# amend.ink v2 : formats M (iPad) et L (Mac)

État au 09/11/2026 : **maquette visuelle validée par Sylvain**, pas encore développée dans la v2 (étape 6b). Maquette : `docs/v2-maquettes/grand-ecran/`, publiée sur https://claude.ai/artifact/9yb3tcEUBhhcz1dUiJNUCF . Décisions : `docs/journal-decisions.md`, § 37. Le format S a sa propre spécification (`docs/v2-format-S.md`) ; ce qui est commun aux trois formats y est rappelé (éditeur, palette).

Règle de départ : regarder d'abord comment procède Docs (règle permanente n° 11). Chaque point ci-dessous dit ce que fait Docs (code lu au commit `03d5b9f` du 05/11/2026).

## Formats et seuils

| Format | Appareil | Largeur | Disposition | Saisie |
|---|---|---|---|---|
| L | Mac | 992 px et plus | deux volets possibles | modification directe |
| M paysage | iPad | 992 px et plus | deux volets possibles | lecture d'abord (comme S) |
| M portrait | iPad | moins de 992 px | un seul volet à la fois | lecture d'abord (comme S) |

- Le seuil est le point de rupture `md` de Mantine (62 em, soit 992 px) : aucune valeur à nous. Docs : 1024 px (`useResponsiveStore.tsx`). Écart décidé (7a).
- L'iPad se reconnaît à son **écran tactile** (`pointer: coarse`), pas à sa largeur : en paysage, il a la disposition de L et la saisie de S. Docs distingue aussi le pointeur tactile (`hasCoarsePointer`).
- L'iPad 13 pouces en portrait (1024 px) a la disposition de L.

## Disposition

L'`AppShell` de Mantine, tel quel : bandeau en haut sur toute la largeur, volet gauche, texte, volet droit.

Docs n'a pas de bandeau : une barre flottante (`DocFloatingBar.tsx`) et des volets sur toute la hauteur. Écart décidé (2) : un bandeau fixe, comme le format S et la v1.

## Bandeau

Fixe, une ligne, de gauche à droite :

