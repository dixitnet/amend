# amend.ink v2 : bilan des scénarios B (suivi des modifications par un éditeur), 10/11/2026

Procédure : `docs/v2-tests/procedure-relecture.md`. Script : `v2/exploitation/campagne/scenarios-suivi.mjs` (pile complète, quatre navigateurs : Paule propriétaire, Edith éditrice, Carla correctrice, Lucie lectrice ; Lucie ne voit que le texte principal, c'est par elle qu'on lit ce qui est vraiment dans le document). Chaque cas est joué trois fois, sur un document neuf.

Séries : Chromium en local (3 fois) ; Chromium, WebKit et Firefox dans GitHub (flux `v2-campagne`, exécution 42865129106, commit cfc479d, 3 fois chacun). Aucune correction faite.

## Résultats

| Cas | Chromium (local) | Chromium (CI) | WebKit (CI) | Firefox (CI) |
|---|---|---|---|---|
| B1 accepter une à une sa propre suggestion | 3/3 | 3/3 | 3/3 | FIREFOX |
| B1 refuser une à une sa propre suggestion | 3/3 | 3/3 | 3/3 | FIREFOX |
| B1 « Tout accepter » sa propre suggestion | 3/3 | 3/3 | 3/3 | FIREFOX |
| B10 une autre éditrice accepte une à une | 3/3 | 3/3 | 3/3 | FIREFOX |
| **B2 bascules rapides, une lettre entre chaque** | **0/3** | **0/3** | **0/3** | FIREFOX |
| **B2 bascules espacées d'une seconde** | **0/3** | **0/3** | **0/3** | FIREFOX |
| B2 activer puis arrêter sans rien taper, puis taper | 3/3 | 3/3 | 3/3 | FIREFOX |
| B2 témoin (jamais de suivi) | 3/3 | 3/3 | 3/3 | FIREFOX |
| B2 suggestion, arrêt, frappe ailleurs | 3/3 (anomalie, voir D4) | 3/3 (id.) | 3/3 (id.) | FIREFOX |
| **B2 suggestion, arrêt, frappe juste après** | **0/3** | **0/3** | **0/3** | FIREFOX |
| B3 supprimer un mot, accepter une à une | 3/3 | 3/3 | 3/3 | FIREFOX |
| B3 remplacer un mot | 3/3 | 3/3 | 3/3 | FIREFOX |
| B3 suppression à cheval sur deux paragraphes | 3/3 (panneau faux, D6) | 3/3 (id.) | 3/3 (id.) | FIREFOX |
| B4 insertions au début, au milieu, à la fin | 3/3 | 3/3 | 3/3 | FIREFOX |
| B4 couper (Entrée) puis fusionner | 3/3 (panneau faux, D6) | 3/3 (id.) | 3/3 (id.) | FIREFOX |
| B5 Annuler en suivi, puis après l'arrêt | 3/3 | 3/3 | 3/3 | FIREFOX |
| **B6 gras en suivi** | **0/3** | **0/3** | **0/3** | FIREFOX |
| B7 basculer pendant que Carla écrit | 3/3 | 3/3 | 3/3 | FIREFOX |
| **B7 basculer juste après la résolution d'un fil** | **0/3** | **0/3** | **2 plantages sur 3** | FIREFOX |
| B8 deux éditeurs au même paragraphe (suivi / direct) | 3/3 | 3/3 | 3/3 | FIREFOX |
| B9 recharger en suivi | 3/3 | 3/3 | 3/3 | FIREFOX |

Les résultats ne dépendent pas du navigateur (sauf la fréquence du plantage B7) : les défauts sont dans la logique commune, pas dans un moteur.

## Défauts

