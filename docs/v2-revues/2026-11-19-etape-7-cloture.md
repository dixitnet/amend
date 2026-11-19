# Revue de clôture de l'étape 7, « Exports » (2026-11-19)

- Relecteur : **Claude** (grille du § 6 des règles), comme pour l'étape 6. L'audit complet du 16/11/2026 (GLM-5.3, tout `v2/`, chaque constat vérifié : `docs/v2-audits/2026-11-16-2137-audit-complet.md`) sert de relecture approfondie ; ses lots A à F sont faits (19/11) ; audits partiels avant chaque fusion.
- Statut : **arbitré par Sylvain le 19/11/2026 (« 1 ok, 2 ok, 3 ok, 4 ok ») ; étape 7 close.**

## Ce que l'étape a livré

Export Markdown ; export PDF de livre composé par Typst dans le navigateur ; fenêtre « Exporter » (format, modèle) aux trois formats d'écran ; modèles de mise en page (modèle du code A4, modèles de l'instance A5, Livre de poche et TàT - Poche, modèles d'équipe, modèle retenu par document) ; page de réglage d'un modèle (format, marges, styles en tableau, chapitre, numéro de page, en-têtes) ; polices (catalogue de onze familles libres, polices de l'instance) ; notes de bas de page, table des matières, titre et sous-titre, légende, exposant ; images sans légende, à la largeur de la page.

## Critère de sortie

« Export d'un livre de référence identique à l'attendu » : **atteint le 19/11/2026**. `contrats/statiques/livre-de-reference.test.js` exporte un livre qui emploie chaque bloc et chaque style du schéma, avec les quatre modèles livrés ; la source Typst est comparée au signe près à celle gardée dans `tests/donnees/livre-de-reference/`, et le PDF à son format et à son nombre de pages. Le PDF A5 a été relu à l'œil par Claude avant d'être pris pour attendu ; **validé par Sylvain le 19/11/2026**.

## Grille

1. **Couches** : la source Typst vient du domaine (`miseEnPage.js`, gabarit) et de l'adaptateur BlockNote (`export.js`) ; les valeurs des modèles sont dans le design (`reglagesLivre.js`) ; le serveur ne compose rien. Lint resserré le 19/11 (lot A).
2. **Fondations** : `xl-typst-exporter` et `xl-typst-compiler` de BlockNote, par leur API publique ; veille tenue (`docs/v2-veille.md`).
3. **Correction** : images chargées en parallèle, image introuvable omise sans faire échouer l'export, nom de fichier sûr (lots B et C de l'audit).
4. **Tests** : contrats Typst (source et PDF), pile des exports (Chromium ; WebKit et Firefox en CI depuis le 18/11), livre de référence.
5. **Propreté des exports** : tout texte passe par `nfc` ; typographie française à la frappe, non refaite à l'export.
6. **Traductions** : libellés de l'export dans les catalogues ; les modèles portent des noms, pas des textes.

## Ce qui n'est pas fait (arbitré : renoncement n° 28)

1. **Export Word** (point 12 du plan de la suite ; `xl-docx-exporter`, comme Docs). Proposition : le sortir de l'étape et l'inscrire au registre des renoncements, à reprendre sur demande d'un éditeur.
2. **Images dans l'export Markdown** (archive `.zip`, comme Docs). Même proposition.

## Constats à l'œil sur le livre de référence (pour mémoire, sans correctif)

- Le séparateur ne se voit pas dans le PDF A5 : **ce n'est pas un défaut** (vérifié le 19/11/2026). Le séparateur de ces modèles est « blanc », une ligne vide de la grille, et il précède ici un titre en haut de la page suivante. Les modèles peuvent choisir un astérisme, des étoiles ou un trait (réglage « séparateur »).
- Un lien ne se distingue pas du texte dans le PDF (voulu pour un livre).
