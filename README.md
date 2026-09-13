# Amend (v0.1)

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
- Commentaires ancrés dans le texte : sélectionner un passage puis
  "Ajouter un commentaire" le surligne et l'associe à une note, listée dans
  un panneau dédié (cliquer dessus fait défiler jusqu'au passage). Résoudre
  un commentaire le supprime définitivement — pas d'historique gardé, par
  choix délibéré pour rester simple. Voir la section dédiée plus bas.
- Facteur d'agrandissement (50 % / 100 % / 150 %) dans le bandeau du haut :
  n'affecte que la zone de texte éditable, réglage propre à chaque
  navigateur (pas synchronisé entre personnes). Voir la section dédiée plus
  bas.
- Bouton "Insérer une ligne" dans la barre d'outils : une ligne visible
  (pointillés) dans l'éditeur, qui devient un vrai saut de page à l'export
  PDF (aucun trait dessiné) et "---" à l'export `.md`. Voir la section
  dédiée plus bas.
- Curseurs et présence des autres personnes connectées, en direct.
- Fiabilité de la collaboration à plusieurs personnes : titre synchronisé
  en direct entre rédacteurs, indicateur de statut honnête (à jour /
  enregistrement… / hors connexion), bandeau de présence (un avatar par
  connexion), coloration persistante du texte par auteur·rice, écritures
  disque groupées — voir la section dédiée plus bas.
- Persistance sur disque (pas de base de données) : chaque document survit
  aux redémarrages du serveur.
- Nom et identité visuelle : l'appli s'appelle "Amend", couleur identitaire
  vert amande — voir la section dédiée plus bas.
- Liste des documents : étoile cliquable (favori) sur chaque document, aussi
  présente dans l'éditeur à côté du titre — les documents favoris remontent
  en haut de la liste. Bouton "Supprimer" par document (confirmation à deux
  clics, pas de popup navigateur) : sort le document de la liste et efface
  son journal de modifications sur disque, irréversible pour cette première
  version (pas de corbeille).
- Suivi des modifications pour les sauts de paragraphe (Entrée) et le
  collage multi-lignes — voir la section dédiée plus bas.
- Page "Historique" (lien "Historique" dans le bandeau de l'éditeur) :
  consultation seule des dernières versions enregistrées d'un document,
  classées de la plus récente à la plus ancienne — voir la section dédiée
  plus bas.

### Limites connues (prochaines étapes possibles)

- Le suivi des modifications couvre l'édition de texte simple (frappe,
  suppression, sélection+remplacement, collage de texte brut), les sauts de
  paragraphe (Entrée) directement sous le document, et le collage
  multi-lignes — voir la section dédiée plus bas. Restent non suivis (édition
  normale, mais pas suivie individuellement) : un saut de paragraphe à
  l'intérieur d'un élément de liste ou d'une citation, le formatage
  (gras/italique/liens…) d'un contenu collé — seul le texte brut est repris
  — et les bascules liste/citation.
- Pas de tableaux ni d'images dans l'éditeur pour l'instant, ni de listes
  numérotées (seulement la liste à tirets) — schéma volontairement minimal
  pour cette première version.
- Historique léger seulement (voir la section dédiée plus bas) : le
  journal d'un document est automatiquement compacté au-delà de 1000
  opérations stockées, et une page de consultation montre les dernières
  versions par horodatage — mais pas de restauration depuis cette page, pas
  de versions nommées, pas de droits d'accès dédiés (voir la conception
  plus complète de "versions majeures" ci-dessous, toujours à venir).
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

## Workflow git (depuis le 12/09/2026)

