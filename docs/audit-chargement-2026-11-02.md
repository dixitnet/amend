# Audit du premier chargement d'un document (02/11/2026)

Question posée : où passe le temps entre l'ouverture d'un lien `#/doc/<id>` et un document utilisable, et quelles optimisations valent la peine.

## Méthode

- **Instance de test locale** (`tools/instance-test.js`), documents du corpus (`tools/corpus.js` : `suivi-dense`, `commentaires-denses`, `these`, `livre`), client compilé, Chromium piloté par Playwright.
- **Nouveau banc** `tools/banc-ouverture.mjs` : ouvre chaque document deux fois (cache vide, puis cache du navigateur rempli), trois essais, médianes. Il mesure les octets transférés, la fin des fichiers statiques, la réponse de `GET /api/docs/<id>`, l'arrivée de l'état du document (levée du masque), puis le calme (500 ms sans tâche longue). Options : `--reseau=4g|adsl`, `--cpu` (profil CPU par fonction), `--requetes` (cascade des requêtes).
- **Nouvel outil** `tools/analyse-bundle.mjs` : poids de chaque module dans le JavaScript compilé, lu dans les source maps, sans dépendance.
- **Limite** : le réseau de la session de développement ne joint pas www.amend.ink. Les en-têtes de la production n'ont donc pas pu être vérifiés d'ici (commande de vérification en fin de document). Le `Caddyfile` versionné (`deploy/Caddyfile.exemple`) n'a pas de directive `encode`.

## Mesures

Réseau simulé « 4G correcte » (9 Mbit/s, 70 ms de latence). Ces chiffres sont des médianes.

| Document (état Yjs) | Cache | Octets HTTP | Statiques reçus | Document affiché | Tâches longues |
|---|---|---|---|---|---|
| vide | vide | 790 ko | 1,1 s | 1,0 s | 0 à 0,1 s |
| vide | **plein** | **790 ko** | 1,1 s | 1,0 s | 0 |
| thèse (609 ko) | vide / plein | 790 ko | 1,1 s | 2,0 s | 0,3 s |
| livre (815 ko) | vide / plein | 790 ko | 1,1 s | **2,4 s** | 0,3 à 0,4 s |

En local, sans contrainte réseau : de 0,2 s (document vide) à 0,55 s (livre).

### 1. Rien n'est mis en cache ni compressé (cause principale)

Le service statique (`server/statique.js`) renvoie les fichiers sans `Cache-Control`, sans `ETag` et sans `Last-Modified`, et sans compression. Le navigateur ne peut donc ni garder ni revalider : **les 790 ko sont retéléchargés à chaque ouverture**, y compris à la seconde visite (ligne « plein » ci-dessus).

| Fichier | Brut | gzip | brotli |
|---|---|---|---|
| `index-*.js` (bundle principal) | 611 ko | 189 ko | 161 ko |
| `index-*.css` | 109 ko | 20 ko | 17 ko |
| 5 polices Roboto (woff2) | 110 ko | déjà compressées | — |

Les noms des fichiers de `assets/` contiennent leur empreinte (Vite) : on peut les déclarer immuables pour un an sans risque. `index.html` doit rester revalidé à chaque fois. `versionClient.js` lit `/` en `no-store`, donc il n'est pas touché.

### 2. L'état du document voyage en clair sur la WebSocket

`server/ws.js` n'implémente pas `permessage-deflate`. L'instantané Yjs envoyé à l'ouverture part tel quel : 815 ko pour le livre du corpus, soit environ 0,8 s en 4G. Le même instantané passé par deflate tombe à 87 ko.

Prudence : le texte du corpus est synthétique et se compresse mieux qu'un vrai texte. Pour un vrai livre, il faut plutôt compter un facteur 3 à 5. Ce coût revient à **chaque** ouverture, cache ou non.

### 3. Une cascade de requêtes en série

