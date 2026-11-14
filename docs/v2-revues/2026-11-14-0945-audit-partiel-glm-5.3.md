# Audit partiel avant fusion (2026-11-14)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 254522 signes envoyés, 2846 reçus (et 7197 de réflexion) ; réflexion `low` ; 15 s ; arrêt : stop
- Diff audité : `v2/` de `6669069` à `75535fc` (17 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot cohérent et bien découpé : domaine pur, route serveur avec contrôle administrateur, composant de présentation Mantine sans réglage, catalogues fr/en complets avec pluriel ICU. Le principal angle mort est la corbeille : la route lit tous les documents, or y/hub refuse de lire un document à la corbeille (renoncement n° 24), donc chaque document jeté sera compté « illisible » et ses images jugées orphelines. Viennent ensuite deux petits points de correction (compteur `documentsLus` trompeur, perfenrature de la boucle séquentielle) et une question sur `exceptions.json`.

## Constats
- **[important]** Grille 6 (correction), `v2/adaptateurs/postgres/comptes-documents.js:68`, `v2/application/serveur/images-orphelines.js:39` — `tousLesDocuments()` prend la corbeille (« corbeille comprise »), mais le renoncement n° 24 dit que y/hub refuse de lire un document à la corbeille : chaque document jeté échouera dans `lireTexte`, gonflera `documentsIllisibles` (avertissement permanent et faux à l'écran) et, ses images n'étant citées nulle part, sera jugé orphelin alors que la restauration du document les rendrait utilisées — contraire à la prudence affichée (« garder à tort, jamais l'inverse »). Proposer d'exclure la corbeille de la requête (ou de la traiter à part dans le rapport), avec un test.
- **[mineur]** Grille 6, `v2/application/serveur/images-orphelines.js:49` — quand `images.length === 0`, aucun document n'est lu mais `documentsLus` vaut `documents.length` : le rapport annonce des documents lus qui ne l'ont pas été. Calculer `documentsLus` seulement sur les documents réellement parcourus.
- **[mineur]** Grille 6, `v2/application/serveur/images-orphelines.js:39-46` — la boucle lit l'état de chaque document séquentiellement (deux appels par document) sur une action déclenchée par un clic ; sur une instance chargée, la requête peut durer longtemps sans limite ni temporisation. Un traitement par lots (ou au moins une temporisation par appel) mérite d'être envisagé, ou noté comme limite connue.
- **[question]** Grille 9, `v2/i18n/exceptions.json:26-29` — quatre clés nouvelles sont ajoutées aux exceptions sans que le diff montre pourquoi ; `admin.images.colonnes.nombre` (« Nombre » / « Count ») diffère d'une langue à l'autre, contrairement à `admin.images.titre` (« Images » / « Images »). Confirmer la raison d'être de chaque entrée (identique dans les deux langues ? exemptée d'un contrôle ?) ; sinon retirer celles qui n'y ont pas lieu d'être.
- **[question]** Grille 6, `v2/domaine/imagesOrphelines.js:20` — le motif n'accepte que `png|jpg|gif` ; vérifier que l'envoi d'images (`application/serveur/images.js`) ne produit jamais d'autre extension (par exemple `jpeg` ou `webp`), faute de quoi ces images seraient toujours jugées orphelines.

## Points de grille sans remarque
1, 2, 3, 4, 5, 7, 8, 10

## Citations vérifiées par le script

(aucun constat numéroté reconnu)

## Réponse de Claude

1. *Juste, important* : un document à la corbeille n'est plus lu (y/hub le refuse, renoncement n° 24) et ses images sont comptées à part (« à la corbeille »), jamais orphelines ; il n'est pas non plus « illisible ». Tests ajoutés (domaine, route).
2. *Juste* : `documentsLus` ne compte que les documents réellement lus (0 sans image) ; test ajouté.
3. *Noté, limite connue* : lecture séquentielle, deux appels par document, chacun limité à 5 s par le client de y/hub ; adaptée à une instance de cette taille, à revoir (lots) si elle grossit.
4. *Voulu* : les quatre clés des exceptions sont identiques dans les deux langues (« Images », « Document ») ; `admin.images.colonnes.nombre` (« Nombre » et « Count ») n'y est pas, la clé citée est `colonnesDocuments.nombre` (« Images »).
5. *Faux* : le serveur ne produit que `png`, `jpg` et `gif` (`typeImage` et `nomImageValide`).

## Arbitrage de Sylvain

(À compléter.)