Le dépôt est initialisé sur le Mac et poussé sur GitHub :
[github.com/dixitnet/amend](https://github.com/dixitnet/amend). Convention
retenue : après chaque modification de code déployée ici, un `git commit`
local est fait dans la foulée (pas besoin d'identifiants pour un commit
local) — mais le `git push` reste entièrement manuel, à lancer par toi
depuis ton propre Terminal Mac quand tu veux mettre GitHub à jour. Ce
sandbox n'a pas et n'aura jamais tes identifiants GitHub. Un rappel est
donné quand plusieurs commits s'accumulent sans avoir été poussés.

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
16. Titre en direct : ouvrir un document dans deux onglets avec des noms
    différents, taper un nouveau titre dans l'un — l'autre doit se mettre à
    jour immédiatement, sauf si son champ titre est activement en train
    d'être édité (auquel cas la mise à jour arrive dès qu'on en sort).
17. Bandeau de présence : avec deux onglets ouverts sur le même document,
    un avatar (initiales + couleur) doit apparaître par onglet connecté ;
    fermer un onglet doit faire disparaître son avatar dans l'autre.
18. Indicateur de statut : taper du texte doit brièvement afficher
    "enregistrement…" puis revenir à "à jour" ; couper la connexion réseau
    puis taper doit afficher "hors connexion — modifications non envoyées" ;
    reconnecter doit renvoyer ces modifications sans les perdre.
19. Coloration par auteur : taper du texte (ou accepter une suggestion IA)
    doit teinter légèrement ce passage de la couleur de son auteur·rice,
    teinte qui doit rester visible après avoir cliqué "Accepter"
    (contrairement au soulignement du suivi de modification, qui lui
    disparaît).
20. Écritures disque groupées : couper puis relancer le serveur juste après
    une frappe (moins d'une seconde après) — le contenu tapé doit être là
    au redémarrage (tolérance de 200 ms de perte au pire, pas plus).


## Pistes pour la suite

- Suivi des modifications pour les sauts de paragraphe et le collage riche.
- Compaction périodique du journal de modifications par document.
- Export en `.md` fait ; export en `.docx` et export "propre" (résultat
  d'application des modifications encore en attente) restent à faire.
- Droits et authentification — voir conception détaillée ci-dessous.
- Accès minimal pour exposer à internet (avant les rôles complets) — voir
  conception détaillée plus bas.
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
"Versions majeures et restauration" ci-dessous — l'idée reste la même
(l'admin peut revenir à un état antérieur) ; la compaction technique qui
soutient tout ça est déjà faite, voir "Historique léger" juste avant cette
section.

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

### Accès minimal pour exposer à internet (conception, pas encore implémentée)

Demandé (12/09/2026) : une version *minimale* de gestion d'utilisateurs,
seulement ce qu'il faut pour exposer le serveur de production à internet et
faciliter des tests utilisateurs — sans construire tout de suite les rôles
et permissions par document du chantier "Droits et authentification"
ci-dessus, volontairement gardés pour plus tard. Question différente : pas
« qui a le droit de faire quoi sur quel document », juste « qui a le droit
d'entrer ».

**Deux options pesées, de la plus simple à la plus complète** :

1. **Basic Auth au niveau du reverse proxy (recommandé pour démarrer)** —
   Caddy (déjà prévu pour le serveur de production, voir "Déploiement dev /
   production" plus bas) protège tout le site derrière un seul couple
   identifiant/mot de passe partagé, en trois lignes de Caddyfile
   (`basicauth`) — zéro ligne de code dans l'appli elle-même. Le nom affiché
   dans l'appli reste ce que chaque personne tape dans la modale existante
   (`user.js`), comme aujourd'hui : pas d'identité vérifiée à ce niveau,
   juste une porte fermée au grand public. Révocation : changer le mot de
   passe dans le Caddyfile et recharger Caddy. Limite assumée : un seul
   identifiant/mot de passe pour tout le monde, à partager toi-même aux
   personnes qui testent (message, jamais publié) — s'il circule, tout le
   monde y a accès jusqu'à ce que tu le changes.

2. **Code d'accès partagé + cookie de session côté appli (si on veut
   identifier les personnes)** — un peu plus de travail, mais donne une
   identité déclarée liée à une vraie session plutôt qu'un simple
   `localStorage` de navigateur :
   - Une petite page d'entrée (avant la liste des documents) : nom + un
     code d'accès unique, partagé par toi hors appli (message, email
     manuel) — pas de compte à créer, pas d'email à vérifier, donc pas
     besoin de SMTP contrairement aux liens de connexion par email du
     chantier "Droits et authentification" plus haut.
   - Code correct → le serveur pose un cookie signé (HMAC avec `crypto`,
     déjà utilisé pour le handshake WebSocket — aucune nouvelle dépendance)
     contenant le nom déclaré et une expiration (30 jours par exemple) ;
     toutes les routes (API et fichiers statiques) exigent ce cookie, sauf
     la route d'entrée elle-même.
   - Aucun rôle, aucune permission par document : une fois entré, accès
     identique à aujourd'hui à tous les documents — exactement le périmètre
     voulu pour des tests, pas plus.
   - Révocation totale : changer `SESSION_SECRET` dans `.env` invalide
     d'un coup tous les cookies déjà émis (utile en fin de période de
     test) ; changer le code d'accès seul empêche seulement les nouvelles
     entrées, sans couper les sessions déjà ouvertes.

**Recommandation** : commencer par l'option 1 (Caddy) — elle ne touche pas
au code de l'appli, cohérente avec l'idée de ne pas complexifier le
développement, et suffit pour des tests utilisateurs encadrés (un petit
groupe de personnes connues, pas un lancement public). Passer à l'option 2
seulement si le besoin de savoir « qui s'est réellement connecté » (au-delà
du nom auto-déclaré déjà existant) se fait sentir en pratique.

