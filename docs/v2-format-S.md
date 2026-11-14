# amend.ink v2 : format S (téléphone, vertical)

État au 09/11/2026 : **maquette visuelle validée par Sylvain**, puis **développée dans la v2** (plan arbitré : `docs/v2-format-S-plan.md`). Maquette : `docs/v2-maquettes/telephone/`, publiée sur https://claude.ai/artifact/1Up7ViVTDpskEYqe58mHy5 . Décisions : `docs/journal-decisions.md`, § 35.

Règle de départ : regarder d'abord comment procède Docs (règle permanente n° 11). Chaque point ci-dessous dit ce que fait Docs.

## Principe

Vertical seulement. Le plus de place possible pour le texte ; Mantine et BlockNote tels quels, sauf les réglages décidés (ADR 0008).

## Bandeau

Fixe en haut, une seule ligne, de gauche à droite :

| Élément                    | Picto (Tabler)                        | Rôle                                                                   |
| -------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| Volet gauche               | `IconListTree` (liste en arbre)       | ouvre « Plan / Documents »                                             |
| Titre du document          | —                                     | coupé par « … » s'il est trop long ; le titre n'est plus dans le texte |
| « Terminer »               | —                                     | seulement en modification : repasse en lecture                         |
| Menu « … »                 | `IconDots`                            | Copier le lien, Partager, Exporter, Imprimer, Dupliquer, Supprimer     |
| Volet droit, tout à droite | `IconPencilCheck` (crayon avec coche) | ouvre « Modifications / Margo (IA) »                                   |

Docs : barre flottante avec le volet gauche, puis le volet droit et le menu « … » en dernier (`DocFloatingBar.tsx`) ; liste à puces pour le plan (`bulleted-list.svg`) ; sur téléphone, son menu masque « Présenter » et « Historique » (`DocToolBox.tsx`). Écart décidé : le volet droit est tout à droite, et le picto du plan est une liste en arbre.

## Volets

Tiroirs Mantine (`Drawer`), chacun à deux onglets avec picto :

- gauche : **Plan** (`IconListTree`) et **Documents** (`IconFiles`) ;
- droite : **Modifications** (`IconPencilCheck`, ouvert par défaut) et **Margo (IA)** (`IconWand`).

Docs : une page pour les documents (`sub-page-logo.svg`), une baguette avec étoiles pour l'IA (`wand_stars.svg`).

## Mode et clavier (décision du 14/11/2026, qui remplace celle du 09/11/2026)

- **Le mode est celui de la personne dès l'ouverture** : Éditer pour qui écrit, Corriger pour un correcteur, Lire pour un lecteur (ou si la personne choisit Lire dans le menu « … »). Les corrections s'affichent donc dans le texte et dans le volet de droite, comme aux autres formats.
- **Le clavier est un état à part** : le texte s'ouvre sans clavier ; **un appui sur le texte** l'ouvre, curseur à l'endroit touché, dans le geste même (sinon le téléphone n'ouvre pas le clavier). **« Terminer »** ou la **fermeture du clavier** (la zone visible, `visualViewport`, retrouve sa hauteur) le referme, **sans changer de mode**.
- **Lire** reste proposé dans le menu « … » : le texte seul, sans volet de droite, un appui n'ouvre pas le clavier.
- Pas de bouton flottant.

Docs : le texte est éditable dès l'ouverture pour qui a le droit d'écrire, sans mode lecture ni cas particulier du téléphone (`DocEditor.tsx` : `readOnly = !doc.abilities.partial_update`). Ce modèle s'en rapproche ; l'écart du 09/11/2026 (ouverture en lecture seule) est supprimé.

## Éditeur (décisions générales, formats S, M et L)

- **Poignées de bloc masquées**, et leur place rendue au texte : **10 px de marge** de chaque côté (`v2/design/feuilles/editeur.css`, réglages `css.editeur.poignees` et `css.editeur.marges`). Docs : 10 px sur téléphone en lecture seule.
- **Palette flottante sans alignement** (gauche, centre, droite) : `BOUTONS_RETIRES` dans `v2/adaptateurs/blocknote/palette.js`. Docs garde l'alignement.
- **Titres de niveau 1 à 5** dans le schéma. Docs limite le choix à 3 niveaux dans sa palette.
- Sur téléphone, la palette tient alors dans la largeur : type de bloc, gras, italique, souligné, barré, retrait, lien.

## Points ouverts

1. Icônes : Tabler ajouté à la v2 (plan du format S, 2.1).
2. Taille des titres sur téléphone : réduite comme Docs (plan du format S, 6.1 ; `css.telephone.titres`).
3. Fermeture du clavier : vérifiée en simulation seulement, à essayer sur un vrai téléphone.
