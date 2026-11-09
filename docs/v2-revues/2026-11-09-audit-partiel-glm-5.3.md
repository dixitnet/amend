# Audit partiel avant fusion (2026-11-09)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 223153 signes envoyés, 5721 reçus (et 37865 de réflexion) ; réflexion `low` ; 60 s ; arrêt : stop
- Diff audité : `v2/` de `8ecbe38` à `96ef7f2` (37 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot étape 5 (suggestions, commentaires, historique) globalement bien placé par couches et fidèle au montage de Docs ; les droits sont vérifiés côté serveur à chaque requête et les textes passent tous par les catalogues ICU. Le point le plus sensible est une condition de course dans la pose d'ancre par le serveur (lecture puis écriture du texte sans re-vérification). Plusieurs points reposent sur des API de Yjs 14 / y/hub / BlockNote que je ne peux pas vérifier ici : classés en questions. Dépendances nouvelles (`postgres` MIT, `prosemirror-transform` MIT) à licences compatibles.

## Constats
1. **[important]** Grille 6 (condition de course), `v2/application/serveur/commentaires.js:135`–`136`, `v2/adaptateurs/blocknote/serveur.js:104`–`135` : l'ancre est calculée sur un instantané lu dans y/hub (`lireTexte`), puis la mise est écrite plus tard (`ecrireTexte`) ; si le texte change entre les deux, la marque peut se poser au mauvais endroit (la citation a été validée sur l'état périmé, et le delta s'applique sur un fragment qui a bougé). Proposer : re-lire et re-vérifier après écriture (comparaison de vecteur d'état), ou documenter l'acceptation de la course avec sa probabilité.
2. **[question]** Grille 2, `v2/adaptateurs/blocknote/historique.js:30`–`34` : le filtrage du stockage par `Object.getOwnPropertyDescriptors` suppose que `createYHubVersionStorage` rend un objet littéral (des méthodes au prototype donneraient un objet vide) et manipule l'objet de la fondation par réflexion. Vérifier la forme réelle retournée et, si possible, filtrer par une copie explicite des seules méthodes de lecture.
3. **[question]** Grille 2, `v2/adaptateurs/blocknote/commentaires.js:116`–`118` : `getThreads()` rend une `Map` ; si l'API de `ThreadStore` attend un tableau de `ThreadData` (itération directe), BlockNote parcourra des paires `[id, fil]`. Vérifier le contrat ; les tests de pile ne semblent couvrir que la marque, pas la liste des fils rendue par BlockNote.
4. **[question]** Grille 1, `v2/adaptateurs/postgres/index.js:7`, `v2/eslint.config.js:178`–`186` : PostgreSQL est couche 0 (plateforme) dans les règles, pas une fondation de la couche 1 ; la liste des adaptateurs (« un dossier par fondation ») ne le nomme pas, et le dépôt des commentaires aurait pu vivre dans l'application (couche 5). Par ailleurs `permises: ['serveur']` : ce motif couvre-t-il bien le paquet `postgres` importé ligne 7 ? À trancher avec Sylvain ou à déplacer.
5. **[mineur]** Grille 6, `v2/adaptateurs/blocknote/commentaires.js:20`, `96`–`99` : quand `point()` rend `null` (sélection hors bloc), `addThreadToDocument` ne fait rien : le fil est créé sans ancre, sans erreur remontée à la personne. Proposer : rejeter la création côté magasin pour que BlockNote annule le fil.
6. **[mineur]** Grille 6, `v2/adaptateurs/blocknote/index.jsx:72`–`88` : les dépendances de `useCreateBlockNote` omettent `suggerer` et `langue`, qui déterminent pourtant les extensions (typographie conditionnelle) et le dictionnaire ; un changement de mode ou de langue d'interface ne reconstruirait pas l'éditeur. Les ajouter (mode et langue sont stables aujourd'hui, mais la liste doit dire la vérité).
7. **[mineur]** Grille 4, `v2/adaptateurs/yhub/index.js:34`, `v2/adaptateurs/yhub/client.js:6`, `v2/adaptateurs/blocknote/historique.js:23`, `v2/adaptateurs/yjs/index.js:19` : la constante d'organisation `'amend'` est écrite quatre fois, et `jetonValide` est dupliquée entre `v2/adaptateurs/yhub/index.js:42` et `v2/application/serveur/index.js:34`. Proposer une source unique (export de l'adaptateur y/hub, ou domaine).
8. **[mineur]** Grille 5, `v2/application/serveur/index.js:97`–`105`, `73`–`77`, `214` : la carte des noms en mémoire n'est remplie que par `/api/moi` et la session de développement ; le `personneDe` donné à `creerCommentaires` (ligne 214) n'y écrit pas, et `/api/personnes` révèle à toute personne connectée le nom de quiconque est passé par ce processus. Acceptable en attendant l'étape 6 (documenté), mais l'écart entre les deux `personneDe` est une source de noms manquants silencieux.
9. **[mineur]** Grille 7, `v2/contrats/pile/pile.test.js:160`–`191` : l'ancien test « y/hub refuse l'écriture forcée sur le texte principal » a disparu ; rien ne vérifie plus qu'un client qui force l'écriture sur `main` (outils de développement) est refusé par y/hub (les tests de branches ne testent que les codes de connexion). Proposer de réintroduire cette vérification.
10. **[mineur]** Grille 6, `v2/adaptateurs/blocknote/serveur.js:20`–`22` : le `Y.Doc` créé pour le `YjsThreadStore` de l'éditeur sans vue n'est jamais détruit (fuite unique, sans conséquence réelle, mais un `destroy` coûte une ligne).
11. **[mineur]** Grille 5, `v2/application/serveur/index.js:30` : `V2_POSTGRES` a un repli par défaut contenant des identifiants (`amendv2:amendv2-dev`), contrairement au secret de session dont l'absence doit arrêter le serveur. Proposer : pas de repli, l'absence de la variable arrête.
12. **[question]** Grille 2, `v2/adaptateurs/yjs/index.js:47`, `26`, `v2/adaptateurs/yhub/client.js:4`, `24`, `34` : `Y.Doc({ isSuggestionDoc: true })`, `Y.decodeContentMap`, `lib0/buffer` (`encodeAny`/`decodeAny`) et le format `customAttributions` du PATCH de y/hub : vérifier dans les contrats que ce sont des API publiques des versions épinglées (et non des chemins internes ou des options non documentées).
13. **[mineur]** Grille 6, `v2/application/client/App.jsx:160`–`164` : l'effet des noms peut lancer plusieurs fois la même requête (pas de garde contre un appel en cours) quand `suggestions` change avant la réponse. Proposer un ensemble des identifiants en attente.