**Explicitement hors scope pour cette étape** (repoussé au chantier "Droits
et authentification" ci-dessus, pour quand le besoin de rôles par document
se fera vraiment sentir) : rôles Lecteur/Éditeur/Admin, permissions par
document, création de compte, vérification d'email, mot de passe oublié,
envoi d'email d'aucune sorte.

**HTTPS reste nécessaire dès que ce gate existe** — un cookie de session
(option 2) ou même un Basic Auth (option 1) transmis en clair sur HTTP est
aussi utile qu'une porte fermée sans mur autour : cohérent avec ce qui est
déjà noté dans "Déploiement dev / production" (Caddy + Let's Encrypt dès
l'exposition à internet).

### Commentaires ancrés dans le texte — fait (12/09/2026)

Anticipé puis construit le jour même (évolution 4.2.4, jusqu'ici notée
« reportée, nécessite d'être bien définie » dans le rapport de fiabilité du
12/09/2026). Objectif : pouvoir remarquer un passage sans que ça crée une
proposition à accepter ou rejeter — un usage différent du suivi des
modifications (remarque, pas changement de contenu), complémentaire plutôt
que redondant.

**Simplification demandée par rapport à la conception initiale** : résoudre
un commentaire le supprime purement et simplement (`commentsMap.delete`),
sans garder de trace ni de bouton "Rouvrir" — plus simple que ce qui était
prévu ci-dessous (« résoudre, pas supprimer »), sur demande explicite.

**Où vit un commentaire — pas une marque sur le texte** : contrairement à
`insertion`/`deletion`/`authorColor`, un commentaire ne doit rien changer au
contenu du document — ni gêner le diff mot-à-mot de l'IA, ni apparaître dans
les exports `.md`/`.pdf`. Rangé dans un type Yjs séparé
(`ydoc.getMap('comments')`), à côté du texte plutôt que dedans. Avantage
concret : ce type Yjs est synchronisé et persisté automatiquement par la
plomberie déjà en place (le même journal `data/<id>.log`, le même relais
d'updates binaires) — comme pour le titre en direct (correctif 4.1.1), zéro
changement serveur nécessaire.

**Ancrage qui résiste aux modifications ultérieures** : une position
ProseMirror figée (un simple nombre) se décale dès que quelqu'un modifie le
texte avant elle. Yjs résout déjà exactement ce problème en interne (pour
les curseurs distants) via ses positions relatives
(`Y.RelativePosition`/`createRelativePositionFromTypeIndex`) — les
réutiliser pour ancrer un commentaire au bon passage, même après coup, sans
aucune nouvelle dépendance.

**Modèle de données, volontairement simple pour une v1** : chaque
commentaire = `{ id, auteur, couleur, ancre: { début, fin }, horodatage,
résolu, texte }` — un seul message par commentaire au démarrage. Un fil de
plusieurs réponses (comme chez Notion, voir section 3 du rapport de
fiabilité) resterait une évolution possible, mais n'est pas nécessaire pour
une première version « simple » comme demandé.

**Interaction** : sélectionner un passage fait apparaître un bouton
« Commenter » (à côté du bouton « Suivi des modifications » déjà présent),
sur le même principe que le bouton IA qui apparaît déjà sur une sélection
non vide. Le passage commenté est simplement surligné — une décoration
ProseMirror recalculée à chaque transaction à partir des ancres, pas une
marque stockée dans le document (même principe que le surlignage de
sélection déjà utilisé pour l'IA, `selectionHighlightPlugin`) — avec une
petite pastille dans la marge indiquant le nombre de commentaires à cet
endroit.

**Panneau** : un nouvel onglet dans le panneau existant (à côté de
« Modifications »), listant les commentaires ouverts (résoudre un
commentaire le retire de la liste, voir plus haut) ; cliquer sur un
commentaire fait défiler le document jusqu'à son passage, au milieu de la
fenêtre — même mécanisme que celui déjà fait pour le panneau des
modifications (`changesPanel.js`, voir plus bas).

**Vérifié en direct** : ancrage qui survit à une frappe d'un autre onglet
avant le passage commenté, surlignage correct du passage, panneau qui liste
et fait défiler jusqu'au commentaire, et disparition immédiate à la
résolution.

**Résoudre supprime, pas d'historique gardé** : contrairement à l'idée de
départ ci-dessus (garder le commentaire résolu, replié, avec un bouton
« Rouvrir »), la version construite le supprime purement et simplement —
demandé explicitement pour rester simple. Différent du principe suivi
ailleurs dans l'appli (rejeter une modification suivie garde la décision
tracée) : un choix assumé, propre aux commentaires plutôt qu'une règle
générale du projet.

**Hors scope pour cette v1 simple, à garder en réserve** : fils de réponse à
plusieurs messages, mentions `@personne` et notifications — vues chez
Notion (section 3 du rapport), mais pas nécessaires pour un premier jet
simple ; à reconsidérer seulement si l'usage réel en fait sentir le besoin.

**Dépendances** : aucune — contrairement au chantier versions/compaction
ci-dessous, les commentaires n'ont pas besoin d'attendre la gestion des
comptes/droits : une identité de session (nom + couleur, comme pour tout le
reste de l'appli aujourd'hui) suffit pour savoir qui a écrit quoi. Le rôle
« Lecteur » prévu dans « Droits et authentification » ci-dessus pourra plus
tard restreindre qui peut *voir* les commentaires par rapport à qui peut en
*ajouter*, mais ce n'est pas nécessaire pour construire cette fonctionnalité
elle-même.

### Facteur d'agrandissement (zoom) — fait (12/09/2026)

Sélecteur 50 % / 100 % / 150 % dans le bandeau du haut, propre à chaque
navigateur (`localStorage`, clé `collabtext:zoom`, sur le même principe que
le nom/couleur dans `user.js`) — pas synchronisé via Yjs, ce n'est pas un
réglage du document. N'affecte que `.editor-container` (la zone de texte
éditable), pas le reste de l'interface.

**CSS `zoom`, pas `transform: scale()`** : plusieurs endroits de l'appli
(`outline.js`, `changesPanel.js`, le futur panneau des commentaires)
calculent des positions de défilement via `coordsAtPos` de ProseMirror
comparé au `getBoundingClientRect()` du conteneur qui défile —
`transform: scale()` fausserait ces calculs (il change l'apparence visuelle
sans changer les dimensions/positions vues par le layout), alors que `zoom`
s'intègre nativement au calcul de mise en page. Vérifié en direct : les
défilements vers un titre/une modification restent corrects à 50 % et
150 %.

### Ligne insérée / saut de page à l'export PDF — fait (12/09/2026)

Nouveau nœud de schéma `horizontal_rule` (`schema.js`), à double usage
selon le contexte : un `<hr>` en pointillés dans l'éditeur (bouton dédié
dans la barre d'outils, à côté de "citation"), "---" à l'export `.md`
(même convention que le reste), mais un vrai saut de page CSS
(`break-after: page`) à l'export PDF — sans dessiner de trait, contrairement
à l'écran et au `.md`.

**Suivi des modifications** : insérer cette ligne est une édition
structurelle (comme les bascules liste/citation, voir plus haut), donc pas
suivie individuellement par `trackChanges.js` — cohérent avec la limite déjà
documentée pour ce type d'édition. Correctif apporté : si la ligne se
retrouve en toute fin de document, un paragraphe vide est ajouté juste
après elle (et le curseur y est placé) — sans ça, la toute première frappe
suivante devrait créer ce paragraphe elle-même (une édition structurelle
de plus), ce qui lui aurait fait perdre le suivi alors que taper juste
après la ligne est l'usage le plus courant.

Vérifié en direct : ligne en pointillés à l'écran, texte tapé juste après
bien suivi (marque d'insertion + couleur d'auteur·rice), export `.md` avec
"---", export PDF avec un vrai saut de page et aucun trait visible — confirmé
en interceptant le `Blob` de l'export `.md` et en stubant `window.print()`
pour inspecter le HTML généré sans déclencher la boîte de dialogue
d'impression du système.

### Documents favoris et suppression — fait (12/09/2026)

**Favoris** : `storage.js` garde un booléen `starred` par document dans le
registre (`docs.json`), n'affecte jamais `updatedAt` (marquer un document
n'est pas une modification de son contenu). `listDocs()` trie les favoris en
premier, puis par date de dernière modification comme avant, à l'intérieur
de chaque groupe. Étoile cliquable dans la liste des documents (`home.js`)
et dans l'éditeur, à côté du titre (`editor.js`) — les deux appellent
`PATCH /api/docs/:id/star`.

**Suppression** : bouton "Supprimer" par document dans la liste, avec
confirmation à deux clics plutôt qu'un `window.confirm()` natif (premier
clic → "Confirmer ?" pendant 3 secondes, second clic dans ce délai supprime
réellement, sinon le bouton revient tout seul à son état normal).
`DELETE /api/docs/:id` sort le document du registre et efface son fichier
`data/<id>.log` — irréversible pour cette première version, pas de
corbeille (voir plus bas pour une suppression douce éventuelle, une fois les
droits en place).

