# Essai de y-prosemirror v2 (02/11/2026)

Question posée : faut-il miser plus tard sur une migration vers `@y/prosemirror` 2 et son mode suggestion natif (piste 4 de `docs/alternatives-suivi-2026-11-02.md`) ? Essai court, **isolé de l'application** : rien n'a changé dans amend.ink.

## Montage

- `@y/prosemirror` 2.0.0-15, `@y/y` (Yjs 14) 14.0.0-rc.29, `lib0` 1.0.0-rc.36 ; le schéma de la démo officielle (pas le nôtre : il faudrait d'abord le « durcir » pour les marques `y-attributed-*`).
- Une personne par onglet (A, B), documents synchronisés entre onglets avec 30 ms de latence. Pour chacun : un document de base et un document de suggestions, reliés par le `DiffRenderer` de Yjs 14, comme dans la démo. Mode suggestion actif, curseurs partagés, annulation de la v2.
- Les gestes sont ceux de nos outils de campagne (sélection, frappe, composition, collage, Entrée…). Pour chaque cas : la proposition, puis « tout rejeter » (doit rendre le départ), puis le même geste et « tout accepter » (doit donner le résultat attendu).
- Outillage : `tools/essai-y-prosemirror-v2/` (`npm i && npm run build && npm run campagne`). Il n'entre pas dans l'application et a ses propres dépendances.

## Résultats

| Geste | amend.ink aujourd'hui | v2 |
|---|---|---|
| Sélection d'un mot puis frappe | conforme | conforme |
| Sélection puis Entrée | texte effacé hors suivi (désormais refusé) | **suivi** ; rejet et acceptation justes ; affichage lourd (toute la fin du paragraphe barrée puis réinsérée) |
| Ctrl+A puis frappe | frappe perdue | **conforme** |
| Frappe sur deux paragraphes | ajout avant le barré, coupure restante à l'acceptation | **acceptation juste** (paragraphes fusionnés) ; affichage illisible (`[-salo-]{+blanc beau ce mati+}n{+, dit-elle+}.`) |
| Dictée sur deux paragraphes | texte dupliqué | **pas de doublon** ; même affichage illisible |
| Collage sur deux paragraphes | effacé hors suivi vers une citation (désormais refusé) | **suivi**, juste ; affichage illisible |
| Gras sur une sélection | appliqué hors suivi | **suivi** (le rejet retire le gras) ; mais rien ne le montre à l'écran avec le schéma de la démo |
| Retour arrière puis frappe | ajout avant le barré, deux cartes | même ordre (ajout avant le barré) |
| Fusion de paragraphes | hors suivi | **suivie** (paragraphe entier barré puis réinséré) |
| Supprimer l'ajout proposé par l'autre | barré (règle D2) | **effacé sans trace** |
| Deux personnes, endroits différents, même paragraphe | espaces hors suivi (corrigé ce jour par le correctif local) | **conforme** |
| Deux personnes, même endroit, même instant | lettres mêlées, une espace hors suivi | **mots intacts** (`{+ou roux et blanc +}`) |
| Touche morte sur une sélection | conforme | **« ^ » laissé dans le texte, 3 fois sur 3** (hors suggestion et sans sélection : conforme) |
| Touche morte contre le curseur de l'autre | « ^ » ou texte doublé, éditeur bloqué | **texte faux** (`{+tre+}noir`) |
| Ctrl+Z après un remplacement | conforme | **faux** : `{+noir+}[-noir-]` au lieu du texte de départ |

Aucune erreur en console. Non testés : l'attribution des modifications à une personne (il faut qu'un serveur de confiance tienne la correspondance entre clients Yjs et comptes ; sans elle, toutes les modifications sont anonymes), notre schéma, les commentaires, les exports, le chargement de nos documents existants, la tenue sur un long document.

## Ce que l'essai établit

1. **La v2 règle ce que notre architecture ne sait pas régler** : toute modification, quelle que soit sa forme, devient une suggestion (Entrée, collage, gras, fusion) ; la synchronisation ne fait plus sortir de texte du suivi ; les frappes simultanées ne se mêlent plus ; accepter une modification sur plusieurs paragraphes les fusionne.
2. **Elle n'est pas prête pour nous** :
   - la **saisie avec touche morte** (ê, î, ô…) casse sur une sélection en mode suggestion : rédhibitoire pour un public francophone sur Mac ;
   - **Ctrl+Z en mode suggestion** produit un état faux ;
   - **effacer la suggestion d'un autre la fait disparaître** sans trace (contraire à notre règle D2) ;
   - l'**affichage** d'une modification sur plusieurs paragraphes est un diff caractère par caractère illisible pour un auteur ;
   - pré-version, API encore mouvante, attribution à construire côté serveur.
3. Ce sont des défauts **de jeunesse, pas de conception** (sauf peut-être l'affichage, qui découle d'un diff entre deux états). La conception — suggestions dans un document à part, attribution par Yjs — est la bonne pour nos familles A, B et D.

## Recommandation

- **Ne pas migrer maintenant ; miser dessus pour plus tard**, et ne pas investir de gros chantiers maison (jointure suivie, suivi de la mise en forme) que la v2 rendrait inutiles.
- **Rejouer cet essai** à chaque nouvelle pré-version importante de `@y/prosemirror`, et à la sortie stable de Yjs 14 : `tools/essai-y-prosemirror-v2/` (mettre à jour les versions dans `package.json`, puis `npm i && npm run build && npm run campagne && npm run compo`). Critères de passage : touches mortes, Ctrl+Z, effacement de la suggestion d'un autre, affichage multi-paragraphes.
- Signaler en amont (dépôt `yjs/y-prosemirror`) les défauts touche morte / Ctrl+Z en mode suggestion, si l'on veut accélérer : ils sont reproductibles en quelques lignes avec cet outillage.
