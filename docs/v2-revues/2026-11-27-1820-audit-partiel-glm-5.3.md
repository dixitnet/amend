# Audit partiel avant fusion (2026-11-27)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 514867 signes envoyés, 2614 reçus (et 3575 de réflexion) ; réflexion `low` ; 22 s ; arrêt : stop
- Diff audité : `v2/` de `9a84915` à `960b5c9` (4 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff ajoute le choix de police propre à chaque style dans la fiche d'un modèle (réglage rétabli par décision de Sylvain du 27/11/2026, ADR 0011), avec l'option « Même police que le texte », le résumé qui la mentionne, et la liste des polices de la page d'aperçu. Le respect des couches, des traductions (clés fr et en) et du design est bon. Les remarques portent sur des cas limites (police de l'en-tête oubliée dans la liste à charger, valeur vide envoyée au domaine) et sur l'absence de tests dans le diff.

## Constats
1. **[mineur]**, grille 6, `v2/application/client/ficheModele.js:365` — la liste `polices` de la page d'aperçu rassemble la police du texte et celles des blocs, mais pas celle de l'en-tête (`enTete.police`, réglable depuis le 19/11/2026, construit juste après à la ligne 369) : si un en-tête utilise une autre famille, elle ne sera pas chargée à l'écran. Proposer d'ajouter la police de l'en-tête à l'ensemble (et de vérifier si le folio a la sienne).
2. **[question]**, grille 6, `v2/application/client/Modeles.jsx:130` — l'option d'héritage est représentée par une valeur vide (`value: ''`). Le domaine (`appliquerReglages`) accepte-t-il la chaîne vide comme « pas de police propre », et l'enregistrer efface-t-il bien un choix antérieur ? Sans certitude sur le contrat du domaine, à vérifier (un test le dirait).
3. **[question]**, grille 6, `v2/application/client/ficheModele.js:62` — le champ `styles.<nom>.police` est ajouté à la fiche de chaque style, y compris vraisemblablement « texte », pour lequel l'option « Même police que le texte » (ligne 130, condition `r.herite`) n'a pas de sens. Le domaine marque-t-il `herite: false` pour le texte ? Si ce n'est pas le cas, le formulaire montre une option absurde.
4. **[important]**, grille 7, `v2/application/client/ficheModele.js:62` — le diff ne contient aucun test : ni pour l'option d'héritage du champ police, ni pour le résumé qui la mentionne (ligne 152), ni pour la liste `polices` du plan de page (ligne 365). Ce sont des comportements nouveaux et calculés ; proposer des tests unitaires de `rubriquesDeLaFiche`, `lectureDeLaFiche` et `planDePage` sur ce point.
5. **[mineur]**, grille 6, `v2/application/client/ficheModele.js:152` — le commentaire dit « Sa police, quand ce n'est pas celle du texte », mais le code ne teste que la présence d'une valeur : si la personne choisit explicitement la police du texte, le résumé l'affiche quand même, contrairement à ce que le commentaire annonce. Soit comparer à `texte.police`, soit corriger le commentaire.

## Points de grille sans remarque
1, 2, 3, 4, 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

Audit découpé par couche : celui-ci ne voit que le commit de l'application.

1. **Faux.** Les en-têtes n'ont plus de police à eux depuis la grille stricte (renoncement n° 30) : `enTete.police` n'est plus un réglage, ils sont dans la police du texte, déjà dans la liste. Le numéro de page aussi.
2. **Vérifié, voulu.** Le domaine accepte la chaîne vide pour un réglage de police qui hérite (`valeurPermise`, `r.herite && v === ''`), et le gabarit lit une police vide comme celle du texte (`styleDe`). Testé : `tests/unitaires/conversion-en-lignes.test.js` (un modèle dont la citation a une police vide se vérifie) et le test de pile, où le champ vaut d'abord « Même police que le texte ».
3. **Faux.** Le texte courant n'a pas de fiche de style : sa police est sous « Caractère » (`styles.texte.police`, sans `herite` dans `reglagesLivre.js`), donc sans l'option « Même police que le texte ». Seuls les dix autres styles l'ont.
4. **En partie faux.** Testé dans le navigateur, dans le commit des tests (`contrats/pile/exports.test.js`) : l'option par défaut, le choix d'Inter pour le titre 3, le résumé (« Inter, 13 pt, italique · … »), l'aperçu composé dans la police choisie, l'enregistrement, puis l'export PDF. Pas de test unitaire de ce module, qui ne se charge pas sous Node (déjà dit dans l'audit du 27/11, 16 h 57).
5. **Juste, corrigé.** Le résumé ne dit la police que si elle n'est pas celle du texte, comme le gabarit.

## Arbitrage de Sylvain

(À compléter.)