### Suivi des modifications : sauts de paragraphe et collage multi-lignes — fait (12/09/2026)

Étendait jusqu'ici une vraie limite connue (voir plus haut) : appuyer sur
Entrée, ou coller plusieurs lignes, s'appliquait normalement mais sans être
suivi individuellement. Deux édits distincts, construits sur le même
mécanisme :

**Sauts de paragraphe (Entrée)** : `trackChanges.js` détecte maintenant un
« split pur » (Entrée pressée dans un paragraphe/titre directement sous le
document — pas dans un élément de liste ou une citation, laissés tels quels
pour cette version) et le distingue d'un collage structurel (qui reste non
suivi). La coupure a réellement lieu tout de suite (l'édition reste
naturelle), mais le nouveau paragraphe/titre est marqué `trackedBreak` —
même forme que les marques insertion/suppression (auteur·rice, couleur,
horodatage) mais en attribut de nœud plutôt qu'en marque de texte, un saut
de ligne n'étant pas un empan de caractères. Rendu à l'écran par un filet
pointillé au-dessus du bloc concerné (`pendingBreakPlugin`, cohérent avec le
pointillé de la ligne insérée ci-dessus). Apparaît dans le panneau des
modifications comme un changement "saut de paragraphe" : accepter efface
juste le marqueur (la coupure reste), rejeter refusionne les deux blocs
(`tr.join`, l'inverse exact du split — repli sur un simple effacement du
marqueur si les deux blocs ne sont plus fusionnables, par exemple si l'un
des deux a changé de type entre-temps).

