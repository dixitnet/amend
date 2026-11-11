# Audit partiel avant fusion (2026-11-11)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 152870 signes envoyés, 3583 reçus (et 11083 de réflexion) ; réflexion `low` ; 21 s ; arrêt : stop
- Diff audité : `v2/` de `3584e58` à `06d7c0b` (24 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff corrige plusieurs défauts réels (corps multi-octets, plafond de flux, masquage du jeton, redemande des noms) avec des tests qui suivent bien. L'ensemble respecte les couches et n'introduit ni dépendance ni texte en dur destiné aux utilisateurs. Restent quelques points de correction mineurs (code d'erreur incohérent, troncature en points de code, fragilité d'un test) et deux questions sur des contrats implicites (comportement de `modifierAcces`, rejet d'un modèle sans folio).

## Constats
1. **[mineur]** (6. Correction) `v2/application/client/App.jsx:163` — Quand `/api/moi` répond 200 mais sans `personne.id`, le code d'erreur construit est `http-200`, qui n'est pas un code d'erreur exploitable côté interface. Proposer un code dédié (par ex. `session-invalide`) dans le catalogue d'erreurs.
2. **[mineur]** (6. Correction) `v2/domaine/corbeille.js:36` — La borne finale `court.slice(0, LONGUEUR_MAX_TITRE)` coupe en points de code : un emoji composé (avec liant ZWJ, que `INVISIBLES` exclut volontairement) coupé au milieu laisserait un liant orphelin dans le titre, non intercepté par `titreDocument`. Proposer une coupe qui évite de laisser un ZWJ en fin de chaîne, ou l'assumer dans un commentaire.
3. **[mineur]** (7. Tests) `v2/tests/services/serveur.test.js:606` — Le test du refus de démarrage de la collaboration dépend de l'ordre de la liste de variables (`V2_POSTGRES` en premier) : si l'ordre change dans `v2/application/collab/index.js:10`, le test casse sans que le comportement change. Proposer d'affirmer seulement `/réglage absent/` sans nommer la variable, ou de tester chaque variable.
4. **[mineur]** (4. Simplicité) `v2/application/client/nomsAuteurs.js:2` — Le fichier s'annonce « fonction pure », mais `nomsAdemander` mute la `Map essais` passée en argument (`v2/application/client/nomsAuteurs.js:23`). Ce n'est pas un défaut de fonctionnement, mais la doc JSDoc contredit le commentaire d'en-tête. Corriger le commentaire (« fonction déterminante à effet sur `essais` »).
5. **[question]** (6. Correction) `v2/application/serveur/comptes.js:456` — Le nouveau garde-fou repose sur le contrat non visible ici : `modifierAcces(d.id, p.id, null)` renverrait `'dernier-proprietaire'`. Ce contrat du dépôt PostgreSQL n'apparaît ni dans le diff ni dans un test du lot. Par ailleurs, pour un document `confie`, le transfert de propriété a déjà eu lieu quand le 409 survient : l'état est partiellement modifié malgré le commentaire « plutôt que de continuer à moitié ». Confirmer le contrat de retour du dépôt et qu'un 409 en cours de suppression laisse un état acceptable.
6. **[question]** (6. Correction) `v2/domaine/miseEnPage.js:55` — `mesures.every(Number.isFinite)` rejette un modèle sans `folio` (`folio?.bas` → NaN → `modele-impossible`). Si un modèle sans folio est légitime (les réglages de l'ADR 0011 ne rendent pas le folio obligatoire a priori), c'est une régression. Vérifier que tous les modèles (amend.ink et écarts d'équipe) ont toujours un folio, sinon traiter `folio?.bas` comme optionnel.
7. **[mineur]** (6. Correction) `v2/application/client/App.jsx:1776` — `if (!trouves.length) return` : si la réponse mélange identifiants trouvés et introuvables, seuls les trouvés sont enregistrés — c'est voulu — mais si la requête échoue côté réseau (rejet de promesse non attrapé dans `nomsAvecMargo` ?), l'effet ne rebouclera qu'au prochain changement de `suggestions`. Vérifier que `nomsAvecMargo` n'importe jamais (sinon promesse non gérée).

## Points de grille sans remarque
1, 2, 3 (hors constat 4 sur la doc), 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides

## Réponse de Claude

Lot : audit complet du 11/11, préconisations 4, 5 et 7 (serveur et collaboration, client, domaine), développées par un modèle plus léger (Sonnet), relues et vérifiées par Claude. Contrôles sur les trois lots réunis : `lint` et `format:check` propres ; 311 tests rapides, 310 passés, 1 sauté ; 60 parcours de la pile, 59 passés, 1 sauté. Le test de l'accent coupé échoue avec l'ancien décodage et passe avec le nouveau (vérifié).

1. **Juste, très mineur, laissé.** Un 200 sans identifiant n'arrive que si un intermédiaire rend autre chose que notre réponse ; le message générique avec le code s'affiche. Un code dédié demande une clé de catalogue : à joindre au prochain lot qui touche `i18n/`, avec `trop-de-flux`.
2. **Juste en théorie, assumé.** La coupe finale n'intervient que si le gabarit de copie dépasse à lui seul 200 signes, ce qu'aucun catalogue ne fait.
3. **Juste, corrigé.** Le test n'exige plus le nom de la première variable.
4. **Juste, corrigé.** Commentaire d'en-tête accordé à ce que fait la fonction.
5. **Contrat vérifié** : `modifierAcces` rend `'dernier-proprietaire'` (`adaptateurs/postgres/comptes.js`, en transaction). **Le reste est juste et préexistant** : la suppression d'un compte traite les documents un par un, hors transaction ; un arrêt en route laisse des documents déjà confiés. Avant ce lot, elle continuait sans regarder ; elle s'arrête maintenant. La rendre atomique demande une méthode du dépôt : noté pour le lot des adaptateurs.
6. **Faux.** Avant ce lot, `grille()` lisait déjà `folio.bas` sans garde : un modèle sans folio levait une `TypeError`. Tous les modèles ont un folio (`design/livre.js`, écarts validés par `appliquerEcarts`).
7. **Faux.** `nomsDe` attrape l'échec et rend la liste sans noms (`client/commentaires.js`) ; la promesse ne rejette pas.

Résumé : rien de bloquant ; deux corrections de forme faites ; un point préexistant (suppression de compte non atomique) reporté au lot des adaptateurs.

## Arbitrage de Sylvain

(À compléter.)
