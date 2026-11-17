# Audit partiel avant fusion (2026-11-17)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 271320 signes envoyés, 1119 reçus (et 1275 de réflexion) ; réflexion `low` ; 6 s ; arrêt : stop
- Diff audité : `v2/` de `5861827` à `258f1f4` (3 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Diff minuscule et propre : un nouveau réglage `arbre.lien.py` (interligne des titres de l'arbre du volet « Documents »), décidé par Sylvain le 17/11/2026, appliqué aux trois variantes de `NavLink` dans `VoletDocuments.jsx`, avec la table de l'ADR 0008 et `reglages.js` mises à jour en cohérence. La valeur (4 px) vit bien dans `reglages.js`, seule exception autorisée, et la décision est notée dans l'ADR. Rien à signaler sur les couches, l'API publique, la sécurité ou les traductions.

## Constats
Aucun constat grave, important ou mineur. Une seule question :

1. **[question]** Grille 7 (tests) — `v2/design/reglages.js:179`, `v2/adr/0008-design.md:56`. Le contrat statique `contrats/statiques/design-decide.test.js` vérifie que chaque réglage de `reglages.js` a sa décision dans la table de l'ADR 0008 ; le diff ne montre pas ce fichier. Si ce contrat énumère les clés (liste ou snapshot), il doit avoir été mis à jour en même temps — à vérifier que `arbre.lien` y est couvert, sinon le test échoue ou, pire, ne couvre plus la nouvelle clé.

## Points de grille sans remarque
1, 2, 3, 4, 5, 6, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides

## Réponse de Claude

1. Faux : le contrat parcourt les feuilles de `REGLAGES` (`chemins(REGLAGES)`) et l'ADR, sans liste à tenir ; `arbre.lien.py` y est couvert (le test passe, 472 réussis).

## Arbitrage de Sylvain

Fusion demandée par Sylvain le 17/11/2026.
