# Audit partiel avant fusion (2026-11-14)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 229203 signes envoyés, 2569 reçus (et 2210 de réflexion) ; réflexion `low` ; 6 s ; arrêt : stop
- Diff audité : `v2/` de `b986a9e` à `ce5c2bc` (4 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Diff très petit : un correctif de design (la pastille de nombre du volet droit rognée par son bouton au format S), son test de pile, la mise à jour de l'ADR 0008 et un `className` posé dans le composant de présentation. L'ensemble est cohérent avec les décisions de Sylvain du 14/11/2026. Deux points à relever : la nouvelle règle CSS ne porte pas la clé de réglage au format prévu par l'ADR 0008 (contrat statique probablement en échec), et le test ferme un seul contexte sur trois et ne vérifie qu'un bord de la pastille.

## Constats
1. **[important]** Grille 1/20 (design décidé), `v2/design/feuilles/telephone.css:26` — La nouvelle règle `.amend-bandeau-volet-droit { overflow: visible; }` est commentée avec la référence à Sylvain, mais ne porte pas la marque `/* réglage : css.telephone.bandeau */` qu'exige l'ADR 0008 révisée (« chaque règle porte la clé du réglage »), vérifiée par le contrat statique `contrats/statiques/design-decide.test.js`. La règle risque d'être rejetée par le contrat, ou de passer inaperçue à la prochaine relecture des réglages. Proposer d'ajouter la marque `/* réglage : css.telephone.bandeau */` au-dessus de la règle (la table de l'ADR, elle, est bien mise à jour, ligne 152).
2. **[mineur]** Grille 7 (tests), `v2/contrats/pile/telephone.test.js:346` — Le test ne ferme que le contexte de `p` (Paule) ; les contextes de `c` (Carla, ligne 331) et `e` (Edith, ligne 335), s'ils en créent un, ne sont jamais fermés, contrairement au motif des tests voisins (lignes 320-323). Fuite de ressources de navigateur à l'échelle de la suite. Proposer de fermer `c` et `e` comme `p`.
3. **[mineur]** Grille 7 (tests), `v2/contrats/pile/telephone.test.js:345` — La vérification `boite.x + boite.width <= 390` ne couvre que le bord droit de la pastille, alors que le défaut constaté était une pastille « coupée en haut à droite » ; le rognage vertical n'est testé qu'indirectement (via `overflow` du bouton, ligne 343), sans vérifier qu'aucun ancêtre ne la rogne non plus. Proposer de vérifier aussi `boite.y >= 0` (et idéalement le débordement des ancêtres du bandeau).
4. **[question]** Grille 7 (tests), `v2/contrats/pile/telephone.test.js:335` — `ouvrir('Edith', doc)` est appelé sans `nav` ni `pile.url`, contrairement à `ouvrirSur` des lignes 328 et 331 : s'agit-il d'une fonction différente (raccourci local) ou d'un appel incomplet ? À vérifier dans le fichier complet ; si c'est une coquille, le test échouera à l'exécution.

## Points de grille sans remarque
1 (couches, hors le point design ci-dessus), 2, 3, 5, 8, 9, 10.

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides

## Réponse de Claude

1. *Faux*, avec la preuve : la règle est dans le bloc `/* réglage : css.telephone.bandeau */` (une clé, un commentaire, contrat `design-decide.test.js`), et le contrat passe.
2. *Juste*, corrigé : les trois contextes sont fermés.
3. *Juste*, corrigé : le test vérifie aussi `y >= 0` et que la pastille est bien celle qui reçoit le point en son centre (aucun ancêtre ne la recouvre ni ne la rogne).
4. *Faux*, avec la preuve : `ouvrir` est le raccourci local du fichier (ligne 13, format S), `ouvrirSur` l'ouverture générale ; le test passe.

## Arbitrage de Sylvain

(À compléter.)
