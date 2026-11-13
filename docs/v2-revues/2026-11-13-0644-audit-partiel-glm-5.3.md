# Audit partiel avant fusion (2026-11-13)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 251178 signes envoyés, 3798 reçus (et 7343 de réflexion) ; réflexion `low` ; 14 s ; arrêt : stop
- Diff audité : `v2/` de `27252c6` à `1907821` (19 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le lot remplace le mode « Relire » par un mode « Éditer » voyant les corrections, adossé à un correctif temporaire de y-prosemirror#245 écrit dans l'adaptateur. Les tests de pile et unitaires suivent bien le changement, les catalogues sont mis à jour dans les deux langues. Les constats portent surtout sur l'usage d'API internes de Yjs par le correctif, une incohérence de vocabulaire restée dans `margo.erreur`, et un état `sansCorrections` que la personne ne peut plus quitter.

## Constats
1. **[question]** Grille 2 (API publique) — `v2/adaptateurs/blocknote/correctif-245.js:82`, `v2/adaptateurs/blocknote/correctif-245.js:83`, `v2/adaptateurs/blocknote/correctif-245.js:100`, `v2/adaptateurs/blocknote/correctif-245.js:104`. Le correctif lit et écrit `afficheur.suggestionOrigins`, appelle `Y.iterateStructsByIdSet` et `tr.insertSet.hasId` : rien ne montre dans le diff que ce sont des API publiques documentées de Yjs 14 (règle 2 : seulement l'API publique). Vérifier dans la documentation de Yjs ; si ces membres sont internes, proposer à Sylvain une révision écrite de la règle (comme les exceptions déjà accordées) ou un signalement amont.
2. **[important]** Grille 2 (API publique) — `v2/tests/unitaires/correctif-245.test.js:53`, `v2/tests/unitaires/correctif-245.test.js:68`, `v2/tests/unitaires/correctif-245.test.js:88`. Les tests lisent `texte.store.pendingStructs`, un membre interne du magasin de Yjs (`store`, `pendingStructs` ne sont pas de l'API publique documentée). Un test de contrat qui casse à la prochaine version pour cette raison dira « notre test utilise des entrailles », pas « ce dont nous dépendons a changé ». Proposer une assertion sur le comportement observable (le texte rendu) plutôt que sur `pendingStructs`.
3. **[important]** Grille 9 (traductions) — `v2/i18n/fr.json:506`, `v2/i18n/en.json:506`. `margo.erreur` dit encore « Ce qui est posé reste dans **Modifications** » alors que l'onglet s'appelle désormais « Corrections » (`volet.modifications`, fr.json:343) et que `margo.accueil` (fr.json:482) a été mis à jour. Mettre les deux catalogues en cohérence.
4. **[mineur]** Grille 6 (correction) — `v2/application/client/Edition.jsx:66` à `69`. Une fois `sansCorrections` à `true` (repli après panne), la personne qui rechoisit « Éditer » dans le sélecteur reste en `ecrireSeul` sans le savoir : le bouton radio affiche « Éditer » (valeur `modeEditeur`) alors que le mode réel est `ecrireSeul`, et il n'y a plus de moyen de retenter l'affichage des corrections sans recharger. Prévoir soit une sortie du repli (choix explicite), soit un libellé distinct.
5. **[mineur]** Grille 4 (simplicité) — `v2/adaptateurs/blocknote/correctif-245.js:53`. `typeof op.insert === 'string' ? op.insert.length : op.insert.length` : les deux branches sont identiques ; la condition est du code mort. Écrire `op.insert.length` seul (avec un mot s'il y avait une intention perdue).
6. **[mineur]** Grille 6 (correction) — `v2/adaptateurs/blocknote/index.jsx:442`. `replacerCurseur.current = …` est assigné dans le corps du rendu, à chaque rendu ; c'est un effet de bord hors de `useEffect`/`useRef` d'initialisation. Fonctionne ici, mais fragile si le composant est un jour mémorisé. Le mettre dans un `useEffect` sans dépendances.
7. **[question]** Grille 3 / règles § 4.5 (correctif temporaire) — `v2/adaptateurs/blocknote/correctif-245.js:1`. Les quatre conditions du § 4.5 semblent réunies (défaut bloquant, ticket #245 cité, test échouant sans correctif), mais la **date de réexamen** n'apparaît ni dans l'en-tête du fichier ni dans le diff (elle devrait aussi figurer dans `docs/v2-veille.md`, hors diff). La confirmer/compléter.

## Points de grille sans remarque
1 (couches), 5 (sécurité et droits), 7 (tests, hors constat 2), 8 (exports), 10 (licences).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides

## Réponse de Claude

1. **Faux** pour l'essentiel : `iterateStructsByIdSet`, les positions relatives, `IdSet` (et sa méthode `hasId`), `createDeleteSetFromStructStore`, `intersectSets`, `diffIdSet` et `createIdSetFromIdMap` sont des exports du paquet `@y/y` ; `suggestionOrigins` est un champ documenté de l'afficheur (`Renderer.js` : « Optionally limit origins that may sync changes to the main doc »). L'en-tête du correctif le dit. Reste vrai que le correctif lit aussi `afficheur.inserts` et `afficheur.attributed` (champs documentés de l'afficheur, déjà lus avant ce lot) : noté dans la veille, à vérifier à chaque montée.
2. **Juste**, corrigé : les tests ne lisent plus `store.pendingStructs`. Ils vérifient ce qui se voit : sans le correctif, la frappe n'atteint pas le texte ; avec lui, chaque mot tapé est dans le texte, et une seule fois après acceptation de la correction.
3. **Juste**, corrigé : `margo.erreur` dit « Corrections » (fr et en).
4. **Juste**, corrigé : choisir un mode dans le sélecteur ou le menu sort du repli et retente l'affichage des corrections (`choisirMode`).
5. **Juste**, corrigé.
6. **Juste**, corrigé : l'affectation est dans un `useEffect`.
7. **Juste**, complété : ce n'est pas un correctif d'une fondation au sens du § 4.5 (pas de `patch-package`, rien n'est modifié dans Yjs), mais un contournement dans notre adaptateur ; il a tout de même sa date de réexamen (à chaque montée de `@y/y` ou de `@y/prosemirror`, au plus tard le 13/12/2026), dans l'en-tête du fichier et dans la veille.

Trouvé en répondant à l'audit, et corrigé : une frappe replacée laisse, du côté des suggestions, une trace ajoutée puis supprimée, que l'afficheur comptait comme une correction en attente (le volet annonçait alors des corrections invisibles). Le décompte ignore maintenant ces traces mortes (`resteDesCorrections`, deux tests). Pile complète passée deux fois de suite (74 tests), 392 tests unitaires.

## Arbitrage de Sylvain

(À compléter.)
