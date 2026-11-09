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

## Avancement

- **Lot 1, design (09/11/2026)** :
  - interface en vert foncé (`theme.colors.vert`, `primaryColor`, `primaryShade: 9`) ; le contrôle de contraste n'exclut plus rien (`CONTRASTE_EN_ATTENTE` retiré, pile verte) ;
  - Tabler en dépendance, réservé au design par le lint ; pictos désignés par un nom de rôle (`design/pictos.jsx`) ;
  - composants : `Coquille` (AppShell, volet gauche redimensionnable de 300 à 450 px), `Bandeau`, `VoletPlanDocuments`, `NavigationListe`, `VoletRelecture`, `TexteDeVolet`, `ColonneTexte`, `AlerteHorsLigne`, `Fenetre`, `FenetreSaisie` ; `useFormat` (étroit, tactile) ; `ListeDocuments` (titre et onglets facultatifs) et `PanneauPartage` (`enFenetre`) adaptés sans rien casser ;
  - réglages notés dans l'ADR 0008, dont deux à confirmer sur captures : hauteur du bandeau (60 px, exemples de Mantine) et pastille du nombre de suggestions (16 px) ;
  - tests de rendu (T4) des nouveaux composants. L'application ne s'en sert pas encore : lot 3.
- **Textes à ajouter au catalogue au lot 3** (fr ; en préparé) : Plan et documents, Modifications et Margo (IA), Autres actions, Mon compte, Personnes sur ce document, Terminer, Plan, Documents, Ce document n’a pas encore de titre, Relecture, Modifications, Margo (IA), Margo arrive bientôt ici, Hors ligne : vos modifications sont gardées et partiront au retour de la connexion, Largeur du volet, Copier le lien, Fermer, Valider, Annuler. Le test de cohérence refuse une clé que le code n'emploie pas : elles entrent avec l'application.
- **À revoir au lot 3** : le panneau des suggestions (titre de niveau 2 et boutons pleins) est serré dans un volet de 300 px.
- **Lot 2, adaptateur BlockNote (09/11/2026)** : plan (titres, titre courant, aller à un titre) et lecture d'abord, dans `adaptateurs/blocknote/plan.js`.
- **Lot 3, application (09/11/2026)** : écrans du document et de la liste sur la coquille ; présence par personne ; alerte hors ligne ; fenêtres de saisie ; parcours de la pile (`contrats/pile/interface.test.js`). Défauts trouvés par la pile et réglés côté design : volets repliés inactifs (`inert`, comme Docs), titres du plan en boutons, palettes de BlockNote devant le bandeau (`css.editeur.palettes`, à confirmer).
- **Fusion de `main`** (étape 6d, back-office) : équipes dans le volet gauche, « Nouvelle équipe » dans la liste, Administration dans le menu du compte. Limites notées : le volet « Documents » d'un document ne montre pas encore les documents d'équipe ; la page d'administration garde son ancienne mise en page.
- **Audit partiel** (GLM-5.3) : `docs/v2-revues/2026-11-09-2139-audit-partiel-glm-5.3.md`, 8 constats, 5 corrigés, 1 faux, 2 questions.
