# amend.ink v2 : notes de bas de page (12/11/2026)

Demande de Sylvain : « trouves un moyen de les gérer en t'appuyant le plus possible sur les briques déjà utilisées » ; réponses : 1 texte simple ; 2 pas de liste des notes d'abord (plus tard, un onglet du volet de droite) ; 3 mise en forme de Typst par défaut dans le PDF ; « Ok pour le dev ».

## Docs et BlockNote

Ni Docs ni BlockNote n'ont de notes de bas de page. Docs a des éléments en ligne à attributs (mentions de personnes, liens entre documents) : c'est le montage repris.

## Ce qu'apprend l'essai du 08/11 (archive `docs/v2-archives/notes-2026-11-08/`)

La note était alors du texte riche tapé dans la phrase : Entrée, collage, clic et note vide la cassaient. Ici, on ne tape jamais dans l'appel.

## Montage

- `extensions/note/` : un élément en ligne de BlockNote sans contenu éditable, qui porte le texte de la note en attribut (`texte`). Il vit dans le document Yjs : collaboration, historique, suggestions et exports en profitent. Le numéro n'est jamais enregistré : compteur CSS à l'affichage (`css.editeur.notes`).
- Insertion : « /note » et un bouton de la palette ; la note se pose à la fin de la sélection. Un clic sur l'appel ouvre la fenêtre (lire, modifier, supprimer). Le texte est typographié et composé (NFC) à l'enregistrement ; vide, la note est retirée. La fenêtre fermée, le curseur revient dans le texte.
- Exports : `#footnote[…]` de Typst ; `[^n]` en Markdown, textes en fin de fichier.
- Relecture : ajouter ou supprimer une note sont des suggestions ordinaires, acceptées ou refusées une à une. **Le texte d'une note ne se modifie pas en Suggérer** (lecture seule ; on commente l'appel) : Yjs 14 accepte une proposition d'attribut avec « Tout accepter », mais pas seule (`acceptChanges` ne parcourt que les éléments voisins, pas les attributs) ; inscrit à la veille.

## Limites

- Texte simple (ni italique ni lien dans une note).
- Margo ne relit pas les notes ; le compteur de signes ne les compte pas.
- Auteur d'une modification de note inconnu dans le panneau (« Quelqu'un ») : cas qui ne se produit plus en Suggérer.
