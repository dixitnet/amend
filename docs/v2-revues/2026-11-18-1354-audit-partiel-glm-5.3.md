# Audit partiel avant fusion (2026-11-18)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 279101 signes envoyés, 2025 reçus (et 6181 de réflexion) ; réflexion `low` ; 35 s ; arrêt : stop
- Diff audité : `v2/` de `debc6c2` à `738a716` (3 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff corrige un défaut d'affichage du menu « / » (étiquettes de groupe dupliquées pendant la frappe), l'adapte proprement dans l'adaptateur BlockNote, l'couvre par un nouveau contrat, et conditionne deux tests du format S à Chromium (clavier virtuel non simulé ailleurs). L'ensemble est sobre et conforme aux couches. Deux points mineurs à vérifier : un cas limite sur le groupe par défaut, et la perte de couverture WebKit/Firefox assumée mais à suivre.

## Constats
1. **[mineur]** Grille 6 (cas limite), `v2/adaptateurs/blocknote/index.jsx:248` — Si `getDefaultReactSlashMenuItems` renvoyait une liste vide, `groupe` serait `undefined` et les entrées du saut de page et de la table des matières recevraient `group: undefined`, ce que BlockNote pourrait mal afficher (ou ignorer). Cas improbable en pratique (les éléments par défaut existent toujours), mais un repli explicite (le groupe du dictionnaire, comme avant) éviterait tout comportement indéfini. Proposer un repli ou documenter l'invariant.
2. **[question]** Grille 7 (tests), `v2/contrats/pile/telephone.test.js:369` — Les deux tests du format S (« Corriger » sans volet, pastille animée) sont désormais sautés hors Chromium ; le commentaire renvoie à un contrôle réel sur iPhone et à une « campagne WebKit » qui n'est pas dans le dépôt. La couverture de ces deux comportements de Sylvain (14/11/2026) repose donc sur un contrôle manuel non tracé. Demander où cette campagne est consignée, ou noter le point dans `docs/v2-veille.md` pour qu'il ne se perde pas.
3. **[mineur]** Grille 7 (tests), `v2/contrats/pile/editeur.test.js:554-558` — Le test vérifie l'unicité des étiquettes à l'ouverture du menu et après avoir tapé « saut » en entier, mais pas les états intermédiaires de la frappe (« s », « sa ») où le défaut se manifestait selon le commentaire (`index.jsx:246-247`). Un contrôle sur un préfixe intermédiaire (par exemple « sa ») fiabiliserait la vérification du défaut corrigé.

## Points de grille sans remarque
1, 2, 3, 4, 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides

## Réponse de Claude

1. Juste, corrigé : repli sur le groupe du dictionnaire.
2. Juste, corrigé : la campagne est `docs/v2-tests/procedure-campagne.md` (workflow `v2-campagne.yml`) ; le point est noté dans `docs/v2-veille.md` avec les deux gestes à contrôler sur iPhone.
3. Juste, corrigé : l'unicité des étiquettes est vérifiée après chaque lettre de « saut ».

## Arbitrage de Sylvain

À arbitrer par Sylvain avec la fusion.
