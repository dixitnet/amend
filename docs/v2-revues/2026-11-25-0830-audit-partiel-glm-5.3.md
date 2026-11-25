# Audit partiel avant fusion (2026-11-25)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 443370 signes envoyés, 2809 reçus (et 5301 de réflexion) ; réflexion `low` ; 54 s ; arrêt : stop
- Diff audité : `v2/` de `6f9dc88` à `0279133` (11 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot propre et conforme dans l'ensemble : le nouveau modèle d'interface « Épure » est bien confiné au design (feuille, réglages, ADR, catalogues fr et en, test de pile), l'application ne fait qu'ajouter un nom. Les valeurs sont toutes adossées à la décision de Sylvain du 25/11/2026. Restent deux incertitudes sur le comportement du zoom hors 100 % et sur la cohérence des sélecteurs de titres, plus une couverture de test partielle (thème sombre).

## Constats
1. **[question]** grille 6 — `v2/design/feuilles/interface-epure.css:14` — La feuille ne règle le corps du texte que pour `[data-amend-zoom='100']` (17 px, puis `xl` à partir de 48 em). Rien ne dit ce qu'il advient des paliers 50, 150 et 200 % (et du palier 200 % du format S) : héritent-ils des règles de zoom du modèle « Atelier », ou retombent-ils sur les 16 px de BlockNote ? L'ADR 0008 (`css.atelier.texte`) précisait « les autres paliers du zoom inchangés » pour Atelier, mais rien d'équivalent n'est écrit pour Épure, et le test ne vérifie que le zoom 100 (`v2/contrats/pile/interface.test.js:267`). À vérifier et, si besoin, à documenter dans l'ADR ou à régler.
2. **[question]** grille 6 — `v2/design/feuilles/interface-epure.css:45` et `v2/design/feuilles/interface-epure.css:54` — Les titres sont stylés par `.bn-block-content[data-content-type='heading']` (ligne 45) mais l'espacement de 48 px les vise par `:has(> .bn-block > [data-content-type='heading'])` (ligne 54) : deux façons d'atteindre le même bloc. Si l'attribut `data-content-type` vit sur `.bn-block-content` (comme le suggère la ligne 45), le sélecteur `:has` de la ligne 54 ne matche jamais et le blanc de 48 px ne s'applique pas. Le test (`interface.test.js:273`) affirme 48 px : confirmer qu'il passe réellement, sinon harmoniser les deux sélecteurs.
3. **[mineur]** grille 7 — `v2/design/feuilles/interface-epure.css:32` — Les couleurs du thème sombre d'Épure (`dark.0`) ne sont couvertes par aucun test : le test de pile tourne en clair uniquement (`interface.test.js:229`, viewport sans `colorScheme`). Le défaut relevé le 11/11/2026 sur Atelier (éditeur illisible en sombre) est précisément ce que ces règles corrigent ; un parcours sombre (ou une précision sur pourquoi il est déjà couvert par le test d'Atelier) éviterait de le revoir.
4. **[mineur]** grille 4 — `v2/design/feuilles/interface-epure.css:28` — Les règles de couleurs d'Épure (fond transparent, `dark.7` / `dark.0`) recopient mot pour mot `css.atelier.couleurs` de la feuille d'Atelier. La duplication est défendable (chaque réglage porte sa clé, ADR 0008), mais si les deux modèles doivent évoluer ensemble, un commentaire croisé dans l'ADR ou les feuilles signalerait la dépendance ; à défaut, le laisser tel quel est acceptable.

## Points de grille sans remarque
1, 2, 3, 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides

## Réponse de Claude

1. **Réponse, documenté.** Les paliers 50, 150 et 200 % sont ceux de `css.editeur.zoom` (un pourcentage, commun à tous les modèles), inchangés, exactement comme pour « Atelier » : seul le palier de 100 % est réglé par le modèle. Écrit dans la feuille et à l'ADR 0008.
2. **Faux.** L'essai de pile mesure bien 48 px devant l'intertitre et passe (Chromium). Les deux sélecteurs visent deux éléments différents, à dessein : la police se pose sur le contenu du bloc (`.bn-block-content`), le blanc sur son enveloppe (`.bn-block-outer`, qui contient `.bn-block > .bn-block-content`).
3. **Juste, corrigé.** L'essai passe aussi en sombre et vérifie un texte clair sur le fond sombre de Mantine.
4. **Juste, noté.** Commentaire croisé ajouté dans la feuille (« à faire évoluer ensemble »).

## Arbitrage de Sylvain

(À compléter.)
