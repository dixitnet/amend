# Audit partiel avant fusion (2026-11-08)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 98963 signes envoyés, 2309 reçus (et 6187 de réflexion) ; réflexion `low` ; 10 s ; arrêt : stop
- Diff audité : `v2/` de `2425f6e` à `b06275d` (20 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff retire proprement la fonction « notes de bas de page » (décision de Sylvain du 08/11/2026) : extension, schéma, composant de design, feuille CSS, clés i18n et tests disparaissent ensemble, et l'ADR 0008 est mise à jour. Le retrait est cohérent d'une couche à l'autre et les frontières testées sont adaptées. Restent deux traces : un parcours de contenu imbriqué dans `texteDesBlocs` qui n'a plus de raison d'être, et la disparition du seul test de `typographierFragment` alors que son comportement change. Le registre des renoncements fourni ne mentionne pas le retrait des notes.

## Constats
1. **[question]** Grille 11 (documentation) — `docs/v2-renoncements.md:5` : le retrait des notes (décision de Sylvain du 08/11/2026, mentionné dans l'ADR 0008 et le plan de l'étape 4) ne figure pas dans la table du registre des renoncements, et le diff ne touche pas ce fichier. Si l'entrée existe déjà hors diff, ignorer ; sinon l'ajouter (quoi : notes de bas de page ; pourquoi : non critique ; ce qui ferait y revenir : reprise très simplifiée plus tard).
2. **[mineur]** Grille 4 (simplicité, code mort) — `v2/adaptateurs/blocknote/serveur.js:47` : `enLigne` gère encore un contenu en ligne imbriqué (`Array.isArray(c.content) ? enLigne(c.content) : ''`), cas qui n'existait que pour la note ; avec `inlineContentSpecs: defaultInlineContentSpecs` (`v2/adaptateurs/blocknote/schema.js:31`), plus aucun contenu en ligne n'a de `content` en tableau. À l'inverse, la typographie a bien supprimé ce cas (`v2/extensions/typographie/index.js:48`). Proposer d'aplatir `enLigne` en `c.text ?? ''`, sauf si un contenu imbriqué par défaut de BlockNote le justifie — auquel cas c'est la typographie qui est incomplète.
3. **[important]** Grille 7 (tests) — `v2/extensions/typographie/index.js:48` : le comportement de `typographierFragment` change (un nœud en ligne ne compte plus comme un objet pour le signe qui le suit), mais le seul test qui couvrait cette fonction (le test « collage » supprimé de `v2/tests/unitaires/blocknote-serveur.test.js`) a été retiré avec les notes au lieu d'être adapté sans note. Proposer un test de collage typographié (guillemet ouvrant/fermant) qui ne dépend plus de la note, pour garder la fonction couverte.

## Points de grille sans remarque
1, 2, 3, 5, 6, 8, 9, 10

## Citations vérifiées par le script

- 1 : **citation invalide** (docs/v2-renoncements.md:5)
- 2 : citations valides
- 3 : citations valides

## Réponse de Claude

1. **Hors sujet.** Le registre des renoncements liste ce qu'on abandonne ; les notes sont reportées (« reprendre ce dev à une étape ultérieure »), pas abandonnées. Le report est noté dans le journal (§ 34), les plans des étapes 4 et 5, l'ADR 0008 et l'archive `docs/v2-archives/notes-2026-11-08/`. La citation de l'auditeur (`docs/v2-renoncements.md:5`) est d'ailleurs invalide.
2. **Faux.** Le lien de BlockNote est un contenu en ligne par défaut qui porte un tableau `content` (`{ type: 'link', href, content: [texte stylé] }`, vérifié par un aller-retour `ecrireBlocs` / `lireBlocs`) : le parcours imbriqué de `enLigne` reste nécessaire. Le test « texte brut » perdait ce cas avec le retrait de la note : il le couvre maintenant par un lien (« liens et cellules de tableau compris »).
3. **Juste en partie.** Le test unitaire de `typographierFragment` est parti avec la note, mais la fonction reste couverte par les tests de collage sur la pile (`contrats/pile/editeur.test.js`, collage en texte brut et en HTML, avec guillemets et adresse protégée). Le « changement de comportement » n'est pas observable : sans note, le schéma n'a plus de nœud en ligne non feuille (le lien est une marque pour ProseMirror). Pas de test ajouté.

## Arbitrage de Sylvain

(À compléter.)
