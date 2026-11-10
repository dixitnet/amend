# amend.ink v2 : le volet « Documents » à la place de la page « Mes documents »

Statut : **proposé** le 10/11/2026, à arbitrer (réponse par numéros). Options 1 à 7 retenues par Sylvain le même jour (journal).

## Ce que fait Docs

Docs garde une page d'accueil : des filtres (Récents, Mes documents, Partagés avec moi, Favoris, Corbeille) et la liste au centre (`features/left-panel/components/LefPanelTargetFilters.tsx`). Dans un document, son volet gauche montre l'arbre des sous-documents (`LeftPanelDocContent`, `DocTree`), avec en tête « Nouveau document », « Accueil » et « Rechercher » (une fenêtre, `DocSearchButtonModal`). **Écart décidé** : chez nous, plus de page d'accueil ; tout passe par le volet.

## Ce qui existe

- Toutes les routes du serveur, sauf une : `/api/documents` écarte les documents des équipes (on les lit équipe par équipe).
- L'onglet « Documents » du volet (L, M) : Mes documents avec ses dossiers, et Partagé avec moi ; sans équipe, sans action. Au téléphone (S) : une liste de liens.
- La page « Mes documents » : tableau, dossiers, équipes, membres, actions, et l'accès au back-office.

## Les lots

1. **Serveur** (petit) : `/api/documents` rend aussi les documents des équipes de la personne, avec leur équipe et leur dossier. Un test.
2. **Design** (dans `v2/design/`, Mantine tel quel) : l'onglet « Documents » complet :
   - en tête, un champ de recherche et deux boutons, « Nouveau document » et « Nouveau dossier » ;
   - l'arbre : Mes documents (dossiers), une entrée par équipe (ses dossiers), Partagé avec moi ;
   - un menu « … » sur chaque entrée (`Menu` de Mantine), qui n'apparaît que si l'entrée a des actions ;
   - un écran vide, « Aucun document », avec « Nouveau document » ;
   - la même chose au téléphone, dans le volet « Plan / Documents ».
3. **Technique** :
   - l'arbre complet et la recherche par titre (filtre de l'arbre, sans appel au serveur) ;
   - les actions par entrée, reprises de la page actuelle : renommer, déplacer (la liste des destinations d'aujourd'hui), supprimer, me retirer, partager ; pour un dossier, renommer et supprimer ;
   - la création dans l'endroit sélectionné (dossier ou équipe), sinon à la racine de Mes documents ;
   - la gestion d'une équipe (membres, renommer, supprimer, quitter) dans une fenêtre, ouverte depuis son menu « … » ;
   - à l'ouverture, le dernier document ouvert (gardé dans le navigateur ; à défaut, le plus récent de la liste) ; sans document, l'écran vide ;
   - le back-office, joignable depuis le menu du compte (aujourd'hui, un bouton de la page).
4. **Retrait de la page « Mes documents »** : les adresses `#`, `#/dossiers/…`, `#/partages`, `#/equipes/…` ouvrent le dernier document, volet « Documents » déplié à l'endroit visé ; code et textes de la page retirés.
5. **Tests** : les parcours de la pile qui passaient par la page (créer, ranger, partager, équipes, se retirer, supprimer) réécrits sur le volet, aux formats L et S ; pseudo-langue du nouvel onglet.

Ordre : 1, 2, 3, puis 4 et 5 ensemble (la page ne disparaît qu'une fois tout le reste vert). Audit partiel avant la fusion ; une seule fusion à la fin, ou une par lot si Sylvain préfère voir avancer.

## Ce que je déconseille

- Le glisser-déposer pour déplacer : plus lourd à écrire et à tester, et peu sûr au doigt ; la liste des destinations suffit (règle 4).
- Les favoris et la corbeille de Docs : hors du besoin (renoncement n° 12 pour les favoris).

## Questions

- Q1. Une seule fusion à la fin, ou une fusion par lot ?
- Q2. À l'ouverture, sans document récent connu de ce navigateur : le plus récemment modifié de mes documents (proposé), ou l'écran vide ?
