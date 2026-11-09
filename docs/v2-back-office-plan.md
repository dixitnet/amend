# amend.ink v2 : le back-office

Statut : **lot 1 développé** le 09/11/2026 (« lances le back », Sylvain). Les rubriques suivantes sont à arbitrer.

## Ce que fait Docs

Docs n'a pas de back-office à lui : il s'appuie sur l'administration de Django (`/admin`), réservée aux comptes « staff » ou « superuser », que l'on désigne en ligne de commande. On reprend le principe, une désignation hors de l'application, sous la forme de la v1 : une liste d'adresses dans l'environnement du serveur. On ne dépend pas de Django.

## Lot 1 (fait)

- **Administrateurs de l'instance** :
  - `V2_ADMINS` dans `/opt/amend/v2.env`, posé par `sudo bash /opt/amend/app/v2/exploitation/prod/admins.sh <adresses>` ;
  - une adresse en `.invalid` (comptes d'essai et de développement) n'est jamais administratrice ;
  - l'adresse de Sylvain n'est pas écrite dans le dépôt.
- `/api/moi` dit `admin` ; un bouton « Administration » apparaît dans Mes documents ; `#/admin`.
- **Rubrique Système** :
  - version **2.NNN** (fusions dans `main` qui touchent `v2/`, calculée seule), avec le commit et sa date ;
  - date de démarrage du serveur, mémoire du serveur, version de Node ;
  - nombres : comptes, comptes d'essai et de développement, documents, équipes.
- Route `GET /api/admin/systeme` : 401 sans session, 403 si l'on n'est pas administrateur.

## Rubriques suivantes (à arbitrer)

1. **Personnes** : liste des comptes (adresse, nom, date de création, dernière connexion), et les administrateurs.
2. **Journaux** : connexions, invitations, courriers envoyés ou refusés, erreurs. La v1 a ses journaux `events-*.jsonl` ; ce serait à reprendre de zéro.
3. **IA (Margo)** : consommation en signes, quand l'IA arrivera dans la v2 (étape 8).
4. **Gestes d'administration** : désactiver un compte, renvoyer un lien, admettre une adresse (service fermé). À n'ajouter que sur un besoin constaté (règle 4).