| Élément | Picto (Tabler) | Rôle |
|---|---|---|
| Volet gauche | `IconListTree` | ouvre ou ferme « Plan / Documents » |
| Titre du document | — | coupé par « … » s'il est trop long ; sur l'écran de la liste : « Mes documents » ou « Partagé avec moi » |
| « Terminer » | — | M seulement, en modification : repasse en lecture |
| Présence | — | les personnes dans le document (avatars de Mantine, nom au survol) |
| « Partager » | `IconShare` | bouton visible, comme Docs (`DocShareButton`) ; ouvre la fenêtre de partage |
| Menu « … » | `IconDots` | Copier le lien, Partager, Exporter, Imprimer, Dupliquer, Historique, Supprimer (chaque action à l'étape qui l'apporte : Exporter et Imprimer à l'étape 7) |
| Compte | — | avatar de la personne ; menu : adresse, « Se déconnecter », « Déconnecter tous mes appareils » |
| Volet droit, tout à droite | `IconPencilCheck` | ouvre ou ferme « Modifications / Margo (IA) » ; porte le nombre de suggestions en attente |

Sur l'écran de la liste, le bandeau ne porte que le volet gauche, le titre et le compte.

Le titre est dans le bandeau, plus dans le texte (3), comme en S. Docs le met au-dessus du texte, en grand (`DocHeader.tsx`) : écart décidé.

## Volet gauche : « Plan / Documents »

- Deux onglets avec picto : **Plan** (`IconListTree`) et **Documents** (`IconFiles`), comme en S ; en tête, le picto et le nom « amend.ink », qui mène à « Mes documents ».
- **Ouvert par défaut en L et en M paysage, fermé en M portrait.** Docs : ouvert sauf sur téléphone (`useLeftPanelStore.tsx`).
- **Redimensionnable** de 300 à 450 px, 300 px au départ (4) : les valeurs de Docs (`ResizableLeftPanel.tsx`). Mantine le fait lui-même (`useAppShellResize`, Mantine 9) ; Docs passe par une bibliothèque (`react-resizable-panels`).

Sur l'écran de la liste, le volet porte « Nouveau document », **Mes documents** (`IconUser`) et **Partagé avec moi** (`IconUsers`), à la place des onglets de 6c (10) ; les dossiers d'équipe (6d) s'y ajouteront. Docs y met ses filtres (`LefPanelTargetFilters.tsx`).

## Volet droit : « Modifications / Margo (IA) »

- En-tête « Relecture » ; deux onglets avec picto : **Modifications** (`IconPencilCheck`) et **Margo (IA)** (`IconWand`).
- 300 px de large, comme Docs (`RightPanel.tsx`).
- **Ouvert d'office à l'ouverture d'un document quand des suggestions attendent** (5b), fermé sinon. Docs le referme à chaque document : écart décidé.

## Volets ensemble

- L et M paysage : les deux volets peuvent être ouverts en même temps.
- M portrait : un seul à la fois. Ouvrir l'un ferme l'autre, qui se rouvre quand on referme le premier ; en passant de paysage à portrait avec les deux ouverts, le gauche se ferme. C'est le montage de Docs (`usePanelCoordination.tsx`).

## Texte

- Colonne de **720 px** au plus, centrée (8) : la taille `sm` du `Container` de Mantine. Docs : 868 px.
- Décisions communes aux trois formats (`docs/v2-format-S.md`) : poignées de bloc masquées, 10 px de marge de chaque côté, palette sans alignement, titres de niveau 1 à 5.

## Lecture et modification

- L : le document s'ouvre en modification, comme Docs.
- M : comme S (9). Le document s'ouvre en lecture seule ; un appui sur le texte passe en modification, curseur à l'endroit touché ; « Terminer » dans le bandeau repasse en lecture.

## Points ouverts de l'ADR 0008, réglés (11)

1. **Couleur de l'interface : le vert**, celui du picto (Sylvain, 09/11/2026), et non plus le bleu de Mantine (nuance 8 choisie un moment). **Valeur en attente de décision.** Mesures (axe, clair et sombre) :
   - le vert du picto (`green.8`, #2f9e44) suffit pour le picto (3,45:1 sur blanc, au-dessus des 3:1 demandés pour un élément graphique), pas pour du texte : texte blanc sur un bouton vert 3,45:1, au-dessous des 4,5:1 ;
   - aucune nuance du vert de Mantine ne porte un texte blanc à 4,5:1 (`green.9` : 4,37:1), et ses variantes légères (entrée active du plan, badges, bouton « Accepter » : texte `green.9` sur `green.1`) donnent 3,8:1 quelle que soit la nuance choisie ;
   - proposition de Claude, **« vert foncé »** : le vert de Mantine dont la dernière nuance est assombrie (#237032), couleur principale à cette nuance. Texte blanc 6,1:1, variantes légères 5,3:1 ; tous les contrôles de contraste passent, comme avec le bleu 8. Le picto garde `green.8`, de la même palette.
   Le contrôle de contraste reprend alors le bouton et le badge (`CONTRASTE_EN_ATTENTE` à retirer).
2. **Haut de page** : le bandeau règle le titre collé au haut de l'écran.
3. **Hors ligne** : une alerte de Mantine sous le bandeau (variante `light`, couleur `orange`, picto `IconWifiOff`), comme `AlertOffline` de Docs. Le texte de la maquette est à reprendre dans le catalogue.
4. **Tabler** (`@tabler/icons-react`) devient une dépendance de la v2, importée par la seule couche de design.

## Réglages à inscrire (`v2/design/reglages.js`, ADR 0008)

Au lot de design, chacun avec sa décision :

| Réglage | Valeur | Décision |
|---|---|---|
| `theme.colors`, `theme.primaryColor`, `theme.primaryShade` | vert de Mantine, dernière nuance #237032 ; couleur principale à cette nuance | en attente (proposition « vert foncé ») |
| volet gauche | 300 px, redimensionnable de 300 à 450 px | Sylvain, 09/11/2026 (4), valeurs de Docs |
| volet droit | 300 px | Sylvain, 09/11/2026 (accord sur la maquette), valeur de Docs |
| colonne du texte | 720 px (`Container` `sm` de Mantine) | Sylvain, 09/11/2026 (8) |
| alerte hors ligne | `variant="light"`, `color="orange"` | Sylvain, 09/11/2026 (accord sur la maquette) |

Valeurs de la maquette **non décidées**, à remplacer au lot de design par les valeurs par défaut de Mantine, ou à soumettre à Sylvain si Mantine n'en a pas : hauteur du bandeau (54 px), taille des pictos dans les volets et les menus (18 px), taille et décalage du nombre sur le bouton du volet droit (16 et 4 px).

## Renoncements

Repris de Docs, non retenus (12, registre n° 12) : mode « Présenter », favoris, emoji du titre.

## Compte, présence, partage, Margo (réponses de Sylvain, 09/11/2026)

1. **Compte** dans le bandeau. Docs le met en pied du volet gauche (`LeftPanelFooter.tsx`) : écart décidé.
2. **État de la connexion** : seulement l'alerte hors ligne, comme Docs (plus de « Synchronisé » ni « Connexion… » affichés) ; **présence** dans le bandeau, avant « Partager ».
3. **Partage** dans une fenêtre de Mantine (`Modal`), comme Docs ; contenu de `PanneauPartage`.
4. **Onglet Margo (IA)** présent dès maintenant, **vide** jusqu'à l'étape 8 (Sylvain, 09/11/2026).
