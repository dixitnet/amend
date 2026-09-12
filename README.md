# CollabText (v0.1)

Édition collaborative de texte en temps réel, avec suivi des modifications
(à la Word/Google Docs) et une assistance IA qui propose ses reformulations
sous forme de modifications suivies — à accepter ou rejeter comme celles
d'une personne. Auto-hébergé, pensé pour être léger.

## Ce qui fonctionne dans cette v0.1

- Édition simultanée à plusieurs (paragraphes, titres, gras, italique) —
  synchronisation en temps réel via CRDT (Yjs).
- Suivi des modifications : quand il est activé, taper du texte l'insère en
  souligné (attribué à son auteur·rice), et supprimer du texte le barre au
  lieu de l'effacer. Chacun peut accepter ou rejeter chaque changement (ou
  tout accepter/rejeter d'un coup) depuis le panneau latéral.
- Assistance IA : sélectionner un passage, choisir ou écrire une instruction
  ("plus concis", "plus formel"...), et la reformulation proposée par
  Claude apparaît comme une modification suivie attribuée à "IA".
- Mise en forme : gras, italique, souligné, barré ; 5 niveaux de titre (via
  le menu déroulant "Style de paragraphe") ; liste à tirets ; citation
  (blockquote).
- Panneau "Plan du document" (à gauche) : liste tous les titres du document,
  indentés uniquement selon leur niveau (1 à 5) — indépendamment de la
  structure du document (un titre dans une citation, par exemple, s'indente
  comme n'importe quel titre de son niveau). Se met à jour en direct à
  chaque ajout/modification/suppression de titre ; cliquer un titre y
  déplace le curseur et fait défiler la vue.
- Compteur de mots/caractères permanent, dans le bandeau du haut : compte
  tout le document, ou seulement la sélection en cours si elle n'est pas
  vide. Se met à jour à chaque frappe et à chaque changement de sélection.
- Organisation de la page en bandeau + trois colonnes : un bandeau plein
  largeur en haut (nom du document, compteur, statut de connexion, export),
  puis trois colonnes — plan du document à gauche, texte au milieu (avec sa
  propre palette de mise en forme, qui reste fixe au-dessus du texte qui
  défile en dessous), assistance IA et suivi des modifications à droite.
- Bouton "Exporter (.md)" dans le bandeau du haut : télécharge le document
  dans son état présent en Markdown (titres, gras/italique/souligné/barré,
  citation, liste à tirets même imbriquée). Le texte encore en attente de
  suivi des modifications — qu'il s'agisse d'un ajout ou d'une suppression
  proposée — est exporté comme texte normal, rien n'étant encore accepté ni
  rejeté.
- Curseurs et présence des autres personnes connectées, en direct.
- Persistance sur disque (pas de base de données) : chaque document survit
  aux redémarrages du serveur.

### Limites connues (prochaines étapes possibles)

- Le suivi des modifications ne couvre que l'édition de texte simple
  (frappe, suppression, sélection+remplacement, collage de texte brut). Les
  sauts de paragraphe (Entrée, y compris pour ajouter un élément de liste),
  le collage de contenu enrichi, et les bascules liste/citation s'appliquent
  normalement mais ne sont pas (encore) suivis individuellement.
- Pas de tableaux ni d'images dans l'éditeur pour l'instant, ni de listes
  numérotées (seulement la liste à tirets) — schéma volontairement minimal
  pour cette première version.
- L'historique des modifications Yjs n'est pas encore compacté : le fichier
  `data/<id>.log` grossit à chaque modification. Très bien pour un usage
  personnel ou petite équipe ; à surveiller pour un usage intensif prolongé
  (voir la conception de compaction/versions majeures ci-dessous).
- Pas d'authentification : quiconque a l'URL du serveur peut ouvrir/éditer
  les documents. Pensé pour tourner derrière ton propre réseau ou un accès
  restreint (VPN, reverse proxy avec auth, etc.).

## Architecture

```
server/   Node.js pur, ZÉRO dépendance npm (http, crypto, fs natifs)
          - ws.js       implémentation WebSocket (RFC 6455) faite maison
          - rooms.js    relaie les modifications Yjs + la présence entre client·es
          - storage.js  persistance fichier (JSON + logs binaires), pas de DB
          - ai.js        appel à l'API Claude pour les suggestions
          - server.js    serveur HTTP, API REST, routage WebSocket

client/   Application web (Vite + Yjs + ProseMirror + y-prosemirror)
          - trackChanges.js  cœur du suivi des modifications
          - editor.js         assemble l'éditeur collaboratif
          - provider.js        pont Yjs ↔ WebSocket (protocole maison, minimal)
```

Le serveur ne connaît rien à Yjs : il relaie et stocke des octets tels
quels (les mises à jour Yjs binaires, plus quelques messages JSON de
présence non persistés). Toute la logique CRDT vit côté client — ça garde
le serveur minuscule et facile à auditer.

## Installation et lancement (auto-hébergé)

Prérequis : Node.js ≥ 18.

```bash
# 1. Compiler le client (a besoin d'internet, une seule fois — ou à chaque mise à jour)
npm run build:client

# 2. (optionnel) activer l'assistance IA
cp .env.example .env
# puis éditer .env et renseigner ANTHROPIC_API_KEY

# 3. Lancer le serveur
npm start
```

Ouvre ensuite `http://localhost:8787` (ou l'IP de ta machine sur le réseau
local, pour que d'autres personnes puissent rejoindre).

### Avec Docker

```bash
docker compose up -d
```

Les documents sont conservés dans un volume Docker (`collabtext-data`).

## Important — comment ce projet a été construit et testé ici

Cette session tourne dans un bac à sable cloud dont l'accès réseau sortant
est restreint par la politique de ton organisation : le registre npm (et
les CDN comme jsdelivr/unpkg/cdnjs) y sont bloqués. Résultat concret :

- Le **serveur** (dossier `server/`) a été écrit sans aucune dépendance
  externe exprès pour pouvoir être développé ET testé entièrement ici :
  `npm test` (voir `server/test/integration.test.js`) fait vraiment tourner
  le serveur, ouvre de vraies connexions WebSocket, vérifie le relais entre
  client·es, la persistance et le rejeu à la reconnexion, et teste les
  erreurs de l'API IA. Les 7 tests passent.
- Le **client** (dossier `client/`) dépend de bibliothèques bien établies
  (Yjs, ProseMirror, y-prosemirror, et depuis les boutons de mise en forme,
  `prosemirror-schema-list` pour la liste à tirets) qui n'ont pas pu être
  installées ni compilées dans ce bac à sable — je n'ai donc pas pu vérifier
  son fonctionnement dans un vrai navigateur. Le code a été relu avec soin,
  les signatures exactes des fonctions utilisées (notamment celles de
  `prosemirror-commands` et `prosemirror-schema-list`) ont été vérifiées
  contre leur code source publié plutôt que supposées de mémoire, et suit
  les API documentées de ces bibliothèques — mais la première chose à faire
  chez toi est de suivre la checklist de test manuel ci-dessous. Un
  `npm run build:client` récupérera la nouvelle dépendance automatiquement
  (le script fait déjà `npm install` avant de builder).

## Checklist de test manuel (après `npm run build:client && npm start`)

1. Ouvrir `http://localhost:8787` dans deux onglets/navigateurs différents
   (avec des noms différents).
2. Créer un document depuis un onglet, l'ouvrir dans le second — le texte
   tapé dans un onglet doit apparaître en direct dans l'autre.
3. Avec "Suivi des modifications" activé, taper du texte : il doit
   apparaître souligné ; le sélectionner et appuyer sur Suppr doit le
   barrer (pas l'effacer). Vérifier "Accepter"/"Rejeter" dans le panneau
   de droite.
4. Désactiver le suivi : les modifications doivent s'appliquer normalement,
   sans marquage.
5. Avec une clé `ANTHROPIC_API_KEY` configurée, sélectionner un passage et
   cliquer "Plus concis" — la suggestion doit apparaître comme modification
   suivie attribuée à "IA".
6. Fermer/rouvrir le serveur (`Ctrl-C` puis `npm start`) : le contenu du
   document doit être toujours là.
7. Nouveaux boutons de mise en forme — à tester un par un :
   - Menu "Style de paragraphe" : passer un paragraphe en Titre 1 à 5, puis
     revenir à Normal.
   - Souligné et barré (boutons U / S, ou Ctrl-U pour souligné) sur une
     sélection.
   - Liste à tirets (bouton "–") : basculer un paragraphe en liste, appuyer
     sur Entrée dans un élément pour en créer un nouveau (doit rester dans
     la liste, pas repartir en paragraphe normal), Ctrl-] / Ctrl-[ pour
     indenter/désindenter un élément, recliquer le bouton pour ressortir de
     la liste.
   - Citation (bouton "”") : basculer un paragraphe en citation, recliquer
     pour en ressortir.
   - Vérifier que ces bascules restent visibles pour l'autre onglet/personne
     connectée (comme le reste, elles passent par Yjs).
8. Panneau "Plan du document" (à gauche) : ajouter plusieurs titres de
   niveaux différents (pas forcément dans l'ordre, ni imbriqués) — le
   panneau doit tous les lister dans l'ordre du document, indentés selon
   leur seul niveau. Modifier le texte d'un titre, en supprimer un (le
   repasser en "Normal") : le panneau doit se mettre à jour immédiatement.
   Cliquer un titre dans le panneau doit déplacer le curseur et faire
   défiler jusqu'à ce titre dans le document.
9. Compteur de mots/caractères (dans la barre d'outils) : taper du texte
   doit faire avancer le compte en direct ; sélectionner un passage doit
   basculer sur "Sélection : X mots, Y caractères" (juste ce passage) ;
   désélectionner (clic simple) doit revenir au compte du document entier.
10. Organisation de la page : le bandeau du haut (nom, compteur, statut,
    export) doit occuper toute la largeur, au-dessus des trois colonnes.
    Faire défiler un document assez long pour dépasser la hauteur de
    l'écran : le bandeau et la palette de mise en forme doivent rester
    visibles (rien ne doit défiler avec le texte), alors que le texte et
    la colonne de droite défilent chacun indépendamment.
11. Bouton "Exporter (.md)" : avec un peu de texte formaté (titre, gras,
    liste, citation), cliquer dessus doit télécharger un fichier `.md`
    dont le contenu correspond à ce qui est affiché.

Si quelque chose ne fonctionne pas à cette étape, dis-le-moi avec le
message d'erreur (console navigateur incluse) et je corrige.

## Pistes pour la suite

- Suivi des modifications pour les sauts de paragraphe et le collage riche.
- Compaction périodique du journal de modifications par document.
- Export en `.md` fait ; export en `.docx` et export "propre" (résultat
  d'application des modifications encore en attente) restent à faire.
- Marqueur de type "TK" dans le texte (à réfléchir, voir plus bas).
- Droits et authentification — voir conception détaillée ci-dessous.
- Commentaires ancrés dans le texte, en plus du suivi des modifications.
- Interface en plusieurs langues — voir conception détaillée plus bas.

### Droits et authentification (conception, pas encore implémentée)

Décidé (discussion du 11/09/2026), à construire quand on s'y remet :

**Trois rôles, par document** :
- **Lecteur** : lecture seule. Pourra plus tard laisser des commentaires
  (couche indépendante des marques insertion/suppression, se greffera sans
  redesign).
- **Éditeur** : peut proposer du texte et solliciter l'IA, mais toujours via
  le suivi des modifications — jamais d'édition directe, jamais
  d'accepter/rejeter ses propres propositions. Concrètement : le toggle
  "suivi des modifications" et les boutons Accepter/Rejeter (déjà
  implémentés) deviennent conditionnés au rôle plutôt qu'ouverts à tout le
  monde.
- **Admin** : accepte/rejette les modifications, peut désactiver le suivi
  et éditer directement, gère les accès (email → rôle) et la suppression du
  document, et peut revenir à une version antérieure. Un document doit
  toujours garder au moins un admin (éviter le doc orphelin).

**Création de documents** : toute personne authentifiée (email vérifié)
peut créer un nouveau document et en devient automatiquement admin — pas de
liste blanche à gérer.

**Suppression** : douce. Un document supprimé disparaît des listes mais
reste récupérable un moment (corbeille + purge différée) avant suppression
définitive.

**Authentification** : par email uniquement, sans mot de passe — lien ou
code à usage unique envoyé par email, à durée de vie courte. Page de
connexion → email → code/lien → session (cookie signé HMAC, avec `crypto`
déjà utilisé pour le handshake WebSocket, donc pas de nouvelle dépendance
pour cette partie) → liste des documents filtrée par les droits de cet
email. Les droits par document (email → rôle) vivraient dans un petit
fichier JSON à côté du registre existant, dans le même esprit que le
stockage actuel (pas de base de données).

**Retour à une version antérieure** : voir la conception détaillée dans
"Historique, versions majeures et compaction" ci-dessous — l'idée reste la
même (l'admin peut revenir à un état antérieur), mais le mécanisme distingue
maintenant compaction technique et versions nommées.

**Envoi d'email** : le serveur reste un simple *client* SMTP (jamais un
serveur mail complet) — faire tourner son propre serveur mail sortant
depuis un tiny/IP résidentielle est peu fiable (blocage du port 25 sortant
par beaucoup de FAI, absence de réputation IP/SPF/DKIM, atterrissage quasi
systématique en spam). On relaie donc via les identifiants SMTP d'un
fournisseur au choix de la personne qui installe l'appli (sa propre boîte,
un compte Gmail, un service transactionnel dédié...), configurés en
variables d'environnement dans `.env` comme `ANTHROPIC_API_KEY` — aucun
changement de code nécessaire pour changer de fournisseur.

Implémentation : `nodemailer` plutôt qu'un client SMTP maison (seule
dépendance npm du serveur, décidée en connaissance de cause) — un protocole
avec ce niveau de détails subtils, pour un enjeu aussi sensible que
l'authentification, gagne à s'appuyer sur une bibliothèque mûre plutôt que
sur du code maison.

### Historique, versions majeures et compaction (conception, pas encore implémentée)

Décidé (discussion du 11/09/2026), en réaction au risque de voir le journal
`data/<id>.log` grossir sans limite sur un document long (ex. 500 000
signes) édité sur une longue période. Deux mécanismes distincts, qui se
combinent mais ne se confondent pas :

**Compaction technique** — automatique, silencieuse, invisible pour
l'utilisateur. Déclenchée par un seuil (taille du journal ou temps écoulé
depuis la dernière compaction) : le serveur calcule l'état complet courant
du document (`Y.encodeStateAsUpdate`, un update Yjs unique représentant tout
le contenu — généralement bien plus compact que la somme des updates
individuels qu'il remplace), le stocke comme nouvelle base, et repart sur un
journal vide. L'historique fin d'avant la coupure est supprimé (pas
archivé) : c'est le choix le plus économe en disque, cohérent avec le fait
que le voyage dans le temps précis ne sert de toute façon que sur le passé
récent (voir plus bas). Ce mécanisme tourne indépendamment de toute action
humaine, précisément pour qu'un document jamais marqué "stable" par un
admin ne voie pas son journal grossir indéfiniment quand même.

**Version majeure** — un geste éditorial explicite et rare, réservé à
l'admin (cohérent avec le rôle admin défini plus haut), pour marquer une
étape stable ("avant la grosse restructuration de juin"). Contrairement à
une compaction technique, elle produit un instantané nommé, horodaté et
attribué, stocké séparément et gardé indéfiniment — garanti restaurable même
après plusieurs compactions techniques ultérieures. Concrètement, une
version majeure est aussi l'occasion naturelle de déclencher une compaction
(on a de toute façon besoin de l'état complet à cet instant), mais les deux
restent des mécanismes séparés : la compaction peut avoir lieu bien plus
souvent que les versions majeures ne sont créées.

**Voyage dans le temps** — deux granularités, pas une seule :
- Retour à une version majeure nommée : direct, puisque son instantané est
  stocké tel quel (pas besoin de rejouer quoi que ce soit).
- Retour fin sur le passé récent : en plus des versions majeures, on garde
  une fenêtre glissante du journal non compactée (ex. les derniers jours),
  permettant un undo plus précis sur l'édition en cours — sans pour autant
  garder cette précision indéfiniment sur toute la vie du document.

L'historique affiché à l'utilisateur ne montre donc que les versions
majeures (une poignée de jalons nommés, lisibles), jamais les compactions
techniques ni le détail des updates — celles-ci ne sont que de la
plomberie interne.

**Restauration** : pas un rollback destructif du journal existant. Charger
l'instantané ciblé dans un `Y.Doc` temporaire, puis appliquer sur le
document courant une transaction qui en reproduit le contenu — ça s'ajoute
comme une nouvelle modification en tête de journal (une "grosse édition" de
plus), sans jamais réécrire l'historique que d'autres client·es ont pu déjà
recevoir. Pourrait même transiter par le suivi de modifications, pour que
la restauration soit relisable/validable plutôt qu'instantanée.

### Déploiement dev / production (conception, pas encore implémentée)

Décidé (discussion du 11/09/2026) : séparer un environnement de test (le
Mac, usage actuel — édition et test en direct, données jetables) d'un
serveur de production stable, mis à jour uniquement à la demande.

- **Dépôt Git** : dépôt privé GitHub, source de vérité unique. Le Mac et le
  serveur de production sont chacun un checkout indépendant de ce dépôt.
- **Serveur de production** : un tiny dédié, distinct du NAS Lenovo
  M710q — celui-ci reste réservé au stockage/sync personnel et ne doit pas
  être exposé. Machine encore à définir/acquérir. Checkout séparé du code,
  avec son propre dossier `data/` (via `DATA_DIR`, déjà supporté par
  `server.js`) — donc ses propres documents, jamais mélangés avec les tests
  faits sur le Mac.
- **Mise à jour** : jamais automatique. Sur demande explicite ("installe la
  dernière version"), un script court sur le NAS fait `git pull` (ou
  passage à un tag précis), `npm run build:client`, puis relance le
  service (`docker compose up -d --build` ou redémarrage
  `systemd`/`pm2`) — même logique que celle déjà décrite plus bas pour
  l'installation par un tiers, appliquée ici en interne.
- **Exposition réseau** : reste sur le réseau local pour l'instant (comme
  la v0.1 actuelle, sans authentification). L'exposition sur Internet
  (nom de domaine + reverse proxy TLS) est volontairement repoussée à
  après la mise en place des droits/authentification — cohérent avec le
  README plus bas qui note que HTTPS devient obligatoire dès qu'il y a des
  cookies de session et des liens de connexion à protéger.
- **Déclenchement depuis cette conversation** : à vérifier une fois la
  machine choisie et mise en place — si le Mac peut l'atteindre en SSH sur
  le réseau local, le script de mise à jour serait lancé à distance depuis
  le Mac ; sinon il faudra un autre chemin d'accès à trouver.

### Installation par un tiers — vision cible (une fois droits/auth en place)

Ce que ça donnerait pour quelqu'un qui installe CollabText de son côté
(sur un tiny, un VPS, ou chez un hébergeur), une fois les points ci-dessus
construits. Rien de ceci n'existe encore — c'est la cible à garder en tête
pour que l'authentification n'introduise pas d'obstacle imprévu à
l'installation.

**Prérequis techniques**

- Une machine avec Node.js ≥ 18 (ou Docker, voir plus bas), et un disque
  qui persiste entre redémarrages — tout l'état de l'appli (documents,
  droits, sessions) tient dans un dossier `data/` à sauvegarder tel quel,
  pas de base de données à administrer séparément.
- Un accès réseau sortant vers : l'API Anthropic en HTTPS (optionnel, pour
  l'assistance IA) et un serveur SMTP en 587 (obligatoire dès que l'auth
  existe, pour les liens/codes de connexion). Aucun port entrant requis à
  part celui de l'appli elle-même.
- Un nom de domaine (même via un DNS dynamique gratuit pour un tiny à la
  maison) et un reverse proxy TLS devant l'appli (Caddy, Traefik ou
  nginx + Let's Encrypt) — HTTPS devient de fait obligatoire une fois qu'il
  y a des cookies de session et des liens de connexion à protéger, alors
  que la v0.1 sans auth pouvait raisonnablement tourner en HTTP sur un
  réseau local.
- Des identifiants SMTP (boîte mail existante, ou un service transactionnel
  dédié) et, si l'assistance IA est souhaitée, une clé `ANTHROPIC_API_KEY`.

**Grandes lignes de l'installation**

1. Récupérer le code (`git clone` ou une archive) sur la machine cible.
2. `npm install` (récupère `nodemailer`, seule dépendance serveur, et les
   outils de build du client), puis `npm run build:client`.
3. Remplir `.env` à partir de `.env.example` : `ANTHROPIC_API_KEY`
   (optionnel), les paramètres SMTP (hôte, port, identifiants, adresse
   d'expédition), l'URL publique de l'appli (utilisée dans les liens de
   connexion envoyés par email) et un secret de session (pour signer les
   cookies) généré une fois pour toutes.
4. Lancer l'appli — soit directement (`npm start`, à mettre derrière un
   gestionnaire de process comme `systemd` ou `pm2` pour qu'elle redémarre
   au boot et en cas de plantage sur un tiny), soit via
   `docker compose up -d` (le chemin le plus simple pour un hébergeur : le
   `Dockerfile`/`docker-compose.yml` existant embarquerait la même config
   par variables d'environnement et un volume pour `data/`).
5. Placer un reverse proxy devant (souvent déjà géré automatiquement par
   l'hébergeur, ou par Caddy/Traefik en une poignée de lignes de config
   pour un tiny) afin de servir l'appli en HTTPS sur le domaine choisi.
6. Se connecter une première fois avec son propre email pour créer le
   premier document (et devenir admin dessus), puis inviter les autres
   personnes simplement en ajoutant leur email aux droits du document.

Pour la suite (mises à jour), le principe resterait le même qu'aujourd'hui :
`git pull` (ou nouvelle image Docker), `npm run build:client`, relancer.
La sauvegarde se résume à copier le dossier `data/` (ou le volume Docker)
ailleurs régulièrement.

**Limite à garder explicite** : stockage fichier + process unique, pensé
pour un usage personnel, associatif ou petite équipe — pas une architecture
multi-tenant à grande échelle. C'est un choix assumé (léger, auditable,
sans base de données à administrer), pas un oubli.

### Marqueur "à compléter" dans le texte (à réfléchir, pas encore implémenté)

À réfléchir (12/09/2026) : un marqueur qu'on tape dans le texte pour se
signaler à soi-même (ou aux autres) "à reprendre plus tard" — dans l'esprit
du "TK" journalistique, ou du double `!!` que tu utilises. Deux besoins
distincts s'en dégagent, pas forcément à traiter tous les deux d'un coup :
le repérer visuellement en le lisant, et pouvoir tous les retrouver d'un
coup de document, sans les chercher un par un.

- **Détection** : plutôt qu'une nouvelle marque stockée dans le document
  (comme insertion/deletion) ou un nouveau type de nœud, la façon la plus
  simple — et qui marche même sur du texte déjà tapé ou collé, pas
  seulement au moment de la frappe — est de scanner le texte du document
  à la recherche du marqueur et de l'habiller avec une décoration
  (ProseMirror sait faire ça sans toucher au contenu réel, exactement
  comme `selectionHighlightPlugin` dans `trackChanges.js` colore déjà la
  sélection sans y ajouter de marque). Le document lui-même ne change pas :
  seul l'affichage change.
- **Rendu dans le texte** : une petite mise en évidence (fond coloré,
  discret mais repérable) sur le marqueur lui-même — pas sur toute la
  phrase autour, plus difficile à délimiter proprement et pas forcément
  utile : la personne peut écrire assez de contexte autour ("revenir sur
  ce chiffre !!") pour qu'un extrait suffise à s'y retrouver.
- **Panneau de navigation** : un deuxième panneau, sur le même principe que
  "Plan du document" (voir plus haut) — une liste de toutes les occurrences
  du marqueur, avec un extrait de texte autour de chacune, cliquable pour y
  sauter. Techniquement, presque le même code que `outline.js`, juste avec
  une recherche de texte à la place d'un scan des titres.
- **Marqueur configurable ou fixe ?** : pour cette première version, un
  marqueur fixe (une constante dans le code, changeable facilement) suffit
  — pas encore de vrai écran de réglages dans l'appli pour choisir "TK" vs
  `!!` vs autre chose par personne. À revisiter si plusieurs personnes avec
  des conventions différentes travaillent sur les mêmes documents.
- **Suivi des modifications** : un marqueur qui se trouve dans du texte
  encore proposé (insertion en attente) ou encore marqué à supprimer
  resterait détecté comme les autres pour cette première version — plus
  simple, quitte à affiner plus tard (ignorer les marqueurs dans du texte
  déjà marqué pour suppression, par exemple).

### Interface en plusieurs langues (conception, pas encore implémentée)

Anticipé (12/09/2026) : le jour où CollabText est utilisé par des personnes
qui ne lisent pas le français, il faudra une interface traduisible. Ce qui
suit ne concerne que l'habillage de l'appli (boutons, panneaux, messages) —
jamais le contenu des documents : le texte que quelqu'un tape reste
exactement dans la langue où il l'a écrit, comme aujourd'hui.

**Où vivent les textes aujourd'hui** : dispersés en dur dans plusieurs
fichiers client (`editor.js` pour la barre d'outils, `outline.js` pour le
panneau "Plan du document", `changesPanel.js`, `aiPanel.js`,
`wordcount.js`, `home.js`, et jusque dans `schema.js` pour les info-bulles
"Ajout de X" / "Suppression proposée par X"), plus quelques messages
d'erreur renvoyés par `server.js` (ex. "le client n'est pas encore
compilé", clé API manquante).

- **Dictionnaires par langue** : un petit module par langue
  (`messages/fr.js`, `messages/en.js`...) exportant des paires clé → texte,
  et une fonction `t(clé, variables)` qui va chercher dans la langue
  courante, retombe sur le français si la clé manque, et sur la clé
  elle-même en dernier recours (avec un avertissement en console) — pas de
  bibliothèque d'i18n externe, dans le même esprit "léger" que le reste du
  projet. Le français reste la langue de référence (celle où tout existe
  forcément).
- **Choix de la langue** : par personne, pas par document — rangé à côté du
  nom d'affichage (`user.js`/`localStorage`), avec la langue du navigateur
  comme valeur par défaut à la première visite et un sélecteur pour la
  changer manuellement. Deux personnes peuvent donc collaborer sur le même
  document chacune dans sa langue d'interface, sans que ça touche au
  document partagé : la langue est un réglage purement local à la personne
  qui regarde, jamais synchronisé via Yjs.
- **Variables et pluriel** : quelques textes ont besoin d'une variable
  ("Ajout de {user}") ou d'un pluriel ("1 mot" / "12 mots",
  "1 caractère" / "3 caractères", déjà gérés à la main dans
  `wordcount.js`). Une petite fonction `pluriel(n, singulier, pluriel)` par
  langue suffit tant qu'on reste sur des langues à deux formes (français,
  anglais) — pas besoin d'un système générique de règles CLDR pour l'instant ;
  à revoir si une langue à pluriels plus riches s'ajoute un jour.
- **Messages venant du serveur** : plutôt que dupliquer tout le dictionnaire
  côté serveur, `server.js` renverrait un code stable en plus de son message
  français par défaut (ex. `{ code: 'CLIENT_NOT_BUILT', error: '...' }`) ;
  le dictionnaire du client traduit les codes qu'il connaît, et affiche le
  message du serveur tel quel pour le reste — la plupart des messages
  d'erreur, rarement vus, n'ont pas besoin d'être traduits dès le premier
  jour.
- **Simplification assumée pour la v1** : changer de langue en cours de
  session recharge la page plutôt que de re-rendre à chaud les panneaux déjà
  montés (outline, modifications, IA...) — bien plus simple, et un
  changement de langue est une action rare comparé à une frappe ou un
  changement de sélection.
