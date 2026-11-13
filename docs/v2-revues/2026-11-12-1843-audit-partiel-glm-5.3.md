# Audit partiel avant fusion (2026-11-12)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 288965 signes envoyés, 3311 reçus (et 37444 de réflexion) ; réflexion `low` ; 51 s ; arrêt : stop
- Diff audité : `v2/` de `4fdc67f` à `5459c72` (26 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse

Le lot remplace les modes (Éditer / Corriger / Lire), ajoute le garde-fou d'Éditer contre y-prosemirror#245, et le passage Lire → écriture par appui au format S. L'architecture est respectée (extension isolée, imports permis, réglages documentés dans l'ADR 0008, catalogues fr/en à jour), et la couverture de tests est sérieuse. Le point faible principal est un défaut de coordonnées dans le garde-fou : les plages d'une étape sont lues en positions « après » et comparées à un document « avant », ce qui laisse passer certaines modifications qui mordent une suggestion.

## Constats

1. **[important]**, grille 6 (correction), `v2/extensions/garde-suggestions/index.js:95`, `v2/extensions/garde-suggestions/index.js:68`, `v2/extensions/garde-suggestions/index.js:104` — `plagesDe` tire ses plages de `etape.getMap().forEach`, qui rend des positions dans le document **après** l'étape, mais `changeUneSuggestion` les compare à `tr.docs[i]`, le document **avant** l'étape. Une suppression qui commence avant la zone protégée et s'étend dedans (ex. : sélection de la fin du mot précédent jusqu'au milieu de la suggestion, Retour arrière) est cartographiée au point de départ de la suppression, hors de la zone dans les anciennes coordonnées : le garde-fou la laisse passer, produisant exactement le mélange qu'il doit empêcher. Le test `v2/tests/unitaires/garde-suggestions.test.js:73` ne couvre que des suppressions démarrant dans la zone. Proposition : utiliser `etape.from`/`etape.to` (positions anciennes, comme déjà fait pour les marques ligne 92) pour toutes les étapes qui les ont, et ajouter un test de suppression venant de l'extérieur de la zone.
2. **[question]**, grille 6, `v2/adaptateurs/blocknote/index.jsx:355`, `v2/application/client/Edition.jsx:514` — l'afficheur est créé une seule fois avec le drapeau `mode === 'corriger'` du mode initial ; au format S, un correcteur s'ouvre en « lire », donc l'afficheur est créé comme simple spectateur, puis le passage en Corriger repose sur `enableSuggestions()` (ligne 439) sans recréation. Le test `v2/contrats/pile/telephone.test.js:55` couvre ce parcours : confirmer qu'il est bien vert (c'est-à-dire que l'attribution des frappes fonctionne sur un afficheur créé spectateur) ; sinon, recréer l'afficheur quand le drapeau change.
3. **[mineur]**, grille 7 (tests), `v2/extensions/garde-suggestions/index.js:15` — l'en-tête affirme que l'annulation (annuler) passe le garde-fou, mais aucun test ne le vérifie (ni unitaire, ni pile) ; si une transaction d'annulation ne porte pas les métadonnées `y-sync`, elle serait refusée au contact d'une suggestion. Ajouter un cas dans `v2/tests/unitaires/garde-suggestions.test.js` avec la métadonnée réellement posée par le plugin d'annulation.
4. **[mineur]**, grille 4 (simplicité), `v2/exploitation/campagne/commun.mjs:20`, `v2/exploitation/dev/mesurer-relecture.mjs:227` — commentaires et noms restés à l'ancien vocabulaire (« en relecture qui veut écrire revient en Modifier » sur une fonction qui passe désormais de Lire à Éditer ; `relireEtAttendrePanneau` qui clique « Éditer »). Mettre les libellés au courant, sans toucher au comportement.

## Points de grille sans remarque

1 (couches), 2 (API publique), 3 (redondance), 5 (sécurité et droits), 8 (exports), 9 (traductions), 10 (licences).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides

## Réponse de Claude

1. **Faux.** `StepMap.forEach(f)` appelle `f(oldStart, oldEnd, newStart, newEnd)` (`prosemirror-transform`, `dist/index.js`, méthode `forEach`) : les deux premières valeurs, celles que lit `plagesDe`, sont bien les positions du document d'avant l'étape, celui de `tr.docs[i]`. Preuve ajoutée : `tests/unitaires/garde-suggestions.test.js`, une suppression qui part d'avant la zone et y entre est refusée, une suppression qui s'arrête avant la zone passe.
2. **Juste comme question, réglé par le test.** `contrats/pile/telephone.test.js` (« le correcteur s'ouvre en Lire ; un appui passe en Corriger… ») est vert : la frappe du correcteur arrive chez l'éditrice comme sa suggestion (« Carla ajoute « Ajout » »). `enableSuggestions()` règle lui-même `suggestionMode` de l'afficheur (`@blocknote/core`, `dist/y.js`) : la valeur de départ n'a pas d'importance.
3. **Juste, et l'en-tête était faux.** L'annulation de BlockNote est celle de ProseMirror (`prosemirror-history`, méta `history$`), pas celle de Yjs : c'est un changement direct comme un autre. Essai réel : Carla pose une suggestion juste après le texte de l'éditrice, l'éditrice fait Ctrl+Z : le garde-fou refuse, avec son message. C'est le comportement voulu (le changement mordrait la suggestion, y-prosemirror#245) ; l'en-tête de l'extension le dit désormais, et le test « garde-fou d'Éditer » (`contrats/pile/relecture.test.js`) le vérifie. Loin de toute suggestion, l'annulation marche (essai du même jour).
4. **Juste, corrigé.** Commentaires de `exploitation/campagne/commun.mjs` et nom `editerEtAttendrePanneau` dans `exploitation/dev/mesurer-relecture.mjs`.

## Arbitrage de Sylvain

(À compléter.)
