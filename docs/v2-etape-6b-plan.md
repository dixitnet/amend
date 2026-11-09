# amend.ink v2 : plan de l'étape 6b, « Interface » (formats M et L)

Statut : **arbitré** le 09/11/2026 (Sylvain : ordre des lots, design d'abord ; valeurs non décidées de la maquette remplacées par celles de Mantine, montrées sur captures). Spécification : `docs/v2-formats-M-L.md` ; maquette : `docs/v2-maquettes/grand-ecran/` (https://claude.ai/artifact/9yb3tcEUBhhcz1dUiJNUCF) ; décisions : `docs/journal-decisions.md`, § 37.

## Ce qui est décidé

Voir la spécification : `AppShell` de Mantine, bandeau fixe avec le titre, la présence, « Partager », le menu « … », le compte et le volet droit ; volet gauche « Plan / Documents » redimensionnable ; volet droit « Modifications » ouvert d'office quand des suggestions attendent ; un seul volet à la fois sous `md` ; lecture d'abord sur écran tactile ; texte de 720 px ; interface en vert (valeur en attente de décision) ; alerte hors ligne ; partage dans une fenêtre ; onglet Margo présent et vide jusqu'à l'étape 8.

## Ce que fait Docs

Code lu au commit `03d5b9f` (05/11/2026), détaillé dans la spécification : `MainLayout.tsx`, `ResizableLeftPanel.tsx`, `RightPanel.tsx`, `usePanelCoordination.tsx`, `useResponsiveStore.tsx`, `DocFloatingBar.tsx`, `DocToolBox.tsx`, `LeftPanelContent.tsx`. Écarts décidés : bandeau au lieu de la barre flottante, titre dans le bandeau, compte dans le bandeau, volet droit ouvert d'office, lecture d'abord sur iPad, seuil `md` de Mantine, texte de 720 px.

## Lots

Un lot par couche (règle 3), design et technique séparés (règle 20). Ordre proposé :

1. **Design** (`v2/design/` seulement, plus le contrat de contraste) :
   - Tabler (`@tabler/icons-react`) ajouté aux dépendances, importé par le design seul (ADR 0008 complétée, contrat des licences) ;
   - réglages dans `reglages.js` et la table de l'ADR 0008 : couleur principale verte, largeurs des volets, colonne de 720 px, alerte hors ligne ; retrait de `CONTRASTE_EN_ATTENTE` ;
   - composants de présentation : la coquille (`AppShell` : bandeau, volets, texte), le bandeau, la présence, le menu du document, le menu du compte, le volet « Plan / Documents », le volet « Modifications / Margo (IA) » (onglet Margo vide jusqu'à l'étape 8), la navigation de la liste, l'alerte hors ligne, la fenêtre de partage (contenu de `PanneauPartage`), une fenêtre de saisie d'un nom (remplace les boîtes du navigateur de 6c) ;
   - le format d'écran exposé par le design (seuil `md` et pointeur tactile), pour que l'application n'importe pas Mantine ;
   - tests de rendu sans navigateur (T4).
2. **Adaptateur BlockNote** :
   - la liste des titres du document, tenue à jour, et l'aller à un titre (volet « Plan ») ;
   - la lecture d'abord : éditeur en lecture, passage en modification au point touché, « Terminer » (repris de la maquette S) ;
   - contrats sur un éditeur réel.
3. **Application** (`v2/application/client/`) :
   - écrans du document et de la liste montés sur la coquille ; état des volets (ouverture par défaut selon le format, d'office si des suggestions attendent, un seul volet sous `md`, volet fermé d'office rouvert ensuite) ;
   - menu « … » : seulement les actions qui existent (Copier le lien, Partager, Historique, Supprimer) ; les autres viendront avec leur étape ;
   - « Mes documents / Partagé avec moi » dans le volet gauche ; fenêtres de saisie à la place des boîtes du navigateur ;
   - état de la connexion réduit à l'alerte hors ligne ; présence dans le bandeau ;
   - textes nouveaux dans `i18n/` (français, anglais préparé, pseudo-langue) ;
   - parcours sur la pile aux formats L, M portrait et M paysage, clair et sombre (Chromium, WebKit) ; captures pour la recette.
4. **Clôture** : audit partiel (GLM-5.3) avant la fusion, réponses dans `docs/v2-revues/` ; courte recette de Sylvain sur le Mac et l'iPad (`v2.amend.ink`).

## Hors périmètre

Format S ; contenu de l'onglet Margo et IA (étape 8) ; exports et impression (étape 7) ; Dupliquer ; dossiers d'équipe (6d) ; mise en forme des courriers.

## Arbitrage (Sylvain, 09/11/2026)

1. Ordre des lots : le design d'abord.
2. Valeurs non décidées de la maquette (hauteur du bandeau, taille des pictos, pastille du nombre de suggestions) : valeurs par défaut de Mantine, montrées sur captures au lot de design.
3. Onglet Margo (IA) présent, vide jusqu'à l'étape 8.
