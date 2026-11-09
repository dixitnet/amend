# Audit partiel avant fusion (2026-11-09)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 219655 signes envoyés, 4378 reçus (et 17525 de réflexion) ; réflexion `low` ; 42 s ; arrêt : stop
- Diff audité : `v2/` de `e5b0b99` à `4cfce17` (34 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot cohérent dans l'ensemble : les règles du partage sont bien au domaine, le dépôt en adaptateur, les composants Mantine sans réglage, les catalogues fr/en complets. Le principal défaut réel est le contrôle d'origine (CSRF), placé après la table des routes et donc inopérant pour elles. S'y ajoutent la langue des courriers codée en dur, une condition de course sur le dernier propriétaire, et quelques points à éclaircir (Mailgun sans ADR, commentaires orphelins à la suppression).

## Constats
1. **[grave]**, grille 5 (sécurité), `v2/application/serveur/index.js:298`–`v2/application/serveur/index.js:301` — Le contrôle `origineAdmise` est exécuté *après* le dispatch dans la table des routes : toute route de `routes` (dont `POST /api/dev/session`, qui pose un cookie de session, et `POST /api/dev/acces`) court-circuite la vérification par `return await route(...)`. La protection CSRF annoncée ne s'applique donc qu'aux routes du partage et des commentaires. Proposer : déplacer le contrôle avant le lookup de route, pour toute requête `/api/` qui modifie.
2. **[important]**, grille 9 (traductions), `v2/application/serveur/comptes.js:79` — Les courriers sont envoyés en français codé en dur (`creerTraducteur('fr')`), contrairement aux règles 23 et 28 (la langue de la personne, pas une constante) ; le commentaire renvoie à « l'étape 6b » mais ce renoncement n'est pas inscrit au registre (`docs/v2-renoncements.md`). Proposer : soit l'entrée au registre avec la condition de retour, soit la langue de la personne dès maintenant.
3. **[important]**, grille 6 (correction), `v2/application/serveur/comptes.js:273`–`v2/application/serveur/comptes.js:283` et `v2/adaptateurs/postgres/comptes.js:180` — Le contrôle « dernier propriétaire » (lecture du compte, puis `refusAcces`, puis écriture) n'est pas transactionnel : deux retraits concurrents peuvent laisser un document sans propriétaire. Proposer : faire le retrait conditionnel en une requête SQL (`delete ... where ... and (select count(*) ...) > 1`) ou dans une transaction.
4. **[question]**, grille 1/10, `v2/adaptateurs/courrier/index.js:1` — Mailgun est un service externe nouveau, qui ne figure ni dans la table des couches (§ 2) ni dans une ADR, et je ne vois pas de décision de Sylvain à son sujet (choix du fournisseur, zone européenne). L'adaptateur lui-même est sobre et n'ajoute pas de dépendance npm. À confirmer : une ADR « courrier » (ou une note de décision) est-elle prévue ?
5. **[question]**, grille 6, `v2/adaptateurs/postgres/index.js:142` — `supprimerFilsDuDocument` n'efface que `amend.fils` ; si `amend.commentaires` n'a pas de clé étrangère `on delete cascade` vers `fils`, les commentaires d'un document supprimé deviennent orphelins. Le schéma des commentaires n'est pas dans le diff : vérifier et, à défaut, effacer aussi `commentaires`.
6. **[mineur]**, grille 6, `v2/application/serveur/comptes.js:216`–`v2/application/serveur/comptes.js:218` — La suppression efface d'abord y/hub, puis les commentaires, puis la ligne PostgreSQL : si l'une des écritures en base échoue, le contenu est déjà détruit mais le document reste listé. Proposer : supprimer d'abord la ligne du document (transaction), puis y/hub, quitte à laisser une branche orpheline en cas d'échec (moins grave).
7. **[mineur]**, grille 4 (simplicité), `v2/design/composants/EcranCourriel.jsx:6` — La prop `enPlus` n'est utilisée par aucun appelant (`Connexion` dans `App.jsx` rend l'écran de développement à côté, séparément) : option « au cas où ». Proposer : la retirer.
8. **[mineur]**, grille 3 (redondance), `v2/application/client/App.jsx:156` et `v2/application/serveur/comptes.js:80` — `nomDuRole` (et `decoder`, déjà présente dans `commentaires.js`) est écrit deux fois, client et serveur. La variante serveur renvoie en plus `undefined` pour un rôle inconnu (le client a un repli `?? role`). Proposer : une seule fonction dans le domaine ou l'i18n, rendant le libellé d'un code de rôle.
9. **[mineur]**, grille 6, `v2/application/serveur/comptes.js:122` — La limite de 5 liens par quart d'heure est vérifiée puis le jeton créé, sans verrou : des requêtes simultanées dépassent la limite. Faible gravité (le jeton reste à usage unique) ; à noter ou à accepter.

## Points de grille sans remarque
8 (exports et NFC : titre et courriel normalisés, rien de parasite), 10 (aucune dépendance npm nouvelle).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides
- 8 : citations valides
- 9 : citations valides

## Réponse de Claude

1. **Juste, corrigé (grave).** Le contrôle d'origine passe désormais avant toute route `/api/` qui modifie, celles de la table principale comprises ; test ajouté (route de session de développement refusée depuis une autre origine).
2. **Juste en partie, noté.** Les courriers partent en français tant que la langue de la personne n'est pas enregistrée (étape 6b) : provisoire inscrit au plan de l'étape 6a et dans l'ADR 0010 ; ce n'est pas un renoncement.
3. **Juste, corrigé.** `modifierAcces` change ou retire un accès en transaction, propriétaires verrouillés : deux retraits simultanés laissent toujours un propriétaire (test ajouté).
4. **Question, réglée.** Mailgun est le fournisseur de la v1 (zone européenne), décision antérieure de Sylvain ; ADR 0010 « Courrier » écrite.
5. **Faux.** `amend.commentaires.fil` est déclaré `references amend.fils (id) on delete cascade` (`adaptateurs/postgres/index.js`) : effacer les fils efface leurs commentaires et réactions.
6. **Juste, corrigé.** La suppression efface d'abord la base (le document disparaît pour tous), puis les fils, puis le contenu dans y/hub ; un échec de y/hub est journalisé.
7. **Juste, corrigé.** Option `enPlus` retirée.
8. **Juste, corrigé.** Une seule fonction, `libelleDuRole` (i18n), pour le client et le serveur.
9. **Juste, accepté.** La limite de 5 liens par quart d'heure peut être dépassée de quelques unités par des requêtes simultanées ; chaque jeton reste à usage unique et de courte durée.

Après corrections : 145 tests rapides ; pile complète relancée.


## Arbitrage de Sylvain

(À compléter.)
