# Audit partiel avant fusion (2026-11-17)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 280573 signes envoyés, 2387 reçus (et 5451 de réflexion) ; réflexion `low` ; 13 s ; arrêt : stop
- Diff audité : `v2/` de `42440fc` à `9d6eb27` (12 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff applique la décision de Sylvain du 16/11/2026 (plus de légende sur les blocs image, retrait du menu des images) de façon cohérente sur quatre couches : adaptateur (export, palette), domaine (gabarit Typst, migration), design (feuille CSS, réglage documenté dans l'ADR 0008) et i18n (clés retirées, exceptions mises à jour). Les tests de contrat Typst sont adaptés et vérifient bien la disparition de la légende. Restent deux traces de données (la clé `numerotation` en base et les légendes saisies avant le changement) et l'absence de test sur le comportement de la palette.

## Constats
1. **[mineur]** Grille 6 (correction / cas limite), `v2/design/reglagesLivre.js:115`, `v2/domaine/migrationModeles.js:83` — la clé `image.numerotation` est retirée des réglables et de la migration, mais les modèles déjà créés en base (jsonb `amend.modeles.valeurs`) entre le 15 et le 16/11 la conservent, sans nettoyage ni code transitoire documenté (contrairement au traitement de `base`/`ecarts` dans l'ADR 0011). Proposer soit un nettoyage au démarrage, soit une note de transitoire dans l'ADR 0011.
2. **[mineur]** Grille 6 (cas limite), `v2/adaptateurs/blocknote/export.js:282`, `v2/application/client/../adaptateurs/blocknote/index.jsx:211`, `v2/design/feuilles/editeur.css:166` — une légende saisie avant le 16/11 reste dans le document mais n'est plus affichée, plus exportée, et le retrait du menu des images empêche de la voir ou de l'effacer : donnée orpheline invisible. Le commentaire du CSS dit « saisie avant, n'est plus affichée », donc c'est peut-être assumé ; à confirmer avec Sylvain, ou prévoir un nettoyage à l'ouverture.
3. **[mineur]** Grille 7 (tests), `v2/adaptateurs/blocknote/index.jsx:211` — le retrait du menu de la palette pour une sélection d'images (nouveau comportement visible) n'est couvert par aucun test dans le diff, alors que la partie export l'est (`v2/contrats/statiques/typst.test.js:395`). Proposer un test d'extension sur un éditeur réel (règle 14).
4. **[question]** Grille 6, `v2/adaptateurs/blocknote/index.jsx:211` — la condition `choisis.every((b) => b.type === 'image')` ne masque le menu que si *tous* les blocs sélectionnés sont des images ; une sélection mixte (image + paragraphe) garde la palette, qui ne propose alors rien pour l'image. Est-ce le comportement voulu ?

## Points de grille sans remarque
1, 2, 3, 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : **citation invalide** (v2/application/client/../adaptateurs/blocknote/index.jsx:211)
- 3 : citations valides
- 4 : citations valides

## Réponse de Claude

1. Juste, négligeable : une clé `image.numerotation` restée dans un modèle déjà enregistré est ignorée à la lecture (`completerModele` ne retient que les réglables) ; aucune incidence, pas de nettoyage.
2. Assumé : la légende saisie avant le 16/11 reste dans le texte du document sans s'afficher ni s'exporter (décision de Sylvain : une légende n'est qu'un style de paragraphe). Pas de nettoyage.
3. Juste, mineur : pas de test de pile sur la palette masquée pour une image. À ajouter dans un prochain lot sur l'éditeur, non bloquant.
4. Voulu : une sélection mixte garde la palette, qui sert aux autres blocs.

## Arbitrage de Sylvain

Fusion demandée par Sylvain le 17/11/2026.