Gravité : **bloquant** (perte de travail ou écran inutilisable), **majeur** (le résultat n'est pas celui voulu et on ne peut pas le rattraper simplement), **gênant** (on s'en sort, mais c'est trompeur).

### D1. Arrêter le suivi ne rend pas la frappe directe tant qu'on ne quitte pas l'endroit (majeur)

- Reproduction : activer le suivi, taper « Proposé. », arrêter le suivi, taper aussitôt « Direct. » au même endroit.
- Constat : « Direct. » rejoint la suggestion (« Paule ajoute « Proposé. Direct. » ») ; le texte principal n'a rien. 3/3 partout.
- Variante (bascules répétées, une lettre entre chaque, que ce soit rapide ou espacé d'une seconde) : toutes les lettres, y compris celles tapées suivi arrêté, finissent dans une seule suggestion « abcde ».
- Ce qui marche : activer puis arrêter sans rien taper, puis taper (frappe directe) ; taper ailleurs après l'arrêt (frappe directe).
- Lecture probable : en mode suggestion, la frappe juste à côté d'une insertion suggérée prolonge cette insertion ; une fois le suivi arrêté, la frappe au contact d'une insertion suggérée en hérite encore. À confirmer : comportement de `@y/prosemirror` (fondation) ou de notre façon de basculer (adaptateur).
- Lien avec ce que voit Sylvain : on croit écrire en direct, on écrit une suggestion, qu'il faut ensuite accepter.

### D2. Écran blanc en activant le suivi juste après la résolution d'un fil (bloquant)

- Reproduction : un fil de commentaire est résolu ; dans les secondes qui suivent, un éditeur active le suivi.
- Constat : page blanche, erreur `[lib0/delta] diffing deletes unsupported`. Chromium 3/3 (local et CI), WebKit 2/3, et 4/5 dans le scénario à cinq. Un rechargement rétablit la page, rien n'est perdu.
- Niveau : fondation (`@y/prosemirror` / `lib0`), sur la modification de la marque de commentaire par BlockNote. Correctif de contournement prêt, non appliqué : `docs/v2-tests/correctif-suivi-en-attente.patch`.

### D3. La mise en forme en suivi n'est ni appliquée ni arbitrable (majeur)

- Reproduction : activer le suivi, mettre un mot en gras, arrêter.
- Constat : le gras s'affiche chez les éditeurs, mais n'est pas dans le texte principal (Lucie ne le voit pas) et le panneau n'en dit rien : on ne peut ni l'accepter ni le refuser. 3/3 partout.
- Niveau : les suggestions de mise en forme ne sont sans doute pas décrites par le panneau (notre code) ; à vérifier si la fondation les gère.

### D4. Une suggestion visible qu'aucun panneau ne liste (majeur, cause possible du « bouton qui ne fait rien »)

- Reproduction : activer le suivi, taper « Proposé. » à la fin du § 1, arrêter, taper ailleurs.
- Constat : « Proposé. » reste affiché chez Edith comme suggestion, mais le panneau de Paule et celui d'Edith sont vides : rien à accepter ni à refuser. 3/3 partout (le cas passe parce que la frappe ailleurs est bien directe, mais l'anomalie est constante).
- À creuser : la suggestion est-elle absorbée, perdue pour le panneau, ou rattachée à rien ?

### D5. Ses propres suggestions sont signées « Quelqu'un » (gênant)

- Constat : dans son propre panneau, Paule lit « Quelqu'un ajoute… » pour ses suggestions dans plusieurs cas (B1, B3, B4) ; ailleurs « Paule ajoute… ». Notre code (nom de l'auteur dans le panneau).

### D6. Le panneau décrit mal les suppressions à cheval et les coupures (gênant)

- Suppression de « ville. ⏎ Les » (à cheval) : le panneau annonce « ajoute « quais étaient déserts et le » » et « remplace « ille » par « ent soufflait » ». Le texte final après « Tout accepter » est juste.
- Couper un paragraphe puis en fusionner deux : le panneau annonce une suppression et un ajout de « et le vent soufflait. », et l'affichage pendant le suivi duplique le passage. Le texte final est juste.
- Niveau : notre description des suggestions par paragraphe (domaine / adaptateur), sur ce que rend la fondation.

### D7. Acceptation une à une de la suggestion d'un éditeur (signalé, non reproduit isolément)

- Signalé par Sylvain et vu dans le scénario à cinq. Dans les scénarios B, accepter une à une sa propre suggestion marche 3/3 dans les trois moteurs, de même pour une autre éditrice (B10).
- Hypothèse : ce sont les suggestions de D1 ou D4 (une suggestion prolongée par la frappe directe, ou affichée sans être listée) qui font « ne rien faire » au bouton. À confirmer avec Sylvain : que tapait-il juste avant ?

### D8. Insertion au milieu d'une phrase découpée en deux lignes (gênant, scénario à cinq)

- « Note de Carla. » inséré au milieu d'une phrase : le panneau montre « ajoute « Note de Ca » » et « ajoute « la.r » ». Non reproduit dans B4 (insertion au milieu : une seule ligne juste). À isoler dans les scénarios C.

## Ce que ce bilan ne couvre pas

Familles A, C, D, E, F, G de la procédure (pas encore écrites) ; formats M et S ; Safari réel ; frappe humaine (le robot tape vite et régulièrement).

## Proposition d'ordre de correction (à décider)

1. D2 (écran blanc) : contournement prêt.
2. D1 et D4 (frappe absorbée, suggestion invisible au panneau) : sans doute une même cause, à établir d'abord (comment Docs bascule-t-il ?).
3. D3 (mise en forme) : décider si on la suggère, ou si le suivi la laisse en direct.
4. D5 et D6 (panneau) : lot sur la description des suggestions.
