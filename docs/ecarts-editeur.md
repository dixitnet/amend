# Écarts de l'éditeur : registre et veille

Registre vivant des écarts de l'interface d'édition par rapport au comportement attendu (Google Docs en mode suggestion), issus de la campagne du 02/11/2026. À mettre à jour à chaque lot : statut, commit, date.

Sources : campagne (`docs/campagne-editeur-2026-11-02.md`), causes (`docs/diagnostic-editeur-2026-11-02.md`, familles A à E), alternatives (`docs/alternatives-suivi-2026-11-02.md`), essai de la v2 (`docs/essai-y-prosemirror-v2-2026-11-02.md`). Outils pour rejouer : `tools/campagne/` (matrice, scénarios, endurance, composition), `tools/essai-y-prosemirror-v2/`.

Statuts : **à corriger** (petit chantier, utile quelle que soit la suite), **atténué** (plus de perte, mais pas encore le comportement voulu), **corrigé**, **attendre la v2** (chantier lourd que `@y/prosemirror` 2 rendrait inutile), **à décider** (question de comportement, pas de défaut).

## Registre

| N° | Écart | Famille | Statut | Piste | Taille |
|---|---|---|---|---|---|
| 1 | Sélection puis Entrée, en suivi : le texte était effacé hors suivi | A | **atténué** (refusé avec message, aa5ea9d) | suivre le geste : barrer la sélection, puis couper | petit |
| 2 | Ctrl+A puis frappe, en suivi : la frappe est perdue | B | **corrigé** (03/11/2026) : la frappe va dans le dernier bloc de texte de la sélection | — | — |
| 3 | Dictée / saisie prédictive sur une sélection titre → paragraphe ou paragraphe → citation : texte dupliqué | B | **corrigé** (03/11/2026) : le reste du bloc reconstruit par ProseMirror est retiré de la frappe | — | — |
| 4 | Collage sur une sélection paragraphe → citation : effacé hors suivi | A | **atténué** (refusé avec message, aa5ea9d) | suivre le collage multi-blocs | moyen |
| 5 | Frappe simultanée dans le même paragraphe : espaces hors suivi | D | **corrigé** à des endroits différents (correctif y-prosemirror, aa5ea9d) ; reste « même endroit, même instant » | résiduel : attendre la v2 | — |
| 6 | Touche morte (ê) sur une sélection collée au curseur d'une autre personne : « ^ » laissé ou texte doublé, puis éditeur bloqué jusqu'au rechargement (aussi hors suivi) | D | **corrigé** (03/11/2026) : les curseurs distants sont masqués pendant une composition (`client/src/curseursComposition.js`) ; scénarios « Touche morte contre le curseur de l'autre » | — | — |
| 7a | Sélection sur plusieurs paragraphes : ajout placé avant le barré | B | **corrigé** (03/11/2026) : ajout après le barré, comme dans un seul paragraphe ; sauf pendant une composition (touche morte), où la frappe reste au début : la déplacer cassait la composition | — | — |
| 7b | Sélection sur plusieurs paragraphes : la coupure reste après acceptation | B | **attendre la v2** | une « jointure suivie » (nouvel attribut de bloc) | lourd |
| 8 | Barrer un passage déjà barré par un autre : sa suppression passe au nouveau nom, et le rejet efface les deux | C | **corrigé** (03/11/2026) : le texte déjà barré est laissé à son auteur | — | — |
| 9 | Commentaire masqué quand on accepte la suppression ou le remplacement de son passage | E | **à décider** | reporter le fil sur le nouveau texte (comme Google Docs) | moyen |
| 10 | Gras / mise en forme en suivi appliqués directement (éditeur) | A | **attendre la v2** | suivi de la mise en forme | lourd |
| 11 | Deux personnes au même endroit : lettres mêlées (aussi hors suivi) | D | **attendre la v2** | — (rare) | — |
| 12 | Suppr. en fin de paragraphe en suivi : fusion hors suivi | A | **attendre la v2** | jointure suivie (cf. 7b) | lourd |
| 13 | Touche morte, ou retour arrière puis frappe : deux cartes au lieu d'un « remplacement » | C | **corrigé** (03/11/2026) : la composition garde le groupe ; une frappe collée à sa propre suppression forme un remplacement | — | — |
| 14 | Retour arrière puis frappe : nouveau texte avant le barré | E | **à décider** | aligner sur « ancien barré, puis nouveau » ou garder | petit |
| 15 | En suivi, taper sur un mot en italique (ou un lien) perd l'italique (le lien) | C | **corrigé** (03/11/2026) : la frappe prend la mise en forme (et le lien) du premier caractère remplacé | — | — |
| 16 | Raccourcis Google Docs absents : Ctrl+Alt+M (commenter), Ctrl+Alt+1…6 / 0 (titres) | E | **à décider** | ajouter les raccourcis | petit |