**Collage multi-lignes** (`richPastePlugin`) : intercepte le collage
directement (`handlePaste`) plutôt que de laisser ProseMirror construire son
propre découpage — un collage d'une seule ligne continue de suivre le
chemin normal ci-dessus, inchangé. Choix de périmètre délibéré : seul le
texte brut du presse-papier est repris (`text/plain`), toute mise en forme
de la source (gras, liens, titres…) est perdue ; chaque ligne devient un
ajout suivi, et les sauts de paragraphe entre les lignes sont suivis
exactement comme un Entrée manuel. Ne s'engage que si la sélection est
directement dans un paragraphe/titre de premier niveau (pas dans une liste
ou une citation, et pas déjà à cheval sur plusieurs blocs) — sinon,
collage normal non suivi, comme avant cette fonctionnalité.

Bug réel trouvé et corrigé pendant le développement : la position du point
de coupure calculée via `tr.mapping.map()` tombait un cran trop loin (à
l'intérieur du second bloc plutôt qu'à la frontière entre les deux) à cause
du biais par défaut de l'API de mapping de position de ProseMirror sur une
insertion structurelle à deux jetons (fermeture + ouverture) — corrigé en
calculant la position directement par arithmétique (`step.from + 1`) plutôt
que par mapping.

Vérifié en direct : split au milieu d'un mot suivi et affiché, accepter et
rejeter testés séparément (rejeter refusionne bien le texte d'origine),
collage de trois lignes au milieu d'un paragraphe existant (le texte
d'origine après le curseur se retrouve correctement rattaché à la dernière
ligne collée), "Tout accepter" testé sur un mélange ajout+saut de
paragraphe.

