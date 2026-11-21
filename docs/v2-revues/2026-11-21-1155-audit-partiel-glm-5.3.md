# Audit partiel avant fusion (2026-11-21)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 384355 signes envoyés, 1735 reçus (et 1220 de réflexion) ; réflexion `low` ; 7 s ; arrêt : stop
- Diff audité : `v2/` de `bea1659` à `2ef0369` (5 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff est un renommage d'adresse (v2.amend.ink → app.amend.ink) dans les scripts d'exploitation et les tests, plus un correctif de robustesse dans `adresse.sh` (retry du contrôle de version après rechargement de Caddy, et neutralisation de l'échec de `curl`). Le renommage est cohérent sur tous les emplacements visibles du diff, et le correctif du script répond à un incident réel daté (21/11/2026). Rien de grave ; une question sur l'exhaustivité du renommage hors diff, et un point mineur sur la boucle d'attente.

## Constats
1. **[question]** Grille 6 (correction) — `v2/exploitation/prod/adresse.sh:207` : la boucle d'attente (12 essais × 5 s, jusqu'à 60 s) est cohérente avec le commentaire, mais je ne peux pas vérifier depuis le diff que le rechargement de Caddy peut réellement prendre plus de 60 secondes sur le VPS ; si c'est arrivé le 21/11/2026, proposer de noter la durée observée dans le commentaire pour fixer la borne. À défaut, rien à changer.
2. **[question]** Grille 6 (correction) — `v2/exploitation/campagne/commun.mjs:70` : le renommage remplace `v2.amend.ink` par `app.amend.ink` dans les cinq fichiers du diff, mais je ne peux pas vérifier qu'aucune autre occurrence ne reste ailleurs (Caddyfile.v2, `exploitation/prod/essayer.sh`, documentation, secrets GitHub, en-tête `V2_JETON_ESSAI` côté serveur). Proposer un `grep -r "v2.amend.ink" v2/ docs/` pour confirmer l'exhaustivité.
3. **[mineur]** Grille 4 (simplicité) — `v2/exploitation/prod/adresse.sh:206` : `for _ in $(seq 1 12)` fonctionne, mais `for _ in {1..12}` éviterait la sous-commande ; c'est un détail de style sans effet, à ne changer qu'à la prochaine retouche du script.

## Points de grille sans remarque
1, 2, 3, 5, 7, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides

## Réponse de Claude

1. **Rien à changer.** La durée de l'indisponibilité n'a pas été mesurée le 21/11 : le script s'est arrêté au premier essai, et l'adresse répondait quand Claude l'a interrogée quelques minutes plus tard. Soixante secondes sont une marge, pas une mesure.
2. **Vérifié.** Recherche de l'ancienne adresse dans tout le dépôt : il ne reste que les mentions voulues, à savoir le renvoi (`Caddyfile.v2`), le script et son test (`adresse.sh`, `changement-adresse.test.js`, sa donnée), la note de `CLAUDE.md` sur l'ancienne adresse, et les documents d'histoire (journal, plans d'étapes, procédure de mise en ligne). La clé d'essai de la CI est un secret de GitHub envoyé en en-tête, sans lien avec le nom de l'hôte.
3. **Noté**, à la prochaine retouche du script.

## Arbitrage de Sylvain

(À compléter.)
