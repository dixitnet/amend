# Audit partiel avant fusion (2026-11-09)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 167783 signes envoyés, 3492 reçus (et 23854 de réflexion) ; réflexion `low` ; 57 s ; arrêt : stop
- Diff audité : `v2/` de `ea11227` à `74f9de7` (16 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot cohérent, bien découpé (domaine pur, adaptateur PostgreSQL, serveur, client, design, i18n, tests aux trois niveaux) ; les règles des équipes vivent au bon niveau et les frontières de couches sont respectées. Je relève surtout deux incohérences de comportement entre routes voisines (code de statut, libellé de rôle affiché dans un onglet d'équipe), un paramètre mort, une duplication de libellé de rôle entre client et serveur, et deux points à vérifier (index partiel, course légère). Les catalogues fr/en sont complets et symétriques.

## Constats
1. **[important]** grille 6, `v2/application/serveur/comptes.js:187` — `POST /api/equipes/:id/membres` rend `400` pour le refus `dernier-gestionnaire` (seul `droit-insuffisant` est mappé en 403), alors que la route voisine `PUT/DELETE …/membres/:id` (`v2/application/serveur/comptes.js:219`) le rend en `409`. Le cas est réel : rétrograder l'unique gestionnaire via POST. Proposer la même correspondance code→statut que la ligne 219.
2. **[important]** grille 9, `v2/application/client/App.jsx:373` — Dans un onglet d'équipe, la colonne rôle des documents affiche `nomDuRole(d.role)` : un gestionnaire verra « propriétaire » et non « gestionnaire », alors que `nomDuRoleEquipe` (App.jsx:169) existe précisément pour ce contexte et est utilisé dans le panneau des membres. Utiliser `nomDuRoleEquipe` quand `equipe` est défini.
3. **[mineur]** grille 4, `v2/application/serveur/comptes.js:129` — Le paramètre `dossierDe` de `equipes()` n'est jamais utilisé dans la fonction : code mort. Le retirer de la signature et de l'appel (ligne 379).
4. **[mineur]** grille 4, `v2/application/client/App.jsx:169` et `v2/application/serveur/comptes.js:107` — `nomDuRoleEquipe` est écrit deux fois (client et serveur), avec le même commentaire ; c'est un libellé de traduction, il a sa place dans `v2/i18n/` à côté de `libelleDuRole`, en une seule définition.
5. **[mineur]** grille 6, `v2/application/serveur/comptes.js:220` — `PUT/DELETE …/membres/:id` appelle `modifierMembre` sans `auteur`, alors que `POST` (ligne 191) le passe : la trace d'auteur des changements de rôle est incomplète selon la route. Passer `p.id`.
6. **[mineur]** grille 6, `v2/application/serveur/comptes.js:452-465` — La décision `deplacementDocument` est calculée sur des capacités lues avant l'exécution (`membre(source)`, `membre(destination)`) ; si le rôle du demandeur est révoqué entre les deux lectures, le document entre ou sort quand même. Course étroite et à faible impact, mais l'ordre « tout vérifié avant de rien changer » (commentaire de la ligne 361) n'est pas tenu ici. À noter, ou à resserrer en transaction si jugé utile.
7. **[question]** grille 6, `v2/adaptateurs/postgres/comptes.js:382` — `sortirDeLEquipe` utilise `on conflict (document, personne) where personne is not null`, qui suppose un index unique partiel sur `acces(document, personne) where personne is not null`. Cet index n'apparaît pas dans le diff ; s'il n'existe pas, l'insertion échouera à l'exécution. Vérifier qu'il est bien créé dans le schéma (le test T3 semble passer, donc probablement présent — à confirmer).
8. **[mineur]** grille 7, `v2/tests/services/equipes.test.js:184` — Aucun test ne couvre l'entrée d'un document dans un **dossier** d'équipe (`dossier` non nul, `entrerDansEquipe` ligne 372-377 de l'adaptateur), ni le refus `dernier-gestionnaire` via `POST …/membres` (lié au constat 1). Ajouter ces deux cas.

## Points de grille sans remarque
1, 2, 3, 8, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides
- 8 : citations valides

## Réponse de Claude

1. **Juste, corrigé.** Une seule correspondance du code de refus vers le statut (`statutDuRefus`) pour toutes les routes des membres et des accès. Test : `dernier-gestionnaire` par POST rend 409.
2. **Juste, corrigé.** Dans l'onglet d'une équipe, le rôle s'affiche par le libellé d'équipe (« gestionnaire »).
3. **Juste, corrigé.** Paramètre `dossierDe` retiré de `equipes()`.
4. **Juste, corrigé.** Une seule définition, `libelleDuRoleEquipe`, dans `v2/i18n/index.js`, utilisée par le client et le serveur.
5. **Juste, corrigé.** `PUT/DELETE …/membres/:id` passe l'auteur.
6. **Noté, laissé tel quel.** Pour qu'un document entre ou sorte à tort, il faudrait que le rôle du demandeur soit retiré dans les quelques millisecondes qui séparent la vérification de l'écriture. Un gestionnaire peut aussitôt corriger. Même montage que pour le rangement de 6c.
7. **Faux.** L'index `acces_document_personne` (unique, partiel, `where personne is not null`) existe depuis 6a (`adaptateurs/postgres/comptes.js`, schéma) ; le test T3 de sortie passe.
8. **Juste, corrigé.** Deux tests ajoutés : un document qui entre directement dans un dossier de l'équipe, et le refus `dernier-gestionnaire` par POST.

## Arbitrage de Sylvain

(À compléter.)
