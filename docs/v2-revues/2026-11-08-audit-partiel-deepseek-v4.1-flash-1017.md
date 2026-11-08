# Audit partiel avant fusion (2026-11-08)

- Auditeur : Scaleway, modèle `deepseek-v4.1-flash-1017` ; consommation : 144767 signes envoyés, 6062 reçus (et 0 de réflexion) ; réflexion `none` ; 9 s ; arrêt : stop
- Diff audité : `v2/` de `bec9478` à `c5b1abf` (41 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff est globalement cohérent avec les règles (couches, API publique, i18n, NFC). Plusieurs points méritent vérification : un `useMemo` avec dépendances vides qui fige les libellés à la langue initiale, un `surNotes` non mémorisé qui relance l'abonnement à chaque rendu, un contrat statique qui ne vérifie pas ce qu'il annonce (règles CSS hors réglage), et un test de menu qui dépend de libellés BlockNote en dur. Le contrat « une seule copie ProseMirror » compare une version installée à une demande `^` de BlockNote sans vérifier la version exacte attendue.

## Constats

A1. **[important]**, grille 6, `v2/application/client/App.jsx:118-123` — `useMemo(() => ({ note: { titre: t(...), … } }), [])` a des dépendances vides alors que `t` dépend de la langue : si la langue change (ou si `t` est recréé), les libellés du menu restent dans l'ancienne langue. Proposition : ajouter `t` (ou `t.langue`) aux dépendances.

A2. **[important]**, grille 6, `v2/application/client/App.jsx:144` — `surNotes={setNotes}` est stable (setter de `useState`), mais dans `v2/adaptateurs/blocknote/index.jsx:49-54` l'effet dépend de `surNotes` ; si un appelant passe une fonction non mémorisée, l'abonnement `onChange` est refait à chaque rendu. Ici c'est sûr, mais le contrat de l'adaptateur n'est pas documenté. Proposition : soit documenter que `surNotes` doit être stable, soit mémoriser en interne.

A3. **[important]**, grille 7, `v2/contrats/statiques/design-decide.test.js:47-51` — `reglagesDeLaFeuille` ne vérifie que l'absence de `{` avant la première clé ; une règle CSS ajoutée après la dernière clé (ou entre deux clés sans nouvelle clé) passe le contrat sans être rattachée à un réglage. Le test annonce « aucune règle hors d'un réglage » mais ne le vérifie pas. Proposition : découper par clé et vérifier que chaque segment contient au plus une règle, ou compter les `{` par segment.

A4. **[important]**, grille 7, `v2/contrats/pile/editeur.test.js:111-114` — le test du menu « / » cherche des libellés français en dur (« Titre 1 », « Citation », « Liste à puces »…) : il dépend du dictionnaire BlockNote et de la langue de l'interface, et cassera à la première montée de version ou au premier passage en anglais. Proposition : vérifier par type de bloc (`data-content-type` ou équivalent) plutôt que par libellé.

A5. **[important]**, grille 7, `v2/contrats/statiques/une-seule-copie-prosemirror.test.js:24-31` — la vérification « celle de BlockNote » compare la version installée à la contrainte `^` de BlockNote, pas à la version exacte qu'il embarque : une version plus récente que celle de BlockNote passerait. Le commentaire annonce « celle que BlockNote demande ». Proposition : comparer à la version résolue dans le verrou pour `@blocknote/core` (ou vérifier que la copie est bien celle hissée par BlockNote).

A6. **[mineur]**, grille 4, `v2/adaptateurs/blocknote/index.jsx:57-70` — `elementsDuMenu` est recréé à chaque rendu et n'est pas mémorisé ; sans conséquence fonctionnelle mais inutile. Proposition : `useCallback` sur `[editeur, libelles]`, ou laisser tel quel si le coût est nul.

A7. **[mineur]**, grille 6, `v2/extensions/note/index.js:96-111` — `notesDuDocument` parcourt `b.content.rows` puis `cellule.content ?? cellule` : si une cellule est un tableau de nœuds inline (cas BlockNote), `contenu(cellule)` itère sur des nœuds texte et ne trouve pas les notes imbriquées dans un paragraphe de cellule. Le test `blocknote-serveur.test.js:98-117` passe parce que la cellule est un tableau plat. Proposition : vérifier la forme réelle des cellules BlockNote et adapter, ou ajouter un test avec un paragraphe dans la cellule.

A8. **[mineur]**, grille 9, `v2/i18n/exceptions.json:2` — `editeur.note.groupe` et `document.notes` sont déclarés « identiques » entre fr et en (« Notes » dans les deux) : c'est exact, mais `editeur.note.groupe` est un libellé de groupe de menu BlockNote, dont la traduction devrait venir du dictionnaire BlockNote (règle 29) plutôt que de nos catalogues. Proposition : vérifier si BlockNote fournit déjà ce libellé ; sinon documenter pourquoi on le duplique.

A9. **[question]**, grille 5, `v2/application/serveur/index.js:32-38` — le retrait de `.svg` et `.json` des types servis, et l'ajout de `.woff`, ne sont pas expliqués dans le diff. Si un asset `.svg` ou `.json` est servi par le serveur statique, il sera désormais renvoyé sans `content-type` correct. Proposition : confirmer que rien ne sert ces extensions, ou documenter le retrait.

A10. **[question]**, grille 2, `v2/adaptateurs/yhub/index.js:23` et `v2/adaptateurs/yjs/index.js:9` — `ORGANISATION` et `RACINE_TEXTE` passent de `export` à `const` : plus aucun export. Vérifier qu'aucun autre module (tests, application) ne les importait ; sinon c'est une rupture silencieuse. Proposition : confirmer par recherche, ou garder l'export si utilisé ailleurs.

A11. **[question]**, grille 6, `v2/extensions/typographie/index.js:67-77` — `annulerRemplacement` inverse les étapes du dernier `inputRules` sans vérifier que le dernier remplacement vient bien d'avoir eu lieu (le commentaire le dit, mais le code ne teste pas l'ancienneté). Un Backspace après un autre changement pourrait annuler un remplacement ancien. Proposition : vérifier que le test de retour arrière couvre ce cas (il semble le faire à `editeur.test.js:73-87`), sinon ajouter un garde-fou.

