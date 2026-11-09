# Audit partiel avant fusion (2026-11-09)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 61605 signes envoyés, 2500 reçus (et 1859 de réflexion) ; réflexion `low` ; 6 s ; arrêt : stop
- Diff audité : `v2/` de `e187a7f` à `c226bb9` (2 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff est petit : lecture du commit git au démarrage du serveur, exposé dans `GET /api/config`, avec un test. La mécanique est propre (try/catch, `execFileSync` sans shell), mais le but annoncé — vérifier ce qui est en ligne — risque d'échouer en déploiement réel, où le répertoire `.git` est souvent absent. Le test dépend de l'environnement d'exécution et est logé dans un test au nom trompeur.
## Constats
1. **[important]** Grille 6 (correction), `v2/application/serveur/index.js:104` — Le commentaire dit que la version sert à « vérifier de l'extérieur ce qui est en ligne (déploiement automatique) », mais un déploiement qui copie le code sans le répertoire `.git` (archive, `git archive`, image de conteneur) donnera `VERSION = null` : la fonction ne remplira pas son rôle exactement là où on en a besoin. Proposer de passer le commit par une variable d'environnement posée à la construction/déploiement, avec la lecture git en repli pour le développement.
2. **[important]** Grille 7 (tests), `v2/tests/services/serveur.test.js:109` — Le test échouera dans tout environnement sans `git` ou sans dépôt (la route renverra `version: null`, qui ne matche pas la regex) : il ne vérifie pas ce qu'il annonce de façon fiable, et le cas `null` n'est pas couvert. Proposer soit d'injecter la version (comme au constat 1), soit de tester explicitement les deux issues (`7 hexa` ou `null`).
3. **[mineur]** Grille 7 (tests), `v2/tests/services/serveur.test.js:103` — La vérification de la version est ajoutée dans le test « requêtes malformées : codes, jamais de plantage », dont le nom n'annonce pas ce contrôle. La déplacer dans le test existant de `/api/config` ou un test dédié.
4. **[mineur]** Grille 5 (sécurité), `v2/application/serveur/index.js:134` — Le commit exact est exposé publiquement, sans authentification, sur une route ouverte : cela renseigne un attaquant sur la version précise du code en ligne (empreinte de version). À minima le noter ; si Sylvain juge le besoin réel, envisager de restreindre l'accès ou de n'exposer qu'en mode `dev`.
5. **[question]** Grille 4 (simplicité), `v2/application/serveur/index.js:104` — Ce besoin de « vérification de l'extérieur » est-il établi et stabilisé (règle « Avant de proposer un développement », point 1), ou relève-t-il de l'exploitation (couche 7), qui aurait pu le traiter par un script ou une variable d'environnement sans toucher au serveur applicatif ? À poser à Sylvain.
## Points de grille sans remarque
2, 3, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

L'outil n'audite que `v2/`. Les scripts de déploiement (`deploy/auto/`) ont été essayés à part, sur un faux dépôt, dans six situations : premier passage, rien de neuf, nouveau commit, `.env` de la v1 changé, `v2.env` changé, échec sans relance.

1. **Hors sujet ici.** Le VPS déploie par `git pull` dans un clone (`/opt/amend/app`). Il n'y a ni archive ni image prévue : la lecture git suffit. Si cela change, on passera le commit par une variable d'environnement.
2. **Juste, corrigé.** Le test accepte les deux issues : un commit de 7 signes ou `null`.
3. **Juste, corrigé.** Le contrôle a désormais son propre test.
4. **Noté.** La v2 est derrière le mot de passe de Caddy, et son code est publié sous AGPL. À revoir avant l'ouverture réelle, avec le retrait de `V2_DEV=1`.
5. **Besoin établi.** C'est la décision de Sylvain (déploiement automatique, option 1) : Claude vérifie lui-même la version en ligne après chaque fusion.

## Arbitrage de Sylvain

(À compléter.)
