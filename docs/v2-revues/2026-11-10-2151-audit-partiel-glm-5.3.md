# Audit partiel avant fusion (2026-11-10)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 250431 signes envoyés, 5392 reçus (et 40513 de réflexion) ; réflexion `low` ; 50 s ; arrêt : stop
- Diff audité : `v2/` de `bd671c5` à `2f1581e` (32 fichiers)
- Statut : avis reçu ; réponse de Claude écrite (constats justes corrigés avant la demande de fusion) ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse

Le lot Margo (étape 8) est globalement bien placé dans les couches : l'adaptateur IA est isolé, le domaine reste pur, les consignes vivent dans des catalogues, les droits sont vérifiés côté serveur et y/hub, et la couverture de tests est sérieuse. Trois points demandent attention : des décalages calculés sur du texte normalisé puis appliqués au texte brut (cas NFD), un `historique` renvoyé par le navigateur sans limite en signes (contournement de la limite de demande), et quelques finitions (code mort, test tautologique, licence de la dépendance nouvelle).

## Constats

**A1** — **[important]**, grille 6 (correction, cas limite), `v2/domaine/margo.js:78-84`, `v2/domaine/margo.js:96-102`, `v2/adaptateurs/blocknote/serveur.js:184-197`, `v2/application/serveur/margo.js:396`
`situerCitation` et `situerRemplacement` cherchent le passage dans le texte **normalisé NFC** et rendent des positions dans ce texte-là ; mais `plage()` les applique à `bloc.texte` brut (serveur.js:186 : `bloc.texte.slice(debut, fin)`), et `commenter` fait `principal.texte.slice(ou.debut, ou.fin)` (margo.js:396). Si le document contient du NFD (coller depuis Word par exemple), la normalisation change la longueur et toutes les positions sont décalées : remplacements refusés (« structure ») ou posés au mauvais endroit. Le test unitaire NFD (`tests/unitaires/margo.test.js:63-67`) ne couvre que le domaine, pas ce chemin. Proposition : produire du texte NFC dès `blocsATexte` (une seule normalisation à la source), ou faire rendre au domaine des positions sur le texte brut qu'il reçoit.

**A2** — **[important]**, grille 5 (limites contournables), `v2/application/serveur/margo.js:130-133`, `v2/application/serveur/margo.js:271-286`
`DEMANDE_MAX_SIGNES` (4 000) ne borne que `demande` ; `historique`, entièrement contrôlé par le navigateur (40 messages de longueur arbitraire, la seule borne étant les 200 Ko du corps), part en entier dans le premier message au modèle, sans comptage en signes. La limite en signes prévue à l'étape 8 est donc contournable, avec un coût IA non maîtrisé. Proposition : limiter l'historique en signes côté serveur (et le compter dans le journal).

