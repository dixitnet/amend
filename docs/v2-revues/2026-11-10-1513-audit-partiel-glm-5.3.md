# Audit partiel avant fusion (2026-11-10)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 155327 signes envoyés, 2928 reçus (et 7413 de réflexion) ; réflexion `low` ; 40 s ; arrêt : stop
- Diff audité : `v2/` de `d99baba` à `5b46486` (19 fichiers)
- Statut : avis reçu ; répondu par Claude ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot cohérent : remplacement des boîtes natives du navigateur (`window.confirm`/`alert`) par des composants Mantine, avec les réglages décidés dans l'ADR 0008 et les catalogues mis à jour (typographie française des textes, nouvelles clés). Les couches sont respectées : la confirmation et les messages passagers vivent dans le design, l'application ne fournit que textes traduits et fonctions de rappel. Quelques points mineurs : un commentaire devenu faux dans l'outil de test, une course possible dans `useConfirmation`, un picto dont l'existence dans la table n'est pas établie, et un commentaire de doc mal placé.

## Constats
1. **[mineur]** Grille 7 — `v2/contrats/pile/outils.mjs:90` : le commentaire dit « comme Docs : " Annuler ", puis l'action » alors que la fonction clique le **dernier** bouton (`fenetre.getByRole('button').last()`, ligne 94), c'est-à-dire « Confirmer » (Annuler est premier dans `FenetreConfirmation`, `Coquille.jsx:350-354`). Le commentaire décrit l'ordre des boutons, pas ce que fait la fonction ; à reformuler pour éviter qu'un futur changement d'ordre casse silencieusement le test (le clic sur « Annuler » passerait inaperçu).
2. **[mineur]** Grille 6 — `v2/application/client/App.jsx:229` : si `confirmer()` est appelé alors qu'une demande est déjà en attente, l'ancienne promesse n'est jamais résolue (son `repondre` est écrasé par `setDemande`) ; de même au démontage du composant. Cas peu probable ici (une seule fenêtre à la fois), mais un `await` pourrait rester suspendu indéfiniment. Proposer de résoudre la demande en cours à `false` avant d'en poser une nouvelle.
3. **[question]** Grille 6 — `v2/design/composants/PageEditionS.jsx:87` : `PictoDe role="autres"` remplace `IconDots`, mais le diff de `v2/design/pictos.jsx` (lignes 30-54) n'ajoute que `retour: IconArrowBack` ; le rôle `autres` n'apparaît pas dans la table visible. S'il manque, le bouton du menu « … » n'a plus de picto (PictoDe rend `null`, `pictos.jsx:57-58`). À vérifier ; s'il manque, l'ajouter à la table.
4. **[mineur]** Grille 4 — `v2/design/composants/Coquille.jsx:330-334` : le commentaire « Une fenêtre de saisie d'un nom (remplace la boîte du navigateur) » est resté au-dessus du nouveau bloc de documentation de `FenetreConfirmation` ; il décrit `FenetreSaisie` (ligne 362) et est désormais trompeur. Le déplacer sur sa fonction.
5. **[mineur]** Grille 7 — `v2/contrats/pile/comptes.test.js:100` : seul le chemin « confirmer » est testé ; aucune pile ne vérifie qu'« Annuler » dans `FenetreConfirmation` annule bien l'action (le document n'est pas supprimé). Un test du refus compléterait ce qui change.
6. **[question]** Grille 10 — `v2/package.json:20` : dépendance nouvelle `@mantine/notifications` 9.7.5. C'est un paquet Mantine (MIT), conforme à l'ADR 0008 (« Mantine est la source ») ; je le note pour la revue de licence, sans défaut.

## Points de grille sans remarque
1, 2, 3, 5, 8, 9

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides

## Réponse de Claude

- **1 : juste, mineur.** Commentaire reformulé (`outils.mjs`) : il dit que la fonction clique le dernier bouton, l'action.
- **2 : juste, mineur.** Une nouvelle demande répond « non » à celle qui attendait (`useConfirmation`).
- **3 : faux.** Le rôle `autres` existe dans la table (`design/pictos.jsx`, `autres: IconDots`) ; le menu « … » garde son picto (pile verte).
- **4 : juste, mineur.** Commentaire remis sur `FenetreSaisie`.
- **5 : juste, mineur.** Le test de suppression passe d'abord par « Annuler » et vérifie que rien ne se passe.
- **6 : sans suite.** Paquet de Mantine, licence MIT, contrat des licences vert.

## Arbitrage de Sylvain

(À compléter.)