### Historique léger : compaction automatique et page de consultation — fait (13/09/2026)

Décidé (13/09/2026) : plutôt que d'implémenter directement la conception
complète ci-dessous (versions majeures nommées, rôles admin), une version
« light » d'abord — compaction technique automatique et une page de
consultation, sans restauration ni droits d'accès pour l'instant (choix
confirmés : consultation seule, page ouverte à tous comme le reste de
l'appli tant qu'il n'y a pas d'authentification).

**Compaction** (`server/storage.js`) : chaque document a un compteur
d'opérations stockées (`_walkLog`, qui parcourt `data/<id>.log`) ; passé
1000 (`DEFAULT_MAX_UNCOMPACTED_OPS`), `getHistoryMeta` renvoie
`needsCompaction: true`. Le serveur ne fait jamais de fusion Yjs lui-même
(voir l'invariant "zéro dépendance yjs côté serveur" en tête de
`storage.js`) : c'est un client connecté (`client/src/historySnapshot.js`,
`runCompactionIfNeeded`, déclenché ~3 s après la connexion dans
`editor.js`) qui télécharge l'historique brut (`GET
/api/docs/:id/history/raw`), fusionne tout ce qui précède les 1000
dernières opérations dans un instantané (`Y.encodeStateAsUpdate`), et
envoie ce résultat au serveur (`POST /api/docs/:id/compact`), qui ne fait
plus que de la manipulation d'octets bruts (découper/concaténer/réécrire le
`.log`, comme un `rename` atomique via fichier temporaire). Un fichier
compagnon `data/<id>.times.json` garde un horodatage par opération stockée
(auto-réparé si absent ou désynchronisé, en retombant sur la date de
création du document) — ce qui permet à la page de consultation d'afficher
"les dernières versions selon leur horaire". Compaction concurrente/périmée
gérée proprement : le client envoie le nombre d'opérations qu'il avait vu
(`expectedTotalBeforeCompaction`), et le serveur refuse (409) si le journal
a changé depuis plutôt que de risquer d'écraser des opérations — la
prochaine connexion (la sienne ou celle de quelqu'un d'autre) réessaiera.

**Page "Historique"** (`client/src/versions.js`, route
`#/doc/:id/versions`, lien depuis le bandeau de l'éditeur) : liste les
versions stockées (regroupées par horodatage distinct plutôt qu'une par
opération individuelle — une rafale de frappes tombées dans la même fenêtre
de 200 ms, voir `FLUSH_DELAY_MS`, partage déjà le même horodatage), du plus
récent au plus ancien ; cliquer une entrée reconstruit et affiche le
Markdown du document tel qu'il était à cet instant (`reconstructMarkdown` :
un `Y.Doc` jetable rejoue les opérations jusqu'à ce point,
`yXmlFragmentToProseMirrorRootNode` puis `docToMarkdown` — jamais touché au
document Yjs de l'éditeur en cours). Consultation seule : pas de bouton
restaurer dans cette version.

