# Audit partiel avant fusion (2026-11-25)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 442869 signes envoyés, 3328 reçus (et 50927 de réflexion) ; réflexion `low` ; 184 s ; arrêt : stop
- Diff audité : `v2/` de `7205f2e` à `fca8966` (5 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff réduit le garde-fou du mode Éditer aux seuls gestes destructeurs mesurés, avec une refonte cohérente de l'extension, des tests unitaires et de la pile, et la mise à jour des deux catalogues. Le respect des couches et de l'API publique est bon, la couverture des nouveaux cas est réelle. Je relève surtout des points de logique en bordure : une ligne de test dont l'écriture paraît déséquilibrée, le sort du collage de texte brut au contact (supposé réparé par un correctif hors du diff), et deux faiblesses de moindre gravité dans les fonctions nouvelles.

## Constats

**A1** — **[question]**, grille 7, `v2/tests/unitaires/garde-suggestions.test.js:116`
Telle qu'elle figure dans le diff, la ligne se lit `assert.equal(changeUneSuggestion(s.tr.insertText('Q', D + 16)), true), false, '…')` : la valeur attendue `false` et le message semblent tomber hors de l'appel à `assert.equal`, et les parenthèses ne paraissent pas équilibrées (la ligne 117, elle, est équilibrée). L'intention est visiblement `changeUneSuggestion(tr, true)` attendu `false`. À vérifier dans le fichier réel ; si le code est tel qu'affiché, le fichier de test ne charge pas.

**A2** — **[question]**, grille 6, `v2/extensions/garde-suggestions/index.js:148` (et le commentaire `index.js:103-105`)
Le cas 3 exempte du refus toute insertion `de === a`, de texte seul, à la même mise en forme, quand `frappeReparee` est actif — le commentaire dit que le correctif replace « la frappe, ou un texte brut collé ». Mais le correctif (`correctif-245.js`, hors du diff) est décrit ailleurs comme réparant « la frappe simple » : s'il ne se branche que sur `handleTextInput`, un collage de texte brut au contact d'une correction (qui ne passe pas par ce crochet) franchit le garde-fou sans être réparé et se mêle à la correction — le défaut y-prosemirror#245 lui-même. À vérifier : le correctif couvre-t-il le collage ?

**A3** — **[mineur]**, grille 6, `v2/extensions/garde-suggestions/index.js:175-186`
`retireSeulementUnBlocVide` compare la liste des blocs de texte avant/après sur tout le document : une transaction qui, à la fois, retire un bloc de texte vide et abîme une correction ailleurs (tout en laissant les listes s'aligner) serait permise, alors que le retrait du bloc vide ne la justifie pas. Cas improbable à la main, mais un contrôle des positions des étapes dommageables (et non du seul résultat net) fermerait la porte.

**A4** — **[mineur]**, grille 4, `v2/extensions/garde-suggestions/index.js:207-217`
Le crochet `handleTextInput` redécrit en propre la logique de contact et de recouvrement déjà portée par `abimeUneCorrection` (cas 1 et 3, `index.js:127-149`) : deux sources de vérité qui peuvent diverger à la prochaine retouche. Sa seule raison d'être est de refuser avant la transaction ; il pourrait déléguer à `abimeUneCorrection` (construire l'étape équivalente) ou l'appeler.

**A5** — **[mineur]**, grille 6, `v2/extensions/garde-suggestions/index.js:106-119`
`memeForme` compare les noms des marques, pas leurs attributs : une marque `comment` (ou un lien) d'un autre fil, collée au contact, compterait comme « même forme » et échapperait au refus, alors que le correctif ne la replace pas. Comparer aussi les attributs (hors `y-attributed-*`) coûterait peu.

## Points de grille sans remarque
1, 2, 3, 5, 8, 9, 10

## Citations vérifiées par le script

- A1 : citations valides
- A2 : citations valides
- A3 : citations valides
- A4 : citations valides
- A5 : citations valides

## Réponse de Claude

- **A1. Faux.** Le fichier se charge et ses huit essais passent (`node --test tests/unitaires/garde-suggestions.test.js`) : la ligne est `assert.equal(changeUneSuggestion(s.tr.insertText('Q', D + 16), true), false, '…')`, le second argument `true` étant `frappeReparee`.
- **A2. Faux.** Le correctif ne se branche pas sur la frappe de l'éditeur mais sur les transactions du document des suggestions (`correctif-245.js`, écoute `beforeObserverCalls`) : il replace tout ajout fait seulement de texte, sans rien de supprimé, d'où qu'il vienne ; un texte brut collé en fait partie. Ce qu'il ne replace pas (un ajout qui porte une mise en forme) est justement ce que `memeForme` fait refuser.
- **A3. Faux pour le dommage décrit, reste noté.** La fonction exige que tous les autres blocs de texte soient identiques avant et après, marques de correction comprises (`Node.eq`) : une correction abîmée ailleurs rend deux blocs différents et la transaction est refusée. Reste théorique : un bloc inchangé mais changé de conteneur dans la même transaction que le retrait d'un bloc vide ; aucun geste de l'éditeur ne produit cela.
- **A4. Juste, corrigé.** `handleTextInput` délègue maintenant à `changeUneSuggestion`, sur la transaction que ferait la frappe : une seule source de vérité.
- **A5. Juste, corrigé.** `memeForme` compare les marques avec leurs attributs (`Mark.eq`) ; essai ajouté (même lien : passe ; autre lien : refusé).

## Arbitrage de Sylvain

(À compléter.)
