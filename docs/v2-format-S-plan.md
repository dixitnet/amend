# amend.ink v2 : plan de l'implémentation du format S (téléphone)

Statut : **arbitré** (« ok pour tout », Sylvain, 09/11/2026) et **développé**. L'implémentation lève le renoncement n° 4 (« format S plus tard »).

Références :
- `docs/v2-format-S.md` (maquette validée, ce que fait Docs) ;
- la maquette `docs/v2-maquettes/telephone/` ;
- le journal, § 35.

## Ce que fait Docs (rappel, d'après son code)

- Un seul site, qui s'adapte à la largeur (`useResponsive` : téléphone, tablette, bureau).
- Sur téléphone : une barre en haut, les volets en tiroirs, et un menu « … » sans « Présenter » ni « Historique » (`DocToolBox.tsx`).
- Pas de mode lecture pour qui peut modifier : écart déjà décidé (ouverture en lecture, un appui pour modifier).

## Questions pour Sylvain

### 1. Quand passer en format S ?

1. **Selon la largeur de l'écran**, comme Docs : même adresse, même application. En dessous du seuil `sm` de Mantine (48 em, environ 768 px), on bascule en format S. Les formats L et M ne changent pas.
2. Selon l'appareil (détection du téléphone).

Proposition : **1**. C'est le réglage de Mantine tel quel, sans valeur inventée.

### 2. Les icônes Tabler (point ouvert de la maquette)

1. **Ajouter `@tabler/icons-react`** à la v2, comme dans la maquette validée : c'est la bibliothèque d'icônes que propose Mantine. On n'en importe que les icônes de la maquette.
2. Pas d'icônes, des libellés seuls.

Proposition : **1**.

### 3. Ce qui n'existe pas encore dans la v2

La maquette montre des éléments qui n'existent pas encore : Margo (IA), Exporter, Dupliquer, Imprimer.

1. **Ne montrer que ce qui marche**, et laisser le reste pour son étape :
   - volet droit : « Modifications » seul ; « Margo (IA) » viendra à l'étape 8 ;
   - menu « … » : Copier le lien, Partager, Historique, Supprimer.
2. Montrer tout, avec « bientôt » sur ce qui n'existe pas encore.

Proposition : **1** (rien d'inerte à l'écran).

### 4. Le titre dans le bandeau

La maquette met le titre du document dans le bandeau, et plus dans le texte. Or la v2 n'a pas encore de titre modifiable : un document neuf est « Sans titre ».

1. **Le titre en base** (celui de la liste), modifiable d'un appui sur le titre du bandeau, pour le propriétaire et l'éditeur. Même chose en formats L et M.
2. Le titre affiché seulement ; sa modification viendra plus tard.

Proposition : **1**. Sans lui, tous les documents restent « Sans titre ».

### 5. Les autres écrans en format S

La maquette ne couvre que l'écran d'un document. Restent la connexion, les listes (Mes documents, Partagé avec moi, équipes) et le partage.

1. **Au plus simple, en Mantine tel quel** :
   - les listes deviennent des listes empilées (nom, rôle, actions dans un menu « … ») au lieu d'un tableau ;
   - les onglets deviennent une liste déroulante quand ils ne tiennent pas en largeur ;
   - le partage s'ouvre en plein écran.
2. Une maquette d'abord, validée par toi, comme pour l'écran du document.

Proposition : **1**, puis tes retours sur un vrai téléphone. Le design d'ensemble viendra en 6b.

### 6. La taille des titres sur téléphone (point ouvert)

1. **Réduite comme Docs** : un réglage de design, à inscrire dans `reglages.js` et l'ADR 0008 ; je propose les valeurs de Docs.
2. Les tailles de BlockNote telles quelles.

Proposition : **1**, sur ta décision des valeurs.

## Découpage (après arbitrage)

1. Domaine et serveur : le titre modifiable (droits, route), si 4.1.
2. Design : bandeau, tiroirs, menu « … », listes empilées, feuille du format S (lots `v2/design/` seuls).
3. Application : bascule selon la largeur, passage lecture et modification (appui, « Terminer », fermeture du clavier), contenu des volets (plan, documents, modifications).
4. Tests sur la pile en largeur de téléphone (Chromium émulant un iPhone), audit partiel, puis essai sur ton vrai téléphone.

## Avancement (09/11/2026)

- **Seuil** : `useFormatS()` (`v2/design/formats.js`), sous le seuil `sm` de Mantine (48 em, 768 px), le même que Docs (`MOBILE_BREAKPOINT`).
- **Icônes** : `@tabler/icons-react` 3.51.0, comme la maquette, permis à la seule couche design (lint).
- **Écran du document** (`PageEditionS`) :
  - bandeau fixe : plan et documents, titre, « Terminer » en modification, menu « … », relecture tout à droite ;
  - ouverture en lecture ; un appui sur le texte passe en modification ; retour par « Terminer » ou à la fermeture du clavier ;
  - volet gauche : Plan (titres du document, un appui y mène) et Documents ;
  - volet droit : Modifications, pour qui accepte ou refuse les suggestions ;
  - menu « … » : Copier le lien, Partager, Mes documents, Supprimer. Pas d'historique, **comme Docs sur téléphone** (`DocToolBox.tsx`) ; écart avec la première version du plan, qui le mettait dans le menu ;
  - partage en plein écran.
- **Titre modifiable** (4.1), dans tous les formats : `PUT /api/documents/:doc/titre`, pour qui écrit le texte ; un appui sur le titre du bandeau en format S, un bouton « Renommer » en L et M ; le titre remplace « Document <identifiant> ».
- **Listes en format S** : fiches empilées au lieu du tableau, liste déroulante au lieu des onglets.
- **Taille des titres** (6.1) : valeurs de Docs à 560 px et moins.
- **Réglages** (ADR 0008) : `theme.components.ActionIcon.defaultProps.variant`, `css.telephone.bandeau`, `css.telephone.plan` et `css.telephone.titres`.
- **Tests** : `contrats/pile/telephone.test.js`, Chromium à la taille d'un iPhone, 3 parcours ; 177 tests rapides.
- **Reste à faire** :
  - essai sur un vrai téléphone, par Sylvain, en particulier la fermeture du clavier, qui n'a pas été essayée en vrai ;
  - Margo, Exporter, Dupliquer et Imprimer, chacun à son étape.