A12. **[mineur]**, grille 8, `v2/contrats/statiques/sources-sans-invisibles.test.js:12` — la regex `INVISIBLES` inclut `\u200D` (liant sans chasse) hors du groupe `[...]`, ce qui est correct, mais le commentaire cite « objet de remplacement » (`\uFFFC`) alors que `OBJET` dans l'extension typographie utilise bien `\uFFFC` — cohérent. Pas de défaut, mais vérifier que les fichiers `.css` ne sont pas scannés (ils ne le sont pas, filtre `m?js|jsx|json`) : les invisibles dans `notes.css` échapperaient au contrat. Proposition : inclure `.css` si l'on veut la même garantie.

## Points de grille sans remarque
1, 3, 10 (hors A8, qui est une question de duplication, pas de texte en dur).

## Citations vérifiées par le script

- A1 : citations valides
- A2 : citations valides
- A3 : citations valides
- A4 : citations valides
- A5 : citations valides
- A6 : citations valides
- A7 : **citation invalide** (v2/blocknote-serveur.test.js:98 hors du diff ou au-delà du fichier)
- A8 : citations valides
- A9 : citations valides
- A10 : citations valides
- A11 : **citation invalide** (v2/editeur.test.js:73 hors du diff ou au-delà du fichier)
- A12 : citations valides

## Réponse de Claude

- **A1 : faux.** `t` est fixé au chargement de la page.
- **A2 : juste, mineur.** `surNotes` doit être stable ; c'est le cas (`setNotes`), mais l'adaptateur ne le dit pas : une ligne de documentation.
- **A3 : faux.** Une règle placée après une clé appartient à cette clé, par construction (une clé peut couvrir plusieurs règles, comme `css.note.numerotation`) ; seule une règle avant la première clé serait sans réglage, et c'est ce qui est vérifié.
- **A4 : juste, mineur.** Le test du menu lit les libellés français du dictionnaire de BlockNote : fragile à une montée de version ; à rendre indépendant des libellés si BlockNote expose le type des éléments du menu.
- **A5 : faux.** BlockNote déclare une plage, pas une version exacte ; le contrat vérifie la copie unique et la compatibilité avec cette plage.
- **A6 : faux** (sans effet, comme il le dit).
- **A7 : faux.** Vérifié : une cellule BlockNote porte directement son contenu en ligne (`tableCell.content`), pas un paragraphe ; le test du 08/11 couvre ce cas.
- **A8 : faux.** « Notes » est notre groupe à nous ; BlockNote n'a pas de libellé pour lui.
- **A9 : faux** (voir la réponse 4 à GLM).
- **A10 : faux.** Vérifié pendant la passe : aucun import ailleurs ; lint et tests verts.
- **A11 : faux** (voir la réponse 3 à GLM). Citation invalide par ailleurs.
- **A12 : juste, mineur.** Le contrat des caractères invisibles ne lit pas les feuilles `.css` : à y ajouter.

Bilan : 12 constats, 3 justes (mineurs), 9 faux ou sans effet ; 2 citations invalides (nom de fichier sans chemin, mieux reconnu depuis).

## Arbitrage de Sylvain

(À compléter.)
