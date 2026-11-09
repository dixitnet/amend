# Audit partiel avant fusion (2026-11-09)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 62019 signes envoyés, 2725 reçus (et 5511 de réflexion) ; réflexion `low` ; 10 s ; arrêt : stop
- Diff audité : `v2/` de `5689be8` à `4f9cafd` (2 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce lot retire le mot de passe Caddy devant v2.amend.ink (cohérent avec l'ADR 0005 : entrée par lien magique uniquement) et fournit un script de transition avec sauvegarde, validation et retour arrière. L'idée est saine, mais la procédure de retour arrière a un défaut d'ordre d'opérations qui peut laisser le site ouvert sans mot de passe alors que le contrôle a échoué. Quelques cas limites de l'analyse awk méritent une vérification.

## Constats
1. **[grave]** Grille 6 (correction, sécurité) — `v2/exploitation/prod/caddy-ouvrir.sh:34` et `v2/exploitation/prod/caddy-ouvrir.sh:41`. La fonction `revenir` remet la copie de la configuration puis sort **sans recharger Caddy** : si le contrôle `curl` échoue (ligne 41), Caddy continue de servir la configuration *sans mot de passe* déjà rechargée à la ligne 38, alors que le fichier sur disque est revenu à l'ancienne. De plus, le `systemctl reload caddy` de la ligne 41 s'exécute alors que `$C` contient encore la configuration fautive, donc il ne sert à rien. Proposer : dans `revenir`, faire `cp` puis `systemctl reload caddy` avant de sortir ; supprimer le reload ligne 41.
2. **[mineur]** Grille 6 — `v2/exploitation/prod/caddy-ouvrir.sh:29`. Toute ligne du bloc contenant `X-Robots-Tag` est supprimée en entier, même si elle porte autre chose (un commentaire, un autre en-tête sur la même ligne). Avec le Caddyfile actuel (une ligne `header X-Robots-Tag` seule) cela fonctionne, mais le script est fragile à toute retouche future du fichier. Proposer : ne supprimer que les lignes qui sont exactement une directive `header X-Robots-Tag`, ou documenter la limite.
3. **[question]** Grille 6 — `v2/exploitation/prod/caddy-ouvrir.sh:26`. Si Caddy accepte la forme de `basic_auth` sans accolades (une seule ligne d'identifiant), la ligne serait supprimée avec ses identifiants — voulu — mais je ne suis pas certain que toutes les formes syntaxiques soient couvertes par le motif `^[[:space:]]*basic_auth([[:space::{]|$)`. À vérifier sur le fichier réel avant exécution (le script valide ensuite par `caddy validate`, ce qui limite le risque).
4. **[question]** Grille 9 — `v2/exploitation/prod/caddy-ouvrir.sh:10` (et messages « ✓/✗ » lignes 34, 42, 43). La règle 23 interdit les phrases en dur « à toute couche » ; ces messages d'exploitation s'adressent à l'administrateur, pas à une utilisatrice. Je les classe en question : confirmer si les scripts de la couche 7 sont hors périmètre du lint des chaînes, sinon les noter dans le registre ou les exempter explicitement.

## Points de grille sans remarque
1, 2, 3, 4, 5 (contrôle côté serveur inchangé, l'ouverture ne fait que retirer une protection remplacée par le lien magique selon l'ADR 0005), 7, 8, 10.

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides

## Réponse de Claude

1. **Juste, corrigé.** `revenir` remet la copie, puis recharge Caddy. Le rechargement inutile qui suivait l'échec du contrôle est supprimé. Essayé en simulant une réponse 502 : la configuration d'origine revient et elle est rechargée.
2. **Juste, corrigé.** Seule une ligne `header X-Robots-Tag …` est remplacée.
3. **Vérifié.** Le bloc réel suit le gabarit (`basic_auth { … }`). Toute autre forme serait arrêtée par `caddy validate`, puis par le contrôle de la réponse, et la configuration reviendrait d'elle-même.
4. **Hors périmètre.** Les scripts d'exploitation s'adressent à l'administrateur, comme `deployer.sh`, `courrier.sh` et `essai.sh` ; la règle des textes traduits vise ce que voit une utilisatrice.

## Arbitrage de Sylvain

(À compléter.)
