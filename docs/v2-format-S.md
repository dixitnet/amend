# amend.ink v2 : format S (téléphone, vertical)

État au 09/11/2026 : **maquette visuelle validée par Sylvain**, puis **développée dans la v2** (plan arbitré : `docs/v2-format-S-plan.md`). Maquette : `docs/v2-maquettes/telephone/`, publiée sur https://claude.ai/artifact/1Up7ViVTDpskEYqe58mHy5 . Décisions : `docs/journal-decisions.md`, § 35.

Règle de départ : regarder d'abord comment procède Docs (règle permanente n° 11). Chaque point ci-dessous dit ce que fait Docs.

## Principe

Vertical seulement. Le plus de place possible pour le texte ; Mantine et BlockNote tels quels, sauf les réglages décidés (ADR 0008).

## Bandeau

Fixe en haut, une seule ligne, de gauche à droite :

| Élément | Picto (Tabler) | Rôle |
|---|---|---|
| Volet gauche | `IconListTree` (liste en arbre) | ouvre « Plan / Documents » |
| Titre du document | — | coupé par « … » s'il est trop long ; le titre n'est plus dans le texte |
| « Terminer » | — | seulement en modification : repasse en lecture |
| Menu « … » | `IconDots` | Copier le lien, Partager, Exporter, Imprimer, Dupliquer, Supprimer |
| Volet droit, tout à droite | `IconPencilCheck` (crayon avec coche) | ouvre « Modifications / Margo (IA) » |

Docs : barre flottante avec le volet gauche, puis le volet droit et le menu « … » en dernier (`DocFloatingBar.tsx`) ; liste à puces pour le plan (`bulleted-list.svg`) ; sur téléphone, son menu masque « Présenter » et « Historique » (`DocToolBox.tsx`). Écart décidé : le volet droit est tout à droite, et le picto du plan est une liste en arbre.

## Volets

Tiroirs Mantine (`Drawer`), chacun à deux onglets avec picto :

- gauche : **Plan** (`IconListTree`) et **Documents** (`IconFiles`) ;
- droite : **Modifications** (`IconPencilCheck`, ouvert par défaut) et **Margo (IA)** (`IconWand`).

Docs : une page pour les documents (`sub-page-logo.svg`), une baguette avec étoiles pour l'IA (`wand_stars.svg`).

## Lecture et modification

- Le document s'ouvre **en lecture seule**.
- **Un appui sur le texte** passe en modification, curseur à l'endroit touché, dans le geste même (sinon le téléphone n'ouvre pas le clavier).
- Retour en lecture : **« Terminer »** dans le bandeau, ou **fermeture du clavier** (la zone visible, `visualViewport`, retrouve sa hauteur).
- Pas de bouton flottant.

Docs n'a pas de mode lecture pour qui peut modifier : la lecture seule n'y existe que sans droit d'écriture (`DocEditor.tsx`). Écart décidé.

## Éditeur (décisions générales, formats S, M et L)

- **Poignées de bloc masquées**, et leur place rendue au texte : **10 px de marge** de chaque côté (`v2/design/feuilles/editeur.css`, réglages `css.editeur.poignees` et `css.editeur.marges`). Docs : 10 px sur téléphone en lecture seule.
- **Palette flottante sans alignement** (gauche, centre, droite) : `BOUTONS_RETIRES` dans `v2/adaptateurs/blocknote/palette.js`. Docs garde l'alignement.
- **Titres de niveau 1 à 5** dans le schéma. Docs limite le choix à 3 niveaux dans sa palette.
- Sur téléphone, la palette tient alors dans la largeur : type de bloc, gras, italique, souligné, barré, retrait, lien.

## Points ouverts

1. Icônes : Tabler ajouté à la v2 (plan du format S, 2.1).
2. Taille des titres sur téléphone : réduite comme Docs (plan du format S, 6.1 ; `css.telephone.titres`).
3. Fermeture du clavier : vérifiée en simulation seulement, à essayer sur un vrai téléphone.
