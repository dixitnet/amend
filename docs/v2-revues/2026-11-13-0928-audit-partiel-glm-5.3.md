# Audit partiel avant fusion (2026-11-13)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 185373 signes envoyés, 2688 reçus (et 2798 de réflexion) ; réflexion `low` ; 22 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `6137222` (3 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Petit lot cohérent : un clic sur un passage commenté ouvre l'onglet « Commentaires » au lieu de la bulle. Le branchement dans l'adaptateur et l'application respecte les couches et les traductions. Deux points à regarder : un accès à l'état interne de l'extension de commentaires (`?.store`) dont le caractère public n'est pas établi, et un test qui n'a pas été complété pour vérifier ce que son commentaire annonce.

## Constats
1. **[question]** Grille 2 (API publique), `v2/adaptateurs/blocknote/index.jsx:615` — L'accès `editeur.getExtension(CommentsExtension)?.store` lit directement le magasin de l'extension ; selon les versions de BlockNote, `store` n'est pas documenté comme API publique (l'API officielle passe par `editor.comments` ou les points d'extension). À vérifier dans la documentation de la version épinglée et, si c'est interne, à remplacer par l'API publique ou à signaler en amont.
2. **[important]** Grille 7 (Tests), `v2/contrats/pile/relecture.test.js:140-141` — Le commentaire dit « Le clic ouvre la colonne de droite sur l'onglet "Commentaires" », mais le test se contente d'attendre la présence d'un fil dans la barre latérale : il n'y a ni clic sur le passage commenté, ni vérification que l'onglet s'ouvre. Le test ne vérifie pas ce qu'il annonce ; ajouter le clic et l'assertion sur l'onglet actif.
3. **[mineur]** Grille 4 (Simplicité), `v2/adaptateurs/blocknote/index.jsx:623` — Le nettoyage `typeof abonnement === 'function' ? abonnement() : abonnement?.unsubscribe?.()` est une défensive « au cas où » : la valeur de retour de `subscribe` est connue (une seule fondation, version épinglée) ; si elle n'est ni fonction ni objet avec `unsubscribe`, l'abonnement fuit silencieusement. Écrire la forme exacte et laisser le contrat la vérifier.
4. **[question]** Grille 6 (Correction), `v2/adaptateurs/blocknote/index.jsx:613-616` — L'effet lit `getExtension(CommentsExtension)` une seule fois au montage (déclenché par `magasin`) ; si l'extension n'est pas encore enregistrée à ce moment, l'abonnement n'a jamais lieu et le clic n'ouvre rien, sans erreur. À confirmer que l'extension est toujours présente avant ce moment-là dans le montage réel.
5. **[question]** Grille 6 (Droits / cas limite), `v2/application/client/Edition.jsx:495` — `surFilChoisi` est passé sans condition : si la personne n'a pas le service de commentaires (lecteur sans fil visible), un clic sur un passage commenté ouvrirait un onglet « Commentaires » vide ou indisponible. Vérifier le comportement pour un lecteur et, si nécessaire, ne passer le rappel que lorsque `commentaires` existe.

## Points de grille sans remarque
1, 3, 5 (hors constat 5 en question), 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. **Accepté, noté** : `store` est le champ que l'extension des commentaires de BlockNote rend elle-même (`key`, `store`, `userStore`), celui que lisent ses propres composants ; il n'a pas d'autre accès public à « quel fil est choisi ». À vérifier à chaque montée de BlockNote (veille).
2. **Faux** : le clic sur le passage commenté est fait quelques lignes plus haut dans le même test (`.bn-thread-mark … click()`), avant la vérification « pas de bulle » ; le fil n'est visible dans la colonne que si elle s'est ouverte sur l'onglet « Commentaires » (elle est fermée au départ du test).
3. **Accepté tel quel** : la forme du retour de `subscribe` n'est pas documentée par BlockNote ; les deux formes sont gérées pour ne pas laisser d'abonnement en cas de changement.
4. **Faux** : l'extension est donnée à la création de l'éditeur (liste `extensions`), donc présente avant tout effet ; vérifié par la campagne (sept scénarios de commentaires rejoués en local, au vert).
5. **Faux** : l'effet ne s'abonne que si le magasin des fils existe (`if (!magasin) return`), c'est-à-dire seulement pour qui voit les commentaires.

## Arbitrage de Sylvain

(À compléter.)
