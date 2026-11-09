# amend.ink v2 : mise en ligne d'essai (v2.amend.ink)

Statut : **prêt**, revue de Mistral traitée (`docs/v2-revues/2026-11-07-etape-1-mise-en-ligne-cloture.md`) ; accord de Sylvain donné le 07/11/2026, fusionné dans `main`.

## But

Faire tourner le squelette de l'étape 1 en conditions réelles, **sur le VPS de la v1**, à l'adresse `https://v2.amend.ink`, protégé par un mot de passe, pour :

1. l'essayer à plusieurs, depuis de vrais navigateurs et de vrais réseaux ;
2. mesurer la mémoire réelle, **pointes comprises**, à côté de la v1 ;
3. éprouver la procédure d'installation et de déploiement avant les étapes suivantes.

Décisions de Sylvain (07/11/2026) : VPS actuel, sous-domaine `v2.amend.ink`, mot de passe demandé par Caddy.

## Architecture en ligne

| Élément | Où | Mémoire visée |
|---|---|---|
| Caddy (existant) | `v2.amend.ink` → `/collaboration/*` vers 4400, le reste vers 4300 ; mot de passe (`basic_auth`) sur tout, WebSocket compris | — |
| `amend-v2` (serveur) | `127.0.0.1:4300`, systemd, utilisateur `amend` | `MemoryMax=200M` (mesuré ~40 Mo) |
| `amend-v2-collab` (y/hub) | port 4400, systemd, utilisateur `amend` | `MemoryMax=400M` (mesuré 90 à 170 Mo) |
| PostgreSQL | local, base `amendv2_yhub` ; `shared_buffers` 32 Mo, 20 connexions | ~50 Mo |
| Valkey | local ; `maxmemory` 96 Mo, persistance en ajout seul | ~10 Mo |
| v1 (`amend`) | inchangée, `MemoryMax=700M` | garde la priorité |

Fichiers : `v2/exploitation/prod/` (services, réglages, bloc Caddy, `installer.sh`, `deployer.sh`, `mesurer.sh`). Secrets : `/opt/amend/v2.env`, créé sur le VPS par `installer.sh` (mot de passe de base, secret de session, jeton interne), jamais commité, lisible par `amend` seulement.

## Points de sécurité

1. **Mot de passe Caddy** sur tout le site : la v2 n'a qu'une connexion de développement (un simple nom). Sans ce mot de passe, personne n'atteint le serveur.
2. **y/hub écoute sur toutes les interfaces** (pas d'option d'adresse dans y/hub 0.10.1) : le port 4400 doit être fermé de l'extérieur par le pare-feu. Même ouvert, y/hub refuse toute connexion sans session signée par notre serveur, lui-même joignable seulement par Caddy (`127.0.0.1`). `installer.sh` vérifie ufw et avertit.
3. PostgreSQL et Valkey écoutent en local (défaut de Debian).
4. Cookie de session `HttpOnly`, `SameSite=Lax` et `Secure` en ligne (`V2_COOKIE_SECURE=1`).
5. Origines admises par y/hub : `https://v2.amend.ink` seulement.

## Procédure

Prérequis : l'étape 1 et ce lot sont dans `main` (accord de Sylvain).

1. **DNS** (chez le registraire) : un enregistrement `v2.amend.ink` vers l'adresse du VPS (A, et AAAA si le site en a un).
2. **Mac** : déployer la v1 comme d'habitude (`./deploy/deployer.sh`), ce qui tire `main` sur le VPS, v2 comprise.
3. **VPS (SSH)** : `sudo bash /opt/amend/app/v2/exploitation/prod/installer.sh` (une fois).
4. **VPS (SSH)** : `bash /opt/amend/app/v2/exploitation/prod/deployer.sh` (à chaque mise à jour de la v2).
5. **VPS (SSH)** : `caddy hash-password`, puis ajouter le bloc `v2/exploitation/prod/Caddyfile.v2` à `/etc/caddy/Caddyfile` avec l'empreinte, `sudo caddy validate --config /etc/caddy/Caddyfile`, `sudo systemctl reload caddy`.
6. Essai : `https://v2.amend.ink/#essai`, mot de passe, puis un nom.
7. **Contrôle extérieur** (Claude, depuis son environnement) : `v2.amend.ink` refuse sans mot de passe, et le port 4400 du VPS ne répond pas depuis Internet.
8. **VPS (SSH)** : `bash /opt/amend/app/v2/exploitation/prod/mesurer.sh` après une séance d'essai (mémoire actuelle et **pointe** de chaque service).
9. **Courriers** (étape 6a ; mis en place le 09/11/2026), depuis le **Mac** : `./deploy/deployer.sh --courrier` (ou, sur le VPS : `sudo bash /opt/amend/app/v2/exploitation/prod/courrier.sh`). Le script recopie la clé et le domaine Mailgun de la v1 dans `/opt/amend/v2.env`, sans les afficher, puis redémarre la v2. Sans eux, les courriers restent en mémoire, lisibles à `/api/dev/courriers`.

Retour arrière : `sudo systemctl disable --now amend-v2 amend-v2-collab`, retirer le bloc Caddy et recharger. La v1 n'est pas touchée.

## Ce que Claude peut vérifier, et ce qu'il ne peut pas

Constaté le 08/11/2026, une fois en ligne :

- **Vérifiable depuis l'environnement de Claude** (le mot de passe Caddy y est enregistré comme secret, injecté par le proxy) : refus sans mot de passe (401 sur les pages, l'API et la WebSocket), en-tête HSTS, configuration servie (`/api/config` annonce `wss://v2.amend.ink/…`), connexion de développement.
- **Non vérifiable depuis cet environnement** : le proxy de l'environnement ne laisse passer **ni les WebSocket**, ni les ports autres que 80 et 443. La collaboration en direct et la fermeture du port 4400 se vérifient donc depuis le Mac ou un navigateur ordinaire (contrôles ci-dessous).

Contrôles à faire depuis le Mac :

1. Le port 4400 est fermé : `nc -vz -w 5 92.243.27.71 4400` doit échouer (alors que `nc -vz -w 5 92.243.27.71 443` réussit).
2. La collaboration : `https://v2.amend.ink/#essai` dans deux fenêtres (ou un ordinateur et un téléphone) ; la frappe de l'une apparaît dans l'autre, l'indicateur affiche « Synchronisé », et le texte est retrouvé après rechargement.
3. La mémoire, après la séance : `mesurer.sh` sur le VPS.
