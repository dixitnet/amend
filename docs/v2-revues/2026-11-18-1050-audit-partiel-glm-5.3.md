# Audit partiel avant fusion (2026-11-18)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 342719 signes envoyés, 4584 reçus (et 9090 de réflexion) ; réflexion `low` ; 68 s ; arrêt : stop
- Diff audité : `v2/` de `ec141ab` à `2a5e751` (20 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot cohérent : mise en forme des courriers (design), renvoi d'invitation, plafond anti-abus, avec tests aux trois niveaux. Les valeurs de design sont dans `v2/design/` et notées à l'ADR 0008, les textes passent par les catalogues. Les principaux écarts sont des incohérences de traitement d'échec du courrier entre documents et équipes, et quelques valeurs de design du gabarit non couvertes par la table de l'ADR.

## Constats
1. **[important]** Grille 6 (correction), `v2/application/serveur/comptes-equipes.js:118` et `v2/application/serveur/comptes-equipes.js:132` : dans le chemin « équipe », `courrier.envoyer` (ligne 118) et `envoyerLien` (ligne 132) sont attendus sans rattrapage, alors que le chemin « document » (`comptes-acces.js:96-109, 115-120`) attrape l'échec ou annule l'invitation. Un échec Mailgun côté équipe lève une exception non gérée (réponse 500 sans code) et laisse une invitation « en attente » orpheline — exactement ce que le nouveau code du document veut éviter. Proposer le même rattrapage et la même annulation.
2. **[important]** Grille 6 (cas limite), `v2/application/serveur/comptes-acces.js:149-151` : au renvoi, `comptes.inviter` est appelé avant l'envoi ; si le courrier échoue (502), l'invitation reste avec une date de création réinitialisée — validité prolongée de 7 jours sans qu'aucun courrier ne soit parti, et rôle éventuellement changé. De même à la ligne 113-118 : réinviter une adresse déjà en attente avec un autre rôle, puis échec du courrier, change le rôle de l'invitation en base bien que la réponse soit 502. Proposer d'envoyer d'abord, puis de réenregistrer.
3. **[mineur]** Grille 1/9 (ADR 0008), `v2/design/reglagesCourrier.js:17-27` : plusieurs valeurs du gabarit ne figurent pas dans la table « Réglages décidés » de l'ADR 0008 (`courrier.page` : marge 24 px ; `courrier.carte` : marge intérieure 28×30 px ; `courrier.titre` : graisse 600 et marge 18 px, alors que la table dit « gras » ; `courrier.marque` : marge 14 px ; `courrier.trait` : marge 16 px). Le commentaire de `reglagesCourrier.js:5` renvoie même à une clé `courrier.gabarit` qui n'existe pas dans la table. Si le contrat statique les accepte, c'est qu'il est incomplet ; proposer de compléter la table (ou de faire porter chaque valeur par la clé existante).
4. **[mineur]** Grille 4 (redondance), `v2/adaptateurs/courrier/index.js:13-14` et `v2/design/courrier.js:8-9` : la fonction `echapper` est écrite deux fois à l'identique. Les couches interdisent l'import entre adaptateur et design, mais elle pourrait vivre dans le domaine (fonction pure) que les deux importent. À proposer, ou à noter comme accepté.
5. **[mineur]** Grille 4, `v2/adaptateurs/courrier/index.js:25-32` : le HTML de repli sans `gabarit` n'est plus utilisé par l'application (qui passe toujours le gabarit, `comptes.js:119`) ; il ne sert qu'aux essais et n'est pas couvert par un test. Vérifier s'il reste un appelant ; sinon, le retirer (sobriété) ou le tester.
6. **[mineur]** Grille 6 (fuite de ressource), `v2/application/serveur/comptes.js:124-131` : `envoisRecents` ne supprime jamais les entrées des personnes qui n'envoient plus (le filtre ne s'exécute qu'à un nouvel appel de `envoiAutorise`) ; la carte croît sans borne avec le nombre de personnes ayant déjà partagé. Proposer un nettoyage périodique ou un plafond de taille.
7. **[mineur]** Grille 9, `v2/i18n/fr.json:90` et `v2/i18n/en.json:90` : le message « courrier-non-envoye » dit « l'invitation n'a pas été créée », faux dans le cas du renvoi (elle existe déjà, et a même été prolongée — voir A2). Proposer un libellé neutre (« Le courrier n'a pas pu être envoyé. Réessayez dans un moment. »).
8. **[question]** Grille 1, `v2/adaptateurs/courrier/index.js:27-32` : le HTML de repli (balisage `<p>`, `<a>`, `<br>`) vit dans l'adaptateur, hors `v2/design/`. Il ne porte aucune valeur d'apparence, donc la règle 17 (couleurs, tailles, styles) n'est pas en cause, mais la structure du courrier est désormais décidée par le design (`design/courrier.js`). À clarifier : ce repli est-il un reste d'essai à retirer (voir A5) ou une structure volontairement minimale ?
9. **[question]** Grille 6 (condition de course), `v2/application/serveur/comptes.js:125-131` : `envoiAutorise` puis `noterEnvoi` ne sont pas atomiques ; des requêtes concurrentes d'une même personne peuvent dépasser le plafond de quelques unités. À une échelle d'abus réel, probablement sans importance — à confirmer ou à accepter.

## Points de grille sans remarque
8 (exports propres et typographie), 10 (licences : aucune dépendance nouvelle).

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

1. Juste, corrigé : côté équipe, un courrier d'accès qui échoue est écrit au journal (le membre est ajouté) et une invitation d'équipe n'est créée que si le courrier part (502 `courrier-non-envoye` sinon).
2. Juste, corrigé : le courrier part d'abord ; l'invitation est créée, ou renouvelée (date, rôle, auteur), seulement ensuite. Un échec ne change plus rien en base, pour une invitation neuve comme pour un renvoi ou un nouveau rôle.
3. Juste, corrigé : la table de l'ADR 0008 donne maintenant les marges et la graisse de chaque ligne `courrier.*` ; le commentaire de `reglagesCourrier.js` ne cite plus de clé inexistante. Le contrat compare les clés, pas le texte des lignes.
4. Accepté : `echapper` écrite deux fois (adaptateur et design), deux lignes ; les couches interdisent l'import entre elles et un partage par le domaine serait disproportionné.
5. Accepté : le HTML de repli de l'adaptateur sert aux essais (le test du dépôt des comptes l'appelle sans gabarit) ; structure volontairement minimale, sans valeur d'apparence.
6. Juste, corrigé : au-delà de 500 personnes suivies, celles qui n'ont rien envoyé dans l'heure sont retirées de la carte.
7. Juste, corrigé : message neutre « Le courrier n'a pas pu être envoyé. Réessayez dans un moment. » (français et anglais).
8. Voulu, voir 5.
9. Accepté : Node n'exécute qu'une tâche à la fois ; seules les requêtes qui se croisent pendant un envoi peuvent dépasser le plafond de quelques unités, sans conséquence contre un abus.

## Arbitrage de Sylvain

Fusion demandée par Sylvain le 18/11/2026.
