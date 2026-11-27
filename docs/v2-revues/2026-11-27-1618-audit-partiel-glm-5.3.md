# Audit partiel avant fusion (2026-11-27)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 466001 signes envoyés, 3313 reçus (et 12243 de réflexion) ; réflexion `low` ; 340 s ; arrêt : stop
- Diff audité : `v2/` de `a209fb7` à `6aca364` (7 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce lot ajoute la « grille stricte » comptée en lignes : un module de domaine (`miseEnPageLignes.js`), l'extraction partagée `ecritureTypst.js`, des tests unitaires nombreux et un contrat qui compile réellement des PDF. Le respect des couches est bon (domaine pur, contrats libres d'importer) et la couverture de tests est sérieuse, y compris un test « le contrôle mord ». Les constats portent surtout sur des validations manquantes dans `grilleEnLignes` et sur quelques points à éclaircir (usage de `lignesOccupees`, sous-chemin wasm, placement du contrat).

## Constats
1. **[important]** Grille 6 (correction), `v2/domaine/miseEnPageLignes.js:104` — `grilleEnLignes` ne valide que `page.hauteur`, `marges.haut` et la grille : `page.largeur`, `marges.interieure` et `marges.exterieure` absents ou non numériques passent la vérification et produisent `NaN` dans le gabarit (`mm(page.largeur)` à la ligne 237), au lieu du code `modele-impossible` attendu (le test ligne 160 ne vérifie l'absence de NaN que sur un modèle valide). Proposer de les ajouter au tableau `mesures`.
2. **[question]** Grille 6 (correction), `v2/domaine/miseEnPageLignes.js:239` — quand un en-tête est demandé, `header-ascent: amend-pas` suppose que la marge de tête laisse la place à l'en-tête plus une ligne blanche, mais `grilleEnLignes` ne vérifie jamais `marges.haut` à cet effet (seul le folio bas a son contrôle, ligne 116). Un modèle à marge de tête très courte pourrait faire chevaucher en-tête et texte. À vérifier sur un cas concret, puis à valider comme `folio`.
3. **[question]** Grille 2 (API publique), `v2/contrats/statiques/grille-en-lignes.test.js:22` — `resolve('@blocknote/xl-typst-compiler/wasm')` résout un sous-chemin du paquet ; si `wasm` n'est pas un export public du paquet (règle 2 : aucun chemin interne), c'est une dépendance fragile à la montée de version. Vérifier les `exports` du paquet ; sinon passer par l'API publique du compilateur.
4. **[mineur]** Grille 4 (simplicité), `v2/domaine/miseEnPageLignes.js:55` — `lignesOccupees` est exporté (jusque dans `domaine/index.js:64`) mais n'est utilisé nulle part dans le gabarit : les titres sont mesurés par Typst lui-même (`amend-mesure`, ligne 272). Seuls les tests s'en servent. Si aucun appelant (formulaire, adaptateur) n'arrive au lot suivant, c'est du code mort à retirer.
5. **[mineur]** Grille 4 (simplicité), `v2/contrats/statiques/grille-en-lignes.test.js:1` — ce contrat compile des PDF (Typst, polices, navigateur de fichiers) ; le ranger dans `contrats/statiques/`, fait pour des contrôles statiques, est trompeur. Proposer `contrats/` à la racine du dossier des contrats de fondation.
6. **[question]** Grille 6 (correction), `v2/domaine/miseEnPageLignes.js:257` — le gabarit fixe le corps du texte à `g.corps` et ignore `styles.texte.corps` s'il est réglé (le repli de `styleDe` ligne 82 ne sert pas ici) : un modèle qui le règle verrait sa valeur silencieusement écartée. Soit l'interdire dans la validation, soit l'utiliser.
7. **[mineur]** Grille 6 (correction), `v2/domaine/miseEnPageLignes.js:305` — un `folio.depart` non entier ou ≤ 1 est ignoré sans erreur ni code ; comme le point 1, une valeur aberrante devrait rendre `modele-impossible` plutôt que passer inaperçue.

## Points de grille sans remarque
1, 3, 5, 7, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides

## Réponse de Claude

1. **Juste, corrigé.** `page.largeur`, `marges.interieure` et `marges.exterieure` sont ajoutées aux valeurs contrôlées : absentes ou non numériques, elles rendent `modele-impossible`, raison `valeur`. Test ajouté. (Les bornes de ces réglages restent l'affaire de `appliquerReglages`, comme pour le gabarit en points, qui avait la même lacune.)
2. **Juste, corrigé.** Vérifié par le calcul : l'en-tête est une brique posée à un pas au-dessus du texte, il lui faut donc deux pas de marge de tête. Avec un en-tête ou un numéro de page en haut, une marge de tête plus courte rend le modèle impossible, raison `enTete`. Tests ajoutés (9 mm pour un pas de 14 pt : refusé avec en-tête, accepté sans). Le message montré à la personne ne dépend pas de la raison (`erreurs.modele-impossible`) : rien à traduire de plus.
3. **Faux.** `./wasm` est un export public du paquet (`@blocknote/xl-typst-compiler/package.json`, `exports` : `"./wasm": { "default": "./pkg/blocknote_typst_wasm_bg.wasm" }`). Les deux contrats existants (`typst.test.js`, `livre-de-reference.test.js`) le résolvent de la même façon.
4. **Hors sujet pour ce lot.** `lignesOccupees` est la règle en JavaScript, pour le formulaire : la fiche d'un style dit « sur une ligne, ce titre occupe 2 lignes de la grille » (plan, § 10, point 2) et l'aperçu la lit aussi, pour ne pas la recalculer. Le gabarit, lui, laisse Typst mesurer. L'appelant arrive au lot 3 ; si ce lot est abandonné, la fonction part avec lui.
5. **Hors sujet.** `contrats/statiques/` porte déjà les deux autres contrats qui compilent un PDF (`typst.test.js`, `livre-de-reference.test.js`) : « statique » y veut dire sans service ni navigateur, par opposition à `contrats/pile/`. Celui-ci suit la convention en place.
6. **Faux.** C'est la forme voulue du modèle, la même que celle du gabarit en points : le corps du texte courant est celui de la grille (`grille.corps`), et le style `texte` n'a pas de corps (`reglagesLivre.js` : « Le texte courant : son corps est celui de la grille »). La documentation de `gabaritEnLignes` le dit ; le formulaire n'offrira pas ce réglage.
7. **Hors sujet.** Même comportement que le gabarit en points, voulu : le premier numéro est borné par la liste des réglages (`entier`, de 1 à 9999, `appliquerReglages`), et le gabarit ignore une valeur qui n'en serait pas un plutôt que d'écrire un compteur faux. Un modèle sans `folio.depart` est valide (1 par défaut).

## Arbitrage de Sylvain

(À compléter.)
