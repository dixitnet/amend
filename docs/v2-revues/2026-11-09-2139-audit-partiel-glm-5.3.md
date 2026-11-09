# Audit partiel avant fusion (2026-11-09)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 224817 signes envoyés, 4320 reçus (et 17380 de réflexion) ; réflexion `low` ; 23 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `9a3c45b` (36 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot cohérent, bien découpé (design d'un côté, application et adaptateurs de l'autre), conforme au graphe des dépendances et à l'ADR 0008 ; les réglages et la nouvelle dépendance Tabler sont documentés. Les points faibles sont surtout côté tests (un test de coquille qui ne vérifie pas ce qu'il annonce) et deux points de correction (déduplication de la présence par nom, mécanisme double d'éditabilité). Rien de bloquant sur la sécurité ou les licences.

## Constats
1. **[important]** Grille 7 (test qui ne vérifie pas ce qu'il annonce) — `v2/tests/design/composants.test.js:149`, `v2/tests/design/composants.test.js:216`, `v2/tests/design/composants.test.js:234`
   Le test « coquille d'un document : … dans chaque langue » utilise des textes français codés en dur (`INTERFACE`, ligne 149) au lieu des catalogues `fr.json`/`en.json`, qui contiennent pourtant déjà les clés `interface.*` ; la boucle `for (const l of LANGUES)` vérifie donc le même texte français quelle que soit la langue, et le commentaire « les textes n'entrent au catalogue qu'avec l'application » (ligne 147) est faux. L'assertion `assert.ok(I('interface.fermer'))` (ligne 287) ne teste rien. Proposer : remplacer `I(cle)` par `t(cle)` et supprimer `INTERFACE`.

2. **[important]** Grille 6 (cas limite) — `v2/adaptateurs/yjs/index.js:75`
   La présence est dédupliquée par nom (`!vues.has(nom)`) : deux personnes distinctes portant le même nom, l'une masque l'autre (une seule pastille, un seul clientID retenu). La déduplication vise « la même personne ouverte deux fois », mais la clé devrait distinguer les personnes (par exemple l'identifiant du compte publié dans l'état de présence), pas leur nom d'affichage. Proposer : dédupliquer sur un identifiant stable de la personne, pas sur `user.name`.

3. **[mineur]** Grille 6 (double mécanisme) — `v2/adaptateurs/blocknote/plan.js:63`, `v2/adaptateurs/blocknote/plan.js:74`, `v2/adaptateurs/blocknote/index.jsx:209`
   L'éditabilité est pilotée deux fois : par la prop `editable` de `BlockNoteView` (état React) et par écriture directe `editeur.isEditable` dans `modifierAuPoint`/`lireSeulement`. Si un rendu survient entre l'appui tactile et le commit de `setEnModification(true)`, la prop `false` peut écraser l'écriture directe. Le besoin synchrone est réel (curseur avant re-rendu), mais le mécanisme mérite un commentaire ou une garde ; à vérifier en test d'interruption.

4. **[mineur]** Grille 6 (condition de course potentielle) — `v2/application/client/App.jsx:859`
   L'effet « volet droit ouvert d'office » appelle `volets.ouvrirDroite()` sans l'inclure dans ses dépendances (`[suggestions]`) : la fermeture capture un `ouvrirDroite` potentiellement périmé si `etroit`/`gauche` ont changé entre-temps. Proposer : inclure la fonction dans les dépendances ou la stabiliser (`useCallback` dans `volets.js`).

5. **[mineur]** Grille 6 — `v2/adaptateurs/blocknote/plan.js:39`
   `titreCourant` considère visible tout titre dont `top > 0`, sans tenir compte du bandeau de 60 px : un titre masqué sous le bandeau est déclaré courant. Docs soustrait l'en-tête. Proposer : comparer à la hauteur du bandeau (réglage `coquille.bandeau`).

6. **[mineur]** Grille 4 — `v2/tests/services/collaboration.test.js:223`
   Le paramètre du rappel `l` masque la variable `l` (le client lecteur) : le test fonctionne mais est trompeur. Renommer (par exemple `liste`).

7. **[question]** Grille 1/9 (réglage sans décision) — `v2/design/feuilles/editeur.css:17`, `v2/design/reglages.js` (table ADR 0008, ligne `css.editeur.palettes`)
   Ce réglage est appliqué dans le code et dans la feuille, mais la table de l'ADR 0008 dit « pris par Claude le 09/11/2026, à confirmer par Sylvain » : la règle 18 veut qu'aucune valeur soit fixée sans décision de Sylvain. L'écart est transparent et documenté — confirmer qu'il a été validé depuis, sinon le retirer en attendant.

8. **[question]** Grille 6 — `v2/application/client/App.jsx:993`
   `lectureDabord={tactile}` s'applique à tout écran à pointeur grossier, y compris l'iPad en paysage (format M large, deux volets possibles) ; le commentaire de `plan.js:2` dit « lecture d'abord (format M, comme le format S) ». Vérifier que c'est bien la décision voulue pour le paysage, pas seulement le portrait.

## Points de grille sans remarque
2, 3, 5, 8, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides
- 8 : citations valides

## Réponse de Claude

1. **Juste**, corrigé. Les clés `interface.*` sont entrées au catalogue au lot 3 : le test de la coquille passe par `t(cle)` dans chaque langue (fr, en, pseudo) ; le tableau en clair et l'assertion vide sont retirés.
2. **Juste**, corrigé. L'éditeur publie maintenant l'identifiant de la personne dans la présence (`user.id`) ; l'adaptateur Yjs compte par identifiant (à défaut, par client) : deux personnes de même nom comptent deux fois, une personne ouverte deux fois une seule fois, et soi-même jamais.
3. **Juste en partie**, commenté. L'écriture directe de `isEditable` est voulue (le clavier d'un écran tactile ne s'ouvre que dans le geste) ; l'état React qui pilote `editable` est mis à jour dans le même gestionnaire, donc le rendu suivant dit la même chose. Commentaire ajouté dans `plan.js` ; le parcours « lecture d'abord » de la pile vérifie l'appui puis « Terminer ».
4. **Faux.** L'effet est recréé à chaque rendu et appelle le `volets.ouvrirDroite` du rendu où `suggestions` a changé, donc l'état courant de `etroit` et de `gauche` ; rien n'est périmé. Le parcours « volet droit ouvert d'office » le vérifie.
5. **Juste**, corrigé. Le titre courant et le défilement vers un titre tiennent compte du bandeau fixe (bas de l'en-tête fixe de la page, sans valeur à nous) : un titre caché sous le bandeau n'est plus courant, et aller à un titre l'amène sous le bandeau, pas dessous.
6. **Juste**, corrigé (paramètre renommé `liste`).
7. **Question pour Sylvain** : `css.editeur.palettes` (palettes de BlockNote devant le bandeau, variable prévue par BlockNote, valeur de Mantine). Sans lui, sélectionner la première ligne ouvre la palette sous le bandeau, qui la cache et prend les clics (défaut trouvé par la pile).
8. **Conforme à la décision.** Réponse 9 de Sylvain : « M comme S », et la spécification (`docs/v2-formats-M-L.md`, tableau des formats) met l'iPad en paysage en lecture d'abord ; l'iPad est reconnu à son écran tactile, pas à sa largeur.

Contrôles après correction : v2 (format, lint, knip, 181 tests rapides, 44 sur la pile) et racine verts.

## Arbitrage de Sylvain

- 09/11/2026 : réglage `css.editeur.palettes` confirmé (constat 7). Fusion : pas encore.