Vérifié en direct sur un vrai document (1988 opérations stockées) : la
compaction s'est déclenchée automatiquement à l'ouverture, a ramené le
compte à 1000 sans redéclencher à la connexion suivante, et la page
"Historique" a correctement reconstruit et affiché le contenu réel du
document. Testé aussi unitairement côté serveur (compaction, rejet d'une
tentative périmée, auto-réparation de `.times.json`, `deleteDoc` qui nettoie
bien le nouveau fichier compagnon).

Reste non implémenté — voir la conception complète ci-dessous : versions
nommées par un·e admin, restauration proprement dite, droits d'accès dédiés
à l'historique.

### Versions majeures et restauration (conception, pas encore implémentée)

Décidé (discussion du 11/09/2026) ; la compaction technique évoquée
ci-dessous est maintenant faite (voir la section "Historique léger"
juste au-dessus) — ce qui suit reste à implémenter : les versions
nommées, réservées à un rôle admin, et la restauration proprement dite.
Deux mécanismes distincts, qui se combinent mais ne se confondent pas :

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
admin ne voie pas son journal grossir indéfiniment quand même. **(Fait,
sous une forme plus simple — voir "Historique léger" ci-dessus : seuil fixe
en nombre d'opérations plutôt que taille/temps, pas d'archivage séparé.)**

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
### Fiabilité de la collaboration à plusieurs rédacteurs — correctifs et évolutions (12/09/2026)

Suite à `rapport-fiabilite-collaboration.md` (tests utilisateurs détaillés,
revue de code et regard sur d'autres outils de collaboration — poussé au
projet Claude « Collab »), puis aux décisions de priorisation qui l'ont suivi
le même jour : 5 correctifs/évolutions ont été implémentés. Les autres ont
été explicitement reportés, rejetés, ou notés pour plus tard sans action —
voir la section 6 du rapport pour le détail de chaque décision.

**Titre synchronisé en direct entre rédacteurs** (`provider.js`, `editor.js`)
— avant ce correctif, changer le titre d'un document restait invisible pour
les autres personnes déjà en train de le regarder tant qu'elles ne
rechargeaient pas la page (seule la sauvegarde via `PATCH /api/docs/:id`
existait). Un message de relais léger (`{type:'title', title}`), sur le même
principe que la présence (JSON relayé par le serveur, jamais persisté par ce
canal — la persistance reste `PATCH`), avertit maintenant tout le monde
immédiatement. Pour éviter qu'une frappe en cours dans un onglet ne soit
écrasée par le titre venant d'un autre, le message entrant n'écrase le champ
que s'il n'a pas le focus. Vérifié en direct (deux onglets, deux identités) :
taper dans un onglet met à jour l'autre instantanément ; si le second onglet
a le focus sur son propre champ titre, il n'est pas écrasé tant qu'il le
garde, et se met à jour dès qu'il le perd.

