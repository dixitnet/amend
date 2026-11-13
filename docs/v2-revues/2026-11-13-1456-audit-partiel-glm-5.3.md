# Audit partiel avant fusion (2026-11-13)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 324679 signes envoyés, 3952 reçus (et 8835 de réflexion) ; réflexion `low` ; 41 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `457ae54` (29 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le lot « polices de l'instance » est bien découpé : domaine pur, adaptateur PostgreSQL, serveur, client, design, catalogues et tests aux deux niveaux. Le principal défaut est un garde-fou de suppression incomplet : seuls les modèles dont les *écarts* citent la famille sont protégés, pas ceux qui en héritent par leur base. Viennent ensuite des conditions de course bénignes sur l'envoi et la suppression, un corps de requête non interrompu au-delà de la limite, et quelques assemblages de listes à la main dans l'interface. Les couches, l'API publique et les licences sont respectées ; les changements de la campagne de test sont cohérents avec la référence.

## Constats
1. **[important]** Grille 6 — `v2/adaptateurs/postgres/comptes-polices.js:37`, `v2/application/serveur/polices.js:98` : `modelesUtilisantPolice` ne cherche que `ecarts->>'police'` ; un modèle d'équipe (ou de l'instance) qui hérite de la police de sa base sans l'écrire dans ses écarts n'est pas trouvé, et le dernier fichier d'une famille utilisée peut donc être supprimé, cassant silencieusement la composition des modèles dérivés. Proposer de rechercher aussi la police du modèle *résolu* (calculer les modèles complets, comme le fait `sources()`), ou de refuser la suppression dès qu'une base l'utilise.
2. **[mineur]** Grille 6 — `v2/application/serveur/polices.js:85`, `v2/application/serveur/polices.js:98` : le contrôle de doublon (POST) et le contrôle « dernier fichier d'une famille utilisée » (DELETE) lisent la liste avant l'opération, sans contrainte d'unicité en base ni de verrou : deux envois simultanés du même style passent tous deux. Ajouter une contrainte unique `(famille, style, graisse)` dans le schéma et rattraper l'erreur, ou sérialiser ces opérations.
3. **[mineur]** Grille 6 — `v2/application/serveur/polices.js:22` à `v2/application/serveur/polices.js:27` : quand la limite est dépassée, `lireOctets` résout `null` mais ne détruit pas la requête : le serveur continue de recevoir les octets jusqu'au bout (jusqu'à la taille que veut envoyer le client). Faire `req.destroy()` (ou renvoyer la réponse et couper) dès le dépassement.
4. **[mineur]** Grille 9 — `v2/application/client/Modeles.jsx:371`, `v2/application/client/Modeles.jsx:388`, `v2/application/client/Modeles.jsx:426` : les listes de modèles et de messages sont assemblées à la main (`join(', ')`, `join(' ')`) au lieu d'un formatage ICU/`Intl` (règle 26 : pas de phrase assemblée par morceaux ; `Intl.ListFormat` existe pour cela). Passer la liste en paramètre nommé et la formater dans le catalogue, ou utiliser `Intl.ListFormat`.
5. **[mineur]** Grille 7 — `v2/tests/services/modeles.test.js:383` à `v2/tests/services/modeles.test.js:458` : le parcours HTTP couvre l'essentiel, mais ni le refus `413 police-trop-lourde` par la route (seul le domaine est testé), ni le repli du nom de fichier quand l'en-tête `x-amend-fichier` est absent ou invalide (`v2/application/serveur/polices.js:87`). Ajouter ces deux cas au test de service.
6. **[question]** Grille 6 — `v2/application/client/Modeles.jsx:392` à `v2/application/client/Modeles.jsx:396` : dans `supprimer`, si le fichier a disparu de `donnees.familles` entre-temps (supprimé dans un autre onglet), `fichier` est `undefined` et `fichier.fichier` lève une exception avant la confirmation. À vérifier : un garde `if (!fichier) return` suffirait.
7. **[question]** Grille 5 — `v2/application/serveur/polices.js:54` à `v2/application/serveur/polices.js:66` : tout personne connectée (lectrice, correctrice extérieure) peut télécharger les polices de l'instance. Le commentaire du fichier le dit et l'export navigateur en a besoin, mais je ne trouve pas la décision de Sylvain correspondante : à confirmer, ou à restreindre aux personnes ayant accès à au moins un document si l'on veut fermer la porte.

## Points de grille sans remarque
1 (couches), 2 (API publique), 3 (redondance), 8 (exports/typographie), 10 (licences).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides

## Réponse de Claude

1. **Juste**, corrigé : la suppression gardée cherche maintenant les modèles dont la police **résolue** (écarts et héritage) est la famille, par le service des modèles. Test : un modèle d'équipe qui dérive du modèle de l'instance, sans écrire la police dans ses écarts, bloque la suppression et figure dans le message.
2. **Juste**, corrigé : index unique `(famille, style, graisse)` en base, insertion `on conflict do nothing` ; deux envois simultanés du même style : un seul passe (test).
3. **Juste**, corrigé : au dépassement, la connexion reçoit un délai court au lieu de lire le reste. Le refus 413 est testé, ou la connexion est coupée par le serveur (les deux sont acceptés par le test, selon le moment où le client finit d'envoyer).
4. **Juste**, corrigé : les listes de noms passent par `Intl.ListFormat`. Le message d'envoi de plusieurs fichiers reste une suite de phrases séparées par une espace, chacune venant du catalogue.
5. **Partiellement juste** : le refus 413 est testé ; le repli du nom de fichier (en-tête absent) ne l'est pas, c'est un cas du serveur à trois lignes sans règle à protéger.
6. **Juste**, corrigé : si le fichier a disparu entre-temps, la liste se recharge.
7. **Question pour Sylvain** : aujourd'hui, toute personne connectée peut télécharger les polices de l'instance, parce que l'export PDF se fait dans son navigateur et qu'il lui faut les fichiers (c'est la même chose pour les modèles, que voit toute personne qui exporte). Restreindre aux personnes qui ont un document ouvert ne protège rien de plus : les polices sont sous licence ouverte ou choisies par les administrateurs. Je propose de laisser ainsi.

## Arbitrage de Sylvain

(À compléter.)