Ordre observé : HTML → bundle JS (le plus long) → `GET /api/docs/<id>` → montage de l'éditeur → WebSocket, avec `publication`, `ia`, `dialogue` et `auth/me` en parallèle → polices (découvertes au premier rendu). La requête des métadonnées ne part qu'une fois le bundle exécuté, ce qui ajoute un aller-retour (environ 150 ms en 4G). `/api/auth/me` est appelé deux fois.

### 4. Le bundle principal (611 ko)

D'après `tools/analyse-bundle.mjs` :
- **Bibliothèques de l'éditeur**, indispensables à l'ouverture : environ 335 ko. Le détail : `prosemirror-view` 95 ko, `yjs` 64, `prosemirror-model` 44, `prosemirror-transform` 30, `prosemirror-tables` 27, `lib0` 22, `y-prosemirror` 18, `prosemirror-state` 12, `prosemirror-commands` 10.
- **Code de l'application** : environ 260 ko.
- **Modules inutiles à l'ouverture d'un document**, environ 80 ko bruts (25 ko compressés) :
  - accueil et liste des documents (`home`, `listeDocuments`) ;
  - panneau de style (`stylePanel`) et Margo (`dialogue`) ;
  - écrans tactiles (`iphone`, `relectureTactile`) ;
  - suppression de compte, contact, panneaux de publication et d'accès.
- L'export Word (545 ko) et les pages d'administration, de modèles et de versions sont déjà chargés à la demande.
- Vite signale un import dynamique sans effet : `styleConfig.js` est aussi importé statiquement ailleurs.

### 5. Calcul côté navigateur (secondaire)

Profil CPU (`--cpu`, client compilé sans minification) : 0,3 à 0,4 s de tâches longues pour un livre, la plus longue faisant 0,25 s. Le temps se répartit entre le rendu ProseMirror (`patchAttributes`, `renderSpec`), le décodage Yjs et le compteur de signes (`countText`, environ 12 ms).

Avec 400 commentaires, la résolution des ancres (`relativePositionToAbsolutePosition`, appelée par `comments.js`) coûte environ 50 ms à l'ouverture. Rien de bloquant.

### 6. Serveur

Le chargement est déjà bien conçu : réplique en mémoire, rejeu des gros journaux dans un worker, compactage, instantané ou différence selon le vecteur d'état du client. Rien à optimiser pour le premier chargement.

## Optimisations proposées

Elles sont classées par gain attendu sur le temps d'ouverture.

1. **En-têtes de cache sur les fichiers statiques** (`server/statique.js`) :
   - `assets/*` en `public, max-age=31536000, immutable` ;
   - `index.html` en `no-cache` avec `ETag` / `Last-Modified` (réponse 304) ;
   - le reste de `public/` (icônes, manifeste) sur une durée courte.

   Gain : environ 1 s par ouverture à partir de la seconde visite (790 ko → quelques ko). Risque faible, testable.
2. **Compression HTTP.** Gain à la première visite : 790 ko → environ 290 ko, soit 0,5 à 0,7 s en 4G.
   - 2a. **Dans Caddy** : une ligne `encode zstd gzip` dans le bloc `www.amend.ink`. C'est le plus simple, et cela couvre aussi les réponses JSON. Le réglage se fait sur le VPS, et la copie versionnée est mise à jour.
   - 2b. **Dans le serveur Node** : fichiers `.br` et `.gz` produits au build, servis selon `Accept-Encoding`. Aucun calcul à la volée et tout est testable dans le dépôt, mais il y a plus de code.
3. **Compresser l'instantané initial de la WebSocket.** Le serveur le compresse en deflate au-delà d'un seuil, et le client le décompresse avec `DecompressionStream`, natif dans les navigateurs. Cela demande un nouveau message de protocole, compatible avec les anciens clients. Gain : de quelques dixièmes de seconde à près d'une seconde en 4G pour un gros document, à **chaque** ouverture.
4. **Demander les métadonnées du document plus tôt** : un petit script dans `index.html` lance `GET /api/docs/<id>` pendant que le bundle se télécharge, et la WebSocket s'ouvre sans attendre la suite. Supprimer aussi le second `auth/me`. Gain : environ un aller-retour, soit 0,1 à 0,2 s.
5. **Charger à la demande les modules inutiles à l'ouverture** (point 4 des mesures) et corriger l'avertissement sur `styleConfig.js`. Gain : environ 25 ko compressés, faible une fois le cache réglé. À ne faire qu'après 1 et 2.
6. **Précharger les deux ou trois graisses de Roboto utilisées à l'ouverture.** Gain marginal une fois le cache réglé.
7. **Commentaires** : garder les positions résolues entre deux rendus si le document n'a pas changé. C'est un gain sur la frappe dans les documents très commentés plus que sur l'ouverture. À mesurer avant d'y toucher.

