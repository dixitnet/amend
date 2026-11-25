# Essai du garde-fou du mode « Éditer » (24/11/2026)

Demande de Sylvain (24/11/2026) : « Le garde-fou bloque des saisies / suppressions à proximité de commentaires, même s'ils sont supprimés. Analyse son fonctionnement pour le limiter drastiquement au seul évitement des bugs. » Puis : « 1 à 4 ok, lance ».

Docs n'a pas de mode suggestion (voir l'essai du 12/11/2026) : pas de point de comparaison.

## Le constat de départ

Après « Supprimer le commentaire » ou « Résoudre », en « Éditer », le Retour arrière était refusé dans le mot commenté et dans les mots voisins, jusqu'au rechargement. Cause : BlockNote remplace la marque du fil par une marque « orpheline » (un changement de mise en forme) ; Yjs l'affiche comme une « modification de mise en forme » attribuée, qui reste (même famille que le défaut des liens du même jour) ; le garde-fou rangeait ces modifications parmi les corrections et protégeait en plus les mots voisins.

## Mesure : garde-fou désactivé

Pile locale, Chromium. Un paragraphe « Alpha bravo était charlie delta. », suivi de « Echo foxtrot golf. » ; Margo propose « était » → « étais » (une suppression de « t », un ajout de « s »). Chaque geste est fait en « Éditer », puis « Tout accepter » d'un côté, « Tout refuser » de l'autre ; on lit l'écran et le texte du serveur.

| Geste                                                                | Résultat                                                                |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| effacer le signe juste après la correction                           | sans dommage                                                            |
| effacer le signe juste avant                                         | sans dommage                                                            |
| effacer dans le mot voisin, avant ou après                           | sans dommage                                                            |
| Entrée en fin de paragraphe, ou après la correction, même à son bord | sans dommage                                                            |
| le paragraphe suivant rejoint celui de la correction                 | sans dommage                                                            |
| un paragraphe vide retiré devant celui de la correction              | sans dommage                                                            |
| gras sur le mot voisin, ou par-dessus la correction                  | sans dommage (vu aussi chez une autre personne)                         |
| collage (avec du gras) dans le mot voisin                            | sans dommage                                                            |
| **Entrée avant la correction**, même loin dans le paragraphe         | **correction aplatie** : « étaits » dans le texte, plus rien à arbitrer |
| **le paragraphe de la correction rejoint le précédent**              | **correction aplatie**                                                  |
| **le paragraphe de la correction devient un titre ou une liste**     | **correction aplatie**                                                  |
| **sélection qui recouvre la correction, puis frappe**                | **la correction disparaît sans trace**                                  |
| **collage mis en forme collé contre la fin de la correction**        | **le texte collé entre dans la correction** : il part si on la refuse   |

## Le garde-fou réduit

`v2/extensions/garde-suggestions/index.js` ne refuse plus que :

1. effacer ou remplacer le contenu même d'une correction ;
2. déplacer une correction : coupure du paragraphe avant elle, fusion de son paragraphe dans le précédent, changement du type de son bloc ;
3. au contact d'une correction (de son début au signe qui suit sa fin) : remplacer une sélection, ou insérer autre chose que du texte à la mise en forme du lieu. La frappe simple passe (correctif `correctif-245.js`).

Ne sont plus protégés : les mots voisins ; les « modifications de mise en forme » ; la mise en forme et les commentaires, même par-dessus une correction.

Vérifié garde-fou actif, sur les mêmes gestes : les cinq gestes destructeurs sont refusés, le texte et la correction intacts après « Tout accepter » comme après « Tout refuser » ; les autres passent.

## Limites connues

- Un « # » ou un « - » tapé en début d'un paragraphe corrigé reste écrit tel quel : la transformation en titre ou en liste est refusée, pas la frappe.
- Une frappe juste après une lettre ajoutée par une correction peut se placer avant elle (limite du correctif 245, inchangée).
- L'attribution fantôme laissée par un commentaire supprimé reste dans l'affichage jusqu'au rechargement ; elle ne bloque plus rien. À traiter en étendant `correctif-forme.js` au remplacement d'une marque.
- Un collage juste avant le début d'une correction est refusé alors qu'il a été mesuré sans dommage : gardé par symétrie avec la fin (l'essai du 12/11 l'avait trouvé destructeur pour un ajout en fin de paragraphe).
