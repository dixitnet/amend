# Audit partiel avant fusion (2026-11-22)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 418482 signes envoyés, 1573 reçus (et 1370 de réflexion) ; réflexion `low` ; 7 s ; arrêt : stop
- Diff audité : `v2/` de `6344d8c` à `0e13047` (7 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Diff très petit et cohérent : ajout du séparateur de scène « points » (trois puces espacées) à tous les étages — ADR 0008, réglages du design, domaine, gabarit Typst, interface, catalogues fr/en et contrat. Les couches et le graphe de dépendances sont respectés, la décision de Sylvain du 22/11/2026 est bien tracée dans la table des réglages. Un seul point de fond : le libellé choisi (« Trois points ») ne décrit pas le signe réellement composé (des puces « • », pas des points de suspension), alors que l'ADR parle de « trois puces espacées ».

## Constats
1. **[mineur]** Grille 9 (traductions), `v2/i18n/fr.json:529` et `v2/i18n/en.json:529` : le libellé « Trois points • • • » / « Three dots • • • » nomme « points » un signe composé de puces (•), non de points ; l'ADR 0008 (`v2/adr/0008-design.md:221`) dit « trois puces espacées ». Le glyphe affiché dans l'étiquette évite l'ambiguïté au pire, mais « Trois puces • • • » / « Three bullets • • • » serait fidèle à la décision. À proposer à Sylvain, qui a choisi le signe mais pas nécessairement le mot.
2. **[question]** Grille 7 (tests), `v2/contrats/statiques/typst.test.js:443` : la nouvelle variante `points` est couverte côté contrat Typst, mais je ne vois pas dans le diff de test du domaine vérifiant que `separateur: 'points'` passe la validation des réglages (`appliquerReglages`) — les autres options de `SEPARATEURS` (`v2/domaine/miseEnPage.js:438`) en ont-elles un ? Si oui, ajouter la valeur au cas existant ; sinon, rien à faire.

## Points de grille sans remarque
1, 2, 3, 4, 5, 6, 8, 10.

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides

## Réponse de Claude

1. **Libellé gardé.** « Trois points » est le mot de Sylvain pour ce séparateur ; le signe est montré dans le libellé, comme pour les autres options, ce qui lève l'ambiguïté. L'ADR décrit le glyphe (des puces), le libellé nomme l'option.
2. **Juste, ajouté.** Un test du domaine vérifie que le réglage `points` est permis par les règles du design, qu'il compose bien « • • • » dans le gabarit, et qu'un signe inconnu est refusé (`tests/unitaires/modeles-livre.test.js`).

## Arbitrage de Sylvain

(À compléter.)
