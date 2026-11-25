# Audit partiel avant fusion (2026-11-25)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 447917 signes envoyés, 2622 reçus (et 6690 de réflexion) ; réflexion `low` ; 15 s ; arrêt : stop
- Diff audité : `v2/` de `6b425f3` à `2ebdeda` (9 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff aligne les outils du connecteur Claude sur ceux de Margo (plan, compter) via des schémas partagés, avec tests de cohérence et catalogues mis à jour des deux côtés. L'ensemble est sobre et bien couvert. Je relève surtout une fragilité silencieuse dans la table `DROITS` du connecteur, une duplication de calcul de la sélection, et deux points à trancher (budget en signes non compté, troncature à 20 textes sans avertissement).

## Constats
1. **[important]** Grille 6 (correction), `v2/application/serveur/connecteur.js:53` — Si `SCHEMAS` (margo.js) gagne un outil absent de `DROITS`, `...DROITS[nom]` s'étale sur `undefined` sans erreur : l'outil est exposé sans capacité ni annotations, donc sans contrôle de droit (la vérification `outil.capacite` à la ligne 148 devient inopérante). Proposer un test ou une assertion au démarrage : chaque nom de `SCHEMAS` doit exister dans `DROITS`.
2. **[mineur]** Grille 4 (simplicité), `v2/application/serveur/margo.js:202-205` et `v2/application/serveur/margo.js:209-210` — `signesSelection` est calculé deux fois par la même formule (`compterTextes`/`signes` sur la tranche `de-1..a`) dans la même fonction ; le second calcul existant pourrait réutiliser le premier. Fusionner en une seule variable.
3. **[question]** Grille 5/6, `v2/application/serveur/margo.js:381-392` et `v2/application/serveur/margo.js:396-417` — `plan` et `compter` lisent l'état complet du document (via `lireEtat`) sans rien ajouter à `compte.signesLus`, contrairement à `lire` (ligne 371). Si les limites en signes de l'étape 8 visent la consommation, un modèle pourrait multiplier les appels `plan`/`compter` hors budget. Est-ce voulu (compter n'est pas lire) ? À trancher avec Sylvain.
4. **[mineur]** Grille 6, `v2/application/serveur/margo.js:412` — `textes.slice(0, COMPTAGE_MAX)` tronque silencieusement au-delà de 20 textes : le modèle qui en donne 30 reçoit 20 comptes sans explication, et la description de l'outil (fr.json:8) ne mentionne pas la limite. Ajouter la limite dans la description de l'outil ou un message de suite.
5. **[mineur]** Grille 9 (traductions), `v2/i18n/consignes/fr.json:45` — Les instructions du connecteur disent « puis " plan " et " lire " » mais ne mentionnent pas `compter`, désormais disponible et utile (une reformulation à vérifier avant de la proposer). Mettre la phrase à jour.

## Points de grille sans remarque
1, 2, 3 (partiellement couvert par le constat 1 côté connecteur, mais pas de violation de couche), 7 (tests présents et cohérents, y compris la vérification NFC implicite du test « une lettre décomposée vaut un signe »), 8, 10.

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : **citation invalide** (fr.json:8)
- 5 : citations valides

## Réponse de Claude

1. **Juste, corrigé.** Le connecteur s'arrête au démarrage si un outil de Margo n'a pas de droits déclarés chez lui.
2. **Juste, corrigé.** Un seul calcul de la taille de la sélection, pour la consigne et pour les signes lus.
3. **Voulu.** Compter n'est pas lire : `plan` et `compter` ne rendent au modèle que des nombres et des titres, pas le texte ; c'est tout l'intérêt de « compter une plage sans la lire ». La limite d'étapes par demande borne déjà le nombre d'appels, quel que soit l'outil.
4. **Juste, corrigé.** La limite de vingt textes est dite dans la description de l'outil (Margo et connecteur), et un dépassement est annoncé dans le résultat ; essai ajouté.
5. **Juste, corrigé.** Les instructions du connecteur disent d'utiliser « compter » pour toute longueur, en signes, espaces compris.

## Arbitrage de Sylvain

(À compléter.)
