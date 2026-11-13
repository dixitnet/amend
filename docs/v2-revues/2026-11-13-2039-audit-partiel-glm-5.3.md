# Audit partiel avant fusion (2026-11-13)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 201210 signes envoyés, 2589 reçus (et 4451 de réflexion) ; réflexion `low` ; 10 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `aee53a2` (5 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff ajoute un délai de 10 s au-delà duquel une connexion qui n'aboutit pas est annoncée « hors ligne », avec le réglage correspondant dans `design/reglages.js` et l'ADR 0008, plus un test de pile au format S. L'ensemble est petit et cohérent avec les décisions de Sylvain du 13/11/2026. Les constats portent surtout sur un import probablement manquant, la place d'un réglage purement technique dans la couche design, et la couverture partielle du comportement (autres formats, rétablissement).

## Constats
1. **[question]** Grille 6 (correction) — `v2/application/client/aidesEdition.jsx:46`. Le nouveau code `useEtatAffiche` lit `REGLAGES.synchro.delaiHorsLigne`, mais le diff n'ajoute aucun import de `REGLAGES` dans `aidesEdition.jsx` (aucune ligne d'import modifiée). Si le fichier ne l'importait pas déjà, ceci casse à l'exécution ; s'il l'importait déjà, rien à faire. À vérifier dans le fichier final.
2. **[mineur]** Grille 1 (couches) — `v2/design/reglages.js:143`. `synchro.delaiHorsLigne` est un délai technique de synchronisation, pas une valeur d'apparence ; le placer dans la couche design (6) fait dépendre la logique de connexion (couche 5, `aidesEdition.jsx:46`) d'un réglage de design. Le précédent `css.editeur.palettes` (ADR 0008) était déjà décrit comme « réglage technique », et la table ADR le documente, donc ce n'est pas un défaut au sens des règles — mais la dérive mérite d'être signalée : proposer à Sylvain un emplacement technique pour les réglages non graphiques, ou de le noter dans l'ADR.
3. **[mineur]** Grille 7 (tests) — `v2/contrats/pile/telephone.test.js:209`. Le test ne couvre que le format S (picto), alors que le réglage vise aussi « l'alerte des autres formats » (ADR 0008, ligne 80) ; et il ne vérifie pas que l'état reste « Synchronisation… » avant 10 s (le nom annonce « au-delà de 10 secondes »). Proposer un test du non-annonce avant le délai, et un test de l'alerte hors bandeau pour un format M/L.
4. **[question]** Grille 6 — `v2/application/client/aidesEdition.jsx:49`. Si l'état du fournisseur repasse par `'connexion'` après une déconnexion (reconnexion longue), `trop` se réinitialise et le délai recommence : c'est probablement voulu, mais le cas « serveur muet, réseau présent, puis serveur revient » n'est pas testé (le test 209 ne coupe pas la route WebSocket). À confirmer que le retour à « Synchronisé » après `Hors ligne` fonctionne dans ce scénario.

## Points de grille sans remarque
2 (API publique), 3 (redondance amont), 4 (simplicité), 5 (sécurité et droits), 8 (exports), 9 (traductions), 10 (licences).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides

## Réponse de Claude

1. *Faux* : `aidesEdition.jsx` importe déjà `REGLAGES` (il le sert au zoom) ; lint et tests passent.
2. *Noté* : même statut que les paliers de zoom (réglage décidé par Sylvain, ligne de l'ADR 0008) ; un emplacement pour les réglages techniques sera à arbitrer avec l'audit complet.
3. *Juste* : le test vérifie maintenant qu'avant le délai l'état n'est pas « Hors ligne ». L'alerte des formats L et M suit la même valeur `connexion` ; sans test de pile dédié, noté.
4. *Juste* : en revoyant ce cas j'ai trouvé un défaut voisin (le fournisseur alterne « en connexion » et « déconnecté » à chaque essai, ce qui aurait fait clignoter le picto) : « trop long » reste vrai jusqu'à la vraie connexion. Test de pile : serveur muet, « Hors ligne » après le délai, puis retour à « Synchronisé » quand il revient.

## Arbitrage de Sylvain

(À compléter.)