Lot de corrections des petits chantiers (6, 2, 3, 7a, 8, 15, 13) : fait le 03/11/2026 ; tests `client/test/ecartsSuivi.test.js`. Matrice complète après correction : 4 635 vérifications, 159 échecs (380 le 02/11), tous attendus (Entrée et collage multi-blocs refusés, coupure 7b, composition multi-blocs au début, artefacts de geste) ; « rien de perdu », « tout rejeter », Ctrl+Z, « une seule modification » : 0 échec. À surveiller : la dictée sur une sélection paragraphe → citation est restée une fois sans effet dans la matrice complète (non reproduit en trois passages isolés). Les points à décider (9, 14, 16) relèvent de Sylvain.

## Veille de y-prosemirror v2

But : savoir quand `@y/prosemirror` 2 (mode suggestion natif, Yjs 14) devient utilisable pour amend.ink, sans y passer de temps entre deux versions.

**Rythme.** Une fois par mois, et à chaque annonce de version stable de Yjs 14.

**Procédure.**

1. Versions publiées : `cd tools/essai-y-prosemirror-v2 && npm i && node veille.mjs`. Le script compare les dernières versions (pré-versions comprises) de `@y/prosemirror`, `@y/y`, `lib0` et `@y/protocols` à celles de l'essai, dit si une version stable existe, et vérifie que y-prosemirror 1.x n'a pas bougé (sinon, revoir `client/patches/`).
2. S'il y a du nouveau : `node veille.mjs --essayer`. Il installe les dernières pré-versions sans toucher à `package.json`, rejoue l'essai (`campagne.mjs`, `compo.mjs`), juge les critères ci-dessous, puis remet l'installation d'origine. Quelques minutes, rien dans l'application.
3. Lire le journal des changements de la version (`CHANGELOG.md` du dépôt `yjs/y-prosemirror`) pour ce qui touche au mode suggestion, à la composition, à l'annulation et à l'attribution.
4. Noter le résultat ci-dessous (date, versions, critères).
5. Si tous les critères passent : ouvrir un **essai approfondi** (notre schéma « durci » pour les marques `y-attributed-*`, attribution par compte côté serveur, commentaires, exports, chargement de documents existants, la campagne complète), puis décider de la migration.

**Critères de passage** (tous requis) :

1. Touche morte sur une sélection, en mode suggestion : `[-noir-]{+être+}`, sans « ^ ».
2. Ctrl+Z après un remplacement, en mode suggestion : retour au texte de départ.
3. Effacer la suggestion d'une autre personne la laisse visible (barrée), pas supprimée.
4. Modification sur deux paragraphes : affichage lisible (`[-salon.…-]{+blanc+}`), pas un diff caractère par caractère.
5. Touche morte contre le curseur d'une autre personne : texte juste.
6. Non-régression : « tout rejeter » rend toujours le départ, « tout accepter » donne le résultat attendu.

### Journal de veille

| Date | Versions | Critères 1–5 | Non-régression | Suite |
|---|---|---|---|---|
| 02/11/2026 | `@y/prosemirror` 2.0.0-15, `@y/y` 14.0.0-rc.29 | ✗ ✗ ✗ ✗ ✗ | ✓ | pas encore ; prochain passage début décembre 2026 |
| 07/11/2026 | inchangées : `@y/prosemirror` 2.0.0-15 (11/10), `@y/y` 14.0.0-rc.29 (15/10), `lib0` 1.0.0-rc.36, `@y/protocols` 1.0.6-rc.1 ; aucune stable (« latest » : 2.0.0-0 et 14.0.0-rc.7) ; y-prosemirror 1.x toujours 1.3.7 (correctif local toujours valable) | non rejoués (mêmes versions qu'au 02/11) | — | rien de nouveau : un seul commit sur `yjs/y-prosemirror` depuis le 11/10 (CI, 04/11), aucun sur le code de `yjs/yjs` depuis le 15/10. Le journal des changements garde, non publiée, l'entrée « Implied format attribution is no longer rendered » (attribution de mise en forme fondue dans l'insertion suivie) : à suivre pour l'écart 10. Prochain passage début décembre 2026 |
