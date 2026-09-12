# Amend (v0.1)

> Ce fichier remplace `README.md`, qui a résisté à plusieurs mises à jour
> pendant le développement (retour tout seul à une version plus ancienne
> après écriture) — probablement quelque chose sur ta machine qui rouvre ou
> resynchronise ce fichier précis. À partir de maintenant, la doc à jour du
> projet vit ici.

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
- Bouton "Exporter (.pdf)" (version légère — voir la section dédiée
  plus bas) : construit le document en HTML habillé de la feuille de style
  admin, puis déclenche l'impression du navigateur ("Enregistrer en PDF").
  Même convention que le `.md` pour le suivi des modifications : état
  présent pris tel quel, rien de marqué en insertion/suppression.
- Page "Mise en page" (admin, lien depuis l'accueil) : une feuille de style
  unique pour tous les documents — police, taille, gras, italique,
  majuscules, alignement, espacement pour le corps de texte/citation/titres,
  plus taille de page (A4, A5, Letter) et marges. Reflétée dans l'éditeur
  (sauf la taille/marges de page, qui n'ont pas de sens dans un éditeur qui
  défile — voir plus bas), en totalité à l'export PDF.
- Marqueur "!!" (à la "TK" journalistique, pour se signaler un passage à
  reprendre) : le texte tapé garde le code `!!` tel quel (dans le document
  comme dans l'export `.md`), mais il est affiché à l'écran comme une
  alerte ⚠️ plutôt que les deux points d'exclamation littéraux, et le
  bandeau du haut affiche un compteur du nombre de `!!` restants dans le
  document.
- Curseurs et présence des autres personnes connectées, en direct.
- Persistance sur disque (pas de base de données) : chaque document survit
  aux redémarrages du serveur.
- Nom et identité visuelle : l'appli s'appelle "Amend", couleur identitaire
  vert amande — voir la section dédiée plus bas.

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
   de droite. Cliquer sur une proposition dans le panneau (hors des boutons
   "Accepter"/"Rejeter") doit faire défiler le document pour amener cette
   proposition au milieu de la fenêtre — cliquer "Accepter"/"Rejeter" ne
   doit lui, pas déclencher ce défilement.
4. Désactiver le suivi : les modifications doivent s'appliquer normalement,
   sans marquage.
5. Avec une clé `ANTHROPIC_API_KEY` configurée, sélectionner un passage et
   cliquer "Plus concis" — la suggestion doit apparaître comme modification
   suivie attribuée à "IA". Vérifier aussi : taper une instruction dans le
   champ et appuyer sur Entrée doit envoyer la demande (pas de retour à la
   ligne) ; Maj+Entrée doit toujours permettre une instruction sur plusieurs
   lignes. Sur une sélection de plusieurs paragraphes : dès l'envoi de la
   demande, le surlignage vert de la sélection doit disparaître (pas
   attendre la réponse) ; une fois la suggestion appliquée, seuls les
   passages réellement modifiés doivent apparaître surlignés — un
   paragraphe que l'IA a renvoyé inchangé ne doit porter aucune marque.
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
   défiler le document pour amener ce titre en haut de la fenêtre (pas en
   bas, ni juste "quelque part visible").
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
12. Marqueur `!!` : taper `!!` dans le texte doit l'afficher comme une
    alerte ⚠️ (pas les deux points d'exclamation littéraux) et faire
    apparaître/avancer le compteur dans le bandeau. Exporter en `.md`
    ensuite doit redonner le `!!` littéral dans le fichier téléchargé.
13. **Redémarrer le serveur** (`pm2 restart` ou équivalent — un simple
    rebuild du client ne suffit pas ici, ce sont des routes serveur) pour
    charger les nouvelles routes `/api/style`, puis : ouvrir "Mise en
    page" depuis l'accueil, changer quelques réglages (police, taille,
    gras, marges...), "Enregistrer" — recharger la page doit redonner les
    valeurs enregistrées, pas les valeurs par défaut. Ouvrir un document
    doit refléter la feuille de style (police/taille/gras/italique du
    corps de texte, par exemple). "Exporter (.pdf)" doit ouvrir la boîte
    de dialogue d'impression du navigateur avec la mise en page complète
    (y compris la taille de page et les marges, si réglés).
14. Nom et couleur : l'onglet du navigateur et le titre de la page d'accueil
    doivent afficher "Amend" (plus "CollabText"). Liens et boutons
    principaux (ex. "Créer", "Enregistrer") doivent être en vert amande.
    Une suggestion IA dans le suivi des modifications doit apparaître dans
    ce même vert (plus l'ancien violet).
15. Feuille de style — italique et A5 : dans "Mise en page", cocher
    "Italique" sur corps de texte/citation/titres, choisir "A5" comme
    taille de page, "Enregistrer" — recharger doit redonner ces valeurs. Le
    texte concerné doit apparaître en italique dans l'éditeur (pas
    seulement à l'export). L'option "Souligné" a disparu du formulaire.
    "Exporter (.pdf)" avec A5 sélectionné doit imprimer sur un format A5
    (vérifiable dans l'aperçu d'impression du navigateur).

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
- Feuille de style admin (mise en page) + export PDF — voir conception
  détaillée plus bas.
- Couleur personnelle persistante par utilisateur·rice, valable sur tous
  les documents — voir conception détaillée plus bas.

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

Ce que ça donnerait pour quelqu'un qui installe Amend de son côté
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

### Marqueur "!!" — fait dans une version simplifiée

Décidé et fait (12/09/2026), plus simple que la première conception
envisagée ci-dessous (gardée en mémoire au cas où) : pas de panneau de
navigation séparé pour l'instant, juste un repérage visuel et un compteur.

- **Détection** : décoration ProseMirror (`tkMarker.js`), pas une marque
  stockée dans le document — comme `selectionHighlightPlugin` dans
  `trackChanges.js`, le contenu réel ne change pas, seul l'affichage
  change. Le texte est scanné bloc par bloc (paragraphe, titre, élément de
  liste...) pour retrouver `!!`, même si les deux caractères se trouvent
  de part et d'autre d'une frontière de marque (ex. une moitié dans une
  insertion suivie).
- **Rendu dans le texte** : le `!!` réel reste dans le document et dans
  l'export `.md` — seul l'affichage le remplace par une alerte ⚠️ (un
  `::after` en CSS par-dessus le texte mis à taille zéro, donc le curseur,
  la sélection et le copier-coller voient toujours les vrais caractères).
- **Compteur** : dans le bandeau du haut, à côté du nombre de mots — le
  nombre de `!!` actuellement dans le document, mis à jour en direct.
- **Marqueur fixe pour l'instant** : une constante dans le code
  (`TK_MARKER` dans `tkMarker.js`), pas encore un réglage par personne.
- **Suivi des modifications** : un `!!` dans du texte encore proposé ou
  encore marqué à supprimer est compté comme les autres pour cette
  première version.

Idée gardée de côté, pas construite : un panneau listant chaque occurrence
avec un extrait de texte autour, cliquable pour y sauter (sur le même
principe que "Plan du document") — utile si le compteur seul ne suffit
plus à s'y retrouver sur un document long avec beaucoup de marqueurs.

### Interface en plusieurs langues (conception, pas encore implémentée)

Anticipé (12/09/2026) : le jour où Amend est utilisé par des personnes
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

### Feuille de style admin + export PDF léger — fait (12/09/2026)

Anticipé (12/09/2026), puis construit le jour même : une page réservée aux
admins pour définir une feuille de style — corps de texte, citation, titres
(police dans une liste, taille, gras, italique, majuscules, alignement,
espace avant/après), plus des réglages de page (taille, marges) — appliquée
en partie dans l'éditeur et en totalité à l'export PDF.

**Révision (12/09/2026)** : sur demande, l'option "souligné" a été retirée
entièrement de la feuille de style (police/gras/majuscules/alignement/
espacement/italique restent), remplacée par une option "italique", et une
taille de page "A5" a été ajoutée à côté de A4/Letter. L'italique n'a, contrairement
à l'ancien souligné, aucun conflit visuel avec le suivi des modifications
(rien dans l'appli ne rend de l'italique pour signaler un ajout/suppression),
donc il s'applique pleinement dans l'éditeur comme à l'export — pas de
restriction "export seulement" comme celle qui existait pour le souligné.

**Fait** : page "Mise en page" (`adminStyle.js`, lien depuis l'accueil,
`#/style`) qui lit/écrit une feuille de style unique via `GET`/`PUT
/api/style` (`storage.js`/`server.js`, un fichier `data/style.json`, même
esprit que le reste — pas de base de données). `styleConfig.js` centralise
le modèle (une liste fermée de 5 polices, `DEFAULT_STYLE`) et la traduction
en CSS (`buildStyleCss`, `buildPageCss`), pour que l'éditeur et l'export
PDF appliquent exactement la même feuille de style plutôt que deux copies à
maintenir. Reflet dans l'éditeur (`editor.js`) : police, taille, gras,
italique, majuscules, alignement, espacement — tout sauf la taille de
page/marges (aucun sens dans un éditeur en défilement continu). Export
"Exporter (.pdf)" (`pdfExport.js`) : sérialise le document en HTML
(`docToHtml`, même convention que l'export `.md` pour le suivi des
modifications — état présent pris tel quel), l'habille de la feuille de
style complète plus une règle `@page` pour la taille/les marges, l'affiche
dans un `#print-root` normalement invisible, puis déclenche
`window.print()` — la personne choisit "Enregistrer en PDF" dans la boîte
de dialogue du navigateur. Vérifié : formulaire "Mise en page" testé en
direct dans le navigateur (valeurs par défaut correctement affichées,
sauvegarde), reflet léger dans l'éditeur confirmé par les styles calculés
(taille du corps de texte et espacement correspondant bien à la feuille de
style), et le flux d'export PDF vérifié en interceptant `window.print()` :
`#print-root` contient bien le HTML du document (avec le `!!` littéral, pas
l'alerte ⚠️ — même principe que pour l'export `.md`) habillé de la bonne
règle `@page` et de la bonne feuille de style, puis se nettoie correctement
après l'impression.

**À faire chez toi avant que "Mise en page" fonctionne réellement** : le
serveur (`server.js`/`storage.js`) a changé pour ajouter les routes
`/api/style` — contrairement au client (servi directement depuis
`client/dist` à chaque requête, un rebuild suffit), le processus serveur
géré par pm2 doit être **redémarré** pour charger ce nouveau code
(`pm2 restart` ou l'équivalent que tu utilises). Tant que ce n'est pas fait,
la page "Mise en page" affiche et enregistre normalement dans son
formulaire, mais `/api/style` répond 404 en coulisses — l'éditeur et
l'export PDF retombent alors silencieusement sur la feuille de style par
défaut plutôt que sur celle enregistrée. Un vrai bug trouvé au passage et
corrigé : `saveStyle()` ne vérifiait pas le code de réponse HTTP, donc un
échec d'enregistrement aurait quand même affiché "Enregistré." — corrigé
pour afficher l'échec dans ce cas.

**Portée** : une feuille de style par instance (pas par document), cohérent
avec le rôle admin déjà envisagé dans "Droits et authentification" — un
réglage par document resterait possible plus tard, mais complique la donnée
et l'UI pour un besoin qui n'est pas exprimé pour l'instant.

**Titres — un style de base, pas cinq réglages complets** : dupliquer
police/graisse/casse/alignement/espacement sur 5 niveaux serait lourd à
administrer pour un gain surtout cosmétique. Plus simple : un seul bloc de
style "titre" (police, gras, italique, majuscules, alignement, espacements)
partagé par les 5 niveaux, plus une simple échelle de taille par niveau
(H1 → H5). Repousse la vraie question ("est-ce qu'on veut un jour des styles
de titre indépendants") à si le besoin se manifeste concrètement.

**Ce qui se reflète dans l'éditeur, et ce qui ne s'y reflète pas** :
police, taille, gras, italique, majuscules, alignement et espacement
avant/après se reflètent dans l'éditeur — une couche purement visuelle
(variables CSS scopées au `.ProseMirror`, sur le même principe que
`.tk-marker` ou les couleurs de `trackChanges.js` : rien ne change dans le
document stocké, seul l'affichage change). Un seul réglage ne se reflète
**pas** dans l'éditeur :
- **Taille de page et marges** n'ont aucun sens dans un éditeur en défilement
  continu sans pagination — réglages purement PDF.
(L'option "souligné" existait à l'origine mais entrait en conflit visuel
direct avec l'insertion suivie, déjà soulignée dans `style.css` —
c'est d'ailleurs pour ça qu'elle a été retirée entièrement de la feuille de
style plutôt que juste tenue à l'écart de l'éditeur ; l'italique qui l'a
remplacée n'a pas ce problème.)
Principe général à garder : l'éditeur reste une prévisualisation légère,
pas un WYSIWYG fidèle — la lisibilité du suivi des modifications (couleurs,
soulignés, barrés déjà utilisés pour ça) prime sur la fidélité typographique
à l'écran.

**Modèle de données** : un fichier JSON unique (`data/style.json`, à côté du
registre des documents existant — même logique que le reste : pas de base
de données), quelque chose comme :
```json
{
  "page": { "size": "A4", "margins": { "top": 25, "right": 20, "bottom": 25, "left": 20 } },
  "body": { "font": "...", "size": 11, "bold": false, "italic": false, "uppercase": false, "align": "left", "spaceBefore": 0, "spaceAfter": 8 },
  "quote": { "...": "même forme que body" },
  "heading": { "...": "même forme que body, sans align/uppercase forcément utiles", "sizes": [24, 20, 17, 15, 13] }
}
```
Une petite API (`GET`/`PUT /api/style`) pour la page admin — à protéger par
le rôle admin une fois l'authentification en place ; en attendant, même
réserve que le reste de la v0.1 (accessible à quiconque a l'URL).

**Polices "dans une liste"** : volontairement une liste fermée de polices
auto-hébergées (fichiers `.woff2` embarqués dans le build client), pas
n'importe quelle police système. Deux raisons : ça évite une dépendance
réseau à l'affichage (cohérent avec l'esprit auto-hébergé du projet), et
surtout ça garantit qu'une police choisie dans la feuille de style sera
bien celle utilisée à l'export PDF — une police système présente chez
l'admin mais pas chez qui génère le PDF donnerait un résultat différent de
ce qui a été réglé.

**Export PDF — trois options pesées, pour "le plus simple possible"** :

1. **`window.print()` + CSS d'impression (retenu)** — un second petit
   sérialiseur à côté de `docToMarkdown` (`docToHtml`, même principe de
   parcours du document) produit du HTML, habillé d'un CSS `@media print`
   qui applique la feuille de style — `@page { size; margin }` correspond
   directement aux réglages "taille de page"/"marges", le reste (police,
   graisse, casse, alignement, espacements) devient des règles CSS
   ordinaires. Un bouton "Exporter en PDF" appelle `window.print()` ; la
   personne choisit "Enregistrer en PDF" dans la boîte de dialogue du
   navigateur. Aucune nouvelle dépendance, ni client ni serveur ; la feuille
   de style se traduit presque littéralement en CSS, ce qui la rend facile
   à maintenir et à faire évoluer. Compromis assumé : ce n'est pas un
   téléchargement en un clic (la boîte de dialogue d'impression du système
   s'interpose), et le rendu peut varier légèrement d'un navigateur/OS à
   l'autre — acceptable vu la contrainte de simplicité posée au départ.
2. **Bibliothèque cliente (jsPDF, html2pdf.js/html2canvas)** — écartée :
   soit un rendu en image (texte non sélectionnable, flou à l'impression),
   soit ré-implémenter un moteur de mise en page maison (gestion des sauts
   de page, alignements...) pour un résultat en vecteur — beaucoup plus de
   travail que l'option 1 pour un résultat pas forcément meilleur, et une
   dépendance client supplémentaire assez lourde.
3. **Rendu PDF côté serveur (Chromium headless via Puppeteer/Playwright)**
   — techniquement le plus fidèle (le même `page.pdf()` honore les mêmes
   règles `@page` que l'option 1, mais produit un vrai fichier en un clic
   sans boîte de dialogue) mais va à l'encontre du choix déjà fait pour ce
   projet d'un serveur sans aucune dépendance npm, léger et entièrement
   testable dans un bac à sable sans accès réseau (voir plus haut) : un
   binaire Chromium embarqué, ~300 Mo, à maintenir/sécuriser sur le tiny de
   production. Pas retenu pour l'instant.

Chemin d'évolution si le clic unique devenait un jour indispensable :
passer de l'option 1 à l'option 3 resterait une évolution, pas une
refonte — le même HTML/CSS habillé de `@page` server simplement rejoué
derrière un navigateur headless plutôt que dans celui de la personne. Pour
un usage personnel/petite équipe, l'option 1 est très probablement
suffisante durablement, pas juste un pis-aller en attendant mieux.

#### Export PDF fiable, indépendant du navigateur, pour envoi imprimeur — recherche d'options (12/09/2026)

Demandé : à terme, un export PDF stable quel que soit le navigateur qui le
génère — nécessaire pour un fichier envoyé tel quel à un imprimeur, où une
variation de rendu entre Chrome/Firefox/Safari (polices de substitution,
gestion des sauts de page) n'est pas acceptable. La mise en page reste
volontairement simple (pas de mise en page façon livre avec notes de bas de
page, renvois, etc.), ce qui élimine d'emblée le besoin des outils les plus
sophistiqués. Trois options concrètes, classées de la plus proche de ce qui
est déjà construit à la plus lourde :

1. **Gotenberg (recommandé)** — une API auto-hébergée, en conteneur Docker
   (licence MIT, gratuite), qui embarque un vrai Chromium headless (plus
   LibreOffice pour d'autres formats, pas utile ici). Concrètement : le
   serveur enverrait le même HTML + la même feuille de style CSS + le même
   `@page` déjà produits par `docToHtml`/`buildStyleCss`/`buildPageCss`
   (aucune réécriture) à ce conteneur par une requête HTTP, et recevrait un
   vrai fichier PDF en retour — plus besoin de la boîte de dialogue
   d'impression du navigateur, et un rendu strictement identique quel que
   soit le navigateur ou l'OS de la personne qui clique sur "Exporter",
   puisque c'est toujours le même Chromium, dans le même conteneur, qui
   fait le rendu. Avantage notable pour ce projet précis : ça n'ajoute
   aucune dépendance npm au serveur Node (toujours zéro dépendance, léger,
   auditable, testable) — Gotenberg vit dans son propre conteneur, appelé
   par une simple requête HTTP, exactement le genre de séparation déjà en
   place pour Docker dans ce projet (voir `docker compose` plus haut).
2. **Prince XML (si le simple ne suffit plus)** — le moteur avec la
   meilleure fidélité prépresse (profils de sortie PDF/X, notes de bas de
   page automatiques, renvois croisés) — mais payant : environ 2 000
   USD/an pour une licence serveur commerciale (ou ~3 800 USD en licence
   par serveur), et sa version gratuite est réservée à un usage non
   commercial strict (logo imposé sur la première page, lien obligatoire
   vers princexml.com) — pas adapté à un usage lié à du travail rémunéré.
   À garder en tête seulement si un imprimeur exige un jour un vrai profil
   PDF/X ou une mise en page bien plus riche que "simple".
3. **WeasyPrint** — gratuit (licence BSD), un moteur CSS écrit en Python
   (pas un navigateur : jamais de JavaScript, son propre moteur de rendu
   CSS plutôt que Chromium) avec un support correct de CSS Paged Media
   (`@page`, compteurs de page) mais moins complet que Prince (pas de notes
   de bas de page ni de renvois automatiques). Fonctionnerait, mais deux
   inconvénients pour ce projet précis par rapport à Gotenberg : une
   installation plus lourde (Python + bibliothèques système Pango/Cairo à
   maintenir sur le tiny de production, plutôt qu'un seul conteneur Docker
   autonome), et un moteur de rendu CSS différent de celui déjà testé en
   direct dans le navigateur cette session — un second moteur à valider,
   pas une garantie de rendu identique à ce qui a déjà été vérifié.

Recommandation : Gotenberg quand ce chantier sera repris — il réutilise
tel quel le travail déjà fait et vérifié cette session (le HTML et la CSS
de `pdfExport.js`/`styleConfig.js`), ne coûte rien, et s'intègre au
déploiement Docker déjà documenté plus haut sans alourdir le serveur Node
lui-même. Prince resterait l'option de repli si un imprimeur exige
explicitement un profil PDF/X ou une mise en page plus riche que prévu.

Sources :
- [WeasyPrint vs Prince: CSS to PDF engines compared](https://pdf4.dev/blog/weasyprint-vs-prince)
- [Gotenberg — a Docker-based API for PDF conversion](https://gotenberg.dev/)
- [Prince — License FAQ](https://www.princexml.com/purchase/license_faq/)

### Couleur personnelle persistante par utilisateur·rice (conception, pas encore implémentée)

Anticipé (12/09/2026) : chaque personne aurait une couleur qui lui est
propre, utilisée pour tous ses documents, tirée en cherchant à maximiser la
différence avec les couleurs déjà attribuées à d'autres personnes, avec la
possibilité plus tard de la modifier soi-même.

**Où on en est déjà, et ce qui manque** : `user.js` fait aujourd'hui une
partie du chemin — le nom et la couleur sont choisis une seule fois puis
gardés dans `localStorage` du navigateur (`collabtext:name` /
`collabtext:color`), donc déjà "valables sur tous les documents" dans les
faits, tant que c'est le même navigateur. Deux manques par rapport à ce qui
est demandé : (1) le tirage est uniforme parmi une palette fixe de 8
couleurs (`COLORS` dans `user.js`) sans regarder ce qui est déjà pris — avec
plus de 8 personnes actives, ou même avant (paradoxe des anniversaires), deux
personnes peuvent vite se retrouver avec la même couleur ; (2) pas encore de
réglage pour la changer soi-même.

**Tirage qui maximise les différences — rester simple** : plutôt qu'un
algorithme d'optimisation (chercher la couleur qui maximise la distance
minimale à toutes les couleurs déjà prises), une rotation de teinte à
"angle d'or" (~137,5° à chaque nouvelle personne, en gardant saturation et
luminosité fixes pour rester dans la palette douce déjà utilisée par
l'appli) répartit les couleurs de façon quasi maximale sans avoir à
comparer à qui que ce soit : la N-ième personne reçoit simplement la teinte
`(N × 137,5°) mod 360°`. Il suffit de savoir combien de personnes existent
déjà pour tirer la suivante — pas de recherche, pas de comparaison.

**La vraie difficulté n'est pas l'algorithme, c'est "qui sont les autres
personnes"** : sans compte (voir "Droits et authentification" plus haut),
il n'y a pas de registre stable des utilisateur·rices — seulement des
navigateurs qui se sont chacun choisi un nom un jour. Attribuer une couleur
vraiment distincte suppose de savoir combien de personnes ont déjà une
couleur, ce qui n'existe nulle part côté serveur aujourd'hui. Solution
provisoire cohérente avec le reste du projet (fichier, pas de base de
données) : un petit registre `data/users.json` (identifiant anonyme généré
et stocké à côté du nom/couleur → couleur attribuée), consulté à la
création d'une nouvelle identité pour connaître le prochain rang N. Ce
registre deviendrait naturellement plus solide une fois l'authentification
par email en place (l'email remplacerait l'identifiant anonyme comme clé).

**Modifier sa couleur soi-même** : un simple réglage à côté du nom
d'affichage (même endroit que le nom, dans la modale `promptForUser` ou un
futur réglage de profil) qui écrit directement dans `localStorage` (et,
avec le registre ci-dessus, informe le serveur du changement) — pas de
contrainte d'unicité stricte à faire respecter, juste un défaut qui essaie
de bien répartir les couleurs au départ.

### Nom et identité visuelle : "Amend", vert amande — fait (12/09/2026)

Décidé et fait : l'appli s'appelle désormais **Amend** (remplace
"CollabText" partout où le nom apparaît à l'écran — titre de l'onglet,
page d'accueil, message de démarrage du serveur), avec le **vert amande**
comme couleur identitaire.

- **Une seule variable CSS à changer** : `--accent` dans `style.css` était
  déjà le fil conducteur visuel de toute l'interface (liens, bouton
  "Créer", boutons `btn-primary`, curseurs distants, bordure du panneau des
  modifications, surlignage de sélection IA) — changer sa valeur a suffi à
  propager la couleur identitaire partout, sans toucher à chaque
  composant un par un. Deux teintes (`#5f7a4a` en clair, `#a9c68a` en
  sombre — la version sombre plus claire pour rester lisible sur fond
  très sombre), au lieu du bleu/lavande précédent.
- **Propositions IA** : `AI_USER.color` dans `user.js` reprend exactement
  la même teinte claire (`#5f7a4a`) que `--accent` — remplace l'ancien
  violet fixe (`#6d597a`). Comme demandé : le vert amande sert notamment
  (pas seulement) à surligner les suggestions de l'IA dans le suivi des
  modifications.
- **Un vert existait déjà** (`--ok`, utilisé pour "en ligne"/modification
  acceptée) : `--accent` en vert amande crée donc deux verts dans
  l'interface, à des fins différentes (identité/action vs. statut positif).
  Choisis volontairement assez éloignés (vert amande plus sourd et plus
  jaune que le vert `--ok`, plus franc) pour rester distinguables — à
  garder en tête si un jour ça se révèle prêter à confusion en usage réel.
- Pas touché : les couleurs personnelles par utilisateur·rice
  (`COLORS` dans `user.js`, sans rapport avec l'identité de l'appli), et le
  nom technique des paquets npm (`package.json`, dossier `data/`, clés
  `localStorage` comme `collabtext:name`) — un rebrand plus profond de ces
  identifiants internes n'apporterait rien côté utilisateur et risquerait
  de casser des données déjà stockées (couleur/nom déjà enregistrés chez
  toi, par exemple).

### "Plan du document" : défilement vers le haut — fait (12/09/2026)

Corrigé : cliquer un titre dans le panneau "Plan du document" faisait
défiler le document jusqu'à peine faire apparaître le titre en bas de la
fenêtre (comportement par défaut de `scrollIntoView()` de ProseMirror, qui
ne fait que le minimum nécessaire pour rendre la position visible). Amendé
dans `outline.js` : après avoir positionné le curseur, un calcul explicite
(`coordsAtPos` du titre comparé au rectangle de `.editor-container`, le
conteneur qui défile réellement dans l'éditeur — voir `editor.js`) fixe le
`scrollTop` pour amener le titre à ~16px du haut. Vérifié en direct sur un
document long (11 000+ mots) : le titre cliqué atterrit bien à 16px du haut
du conteneur, plus de saut vers le bas.

### Assistance IA : touche Entrée, et surlignage de sélection après envoi — fait (12/09/2026)

Deux corrections dans `aiPanel.js`/`trackChanges.js` :

- **Entrée envoie la demande** : le champ d'instruction (une `<textarea>`)
  n'avait rien de spécial sur `keydown`, donc Entrée insérait un retour à la
  ligne comme dans n'importe quelle zone de texte. Ajouté : un gestionnaire
  qui, sur Entrée sans Maj, empêche le retour à la ligne et envoie la
  demande directement (Maj+Entrée garde le comportement normal, pour une
  instruction sur plusieurs lignes).
- **Le surlignage de sélection ne disparaissait pas après l'envoi** : la
  sélection reste surlignée en vert pendant la saisie de l'instruction
  (`selectionHighlightPlugin`, exprès — sinon la sélection semblerait
  disparaître dès qu'on clique dans le champ, hors de l'éditeur). Mais rien
  ne l'effaçait après coup : sur une sélection de plusieurs paragraphes, le
  surlignage restait sur l'ensemble de la sélection d'origine même une fois
  la suggestion appliquée, donnant l'impression que tous les paragraphes
  avaient été modifiés — alors que seuls certains l'étaient réellement (le
  diff mot-à-mot existant, lui, marquait déjà correctement les seuls
  passages changés). Corrigé : dès l'envoi de la demande (avant même la
  réponse de l'IA), la sélection est réduite à un curseur — le surlignage de
  sélection disparaît donc immédiatement, et seules les marques
  d'insertion/suppression du diff (déjà scopées aux passages réellement
  modifiés) restent visibles une fois la suggestion appliquée.

### Panneau des modifications : cliquer une proposition défile jusqu'au milieu — fait (12/09/2026)

Ajouté dans `changesPanel.js` : cliquer sur une proposition de modification
dans le panneau (n'importe où sur la carte, hors des boutons
"Accepter"/"Rejeter") fait défiler le document pour amener cette
modification au milieu de la fenêtre plutôt qu'à un endroit quelconque —
utile pour voir une modification dans son contexte avant de choisir de
l'accepter ou de la rejeter. Même approche que le défilement du "Plan du
document" (`outline.js`) : `coordsAtPos` de la modification comparé au
rectangle de `.editor-container`, mais centré sur le milieu du conteneur au
lieu d'être calé en haut — une modification est en général courte, donc voir
ce qu'il y a autour (avant et après) compte plus que caler son bord de
départ. Le clic sur "Accepter"/"Rejeter" (`.change-actions`) est
explicitement exclu du déclenchement de ce défilement. Vérifié en direct :
la modification cliquée atterrit exactement au milieu vertical du
conteneur, et cliquer les boutons d'action ne déclenche pas le défilement.
