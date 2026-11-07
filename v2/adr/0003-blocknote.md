# ADR 0003 — BlockNote et son modèle par blocs

- Statut : acceptée (Sylvain, 07/11/2026)

## Contexte

L'éditeur doit offrir collaboration, mode suggestion, commentaires et historique sans que nous les écrivions. BlockNote (MPL-2.0, paquets `xl-` en GPL-3.0) les fournit sur `@y/prosemirror` 2 et Yjs 14 ; Docs l'utilise.

## Décision

BlockNote est l'éditeur de la v2. Le document est une liste de blocs (paragraphes, titres, citations, listes, images, tableaux, séparateurs) ; nos besoins propres sont des extensions : note de bas de page (contenu en ligne à texte riche), typographie française. Collaboration par `@blocknote/core/y` (Yjs 14).

## Options écartées

ProseMirror nu (plus de code à nous) ; Tiptap seul (son suivi des modifications est payant) ; Lexical, Slate (pas de suivi des modifications).

## Conséquences

Structures composées aplaties (citation de plusieurs paragraphes = blocs voisins) ; interface React ; poignées et menu « / » à masquer pour une page de livre ; exports à écrire sur le JSON de BlockNote ; version 0.x qui évolue vite.

## Ce qui ferait revenir dessus

Notes de bas de page impossibles à faire tenir en extension ; mode suggestion qui ne mûrit pas ; ruptures de version trop coûteuses.
