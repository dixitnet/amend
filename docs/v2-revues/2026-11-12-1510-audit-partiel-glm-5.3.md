# Audit partiel avant fusion (2026-11-12)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 172993 signes envoyés, 1514 reçus (et 497 de réflexion) ; réflexion `low` ; 29 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `5a1df3b` (3 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff retire la mention « espaces compris » / « including spaces » du compteur de signes, dans les catalogues fr et en et dans le test de pile qui l'affiche. Le changement est cohérent entre les trois fichiers, mais il contredit la règle 27 des règles de développement, qui impose que l'unité « signes, espaces compris » soit traduite explicitement. Aucun autre écart (couches, licences, design) n'est visible dans ce diff.

## Constats
1. **[important]** Grille 9 (traductions) — `v2/i18n/fr.json:48`, `v2/i18n/en.json:48`, `v2/i18n/fr.json:64`, `v2/i18n/en.json:64`, `v2/contrats/pile/editeur.test.js:330`. La règle 27 dispose : « Les unités restent les signes, espaces compris… traduits par exemple en "characters (including spaces)" en anglais ». Le retrait de « espaces compris » / « including spaces » du compteur et du compteur de sélection contredit cette règle ; rien dans le dossier (ADR, registre des renoncements) n'enregistre une décision de Sylvain qui lèverait l'exigence. Si Sylvain a décidé cette simplification à l'écran, il faut l'inscrire (règle 9, registre des renoncements ou note dans l'ADR 0009) ; sinon, rétablir la mention. Je classe en important plutôt que grave car le sens de l'unité (signes espaces compris) reste correct dans le calcul — seule sa mention explicite disparaît — mais c'est un contournement d'une règle écrite sans décision enregistrée.

## Points de grille sans remarque
1, 2, 3, 4, 5, 6, 7 (le test est mis à jour en cohérence avec le catalogue), 8, 10.

## Citations vérifiées par le script

- 1 : citations valides

## Réponse de Claude

1. **Juste** sur la forme : la décision existe (Sylvain, 12/11/2026 : « Pas besoin de préciser (espaces compris) »), mais elle n'était inscrite que dans le journal. Elle est maintenant notée en exception à la règle 27 (`docs/v2-regles-developpement.md`). Le compte inclut toujours les espaces ; les limites et la consommation d'IA gardent la mention.

## Arbitrage de Sylvain

(À compléter.)
