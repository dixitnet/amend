# amend.ink v2 : plan de l'étape 5, « Relecture »

Statut : **arbitré** par Sylvain le 08/11/2026 (voir « Arbitrage » en fin de plan) ; développement lancé. Revue d'ouverture par Claude (grille des règles, § 6) ; scénarios de test par Claude (`docs/v2-tests/etape-5-scenarios.md`).

Références : `docs/v2-regles-developpement.md`, `docs/v2-etape-2-plan.md` (rôles), `v2/adr/0003-blocknote.md`, `v2/adr/0004-yhub.md`.

## But

La relecture d'un livre à plusieurs : le correcteur propose (suggestions), tout le monde commente selon son rôle, l'éditeur accepte ou refuse, et l'historique permet de revenir en arrière. Avec ce que BlockNote et y/hub savent déjà faire, le moins possible de code à nous.

## Ce que les briques font déjà (vérifié dans BlockNote 0.57 et y/hub 0.10.1)

| Besoin | Brique | Ce qu'elle fournit |
|---|---|---|
| Suggestions | BlockNote (`SuggestionsExtension`) | mode suggestion sur un **document de suggestions** distinct (`suggestionDoc`) : écrire en suggestion, voir, accepter ou refuser une suggestion ou toutes ; auteur et couleur par personne ; info-bulle d'attribution |
| Lieu des suggestions | y/hub | des **branches** d'un même document (`?branch=…` sur la WebSocket et l'API), chacune avec ses permissions : la branche principale et une branche de suggestions (le montage de Docs) |
| Commentaires | BlockNote | fils, réponses, réactions, résolution ; deux façons de les stocker : dans le document Yjs (`YjsThreadStore`, droits vérifiés par le navigateur seulement), ou lus dans le document et **écrits par notre serveur** (`RESTYjsThreadStore`, droits vérifiés côté serveur) ; interface fournie (bulle de saisie, fil, panneau des fils) |
| Historique | BlockNote + y/hub (`YHubVersioningExtension`) | liste des modifications par auteur et par date, comparaison, versions nommées, retour à une version ; panneau fourni (`@blocknote/react/versioning`) ; y/hub donne l'historique **à partir d'une date** par personne |
| Droits | y/hub | par branche : lire, écrire, historique, retour arrière ; décidés par notre serveur à chaque connexion |

## Ce qui est établi

