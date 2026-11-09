# Audit partiel avant fusion (2026-11-09)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 57441 signes envoyés, 1626 reçus (et 2932 de réflexion) ; réflexion `low` ; 10 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `badef56` (1 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff est minuscule : un seul test de contrat ajusté pour admettre les titres de niveau 4 et 5 dans le menu « / » et exclure le niveau 6, avec un commentaire citant la décision de Sylvain. La décision étant documentée et citée, l'ajout en soi n'est pas un défaut. Deux points interrogent : l'absence, dans ce diff, de la modification du schéma/éditeur qui doit rendre ces titres réellement disponibles, et la fragilité de la vérification par sous-chaîne, sur laquelle les nouvelles clés s'appuient.

## Constats
1. **[question]** Grille 7 (tests) — `v2/contrats/pile/editeur.test.js:121-122` : le diff ne touche que le test ; la configuration de l'éditeur (schéma des blocs, adaptateur BlockNote) qui doit proposer `heading_4` et `heading_5` au menu « / » n'apparaît pas ici. Si elle est bien modifiée dans un autre fichier du même lot, rien à signaler ; sinon le test échouera ou, pire, passera à vide. Propose de confirmer que le lot contient bien la modification correspondante côté adaptateur/extensions.
2. **[mineur]** Grille 7 (tests) — `v2/contrats/pile/editeur.test.js:130` : la présence est vérifiée par `tout.includes(libelle(cle))`, une correspondance par sous-chaîne : le libellé de `heading` (« Titre ») est contenu dans celui de `heading_2` (« Titre 2 »), donc la boucle de présence peut passer même si un bloc manque. Les nouvelles clés `heading_4`/`heading_5` héritent de cette faiblesse (« Titre 4 » contient « Titre »). Propose de comparer des libellés exacts (découpage de la liste plutôt que `includes` sur la chaîne concaténée).

## Points de grille sans remarque
1, 2, 3, 4, 5, 6, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides

## Réponse de Claude

1. **Faux.** Le schéma propose déjà les niveaux 1 à 5 : `createHeadingBlockSpec({ levels: [1, 2, 3, 4, 5] })` dans `v2/adaptateurs/blocknote/schema.js:20`, fusionné avant ce lot (journal des décisions, 09/11/2026). Le test échouait justement parce qu'il n'avait pas suivi ; la pile complète passe maintenant (35/35).
2. **Juste, corrigé.** Le test compare désormais les libellés exacts de la liste (`titres.includes`) au lieu de chercher une sous-chaîne dans la liste mise bout à bout ; `contrats/pile/editeur.test.js` passe (7/7).

## Arbitrage de Sylvain

(À compléter.)
