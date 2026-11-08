# Rapport de tests de l'étape 4, « Éditeur » (08/11/2026)

Procédure : `docs/v2-procedure-tests.md`. Mistral étant suspendu, les scénarios sont ceux de Claude (`etape-4-scenarios.md`), et c'est Claude qui vérifie la couverture.

## Résultats dans la session de Claude

| Couche | Commande | Résultat |
|---|---|---|
| T0 statique | `npm run lint`, `npm run format:check`, contrats statiques | vert ; nouveaux : une seule copie de ProseMirror et du module de règles de saisie, aucun caractère invisible en clair dans les sources, feuilles de design liées à l'ADR 0008 |
| T1 à T4 | `npm test` | 90 tests, tous verts (dont 11 T1 de typographie, 3 T2 du schéma du livre et des notes, 1 T4 de la liste des notes) |
| T5 (Chromium) | `npm run test:pile` | 35 tests, tous verts (dont 13 de l'éditeur : typographie, schéma, notes) |
| Mesure | `npm run mesurer` | 250 Mo au total avec un livre de 500 000 signes ouvert à deux (étape 2 : 257 Mo) ; ouverture du livre en 0,4 s |

WebKit et Firefox : CI GitHub.

## Couverture des scénarios

| Scénario | Test |
|---|---|
| T1 : chacune des cinq règles ; idempotence ; rien devant un signe collé ; existant correct respecté ; adresses, courriels, `12:30`, `!=`, `?param`, émoticônes intacts ; guillemets selon ce qui précède ; autre langue ; entrées étranges | `tests/unitaires/typographie.test.js` |
| T2 : document avec notes écrit en Yjs et relu à l'identique (texte et mise en forme de la note) ; notes dans l'ordre du texte | `tests/unitaires/blocknote-serveur.test.js` |
| T2 : blocs et styles retirés refusés avec un code | idem |
| T2 : deux personnes modifient la même note | couvert en T5 (deux navigateurs), plus probant que deux documents en mémoire |
| T5 : frappe, chaque règle ; Retour arrière | `contrats/pile/editeur.test.js` |
| T5 : collage brut et HTML typographiés, NFC, adresse d'un lien intacte | idem |
| T5 : menu « / » et HTML collé limités au schéma du livre | idem |
| T5 : note insérée, ouverte au curseur, repliée hors du curseur, listée ; renumérotation ; rechargement ; deux navigateurs ; copier-coller avec sa note ; flèches aux bords | idem |
| T5 : correcteur : ni typographie, ni collage, ni note ne lui ouvrent l'écriture | idem |
| Recette (Sylvain) : vrai clavier français du Mac, vrai iPad | à faire, voir ci-dessous |

## Recette à la main (Sylvain)

Sur `v2.amend.ink` une fois déployé :
1. Taper au clavier du Mac : `l'été`, `"oui"`, `Quoi ?`, `Note :`, `Fin...`, puis Retour arrière juste après chacun.
2. Coller un passage d'un PDF ou d'un document Word (accents, guillemets droits).
3. Insérer deux notes par « / », écrire dedans, sortir et rentrer avec les flèches, recharger.
4. La même chose sur l'iPad (clavier à l'écran : guillemets, apostrophe).

## Constats, qualifiés

1. **Annulation du module de règles de saisie** (amont) : réinsère le caractère tapé ; contourné dans l'extension, noté en veille ; signalement en amont plus tard (décision de Sylvain).
2. **Frontières d'un contenu en ligne à texte** (comportement connu de ProseMirror et des navigateurs, pas un défaut de notre code) : à la frontière d'une note, le navigateur prolonge le texte voisin. Réglé dans l'extension par deux bornes non modifiables et la gestion des flèches aux bords. Candidat à proposer en amont avec les notes.
3. **« :) » tapé** reçoit une espace insécable (limite de la frappe, un Retour arrière la défait) ; le collage le laisse intact.
4. **Accessibilité de l'appel de note** : son numéro est produit par la feuille de style ; sa lecture par les lecteurs d'écran est à vérifier avec le travail sur l'interface (noté).
5. **Rafales de touches** : ProseMirror suit le curseur du navigateur de façon asynchrone ; des flèches tapées en rafale très rapide peuvent ne pas entrer dans une note repliée. Sans effet à vitesse humaine (test avec des touches espacées).