## Points de grille sans remarque
3, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides
- 8 : citations valides
- 9 : citations valides
- 10 : citations valides
- 11 : citations valides
- 12 : citations valides
- 13 : citations valides

## Réponse de Claude

1. **Faux pour le « mauvais endroit », juste pour le passage changé.** La marque s'écrit dans Yjs, qui la rattache aux caractères eux-mêmes (identifiants des éléments), pas à des positions : si le texte bouge ailleurs entre la lecture et l'écriture, elle reste sur le passage cité. Si le passage lui-même est modifié dans cet intervalle (moins d'une seconde), la marque couvre ce qui en reste. Course acceptée, notée ici ; pas de correctif.
2. **Faux.** `createYHubVersionStorage` rend un objet littéral (méthodes propres, `return { … }` dans `@blocknote/core/y`) ; vérifié dans le navigateur : la correctrice n'a pas le bouton « nommer une version », l'éditrice l'a (test `historique` de `contrats/pile/relecture.test.js`).
3. **Faux.** Le contrat de `ThreadStore` de BlockNote demande une `Map` (`YjsThreadStoreBase.getThreads` en rend une) ; le fil se voit chez l'éditrice (test `commentaire du correcteur`).
4. **Question pour Sylvain, sans urgence.** `postgres` (le client) est traité comme une fondation par le lint (famille `serveur`, qui couvre bien ce paquet ; le lint passe) : un adaptateur à lui, comme y/hub. Le dépôt pourrait vivre dans l'application ; le garder dans l'adaptateur isole le SQL. À confirmer à l'étape 6 (stockage définitif).
5. **Juste, corrigé.** Un fil qu'on n'a pas pu ancrer (sélection hors bloc, passage périmé, y/hub injoignable) est retiré, et l'erreur remonte à BlockNote.
6. **Juste, corrigé.** `langue` et `suggerer` ajoutés aux dépendances de l'éditeur.
7. **Hors sujet (voulu).** Les adaptateurs ne s'importent pas les uns les autres (règles, § 2) : chacun garde son nom d'organisation ; `jetonValide` existe dans le serveur et dans l'adaptateur y/hub pour la même raison (le domaine ne peut pas importer `node:crypto`).
8. **Juste, corrigé.** Une seule lecture de session (`creerIdentite`) pour toutes les routes, commentaires compris : les noms sont retenus partout. La visibilité des noms à toute personne connectée est provisoire (étape 6), déjà notée.
9. **Faux.** La vérification existe au niveau des services : `tests/services/collaboration.test.js`, « correcteur : sa modification n'atteint pas les autres » (un client Yjs qui écrit quand même sur `main`, refusé par y/hub, état relu côté serveur).
10. **Juste, non corrigé.** Un seul document, créé une fois par processus et gardé tant qu'il vit : sans effet.
11. **Juste, corrigé.** Hors développement, pas de repli : sans `V2_POSTGRES`, le serveur s'arrête (le fichier `/opt/amend/v2.env` de l'installation la fournit déjà).
12. **Faux.** Vérifié : `isSuggestionDoc` est une option documentée de `Y.Doc` (`DocOpts`), `decodeContentMap` est exporté par `@y/y`, `lib0/buffer` est un chemin déclaré dans les `exports` de lib0 (contrat `api-publique`), `customAttributions` est dans le schéma du `PATCH /ydoc` de y/hub (`builtin-api.js`).
13. **Juste, corrigé.** Un nom n'est demandé qu'une fois (ensemble des demandes en cours).

Après corrections : 118 tests rapides et 35 sur la pile au vert.


## Arbitrage de Sylvain

(À compléter.)
