# Audit partiel avant fusion (2026-11-11)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 283252 signes envoyés, 4407 reçus (et 13406 de réflexion) ; réflexion `low` ; 24 s ; arrêt : stop
- Diff audité : `v2/` de `a1dda94` à `fc46656` (27 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le lot introduit les trois modes d'édition (Modifier, Suggérer, Relire) fidèlement à l'exemple de BlockNote, avec une couverture de tests et de scénarios de campagne très fournie. Le principal défaut fonctionnel trouvé est l'invitation « Relire les suggestions » montrée à un correcteur, dont le bouton ne peut rien faire. Quelques points relèvent de l'API publique des fondations (`attributed`, `resolvedPositionToRelativePosition`, `activityParams`) et méritent confirmation ou un contrat. Rien de bloquant sur les couches, les licences ou les traductions.

## Constats

**A1 — [important] Grille 6 (cas limite, logique)** — `v2/application/client/App.jsx:1305` (et `App.jsx:1089`, `App.jsx:1189`)
Hors relecture, l'invitation « Des suggestions attendent : passez en relecture… » avec son bouton `setModeEditeur('relire')` est montrée dès que `suggestions.enAttente` est vrai — donc aussi à un **correcteur**, dont le mode est forcé à `suggerer` (`mode = caps.includes('ecrire') ? modeEditeur : …`). Le bouton change l'état `modeEditeur` sans effet : le correcteur ne passera jamais en relecture, et le volet droit s'ouvre d'office chez lui (`App.jsx:1189`) pour montrer un bouton inerte. Proposition : ne montrer l'invitation (et l'ouverture d'office du volet) qu'à qui a la capacité `ecrire`, ou poser la question du comportement voulu pour un correcteur (peut-être ne voit-il que le nombre).

**A2 — [question] Grille 2 (API publique)** — `v2/adaptateurs/blocknote/index.jsx:220`
`enAttente: !afficheur.attributed.isEmpty()` lit la propriété `attributed` du `DiffRenderer` de Yjs. Est-elle documentée comme API publique (elle n'était pas utilisée avant) ? Si c'est un membre interne, cela contrevient à la règle 2 et cassera à la montée de version. À vérifier et, si publique, à couvrir par un contrat.

**A3 — [question] Grille 2 (API publique)** — `v2/adaptateurs/blocknote/suggestions.js:14` et `v2/adaptateurs/blocknote/historique.js:28`
De même : `resolvedPositionToRelativePosition` importé de `@y/prosemirror` (utilisé à `suggestions.js:66`) et l'option `activityParams: { groupMaxGap }` de `createYHubVersionStorage`. Sont-elles des exports publics documentés ? Si oui, un contrat devrait les épingler (c'est exactement ce qu'un contrat doit protéger) ; sinon, contrevient à la règle 2.

**A4 — [mineur] Grille 6 (logique)** — `v2/adaptateurs/blocknote/suggestions.js:53-54`
Le commentaire (ligne 31 : « le délai laisse passer la mise en cache des réponses de y/hub (1 s) ») justifie `delai`, mais l'appel initial passe de `delai` à `0` : la première demande part avant que le cache de y/hub soit prêt, ce qui augmente le risque de réponse vide (un seul nouvel essai est prévu, à `delai * 4`). Si c'est voulu (afficher les auteurs plus vite), le commentaire devrait le dire ; sinon revenir à `delai`.

**A5 — [mineur] Grille 9 (traductions)** — `v2/contrats/pile/outils.mjs:129` et `v2/contrats/pile/outils.mjs:144`
Les utilitaires de test ciblent le sélecteur par son libellé français en dur (« Mode d'édition »). Les tests de pile tournent en français, mais le test en pseudo-langue (`contrats/pile/affichage.test.js:164`) ne passe pas par `choisirMode` — si un jour il y passe, il cassera. Acceptable aujourd'hui ; à garder en tête. Par ailleurs `suggestions.relire` (`fr.json:97`) duplique exactement `document.passerRelire` (`fr.json:41`) : deux clés pour la même phrase, à fusionner si la maquette ne les distingue pas.

**A6 — [mineur] Grille 6 (copié-collé)** — `v2/exploitation/campagne/scenarios-complements.mjs:397-398`
Dans H17, `r.setStart(b[1].firstChild, 0)` apparaît deux fois de suite ; la seconde ligne est vraisemblablement un reste de copié-collé (sans effet, mais elle masque l'intention de la sélection). À nettoyer.

**A7 — [question] Grille 6 (condition de course)** — `v2/adaptateurs/blocknote/index.jsx:132`
L'afficheur est créé une seule fois avec `suggestionMode = (mode === 'suggerer')` au moment de la création, puis les changements de mode passent uniquement par l'extension (`enableSuggestions`/`viewSuggestions`/`disableSuggestions`, ligne 195-197). Les tests (B1, B2, C…) montrent que la bascule Modifier → Suggérer fonctionne, donc l'extension pilote bien le rendu ; je le note seulement pour confirmation que `renderer.suggestionMode` n'a pas besoin d'être mis à jour au changement de mode.

## Points de grille sans remarque
1, 3, 4, 5, 7, 8, 10

## Citations vérifiées par le script

- A1 : citations valides
- A2 : citations valides
- A3 : citations valides
- A4 : citations valides
- A5 : citations valides
- A6 : citations valides
- A7 : citations valides

## Réponse de Claude

- **A1 — faux.** Le correcteur ne reçoit jamais la liste : `surSuggestions` n'est passé qu'avec la capacité `arbitrer` (`App.jsx`, `surSuggestions={caps.includes('arbitrer') ? setSuggestions : undefined}`) ; sans elle, `suggestions` reste `null`, le volet affiche le texte du correcteur et ne s'ouvre pas d'office. Pas d'invitation chez lui (vérifié : scénario E1, colonne Carla).
- **A2 — juste, corrigé par un contrat.** `attributed` est une propriété documentée du `DiffRenderer` de Yjs (classe exportée ; « See AbstractRenderer#attributed »), donc publique, mais nouvelle pour nous : `contrats/statiques/fondations-suivi.test.js` l'épingle (`attributed.isEmpty()`, `suggestionMode`).
- **A3 — juste, corrigé par le même contrat.** `resolvedPositionToRelativePosition` est dans la surface déclarée de `@y/prosemirror` (son `index.js` l'exporte explicitement, « app code maps positions via the view ») ; `activityParams` est une option déclarée de `YHubVersionStorageOptions` (types publiés de BlockNote). Le contrat vérifie les deux, et les méthodes de l'extension des suggestions que nous utilisons.
- **A4 — juste en partie, commentaire corrigé.** La première demande part exprès tout de suite (les noms au plus tôt) ; le délai d'1,5 s ne vaut qu'après un changement, pour ne pas lire une réponse mise en cache d'avant le changement. Le commentaire le dit maintenant.
- **A5 — juste, corrigé.** `suggestions.relire` doublait `document.passerRelire` : clé retirée, le panneau utilise `document.passerRelire`. Le libellé français dans les outils de test : accepté (les tests de la pile sont en français).
- **A6 — juste, corrigé** (ligne en double dans H17).
- **A7 — faux.** `enableSuggestions` et `viewSuggestions` posent eux-mêmes `renderer.suggestionMode` (BlockNote, `packages/core/src/y/extensions/Suggestions.ts`) ; `disableSuggestions` détache l'afficheur. La valeur du départ n'est donc lue qu'avant le premier changement de mode.

## Arbitrage de Sylvain

(À compléter.)