**A3** — **[mineur]**, grille 6 (fuite de ressource), `v2/application/serveur/margo.js:387-403`
Dans `commenter`, si `collaboration.ecrireTexte` échoue après `depot.creerFil`, le fil reste en base sans ancre dans le texte (le rollback `supprimerFil` n'existe que pour l'échec de l'ancre). Proposition : englober l'écriture et supprimer le fil en cas d'échec.

**A4** — **[mineur]**, grille 6 (cas limite), `v2/adaptateurs/ia/index.js:177-181`
Côté Scaleway, `await r.json()` (ligne 181) est hors du `try` : une réponse 200 au corps non JSON lève une erreur brute, sans code `ia-indisponible`, et l'historique `messages` garde l'ajout du tour échoué. Proposition : inclure la lecture du corps dans la gestion d'erreur.

**A5** — **[mineur]**, grille 4 (code mort), `v2/application/serveur/margo.js:204-206`
`arret = tour.arret === 'outils' ? 'fin' : tour.arret` : la branche `'outils'` est inatteignable — si `tour.arret === 'outils'` et `!derniereEtape`, la condition de la ligne 204 ne casse pas. Simplifier en `arret = tour.arret`.

**A6** — **[mineur]**, grille 9 (traductions), `v2/i18n/fr.json:77`, `v2/i18n/en.json:77`
« 4 000 signes au plus » est écrit en dur dans le catalogue alors que la limite vit dans `DEMANDE_MAX_SIGNES` (margo.js:37) : elles divergeront. Par ailleurs l'anglais dit « 4,000 characters » sans « including spaces », contrairement à la règle 27. Proposition : paramètre ICU alimenté par la constante, et « characters (including spaces) ».

**A7** — **[mineur]**, grille 10 (licences), `v2/package.json:11`
Dépendance nouvelle `@anthropic-ai/sdk` épinglée, mais aucune note de licence dans le diff ; l'ADR 0006 exige que chaque dépendance nouvelle ait une licence compatible vérifiée en revue. Confirmer MIT et le noter (veille ou ADR).

**A8** — **[question]**, grille 2 (API publique), `v2/adaptateurs/blocknote/serveur.js:203`
`new Y.Doc({ isSuggestionDoc: true })` : cette option est-elle une API publique documentée de Yjs 14 (et non un détail interne du mode suggestion) ? À vérifier dans le contrat de la fondation.

**A9** — **[question]**, grille 6, `v2/adaptateurs/blocknote/index.jsx:35-40`
Le commentaire de `selectionEnBlocs` promet « `null` sans sélection étendue », mais le code ne rend `null` que si `getSelection()?.blocks` est vide. Si BlockNote rend le bloc du curseur dans cette sélection (comportement que je ne peux pas vérifier ici), le bouton « Corriger » et la portée « Sur la sélection » s'activeraient au simple curseur. À vérifier par un test sur éditeur réel.

**A10** — **[mineur]**, grille 7 (test qui ne vérifie pas ce qu'il annonce), `v2/contrats/pile/margo.test.js:84-90`
`assert.match(await ligne.first().innerText(), /Margo \(IA\)/)` : le locator `ligne` est déjà filtré par cette même regex, l'assertion est tautologique. Vérifier plutôt le contenu de la ligne (l'auteur et le texte de la suggestion).

**A11** — **[question]**, grille 6, `v2/application/serveur/margo.js:129`
`lireCorps(req, 200_000)` est hors `try`, à la différence des autres erreurs de la route : un corps trop grand lève-t-il une réponse JSON d'erreur (comme ailleurs) ou une erreur non gérée ? À vérifier selon la gestion du serveur.

## Points de grille sans remarque

1, 3, 8

## Citations vérifiées par le script

- A1 : **citation invalide** (margo.js:396)
- A2 : citations valides
- A3 : citations valides
- A4 : citations valides
- A5 : citations valides
- A6 : **citation invalide** (margo.js:37)
- A7 : citations valides
- A8 : citations valides
- A9 : citations valides
- A10 : citations valides
- A11 : citations valides

## Réponse de Claude

- **A1, juste, corrigé.** Le domaine cherche maintenant le passage dans le texte tel qu'il est reçu, sous ses formes NFC et NFD, et rend des positions valables pour ce texte (`situerCitation`, `domaine/margo.js`) ; le nouveau texte reste en NFC. Test : un texte collé en NFD, cité en NFC, est corrigé à la bonne place (`tests/unitaires/margo.test.js`).
- **A2, juste, corrigé.** Les échanges précédents renvoyés par le navigateur sont bornés à 20 000 signes, les plus récents d'abord (`MARGO_HISTORIQUE_MAX_SIGNES`, borne technique comme celle de la demande, pas un tarif) ; le journal compte désormais les signes du premier message (`signesDemande`). Test : `tests/services/margo.test.js`.
- **A3, juste, corrigé.** Si l'écriture de l'ancre échoue, le fil est supprimé.
- **A4, juste, corrigé.** Une réponse 200 illisible vaut `ia-indisponible`, et le tour ne reste pas dans l'historique. Test : `tests/unitaires/ia.test.js`.
- **A5, juste, corrigé** (`arret = tour.arret`).
- **A6, juste, corrigé.** La borne vient de la constante du domaine (`MARGO_DEMANDE_MAX_SIGNES`, paramètre ICU `{max, number}`), et le message dit « espaces compris » en français et « including spaces » en anglais.
- **A7, juste en partie.** La licence (MIT) est vérifiée à chaque `npm test` par le contrat `contrats/statiques/licences.test.js`, qui échoue sur toute licence non examinée ; rien à ajouter dans l'ADR.
- **A8, faux.** `isSuggestionDoc` est déjà l'option qu'utilise l'adaptateur Yjs du navigateur pour le document des suggestions (`adaptateurs/yjs/index.js`), comme le montage de BlockNote ; le serveur reconstruit le même document.
- **A9, faux.** Vérifié dans BlockNote 0.57 : `getSelection()` rend `undefined` quand la sélection est vide (`if (e.selection.empty …) return`) ; le bouton « Corriger » ne paraît donc qu'avec une sélection étendue, et la pile le vérifie (la palette ne s'ouvre qu'avec une sélection).
- **A10, juste, corrigé.** Le test de pile vérifie la ligne entière : « Margo (IA) ajoute « s » ».
- **A11, faux.** `lireCorps` lève `requete-trop-grosse`, que le gestionnaire commun du serveur traduit en 413 JSON (`application/serveur/index.js`), comme pour les autres routes.

## Arbitrage de Sylvain

(À compléter.)
