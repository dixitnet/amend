# Audit partiel avant fusion (2026-11-11)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 146521 signes envoyés, 2105 reçus (et 4191 de réflexion) ; réflexion `low` ; 14 s ; arrêt : stop
- Diff audité : `v2/` de `689d286` à `f78c382` (12 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot cohérent : table des matières accessible (étiquette visible, options en clair), tailles des pictos de l'éditeur, et correction d'une fausse alerte du test de pare-feu. Les couches et les réglages décidés (ADR 0008) sont respectés, les catalogues fr et en sont mis à jour ensemble, et les tests suivent le changement. Deux points mineurs : un couplage implicite entre l'application et l'extension sur l'ordre des options, et une valeur brute (l'épaisseur de bordure) dans la feuille de style.

## Constats
1. **[mineur]** Grille 6 (correction), `v2/extensions/tableDesMatieres/index.js:65` et `v2/application/client/aidesEdition.jsx:35` — l'extension lit l'option par indice (`textes.niveaux?.[n - 1]`) alors que l'application construit le tableau par `PROFONDEURS_TABLE.map(...)` : cela ne coïncide que si `PROFONDEURS_TABLE` reste `[1, 2, 3, 4, 5]` contigu. Un jour où le domaine changerait la liste (profondeur 6, ou retrait d'un niveau), les libellés se décaleraient sans erreur. Proposer un objet clé/valeur (`{ [n]: libellé }`) ou un tableau de paires, pour que le contrat soit explicite.
2. **[question]** Grille 1/18 (design), `v2/design/feuilles/editeur.css:60` — l'épaisseur de bordure `calc(0.0625rem * var(--mantine-scale))` est une valeur brute, pas une variable de Mantine ; la table de l'ADR 0008 ne mentionne que « bordure `default-border` ». C'est la formule que Mantine utilise elle-même pour ses champs, donc probablement voulu, mais à confirmer avec Sylvain ou à remplacer par la variable si Mantine en expose une.
3. **[mineur]** Grille 7 (tests), `v2/tests/en-ligne/en-ligne.test.js:132-135` et `v2/exploitation/prod/essayer.sh:41` — avec `V2_DEPUIS_LE_SERVEUR=1`, le contrôle « ports internes fermés depuis Internet » n'est plus jamais joué automatiquement après un déploiement ; le message l'admet (« à vérifier de l'extérieur »). Le contournement de la fausse alerte est juste, mais il faudrait noter où la vérification externe est faite (procédure, revue de sécurité) pour qu'elle ne soit pas simplement perdue.

## Points de grille sans remarque
3, 4, 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides

## Réponse de Claude

1. *Juste*, corrigé : l'application passe les libellés par numéro de niveau (`{ 1: …, 2: … }`) et l'extension les lit par ce numéro (`textes.niveaux?.[n]`) ; un changement de `PROFONDEURS_TABLE` ne peut plus décaler les libellés.
2. *Faux* : `calc(0.0625rem * var(--mantine-scale))` est la formule de Mantine elle-même (`rem(1px)`) pour la bordure de ses champs ; Mantine n'expose pas de variable d'épaisseur. La ligne `css.editeur.table` de l'ADR 0008 décrit le choix « dessiné comme un champ de Mantine », ce qui couvre cette épaisseur.
3. *Juste*, précisé : le contrôle des ports se joue quand la suite en ligne est lancée depuis le Mac ; le commentaire du test donne la vérification à la main (`nc -vz -w 5 v2.amend.ink 4400`, de même 4300, 5432, 6379, qui doit échouer). Elle figure aussi dans le compte rendu du lot à Sylvain.

## Arbitrage de Sylvain

(À compléter.)