- Les rôles et leurs capacités (étape 2) : lecteur (`lire`), correcteur (`commenter`, `suggerer`), éditeur (`ecrire`, `arbitrer`, `restaurer`, `inviter`), propriétaire.
- Le mode suggestion est imposé au correcteur ; y/hub en est la garantie (le correcteur ne peut pas écrire dans la branche principale).
- L'historique visible à partir de la date d'accès (idée reprise de Docs, notée à l'étape 2).
- Le design reste Mantine et BlockNote tels quels ; toute apparence nouvelle est ta décision.

## Questions pour Sylvain

### 1. Où écrire les commentaires

| Option | Pour | Contre |
|---|---|---|
| **a. Écrits par notre serveur** (`RESTYjsThreadStore`, le montage de Docs) | les droits (qui commente, qui supprime le commentaire d'un autre) sont vérifiés **par le serveur** ; le correcteur commente sans écrire dans le texte | un peu de code serveur : quatre ou cinq routes qui vérifient le rôle et écrivent dans le document par l'API de y/hub |
| b. Dans le document de suggestions (`YjsThreadStore`) | aucun code serveur | les droits des commentaires ne sont vérifiés que par le navigateur : un correcteur qui force son navigateur pourrait modifier ou supprimer les commentaires des autres ; contraire à la règle « pas de contrôle côté client seulement » |

Proposition : **a**.

### 2. Le lecteur peut-il commenter ?

À l'étape 2, la question était renvoyée ici. Deux réponses possibles :
1. **Non** : le lecteur lit seulement ; c'est le correcteur qui relit et commente.
2. **Oui**, comme le « commentateur » de Docs : il commente sans proposer de suggestion.

### 3. Qui voit l'historique, et depuis quand ?

Proposition, reprise de Docs : chaque rôle voit l'historique **à partir de sa date d'accès** au document ; l'éditeur et le propriétaire peuvent nommer une version et **revenir** à une version (`restaurer`). Il faut pour cela enregistrer la date d'accès dans la table des accès (provisoire jusqu'à l'étape 6).

### 4. Accepter et refuser : quelle interface

BlockNote fournit les fonctions (accepter ou refuser une suggestion, toutes les suggestions) et l'info-bulle qui montre l'auteur, mais **pas de boutons** pour accepter ou refuser. Il faudra donc une petite interface. Proposition : un essai en captures de deux ou trois dispositions (boutons dans l'info-bulle ou la barre de mise en forme quand le curseur est dans une suggestion ; « tout accepter, tout refuser » dans l'en-tête), avec les composants Mantine sans réglage ; tu choisis.

### 5. Présence du correcteur et du lecteur

Aujourd'hui, un correcteur ou un lecteur ne publie pas sa présence (curseur, « personnes sur ce document ») : les autres ne le voient pas (constat de l'étape 2). Proposition : leur permettre de **publier leur présence** (y/hub, droit de présence), sans droit d'écrire.

### 6. Les renoncements prévus au § 8 pour cette étape

1. **Règle D2 de la v1** (une correctrice ne fait pas disparaître la proposition d'une autre personne) : dans BlockNote, effacer la suggestion d'un autre la supprime. Proposition : **renoncer**, et adopter la règle de l'outil ; la faire respecter demanderait d'analyser chaque modification côté serveur, du code à nous.
2. **Couleurs stockées** (v1) : BlockNote donne une couleur par personne, calculée ; proposition : renoncer.
3. **Cartes appariées** (affichage des modifications de la v1) : proposition : renoncer, au profit de l'affichage de BlockNote.

## Risques connus, à vérifier en premier

1. **Typographie en mode suggestion** : un remplacement à la frappe doit rester une seule suggestion propre (risque noté à l'étape 4).
2. ~~Notes de bas de page en mode suggestion~~ : sans objet, les notes sont retirées (08/11/2026).
3. **Mémoire** : un second document (la branche de suggestions) par document ouvert ; à mesurer.

## Contenu, en lots (après arbitrage)

0. **Essais** dans le brouillon : suggestions sur une branche y/hub avec la typographie et les notes (risques 1 et 2) ; dispositions pour accepter et refuser (captures).
1. **Adaptateur y/hub et serveur** : branche de suggestions et permissions par rôle (lecture de la principale et écriture des suggestions pour le correcteur ; les deux pour l'éditeur ; présence pour tous) ; date d'accès et historique depuis cette date ; routes des commentaires (si option a).
2. **Adaptateurs Yjs et BlockNote** : second document (suggestions), mode suggestion imposé au correcteur, commentaires, historique.
3. **Interface** : composants de BlockNote tels quels ; accepter et refuser selon ton choix ; textes traduits.
4. **Tests** par couche, et la **campagne de saisie** de la v1 rejouée (critère de sortie du § 8).

## Critères de sortie

1. Un correcteur ne peut que proposer : rien de ce qu'il tape n'atteint la branche principale, quelle que soit la façon de s'y prendre.
2. L'éditeur accepte ou refuse chaque suggestion, ou toutes ; le résultat survit au rechargement et converge à plusieurs.
3. Les commentaires respectent les rôles, vérifiés côté serveur (si option a).
4. L'historique montre les modifications à partir de la date d'accès ; l'éditeur revient à une version.
5. La campagne de saisie de la v1 est rejouée ; tests T0 à T5 verts ; audit partiel avant la fusion.

## Hors périmètre

Invitations, comptes, stockage définitif des accès (étape 6) ; exports des suggestions et des commentaires (étape 7) ; Margo comme auteur de suggestions (étape 8) ; sauvegarde de la base v2 (mise en ligne avec de vrais textes).

## Arbitrage de Sylvain (08/11/2026)

1. Commentaires **écrits par notre serveur** (`RESTYjsThreadStore`, droits vérifiés côté serveur).
2. Le lecteur **ne commente pas** : il lit seulement.
3. **Plus simple : tout le monde a accès à tout l'historique** (pas de date d'accès à enregistrer) ; nommer une version et y revenir restent à l'éditeur et au propriétaire (`restaurer`).
4. Accepter et refuser : essai de deux ou trois dispositions en captures, Sylvain choisit.
5. Correcteur et lecteur publient leur présence, sans droit d'écrire.
6. Renoncements : règle D2, couleurs stockées, cartes appariées (registre, n° 9 à 11).


## Essais du lot 0 (08/11/2026)

Page d'essai locale (deux postes, chacun avec son document principal et son document de suggestions, reliés comme par y/hub), BlockNote 0.57 tel quel, avec le schéma du livre, la typographie et les notes.

Ce qui marche :
1. Le mode suggestion : ce que tape le correcteur reste dans le document de suggestions ; le principal ne change pas avant l'acceptation ; « tout accepter » et « tout refuser » donnent le bon résultat chez les deux postes.
2. Les notes en mode suggestion (risque 2) : insérer une note et écrire dedans fait une suggestion ; l'accepter la porte dans le principal, la refuser la retire.

Ce qui ne marche pas :
3. **Typographie en mode suggestion (risque 1)** : nos règles ne s'appliquent pas (guillemets droits, pas d'espace fine), avec l'erreur « Applying a mismatched transaction ». C'est un **défaut amont** : les remplacements de BlockNote lui-même (« # » → titre, « - » → liste) échouent de la même façon. Cause : le module de règles de saisie envoie deux transactions de suite, la seconde préparée sur un état que la synchronisation du mode suggestion a déjà changé. Une variante de notre extension qui fait le remplacement **en une seule transaction** fonctionne en mode suggestion (« monde !» donne une seule suggestion propre, avec l'espace fine, dans le texte comme dans une note). Noté dans la veille.
4. **Ancre des commentaires du correcteur** : quand le correcteur (mode suggestion) commente un passage, le fil est créé mais **aucune marque n'est posée dans le texte** (le commentaire n'est rattaché à rien) ; pour l'éditeur, la marque est posée. La marque d'un commentaire vit dans le texte du document principal, où le correcteur n'écrit pas.
5. **Correction du plan** : Docs n'utilise pas `RESTYjsThreadStore`. Son magasin de fils est le sien (routes de son serveur pour les fils et les commentaires), et **la marque est posée par le navigateur**, dans le texte ; une personne qui ne peut pas modifier le document n'a pas d'interface de commentaire. Docs ne résout donc pas le cas de notre correcteur.

Réponses de Sylvain (08/11/2026) :
- typographie : **le correcteur n'a pas la typographie à la frappe** tant que BlockNote n'a pas corrigé le défaut (option 2) ; la variante en une transaction n'est pas retenue ;
- ancre des commentaires : **le serveur pose la marque** dans le texte principal (option 1 ; dans l'option 2, le commentaire n'aurait été lié à aucun bloc), après un essai de faisabilité ;
- avant de poursuivre l'étape, **les notes de bas de page sont retirées** et archivées (`docs/v2-archives/notes-2026-11-08/`).

## Ce que fait Docs (lu dans son code, branche `main`, 08/11/2026)

Docs est passé de Hocuspocus à **y/hub** (version 6.0.0, `src/yhub-server/`) : son montage est le modèle direct du nôtre.

1. **Rôles** (`src/backend/core/choices.py`, `models.py`) : lecteur, **commentateur** (« peut lire et commenter »), éditeur, administrateur, propriétaire. Le commentateur a `comment` mais ni `update` ni `partial_update`.
2. **Permissions y/hub** (`src/yhub-server/src/permissions.ts`, `server.ts`) : écriture (`ydoc`, `ws` en `-ru-`) seulement avec `update` ; sinon lecture (`-r--`). **Seule la branche `main`** est ouverte (toute autre est refusée). **Présence** : celui qui ne peut pas écrire **reçoit la présence sans publier la sienne** (correctif de sécurité de la 6.0.0, « stop read-only users from sharing their cursor ») ; c'est un écart voulu par rapport au défaut de y/hub. **Historique** : à partir de la date d'accès (`accessSince`), retour à une version pour l'éditeur seulement.
3. **Commentaires** : Docs n'utilise ni `YjsThreadStore` ni `RESTYjsThreadStore`, mais **son propre magasin** (`DocsThreadStore`, dérivé de `ThreadStore`) : les fils et les commentaires sont dans **sa base de données** (modèles `Thread`, `Comment`, routes `documents/{id}/threads/…`, droits vérifiés par le serveur : `CommentPermission`, auteur seul pour modifier, modération par l'administrateur et le propriétaire). Seule l'**ancre** est dans le texte : la marque `comment` posée **par le navigateur** (`setMark`). Le serveur n'écrit jamais dans le document Yjs pour un commentaire.
4. **Le commentateur ne peut pas commenter dans l'interface** : sans `partial_update`, il reçoit l'éditeur en lecture seule (`BlockNoteReader`), sans bulle de saisie ni fil. Son rôle n'a d'effet que sur l'API. Docs ne résout donc pas l'ancre d'un commentaire posé sans droit d'écrire.
5. **Pas de mode suggestion** dans Docs (ni extension, ni branche).

Conséquences pour cette étape : questions posées à Sylvain le 08/11/2026 (journal). L'essai de l'ancre posée par le serveur est arrêté à mi-chemin (partie serveur concluante, partie navigateur non faite) en attendant ses réponses.

### Réponses de Sylvain (08/11/2026)

1. **a** : fils et commentaires dans **notre base** (PostgreSQL), avec notre propre magasin de fils côté navigateur, comme Docs (`DocsThreadStore`) ; droits vérifiés par le serveur. Remplace la réponse 1 de l'arbitrage (`RESTYjsThreadStore`).
2. **b** : écart assumé avec Docs, **le serveur pose l'ancre** du commentaire d'un correcteur dans le texte principal (essai en cours) ; l'éditeur et le propriétaire la posent dans leur navigateur, comme Docs.
3. **a** : comme Docs, le correcteur et le lecteur **ne publient pas leur présence** (ils voient celle des autres). Remplace la réponse 5 de l'arbitrage.
4. **a** : décision gardée, tout le monde voit tout l'historique.

À vérifier à la conception : Docs prévient les autres navigateurs d'un nouveau commentaire par la présence (« commentsPing ») ; un correcteur sans présence publiée ne le peut pas. Piste : l'ancre posée par le serveur est une modification du document, qui suffit à prévenir les autres.

### Essai de l'ancre posée par le serveur (08/11/2026) : concluant

Montage essayé (page d'essai, deux postes) :
- **Navigateur du correcteur** : la sélection est traduite en coordonnées du texte principal (identifiant du bloc et décalage, sans compter les insertions suggérées), plus le **passage cité**.
- **Serveur** : il relit le document principal (`ynodeToPmnode` de `@y/prosemirror` avec le transformateur de BlockNote), pose la marque `comment` avec ProseMirror, et en déduit la modification Yjs (différence des deltas, `lib0/delta`). Au lot 1, cette modification partira vers y/hub (`PATCH /ydoc`, identité du serveur).

Résultats :
1. Une insertion suggérée avant le mot et une suppression suggérée après : la marque tombe sur le bon mot, chez le correcteur et chez l'éditeur, sans apparaître comme une suggestion ; elle tient après « tout accepter ».
2. Sélection sur deux paragraphes : marque posée ; texte en italique : la marque s'y ajoute sans abîmer le style ; deux ancres : 252 octets de mise à jour.
3. Sélection faite seulement de texte suggéré : **refusée** (`ancre-vide`), rien dans le texte principal pour l'accrocher.
4. Texte principal modifié entre la sélection et la pose : **détecté** (`ancre-perimee`, le passage cité ne correspond plus) ; le navigateur recalcule et renvoie.
5. Bloc absent du texte principal (bloc entièrement suggéré) : `bloc-introuvable`.
6. Défaut d'affichage mineur : un texte suggéré inséré juste au bord du passage commenté peut s'afficher dans le surlignage du commentaire.

Paquets nouveaux pour le serveur : `@y/prosemirror` (déjà là), `prosemirror-transform` et `lib0/delta` (dépendances de BlockNote, dans ses versions), à placer dans l'adaptateur BlockNote côté serveur ; le contrat d'une seule copie s'étend à `prosemirror-transform`.

### Accepter et refuser : essai de trois dispositions (08/11/2026)

Ni Docs (pas de suggestions) ni les exemples de BlockNote (aucun bouton : seulement les fonctions) n'en proposent. Trois dispositions essayées avec les composants de Mantine sans réglage, la correctrice tapant au clavier (remplacement, ajout, suppression), avec « Tout accepter » et « Tout refuser » en tête dans les trois :

- **A. Boutons dans l'info-bulle** qui s'ouvre au survol d'une suggestion : **ne marche pas tel quel**, l'info-bulle de BlockNote disparaît quand la souris la rejoint ; il faudrait la retenir, du code en plus.
- **B. Petite barre au-dessus de la suggestion** où se trouve le curseur (auteur, Accepter, Refuser) : marche ; sa place doit être réglée pour ne pas couvrir le texte ni l'info-bulle.
- **C. Panneau à côté du texte**, une ligne par suggestion (« Carla supprime « loin du centre » », Accepter, Refuser) : marche, le plus lisible ; un remplacement y fait deux lignes (suppression puis ajout), qu'on peut réunir en « remplace … par … ».

Captures envoyées à Sylvain ; choix à venir.

Choix de Sylvain (08/11/2026) : **C**, le panneau à côté du texte, un remplacement sur une seule ligne (« remplace … par … ») ; « avance ».

## Avancement du développement

- **Lot 1a, domaine** (`domaine/droits.js`) : `accesBranche(capacités, branche)` (texte en écriture ou en lecture, présence, restaurer ; branches `main` et `suggestions` seulement ; **le lecteur ne voit pas les suggestions**, choix de Claude par défaut, comme le lecteur de Docs qui n'a que le texte) ; `peutCommenter` (modèle de Docs : commenter à partir du correcteur ; modifier le sien seulement ; supprimer et résoudre : le sien, ou tout fil pour qui peut arbitrer).
- **Lot 1b, y/hub et serveur** : permissions par branche calculées depuis le domaine (adaptateur y/hub, comme `permissions.ts` de Docs) ; la route interne des droits prend la branche ; présence publiée seulement par qui écrit le texte ; historique entier pour tous, versions et retour arrière pour qui peut restaurer. Tests de service sur y/hub réel (accès par branche et par rôle, présence).
- **Lot 1c, commentaires côté serveur** : dépôt dans PostgreSQL (`adaptateurs/postgres/`, schéma `amend` dans la base de y/hub, une seule base à installer d'ici l'étape 6), routes sur le modèle de Docs (`application/serveur/commentaires.js`), droits vérifiés par le domaine à chaque requête, flux d'événements pour prévenir les navigateurs (Docs passe par la présence, que le correcteur ne publie plus). Tests contre PostgreSQL.
- **Ancre posée par le serveur : en attente d'une révision de la règle 1** (question à Sylvain, 08/11/2026). Le serveur doit lire le texte dans y/hub et y écrire la marque : l'adaptateur BlockNote (côté serveur) a besoin de `prosemirror-transform` et de `lib0/delta`, l'adaptateur y/hub de `lib0` (l'encodage des requêtes de y/hub). Proposition : les permettre à ces deux adaptateurs seulement, dans les versions qu'embarquent BlockNote et y/hub (une seule copie, contrat étendu), comme la révision de l'étape 4 pour les extensions.
- **Règle 1, seconde révision** (Sylvain, 09/11/2026, « ok pour 1 ») : `prosemirror-transform` et `lib0` permis à la partie serveur de l'adaptateur BlockNote, `lib0` à l'adaptateur y/hub ; contrat d'une seule copie étendu.
- **Ancre posée par le serveur** : `ancreCommentaire` (adaptateur BlockNote, côté serveur), identité interne de notre serveur auprès de y/hub (lire et écrire le texte principal seulement, jeton interne), client `clientCollaboration` (adaptateur y/hub), route `POST …/fils/:fil/ancre` (l'auteur du fil seulement ; passage périmé : 409 ; y/hub injoignable : 503). Modification attribuée au correcteur (`pour`). Testé de bout en bout contre y/hub et PostgreSQL.

