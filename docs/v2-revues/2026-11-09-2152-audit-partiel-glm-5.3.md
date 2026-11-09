# Audit partiel avant fusion (2026-11-09)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 130219 signes envoyés, 5118 reçus (et 11409 de réflexion) ; réflexion `low` ; 20 s ; arrêt : stop
- Diff audité : `v2/` de `3aa6cba` à `8482b4f` (26 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot format S (téléphone) : page d'édition dédiée, lecture/modification par appui, plan, renommage des documents, nouvelle dépendance icônes. L'ensemble respecte en général les couches et les réglages décidés, avec de bons tests de pile. Principaux points : un contournement du lint par réflexion sur ProseMirror dans l'adaptateur, une mutation pendant le rendu React, un test de robustesse qui n'attend probablement rien, et une clé morte dans `exceptions.json`.

## Constats

1. **[important]** Grille 1/2 (couches, API publique) — `v2/adaptateurs/blocknote/index.jsx:199`
Le code récupère la classe `Selection` par réflexion (`vue.state.selection.constructor`) pour appeler `Selection.near`, en arguant dans le commentaire (ligne 197-198) que « ProseMirror n'est importé que par ses points d'extension publics ». C'est exactement le contraire : on utilise l'API de `prosemirror-state` sans l'importer, pour esquiver la règle 1 qui ne permet ce paquet qu'aux extensions. Proposition : demander à Sylvain la même exception que pour `prosemirror-transform`/`lib0` (adaptateur BlockNote), avec import explicite et contrat, plutôt que cette réflexion fragile.

2. **[important]** Grille 6 (correction) — `v2/adaptateurs/blocknote/index.jsx:191`
`if (controle) controle.current = { terminer }` mute une ref pendant le rendu : effet de bord en plein render, réexécuté à chaque rendu, contraire aux règles de React (peut être perdu ou dupliqué selon le mode strict). Proposition : `useEffect(() => { if (controle) controle.current = { terminer } }, [controle, terminer])` ou affectation via callback ref.

3. **[important]** Grille 7 (tests) — `v2/contrats/pile/robustesse.test.js:121`
`attendreTexte(a, '')` : si `attendreTexte` attend qu'un texte *contienne* la chaîne, contenir `''` est toujours vrai et l'attente ne vérifie rien — le test n'atteste pas que le second document a remplacé le premier, contrairement à ce qu'annonce le commentaire (lignes 119-121). La ligne 123 fait de même. Proposition : attendre une condition réelle (disparition de « Premier document. », ou titre « Sans titre » présent dans le bandeau).

4. **[important]** Grille 6/7 (correction, tests) — `v2/design/feuilles/telephone.css:37`
La règle `css.telephone.titres` assigne une variable `--level` aux blocs titre, mais rien ne montre que BlockNote dimensionne ses titres par cette variable ; si ce n'est pas la bonne, la règle ne fait rien et aucun test ne mesure la taille rendue. Proposition : vérifier dans le code de BlockNote la variable réellement utilisée, et ajouter une assertion de taille dans `telephone.test.js`.

5. **[mineur]** Grille 6 (correction) — `v2/adaptateurs/blocknote/index.jsx:216`
Le `useEffect` du `visualViewport` n'a pas de tableau de dépendations : l'écouteur est retiré/remis à chaque rendu et `clavierOuvert` se réinitialise en cours de route ; le seuil 0,8 (ligne 211) peut aussi se déclencher sur rotation ou zoom. Proposition : dépendances `[enModification]` et état `clavierOuvert` conservé hors du rappel.

6. **[mineur]** Grille 9/4 (i18n, code mort) — `v2/i18n/exceptions.json:6`
`document.titre` reste listé dans `identiques` alors que la clé a été retirée des catalogues (`v2/i18n/fr.json:20`, `en.json:20`). Entrée morte ; si le test de complétude ne la signale pas, c'est aussi une lacune du test. Proposition : retirer la clé de `exceptions.json`.

7. **[mineur]** Grille 6 (correction) — `v2/design/composants/ListeDocuments.jsx:85`
`l.cellules.filter(Boolean).join(' · ')` suppose des chaînes ; si une cellule est un élément React (actions, badge), le rendu donnera « [object Object] ». Proposition : filtrer sur `typeof c === 'string'` ou ne joindre que les cellules textuelles déclarées comme telles.

8. **[mineur]** Grille 5/6 (droits, cas limite) — `v2/application/client/App.jsx:824`
`navigator.clipboard?.writeText(location.href)` échoue silencieusement si l'API est absente ou refusée (contexte non sécurisé, permission) : l'entrée de menu « Copier le lien » ne fait alors rien, sans message. Proposition : au minimum un retour d'erreur traduit.

9. **[question]** Grille 1 (design/technique) — `v2/application/client/App.jsx:716`
`window.prompt` / `window.alert` pour le renommage et l'erreur : natifs, donc sans valeur de design à nous, mais l'apparence d'un champ de saisie du titre relève en principe du design (règle 16-17) et la maquette validée ne mentionne pas ce moyen. À confirmer avec Sylvain, ou à remplacer par un composant de présentation.

10. **[question]** Grille 6 (correction) — `v2/application/client/App.jsx:856`
Le lien « Tous les documents » (`href: '#'`, `actif: false`) mène en pratique à « Mes documents » (hash vidé) : libelle trompeur ou comportement non décidé. À clarifier avec Sylvain.

11. **[question]** Grille 10 (licences) — `v2/package.json:18`
`@tabler/icons-react` 3.51.0 (MIT, compatible AGPL) : dépendance nouvelle conforme, mais je n'ai pas la preuve dans le diff qu'elle a été notée en revue comme l'exige l'ADR 0006. À confirmer dans le dossier de revue.

## Points de grille sans remarque
3 (redondance amont), 8 (exports propres).

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

## Réponse de Claude

1. **Juste, corrigé autrement.** Plus aucun usage de ProseMirror : le curseur est posé par la sélection du navigateur (`caretPositionFromPoint` ou `caretRangeFromPoint`), que l'éditeur relit. Un test vérifie qu'un appui au début du texte y place le curseur.
2. **Juste, corrigé.** `controle.current` est affecté dans un `useEffect`, plus pendant le rendu.
3. **Faux.** `attendreTexte` compare par égalité stricte (`contrats/pile/outils.mjs`) : `''` veut dire « le document est vide ». Le commentaire le précise désormais.
4. **Vérifié, et testé.** BlockNote dimensionne ses titres par `--level` (`@blocknote/core/dist/style.css`). Le test du format S mesure 25,6 px (1,6 rem) au niveau 1, à 390 px de large.
5. **Juste, corrigé.** Dépendance `[enModification]`. La rotation et le zoom ne réduisent pas la zone visible de plus de 20 % : pas de faux retour en lecture attendu. Point déjà noté : essai sur un vrai téléphone.
6. **Juste, corrigé.** `document.titre` est retiré de `exceptions.json`.
7. **Faux en pratique.** Les cellules sont des chaînes par contrat (type déclaré `string[]`) ; les actions passent par `actions`.
8. **Juste, corrigé.** « Lien copié. », ou bien « Le lien n'a pas pu être copié : … » avec le lien à copier à la main.
9. **Déjà arbitré.** Les boîtes de dialogue du navigateur restent jusqu'aux écrans de 6b (Sylvain, audit de l'étape 6c).
10. **Juste, corrigé.** Le lien s'appelle « Mes documents », ce qu'il ouvre.
11. **Conforme.** `@tabler/icons-react` est sous licence MIT, vérifiée par le contrat `contrats/statiques/licences.test.js`. Elle était déjà utilisée par la maquette validée, et son ajout a été décidé au plan du format S (2.1).

## Arbitrage de Sylvain

(À compléter.)
