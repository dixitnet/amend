# Notes de bas de page : défauts constatés (08/11/2026)

Parcours d'utilisateur sur la pile complète (Chromium, `npm run dev`), à la demande de Sylvain (« pour le moment ça ne marche pas »). Version testée : celle de `main` (même construction que v2.amend.ink).

## Ce qui marche

Insertion par le menu « / », frappe dans la note, typographie dans la note, sortie par la flèche droite, flèches gauche et droite à travers une note (à vitesse de frappe et de répétition de touche), Début et Fin, Entrée hors des notes, Annuler (Ctrl+Z) après suppression d'une note, liste des notes, rechargement, sélection à la souris d'un passage qui contient une note, Maj+Entrée dans une note (saut de ligne), collage d'une ligne dans une note.

## Défauts

| n° | Geste | Résultat | Gravité |
|---|---|---|---|
| 1 | Entrée dans une note (au milieu ou à la fin de son texte) | **perte de texte** : la fin de la note et la suite du paragraphe disparaissent (« Avant[La note.] après. » → « Avant[La not] ») ; erreur « Cannot join paragraph onto blockContainer » | critique |
| 2 | Coller deux paragraphes dans une note | la note est coupée en deux, à cheval sur deux paragraphes | grave |
| 3 | Clic sur l'appel de note | le curseur se place avant ou après l'appel, la note ne s'ouvre pas : **à la souris, une note ne peut être ni ouverte ni modifiée** | grave |
| 4 | Retour arrière dans une note vide | rien : la note vide ne peut pas être retirée de l'intérieur | mineur |
| 5 | Retour arrière juste après l'appel | toute la note, texte compris, disparaît d'un coup (Ctrl+Z la rend) | question de produit |

Le n° 1 vient de la touche Entrée de BlockNote, qui coupe le bloc sans tenir compte d'un contenu en ligne à texte (défaut amont probable, à vérifier puis à noter dans la veille).

Non testé ici : Safari et Firefox (navigateurs absents de l'environnement ; la CI fait passer les tests existants sur les trois moteurs).
