# amend.ink v2 : parties, en-têtes, bibliographie et modèle « TàT 140 × 220 »

Statut : **défini avec Sylvain le 19/11/2026, pas lancé** (« on ne lance rien avant d'avoir tout défini »). Source : analyse d'un livre de 140 × 220 mm composé dans InDesign (parties, chapitres, trois niveaux d'intertitres, bibliographie, table en fin de volume).

## Décisions

1. **Les parties sont des titres 1, les chapitres des titres 2.** Pas de bloc « partie » : le schéma de l'éditeur ne change pas pour cela.
2. **Les réglages d'ouverture du titre 1 sont étendus au titre 2** : début (à la suite, nouvelle page, belle page), ligne du titre, ligne où le texte reprend. Affichés pour le titre 2 seulement quand il ne démarre pas « à la suite ».
3. **Pages d'ouverture** : pas d'en-tête sur une page ouverte par un titre 1 ou 2 ; **le numéro de page se règle par niveau** (affiché ou non sur l'ouverture d'un titre 1, et sur celle d'un titre 2).
4. **En-tête « chapitre en cours »** : le niveau le plus profond qui ouvre une page (le titre 2 quand il ouvre une page, sinon le titre 1), sans réglage de plus.
5. **Style des en-têtes réglable** : police, corps, italique, petites capitales, alignement.
6. **Petites capitales dans les styles** (titres, en-têtes), à côté de « majuscules ». Pas de petites capitales dans le texte (pas de mise en forme de plus dans l'éditeur).
7. **Style de paragraphe « Bibliographie »**, avec un **retrait suspendu** (propriété de style nouvelle, offerte à tous les styles de bloc).
8. **Écartés** : en-tête « auteur », ornement sous le titre, numérotation automatique des chapitres, grand chiffre de partie distinct du titre, demi-gras, pages liminaires et finales composées, Caslon dans le catalogue.

## Modèle « TàT 140 × 220 » (modèle de l'instance, valeurs validées)

| Paramètre | Valeur |
|---|---|
| Format | 140 × 220 mm |
| Marges | haut 25, intérieure 21, extérieure 18, bas 32 mm (33 lignes) |
| Texte | EB Garamond, 11 / 14 pt, justifié, césures, alinéa 5 mm |
| Premier paragraphe d'un chapitre | avec alinéa |
| Numéro de page | bas centré, à 20 mm du bord ; pas sur l'ouverture d'un titre 1, oui sur celle d'un titre 2 |
| En-têtes | petites capitales, 10,5 pt, centrés ; contenu : voir « À préciser » |
| Titre 1 (partie) | belle page, ligne 14, petites capitales, 14 pt, centré |
| Titre 2 (chapitre) | belle page, gras 11 pt, centré, titre ligne 6, texte ligne 11 |
| Titre 3 | gras 11 pt, à gauche, 21 pt avant, 7 pt après |
| Titre 4 | italique 11 pt, à gauche, 14 pt avant |
| Titre 5 | italique 11 pt, retrait 5 mm, 14 pt avant |
| Citation | 10 pt, retrait 5 mm, 7 pt avant et après |
| Bibliographie | 10 pt, retrait suspendu 5 mm, aligné à gauche |
| Légende | 9 pt, italique, centrée |
| Séparateur | blanc |

La marge basse est calculée (33 lignes de 14 pt) : à vérifier dans un PDF au développement.

## Vérifié dans le code avant de lancer

- Un style en plus petit corps garde **l'interligne du texte** (`leading: interligne − 1em` dans chaque style du gabarit) : la bibliographie et la citation en 10 pt restent sur la grille de 14 pt.
- Les petites capitales de Typst s'appuient sur la police. EB Garamond les a ; **à vérifier pour chaque police du catalogue** par un contrat, avec un repli décidé (majuscules, ou réglage non proposé pour les polices qui ne les ont pas).

## À préciser

- **Contenu des en-têtes du modèle**, l'auteur étant écarté : titre du document à gauche et chapitre en cours à droite, ou titre du document des deux côtés, ou aucun.

## Lots, dans l'ordre (un lot = une couche)

1. **Domaine** : ouverture par niveau (titres 1 et 2), numéro de page par niveau, en-tête au niveau le plus profond qui ouvre une page, style des en-têtes, petites capitales, retrait suspendu, style bibliographie dans le gabarit ; reprise des modèles enregistrés (valeurs par défaut identiques au comportement actuel).
2. **Extension et adaptateur** : bloc « Bibliographie » (sur le modèle de « Légende »), palette, menu « / », exports Typst et Markdown.
3. **Design** : liste des réglages, modèle « TàT 140 × 220 », lignes de l'ADR 0008 et de l'ADR 0011.
4. **Application et traductions** : page de réglage d'un modèle (lignes du titre 2, style des en-têtes, colonnes petites capitales et retrait suspendu).
5. **Tests** : contrats Typst, livre de référence régénéré (avec parties et bibliographie), pile des modèles.
