# amend.ink v2 : registre des renoncements

Règle 9 de `docs/v2-regles-developpement.md` : chaque fonction ou principe de la v1 que la v2 abandonne est noté ici, avec la raison et ce qui ferait y revenir. Un renoncement est décidé par Sylvain, en général à l'ouverture ou à la clôture d'une étape.

| N° | Date | Renoncement | Pourquoi | Ce qui ferait y revenir |
|---|---|---|---|---|
| 1 | 07/11/2026 | Migration des documents de la v1 | décision de Sylvain : la v2 démarre avec des documents neufs | — |
| 2 | 07/11/2026 | Fork de Docs, et OIDC | rythme de l'amont, exploitation lourde (ADR 0001, 0005) | organisations clientes dotées d'un fournisseur d'identité |
| 4 | 08/11/2026 | Format S (iPhone) dans les premières étapes | le design vise L (Mac) et M (iPad) ; un développement spécifique au téléphone viendra plus tard, avec des compromis fonctionnels forts (décision de Sylvain) | **levé le 09/11/2026** : implémentation demandée par Sylvain (`docs/v2-format-S-plan.md`) |
| 3 | 07/11/2026 | Structures composées du schéma v1 (citation de plusieurs paragraphes, liste à paragraphes multiples) | modèle par blocs de BlockNote (ADR 0003) | BlockNote qui offrirait des conteneurs |
| 5 | 08/11/2026 | Table des matières comme bloc du texte | produite à l'export (Typst) et dans le volet « Plan » ; un bloc à tenir à jour dans le texte est du code à nous (décision de Sylvain, étape 4) | un besoin d'édition qui exige la table dans le texte même ; **levé le 11/11/2026** (Sylvain : « pouvoir l'insérer où on veut », profondeur au choix comme la v1 ; `docs/v2-lots-2026-11-11-plan.md`) |
| 6 | 08/11/2026 | Styles de paragraphe personnalisés | les blocs de BlockNote suffisent au livre (décision de Sylvain, étape 4) | un besoin éditorial que les blocs ne couvrent pas |
| 7 | 08/11/2026 | Colonnes à l'écran | les colonnes restent un réglage d'export (décision de Sylvain, étape 4) | — |
| 9 | 08/11/2026 | Règle D2 de la v1 (une correctrice ne fait pas disparaître la proposition d'une autre personne) | dans BlockNote, effacer la suggestion d'un autre la supprime ; la faire respecter demanderait d'analyser chaque modification côté serveur (décision de Sylvain, étape 5) | des pertes de propositions constatées en relecture réelle |
| 10 | 08/11/2026 | Couleurs d'auteur enregistrées (v1) | BlockNote calcule une couleur par personne (décision de Sylvain, étape 5) | — |
| 11 | 08/11/2026 | Cartes appariées de la v1 (affichage des modifications) | l'affichage des suggestions de BlockNote les remplace (décision de Sylvain, étape 5) | un besoin de lecture que l'affichage de BlockNote ne couvre pas |
| 8 | 08/11/2026 | Blocs et styles audio, vidéo, fichier, bloc de code, liste à cocher, liste repliable, code, couleur du texte et du fond | sans équivalent dans le livre ni ses exports (décision de Sylvain, étape 4) | un usage éditorial réel (édition scientifique : code) |
| 12 | 09/11/2026 | Mode « Présenter », favoris et emoji du titre (fonctions de Docs) | hors du besoin d'un auteur ou d'un éditeur de livres ; sobriété (décision de Sylvain, étape 6b) | un usage réel qui les demande ; **favoris levés le 10/11/2026** (Sylvain : étoile devant le titre, groupe « Favoris » du volet « Documents ») |
| 13 | 10/11/2026 | Entrer en modification au clavier sur iPad (touche Entrée), format M tactile | on entre en modification d'un appui, comme sur téléphone ; un clavier externe sur iPad est un usage marginal (décision de Sylvain, audit complet du 10/11/2026, question Q2) | des personnes qui travaillent sur iPad avec un clavier et s'en plaignent |
| 14 | 10/11/2026 | Langue enregistrée par document (règle 28) | Docs n'en a pas (ses exports prennent la langue de l'interface) ; les textes visés sont en français ; tout document est en français (typographie, exports) (décision de Sylvain, clôture de l'étape 6) | un texte non français à éditer |
| 15 | 10/11/2026 | Modèles de mise en page libres (CSS de la v1, Typst libre), modèles personnels, dépôt de polices, aperçu dans l'éditeur de modèle | un modèle d'équipe est une base d'amend.ink et des écarts pris dans une liste fermée et bornée ; un auteur seul a une équipe d'une personne ; polices d'un catalogue décidé ; pas d'aperçu (comme la v1), l'export fait foi (décision de Sylvain, ADR 0011) | un maquettiste réel qui en a besoin |
| 16 | 11/11/2026 | Dialogue de Margo (outils lire, proposer, commenter) et connecteur MCP « Inviter Claude » de la v1 | décision de Sylvain, comparaison v1 / v2 (`docs/v2-comparaison-v1-v2-2026-11-10.md`, point 15) | — |
| 17 | 11/11/2026 | Rubriques du back-office de la v1 autres que Système : personnes, invitations en attente, retours, consommation de l'IA, journaux, banc de Margo | décision de Sylvain, comparaison v1 / v2 (points 16 et 30) | — |
| 18 | 11/11/2026 | Comparer deux versions mot à mot, et restaurer « en avant » en suivi (v1) | l'historique de BlockNote (aperçu, restauration directe) suffit ; Docs ne compare pas (décision de Sylvain, points 23 et 31) | — |
| 19 | 11/11/2026 | Numéros de bloc dans la marge (v1) | décision de Sylvain, point 27 ; le zoom, lui, est repris | — |
| 20 | 11/11/2026 | Fonctions de Docs ou d'autres applications non reprises : chapitres en sous-documents, recherche plein texte, import .docx, demande d'accès, objectifs d'écriture, mode présentation, encadrés, diagrammes, code, emoji, impression, exports ODT et HTML, copier en Markdown, antivirus | hors du besoin ou marginal (règle 4) (décision de Sylvain, points 34 à 37, 43, 46 à 48) | — |

Renoncements à examiner, étape par étape : voir le tableau du § 8 des règles.