Ordre recommandé : 1 et 2 (2a), puis 3, puis éventuellement 4. Les points 5 à 7 restent en réserve.

## Résultat du lot 1, 2a, 3 et 4 (02/11/2026)

Décision de Sylvain : 1, 2a, 3 et 4.

- **1. Cache** (`server/statique.js`) : `assets/*` en `public, max-age=31536000, immutable` ; `.html` en `no-cache` ; le reste de `public/` une heure. Validateurs `ETag` (faible, taille + date) et `Last-Modified`, réponse 304. `HEAD` est géré. Un fichier de `assets/` absent (version précédente) reçoit un 404 franc au lieu de la page d'accueil.
- **2a. Compression** : `encode zstd gzip` dans `deploy/Caddyfile.exemple`, à poser sur le VPS. Types par défaut de Caddy : le flux ndjson de Margo n'est pas compressé.
- **3. État initial compressé** :
  - le client demande `?z=1` si le navigateur sait décompresser (`DecompressionStream('deflate-raw')`) ;
  - au-delà de 8 Ko, le serveur envoie `{type:'etat-z', octets}` puis la trame compressée (deflate brut) ;
  - côté client, ce qui arrive pendant la décompression (dont `synced`) attend son tour. Si la décompression échoue, il se reconnecte sans compression et rien n'est affiché comme complet ;
  - un ancien client ne demande rien et reçoit l'état en clair.
- **4. Métadonnées plus tôt** :
  - `client/public/precharge.js` (en `defer`, la CSP interdisant les scripts en ligne) lance `GET /api/docs/<id>` pendant le téléchargement du bundle, et `main.js` reprend la réponse ;
  - `/api/auth/me` n'est plus lu qu'une fois par page (`getMoi()` dans `auth.js`), et le cache suit les changements de nom et de couleur (`majMoi`).

Banc, 4G simulée, sans la compression de Caddy (qui ne tourne pas en local) :

| Document | Cache | Avant : octets / affiché | Après : octets / affiché |
|---|---|---|---|
| vide | vide | 790 ko / 1,0 s | 793 ko / 0,94 s |
| vide | plein | 790 ko / 1,0 s | **6 ko / 0,27 s** |
| thèse | vide | 790 ko / 2,0 s | 793 ko / 1,17 s |
| thèse | plein | 790 ko / 2,0 s | **6 ko / 0,44 s** |
| livre | vide | 790 ko / 2,4 s | 793 ko / 1,21 s |
| livre | plein | 790 ko / 2,4 s | **6 ko / 0,48 s** |

Les métadonnées arrivent vers 0,43 s au lieu de 0,92 s. Avec Caddy, la première visite perd encore environ 500 ko. Le gain de la WebSocket est surestimé par le corpus synthétique : pour un vrai texte, compter un facteur 3 à 5.

## Vérifier la production (terminal du Mac)

Ces commandes affichent la compression et les en-têtes de cache réellement servis par www.amend.ink :

```bash
cd ~/Documents/collabtext-test/collabtext
A=$(curl -s https://www.amend.ink/ | grep -o 'assets/index-[^"]*\.js' | head -1)
curl -s -o /dev/null -D - -H 'Accept-Encoding: zstd, br, gzip' "https://www.amend.ink/$A" | grep -i -E 'HTTP/|content-encoding|content-length|cache-control|etag|last-modified'
```

S'il n'y a ni `content-encoding` ni `cache-control`, le constat ci-dessus vaut pour la production.
