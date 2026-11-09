# amend.ink v2 : plan de l'étape 6c, « Dossiers personnels et Partagé avec moi »

Statut : **lancé** le 09/11/2026 (« go » de Sylvain), d'après l'étude arbitrée `docs/v2-etude-dossiers-equipes.md`.

## Ce qui est décidé

- Modèle du serveur de fichiers d'entreprise, sans référence à Docs pour cette question (Sylvain, 09/11/2026) : **Mes documents**, **Partagé avec moi**, puis les dossiers d'équipe (étape 6d).
- **On ne partage que des documents**, partout (réponse 1 à la question complémentaire) : les dossiers de Mes documents sont un rangement personnel ; pour travailler à plusieurs sur un dossier, on prendra un dossier d'équipe (6d).
- Au plus simple.

## Contenu

1. **Domaine** (`domaine/dossiers.js`) :
   - nom de dossier valide ;
   - déplacement d'un dossier sans boucle ;
   - section d'un document : Mes documents s'il est rangé chez moi, sinon Partagé avec moi ;
   - qui range un document : son propriétaire, s'il est rangé chez lui ;
   - se retirer d'un document : jamais le dernier propriétaire.
2. **PostgreSQL** :
   - table `amend.dossiers` (nom, parent, personne) ;
   - sur `amend.documents` : `emplacement` (la personne dans le Mes documents de qui il est rangé, d'abord son créateur) et `dossier` ;
   - sur `amend.acces` : `auteur` (qui a partagé, pour « Partagé avec moi ») ;
   - un dossier ne se supprime que vide (vérifié par la base).
3. **Serveur** :
   - `GET /api/documents` rend mes documents et mes dossiers, et ce qui est partagé avec moi (avec qui l'a partagé et quand) ;
   - routes des dossiers : `POST /api/dossiers`, `PUT /api/dossiers/:id` (nom, parent) et `DELETE /api/dossiers/:id` ;
   - ranger un document : `PUT /api/documents/:doc/dossier` ;
   - se retirer d'un document : `DELETE /api/documents/:doc/moi`.
4. **Écrans techniques** :
   - deux onglets, Mes documents et Partagé avec moi ;
   - un chemin de dossiers ;
   - créer un document ou un dossier là où l'on est ;
   - renommer, déplacer et supprimer (vide) un dossier ;
   - déplacer un document ;
   - se retirer d'un document partagé ;
   - adresses `#/dossiers/<id>` et `#/partages` ;
   - le design suit en 6b.
5. **Tests** par couche ; un parcours sur la pile.

## Hors périmètre

Dossiers d'équipe (6d) ; partage d'un dossier ; raccourcis ; corbeille ; restriction d'un sous-dossier (non, arbitrage).

## Avancement (09/11/2026)

- **Domaine** (`domaine/dossiers.js`) : nom de dossier (80 signes au plus, comme un nom de personne), déplacement sans boucle, section d'un document, rangement par le propriétaire (nouvelle capacité `ranger`), retrait sauf du dernier propriétaire.
- **PostgreSQL** : table `amend.dossiers` ; `emplacement` et `dossier` sur les documents (migration : l'emplacement des documents existants est leur créateur) ; `auteur` sur les accès, repris de l'invitation à la connexion.
- **Serveur** : `GET /api/documents` rend `{ dossiers, documents }` (chaque document avec sa section) ; routes des dossiers ; ranger ; se retirer. Un copropriétaire voit le document dans Partagé avec moi.
- **Écrans** : onglets Mes documents et Partagé avec moi, chemin, créer un dossier ou un document là où l'on est, renommer, déplacer, supprimer un dossier vide, déplacer un document, se retirer. Les noms se saisissent par la boîte de dialogue du navigateur, en attendant le design (6b). Composants de design : `ListeDocuments` refait, `Choix` ajouté (lot à part).
- **Tests** : 159 rapides, 40 sur la pile (dont 2 parcours : dossiers ; Partagé avec moi).
