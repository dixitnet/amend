# Audit partiel avant fusion (2026-11-11)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 129413 signes envoyés, 3047 reçus (et 6944 de réflexion) ; réflexion `low` ; 20 s ; arrêt : stop
- Diff audité : `v2/` de `62f644b` à `82d9c59` (14 fichiers)
- Statut : avis reçu ; réponse de Claude écrite (constats justes corrigés avant la demande de fusion) ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot cohérent : le choix du modèle de Margo au back-office est bien contrôlé côté serveur (401/403/400/409), testé, traduit, et le domaine corrige un défaut réel constaté au banc. Les constats portent surtout sur une duplication de connaissance entre le client et le serveur (la liste des modèles), un champ d'API renvoyé mais jamais utilisé, et la fragilité du chargement parallèle des deux routes d'administration. Rien de bloquant.

## Constats
1. **[important]** Grille 3 (redondance) — `v2/application/client/App.jsx:417` : le client duplique la liste des modèles (`NOMS_MODELES`) déjà connue du serveur (`MODELES`, `v2/application/serveur/index.js:246`). Un modèle ajouté côté serveur s'affichera comme identifiant brut (`nomDuModele`, `App.jsx:423`) jusqu'à ce que le client soit mis à jour : deux endroits à maintenir pour une même liste. Proposer que le serveur renvoie avec chaque modèle une clé de libellé (ou le libellé déjà traduit via i18n côté serveur, les catalogues étant communs), et supprimer `NOMS_MODELES` du client.
2. **[mineur]** Grille 4 (simplicité, option « au cas où ») — `v2/application/serveur/index.js:248` : le champ `fournisseur` est renvoyé par `GET /api/admin/ia` mais n'est utilisé nulle part dans le client (`App.jsx:483-487` n'exploite que `id` et `disponible`). Le retirer de la réponse, ou l'employer dans le libellé (ce qui réglerait aussi le constat 1).
3. **[mineur]** Grille 6 (correction, cas limite) — `v2/application/client/App.jsx:434` : `Promise.all` fait tomber tout l'écran d'administration si une seule des deux routes échoue (par exemple `/api/admin/ia` en 503 alors que « Système » est sain). Un `Promise.allSettled` ou deux chargements indépendants rendrait la rubrique Système robuste à une panne de la rubrique IA.
4. **[question]** Grille 9 / accessibilité — `v2/application/client/App.jsx:449` et `v2/design/composants/PageAdministration.jsx:12` : le message d'erreur d'enregistrement du modèle transite par le même état `message` que le succès, rendu avec `role="status"` (vérifié par `v2/tests/design/composants.test.js:432`). Un lecteur d'écran n'interrompt pas sur un `status` comme il le ferait sur un `alert` ; est-ce voulu (le composant ne connaît que « un message ») ou faut-il distinguer succès et erreur ? À poser à Sylvain si le sujet remonte.
5. **[mineur]** Grille 7 (tests) — `v2/tests/services/serveur.test.js:459` : le test couvre bien 401/403/400/409/200 et la persistance du choix, mais pas le cas « réglage en base contenant un modèle retiré de `MODELES` après une montée de version » (`v2/application/serveur/index.js:244` le gère en silencieux). Un test de ce repli protégerait la montée de version mensuelle des fondations ; à ajouter au test existant.

## Points de grille sans remarque
1 (couches), 2 (API publique), 5 (sécurité et droits), 8 (exports), 10 (licences) — les traductions (grille 9) sont couvertes par les constats 1 et 4 ; les catalogues fr/en sont complets et cohérents avec `exceptions.json` (libellés identiques dans les deux langues).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

- **1, faux.** Le serveur rend des identifiants, l'interface choisit le texte dans la langue de la personne (règle 25) ; les noms des modèles sont des textes d'interface, dans les catalogues. Un modèle ajouté demande sa ligne de catalogue ; d'ici là, son identifiant s'affiche (repli voulu).
- **2, juste, corrigé** : `fournisseur` retiré de la réponse.
- **3, juste, corrigé** : deux chargements indépendants ; une panne de la rubrique IA s'affiche dans sa ligne, la rubrique Système reste visible.
- **4, question pour Sylvain** (déjà posée au précédent audit, point 7) : un seul message, en `role="status"`, pour le succès et l'erreur.
- **5, juste, corrigé** : test d'un réglage qui nomme un modèle retiré de l'adaptateur (il ne vaut plus rien, Margo prend le modèle par défaut).

## Arbitrage de Sylvain

(À compléter.)