**Écritures du journal disque groupées et asynchrones** (`storage.js`) —
chaque modification écrivait auparavant en synchrone (`appendFileSync`) dans
le fichier `data/<id>.log`, ce qui bloque le fil d'exécution unique de Node à
chaque frappe de chaque personne connectée. Remplacé par une mise en mémoire
tampon par document (jusqu'à 200 ms), regroupée en une seule écriture
asynchrone (`appendFile`), avec une file de promesses par document pour
garantir qu'elles ne s'entrelacent jamais. `readUpdates` fusionne ce qui est
déjà sur disque avec ce qui est encore en tampon, pour qu'une personne qui
rejoint ne rate jamais les toutes dernières modifications. Un arrêt propre
(`SIGINT`/`SIGTERM` dans `server.js`) vide le tampon avant de quitter, pour ne
jamais perdre les dernières modifications à un redémarrage normal. Vérifié :
suite de tests serveur toujours à 6/7 (le seul échec restant est préexistant
et sans rapport avec ces changements — un test suppose l'absence de
`ANTHROPIC_API_KEY` pour vérifier le message d'erreur 501, alors qu'une clé
est configurée sur cette machine, ce qui produit un vrai appel réseau et un
502) ; fonctionnement en direct confirmé, y compris un redémarrage complet du
serveur juste après une frappe.

**Bandeau de présence** (`presence.js`, nouveau fichier) — un avatar
(initiales + couleur personnelle) par connexion active dans le bandeau du
haut, alimenté par le même état d'« awareness » Yjs qui pilote déjà les
curseurs distants nommés. Choix délibéré, décidé ensemble : un avatar par
connexion, pas par personne — l'appli n'a pas de compte, donc deux personnes
peuvent partager le même nom/navigateur, et dédupliquer par nom donnerait une
fausse impression de « qui est vraiment là » (voir le constat 1.4 du
rapport). Vérifié en direct avec deux identités : les deux avatars
apparaissent, chacun avec ses bonnes initiales/couleur, et disparaissent à la
fermeture de l'onglet correspondant.

**Indicateur de synchronisation honnête** (`provider.js`, `editor.js`) —
remplace l'ancien binaire « connecté/reconnexion » par trois états réels : "à
jour" (vert), "enregistrement…" (pendant l'envoi d'une modification), et hors
connexion — qui distingue maintenant explicitement "reconnexion…" de
"modifications non envoyées" selon qu'il y a ou non des modifications
locales en attente. En creusant cet indicateur pour qu'il soit honnête, un
vrai trou de fiabilité préexistant est apparu et a été corrigé au passage :
une modification faite hors connexion n'était jamais réellement
retransmise une fois la connexion revenue (l'envoi était un no-op silencieux
tant que le WebSocket n'était pas ouvert). Corrigé en renvoyant l'état
complet du document (`Y.encodeStateAsUpdate`) à la reconnexion dès qu'il y a
eu des modifications locales en attente — sans danger, les mises à jour Yjs
étant idempotentes/commutatives. Vérifié : un arrêt/redémarrage complet du
serveur pendant qu'une personne tapait a bien laissé sa modification
atteindre l'autre personne une fois le serveur revenu — un test plus radical
qu'une simple coupure réseau, qui a bien montré que rien n'est perdu.

**Coloration du texte par auteur·rice, persistante** (`schema.js`,
`trackChanges.js`, `style.css`) — nouvelle marque ProseMirror `authorColor`,
posée aux côtés de la marque d'insertion suivie à chaque ajout de texte
(humain ou IA), mais — contrairement à elle — jamais retirée à l'acceptation
d'une modification : un passage garde une légère teinte de la couleur de la
personne qui l'a écrit bien après que le suivi de modification lui-même a
disparu. Vérifié en direct : texte tapé par une personne teinté de sa
couleur, teinte toujours présente après avoir cliqué "Accepter".

**Non fait maintenant, par décision explicite** (voir la section 6 du
rapport pour le détail) : déduplication de la présence par nom (rejetée —
plusieurs personnes peuvent partager un compte) ; avertissement de collision
Accepter/Rejeter (noté, risque jugé trop faible pour agir maintenant) ;
renommage/couleur en cours de session (reporté) ; compaction du journal +
versions majeures + retour en arrière (chantier combiné, nécessite d'abord
les droits/comptes utilisateur·rice — voir « Droits et authentification »
plus haut — et sera réservé aux admins).
