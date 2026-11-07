# Revue de clôture de l’étape 1-mise-en-ligne (2026-11-07)

- Relecteur : Mistral, modèle `mistral-large-latest` ; consommation : 16891 jetons en entrée, 566 en sortie
- Pièces : `docs/v2-regles-developpement.md`, `docs/v2-renoncements.md`, `docs/v2-veille.md`, `v2/adr/0001-architecture-docs-allege.md`, `v2/adr/0002-couches.md`, `v2/adr/0003-blocknote.md`, `v2/adr/0004-yhub.md`, `v2/adr/0005-connexion.md`, `v2/adr/0006-licence.md`, `v2/adr/0007-relecteur-ia.md`, `v2/adr/0008-design.md`, `v2/adr/0009-traductions.md`, `docs/v2-mise-en-ligne.md`, `Arborescence de v2/ (fichiers suivis)`, `v2/package.json`, `Diff de v2/ depuis 96e23b8`
- Commit relu : `fe783f8` (depuis `96e23b8`)
- Statut : avis reçu ; réponse de Claude écrite ; arbitré par Sylvain le 07/11/2026.

## Avis du relecteur

## Synthèse
L'étape 1-mise-en-ligne est **prête à être close** : l'architecture et le code respectent les règles de développement, les points de sécurité et d'exploitation sont couverts, et les fichiers de déploiement sont complets. Les ajustements mineurs proposés (R1 à R4) n'impactent pas la stabilité ni la sécurité. La mémoire mesurée (~200 Mo pour la v2) reste compatible avec le VPS actuel.

## Constats
**R1 [mineur] 5 (Sécurité et droits)** – `v2/exploitation/prod/installer.sh`
Le script vérifie l'absence de règles UFW pour les ports 4300/4400, mais ne vérifie pas que le pare-feu système (nftables) bloque effectivement le port 4400. Proposer d'ajouter une vérification explicite avec `nft list ruleset | grep -q "dport 4400"` et un avertissement clair si le port est accessible.

**R2 [mineur] 1 (Couches)** – `v2/exploitation/prod/amend-v2-collab.service`
Le service `amend-v2-collab` dépend de `postgresql.service` et `valkey-server.service`, mais n'a pas de dépendance explicite à `network-online.target`. Bien que systemd gère généralement cela, ajouter `After=network-online.target` pour garantir que le réseau est prêt avant le démarrage.

**R3 [mineur] 8 (Licences)** – `v2/package.json`
Les dépendances `@mantine/core` et `@mantine/hooks` sont sous licence MIT, compatible avec AGPL-3.0. Cependant, leur version (9.7.5) est ancienne par rapport à la dernière stable (10.x). Proposer de documenter dans `v2-veille.md` la veille sur les montées de version de Mantine pour éviter des écarts futurs.

**R4 [question] 7 (Exports propres)** – `v2/design/styles.css`
Le correctif temporaire pour la police BlockNote (rebranchement de `--bn-font-family`) est documenté dans `v2-veille.md`, mais le contrat `dictionnaire-blocknote.test.js` ne vérifie pas explicitement que la police est bien appliquée. Faut-il ajouter un test visuel (ex: screenshot) ou un test de présence de la règle CSS ?

## Points de grille sans remarque
2, 3, 4, 6, 9, 10, 11.

## Réponse de Claude

- **R1 (pare-feu nftables)** : *corrigé*. `installer.sh` regarde aussi nftables (chaîne d'entrée en « policy drop », règles qui ouvriraient 4300 ou 4400) et, faute de pare-feu, avertit avec la commande ufw à lancer. Surtout, la procédure ajoute un **contrôle extérieur** : Claude vérifie depuis son environnement que le port 4400 du VPS ne répond pas, ce qui prouve la fermeture quel que soit l'outil de pare-feu.
- **R2 (`network-online.target`)** : *contesté*. Les deux services ne parlent qu'à des adresses locales (`127.0.0.1` : PostgreSQL, Valkey, notre serveur) ; `network.target` suffit, et attendre `network-online` peut retarder le démarrage sans rien garantir de plus. La v1 fait de même.
- **R3 (Mantine « ancienne »)** : *contesté, erreur de fait*. 9.7.5 est la dernière version publiée de `@mantine/core` (étiquette `latest` sur npm au 07/11/2026) ; il n'y a pas de 10.x. De plus, `@blocknote/mantine` 0.57.0 n'admet que Mantine 8.3 ou 9. Les montées de version passent par la veille mensuelle (règle 4.2).
- **R4 (police de BlockNote non testée)** : *contesté*. Le contrat existe : `v2/contrats/pile/pile.test.js`, test « contrat 5 : les jetons de design atteignent l'éditeur (couleur et police) », vérifie dans Chromium que la police calculée de l'éditeur est celle des jetons. Le fichier cité par le relecteur (`dictionnaire-blocknote.test.js`) porte sur autre chose.

## Arbitrage de Sylvain

07/11/2026 : réponses validées (R1 corrigé ; R2, R3, R4 contestés) ; fusion dans `main` acceptée pour la mise en ligne d'essai.
