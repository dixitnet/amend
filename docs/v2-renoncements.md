# amend.ink v2 : registre des renoncements

Règle 9 de `docs/v2-regles-developpement.md` : chaque fonction ou principe de la v1 que la v2 abandonne est noté ici, avec la raison et ce qui ferait y revenir. Un renoncement est décidé par Sylvain, en général à l'ouverture ou à la clôture d'une étape.

| N° | Date | Renoncement | Pourquoi | Ce qui ferait y revenir |
|---|---|---|---|---|
| 1 | 07/11/2026 | Migration des documents de la v1 | décision de Sylvain : la v2 démarre avec des documents neufs | — |
| 2 | 07/11/2026 | Fork de Docs, et OIDC | rythme de l'amont, exploitation lourde (ADR 0001, 0005) | organisations clientes dotées d'un fournisseur d'identité |
| 4 | 08/11/2026 | Format S (iPhone) dans les premières étapes | le design vise L (Mac) et M (iPad) ; un développement spécifique au téléphone viendra plus tard, avec des compromis fonctionnels forts (décision de Sylvain) | l'étape dédiée au format S |
| 3 | 07/11/2026 | Structures composées du schéma v1 (citation de plusieurs paragraphes, liste à paragraphes multiples) | modèle par blocs de BlockNote (ADR 0003) | BlockNote qui offrirait des conteneurs |
| 5 | 08/11/2026 | Table des matières comme bloc du texte | produite à l'export (Typst) et dans le volet « Plan » ; un bloc à tenir à jour dans le texte est du code à nous (décision de Sylvain, étape 4) | un besoin d'édition qui exige la table dans le texte même |
| 6 | 08/11/2026 | Styles de paragraphe personnalisés | les blocs de BlockNote suffisent au livre (décision de Sylvain, étape 4) | un besoin éditorial que les blocs ne couvrent pas |
| 7 | 08/11/2026 | Colonnes à l'écran | les colonnes restent un réglage d'export (décision de Sylvain, étape 4) | — |
| 8 | 08/11/2026 | Blocs et styles audio, vidéo, fichier, bloc de code, liste à cocher, liste repliable, code, couleur du texte et du fond | sans équivalent dans le livre ni ses exports (décision de Sylvain, étape 4) | un usage éditorial réel (édition scientifique : code) |

Renoncements à examiner, étape par étape : voir le tableau du § 8 des règles.
