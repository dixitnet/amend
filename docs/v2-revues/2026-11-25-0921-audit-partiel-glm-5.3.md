# Audit partiel avant fusion (2026-11-25)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 434780 signes envoyés, 2276 reçus (et 4904 de réflexion) ; réflexion `low` ; 33 s ; arrêt : stop
- Diff audité : `v2/` de `6e9bf0f` à `7e953a0` (3 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff met en œuvre deux décisions de Sylvain du 25/11/2026 (trait du bandeau remis, largeur de colonne du modèle « Épure »), avec mise à jour conjointe de l'ADR 0008, de la feuille CSS et du contrat de pile — l'ensemble est cohérent et les valeurs correspondent aux décisions notées. Les seules réserves portent sur la robustesse du sélecteur CSS (variable `--container-size`, constante 54 px dupliquée) et sur la portée exacte de la mesure dans le test.

## Constats
1. **[question]** Grille 6 (correction) — `v2/design/feuilles/interface-epure.css:84`
   Le `max-width` utilise `var(--container-size)`, variable que Mantine ne définit pas globalement mais en style en ligne sur le composant `Container` qui la porte. Si `[data-amend-colonne]` n'est pas lui-même ce `Container` (avec `size="sm"`), la variable est indéfinie et `max-width` devient invalide, silencieusement. Vérifier que l'attribut est posé sur le `Container` Mantine de taille `sm` ; sinon, utiliser `--container-size-sm` ou la valeur du réglage.

2. **[mineur]** Grille 4 (simplicité / redondance) — `v2/design/feuilles/interface-epure.css:84`
   La constante 54 px (marge latérale de l'éditeur BlockNote) est recopiée en dur ici alors qu'elle est déjà documentée comme valeur de BlockNote dans le réglage `css.editeur.marges` de l'ADR 0008 ; une montée de version de BlockNote qui changerait cette marge cassera la largeur de colonne sans que rien ne le signale. Proposer de référencer la valeur à un seul endroit (variable ou réglage) ou d'ajouter un commentaire de veille dans `docs/v2-veille.md`.

3. **[question]** Grille 7 (tests) — `v2/contrats/pile/interface.test.js:263`
   `largeurDuTexte` est mesurée sur `paragraphe.closest('.bn-block-content')` : le test annonce vérifier la largeur « du texte » (la colonne, 720 px), mais mesure le contenu d'un bloc, qui peut différer de la colonne si BlockNote ajoute un remplissage. La valeur passe aujourd'hui, mais le test ne vérifie pas exactement ce que son nom et l'assertion (`largeurDuTexte, 720`) annoncent si le sélecteur de colonne est `[data-amend-colonne]`. Mesurer plutôt sur l'élément porteur du réglage, ou préciser le commentaire.

## Points de grille sans remarque
1, 2, 3 (partiellement couvert par le constat 2), 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides

## Réponse de Claude

1. **Faux.** `[data-amend-colonne]` est posé sur le `Container` de Mantine lui-même (`design/composants/Coquille.jsx`, `ColonneTexte`), de taille `sm` par le thème : la variable y est définie. La feuille d'« Atelier » s'appuie sur la même variable depuis le 11/11, et l'essai de pile mesure bien 720 px.
2. **Réponse.** La valeur de 54 px est celle de l'éditeur de BlockNote, qui ne l'expose par aucune variable ; le commentaire de la feuille le dit. Une montée de BlockNote qui la changerait est signalée : l'essai de pile exige un texte large de 720 px exactement (et 612 px en « Atelier »).
3. **Réponse.** C'est voulu : le réglage porte sur la largeur du texte lui-même, pas sur celle du conteneur (c'était le défaut : un conteneur de 720 px ne laissait que 580 px au texte). L'essai mesure donc le contenu d'un bloc ; son commentaire le dit (« le texte à la largeur sm de Mantine »).

## Arbitrage de Sylvain

(À compléter.)
