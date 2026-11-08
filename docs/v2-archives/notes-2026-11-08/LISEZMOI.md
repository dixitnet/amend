# Archive : notes de bas de page de la v2 (étape 4), retirées le 08/11/2026

Décision de Sylvain (08/11/2026) : « pour le moment supprimes tout le développement lié aux notes. ce n'est pas une fonctionnalité critique. archives tout pour reprendre ce dev a une étape ultérieure, probablement en simplifiant drastiquement cette fonctionnalité. »

## Où retrouver le code

- **État complet d'avant le retrait** : commit `580f4f1` de la branche `claude/determined-edison-rybime` (`git show 580f4f1:v2/extensions/note/index.js`, etc.). Le commit de retrait suit immédiatement.
- **Copies** des fichiers concernés, telles qu'au commit `580f4f1`, dans `code/` (suffixe `.archive` pour qu'aucun outil ne les lise comme du code actif) :
  - `extensions/note/index.js` : le contenu en ligne `note` (texte riche), les flèches aux bords, l'insertion, la liste des notes du document ;
  - `design/composants/ListeNotes.jsx` et `design/feuilles/notes.css` : la liste en fin de document et l'affichage B (numéro par compteur CSS, appel en exposant, texte replié hors du curseur) ;
  - `adaptateurs/blocknote/index.jsx` et `schema.js`, `application/client/App.jsx` : le branchement (menu « / », schéma, liste) ;
  - les tests : `contrats/pile/editeur.test.js` (parcours sur la pile), `tests/unitaires/blocknote-serveur.test.js` (aller-retour, ordre, tableau, texte brut, collage typographié), `tests/design/composants.test.js` (liste).

## Ce qui avait été décidé (étape 4)

- Modèle a : la note est un contenu en ligne à texte riche, à l'endroit de son appel ; son numéro n'est jamais stocké.
- Affichage B : seul l'appel se voit ; le texte s'ouvre quand le curseur y entre ; liste des notes en fin de document.
- Réglages de design décidés (ADR 0008, retirés de la table avec ce code) : `css.note.numerotation`, `css.note.appel` (taille `xs`), `css.note.repliee`, `css.note.ouverte` (taille `sm`, couleur atténuée de Mantine).
- Pas de raccourci clavier pour insérer une note.

## Pourquoi c'est retiré

Le parcours d'utilisateur du 08/11/2026 (`docs/v2-tests/2026-11-08-notes-defauts.md`) a montré : Entrée dans une note fait perdre du texte ; un collage de plusieurs paragraphes coupe la note en deux ; un clic sur l'appel n'ouvre pas la note ; une note vide ne se retire pas de l'intérieur. À l'essai du mode suggestion (étape 5), les notes, elles, fonctionnaient.

## À la reprise

- Partir d'une version **drastiquement simplifiée** (souhait de Sylvain), par exemple sans texte riche ni repli dans le texte, et la décider avant de coder.
- Rejouer d'abord le parcours d'utilisateur du rapport de défauts (Entrée, collage, souris, note vide, retour arrière), pas seulement les tests de l'étape 4 qui ne les voyaient pas.
- Vérifier la typographie à côté d'un contenu en ligne (le collage traitait la note comme un objet : `typographierFragment`).
