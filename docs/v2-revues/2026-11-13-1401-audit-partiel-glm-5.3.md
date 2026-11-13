# Audit partiel avant fusion (2026-11-13)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 212531 signes envoyés, 2402 reçus (et 2651 de réflexion) ; réflexion `low` ; 18 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `f090626` (7 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Diff modeste : picto « P » pour le style Paragraphe, étiquette Badge pour la portée de Margo, défilement automatique de la conversation. L'ensemble respecte les couches et l'ADR 0008 (réglages notés dans la table). Deux points à vérifier : le rôle exact de la nouvelle entrée `paragraphe` dans `TEXTES_EDITEUR` (risque d'entrée parasite dans la liste des types de bloc), et le placement du comportement de défilement dans un composant de présentation. Aucun test n'accompagne ces changements.
## Constats
1. **[question]** Grille 6 (correction), `v2/application/client/aidesEdition.jsx:48` et `v2/adaptateurs/blocknote/index.jsx:193-199`. L'entrée `paragraphe` ne contient que `picto`, sans `titre`. Si la liste `nos` de `typesDeBloc` (dont le début n'est pas dans le diff) contient `['paragraphe', …]`, le filtre `textes?.[cle]` la laisse passer (l'objet est truthy) et produit un élément avec `name: undefined`, en doublon de celui de BlockNote. Vérifier que `paragraphe` n'est pas dans cette liste ; sinon l'exclure du filtre (exiger `titre`).
2. **[mineur]** Grille 1 / règle 16, `v2/design/composants/PanneauMargo.jsx:33-35`. Le défilement automatique (`scrollIntoView`) est un comportement d'interaction, pas de l'apparence, placé dans un composant de présentation qui « rend de l'apparence ». Acceptable en l'état (le repère `fin` est un détail de rendu), mais si le comportement s'enrichit (focus, position mémorisée), il devra remonter dans l'application. À noter, pas nécessairement à changer.
3. **[mineur]** Grille 4 (simplicité), `v2/design/composants/PanneauMargo.jsx:74-76`. Un `Group` Mantine autour d'un seul `Badge` est un emballage sans effet ; `<Badge …>{portee}</Badge>` suffit. Proposer de le retirer.
4. **[mineur]** Grille 4, `v2/design/composants/PanneauMargo.jsx:29`. La valeur par défaut `visible = true` est une option « au cas où » : `Edition.jsx:452` passe toujours la prop. Proposer de la rendre obligatoire (pas de défaut).
5. **[mineur]** Grille 7 (tests), `v2/adaptateurs/blocknote/index.jsx:196-198` et `v2/design/composants/PanneauMargo.jsx:33-35`. Le remplacement du picto du paragraphe et le défilement automatique ne sont couverts par aucun test du diff. Un test d'extension/contrat vérifiant que l'élément `paragraph` de la palette porte bien notre picto (et un seul élément « Paragraphe ») suffirait.
## Points de grille sans remarque
3, 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. **Faux** : la liste `nos` ne contient que `titre` et `sousTitre` ; `paragraphe` ne sert qu'à remplacer le picto de l'entrée de BlockNote. Vérifié par un test de la pile (un seul « Paragraphe » dans le menu).
2. **Accepté, noté** : amener la fin de l'échange à l'écran reste un détail de rendu ; s'il s'enrichit, il remontera dans l'application.
3. **Faux** : dans une pile de Mantine (`Stack`), un enfant s'étire sur toute la largeur ; le `Group` garde l'étiquette à la largeur de son texte.
4. **Accepté tel quel** : les tests de design rendent le panneau sans cette propriété ; par défaut, le panneau est visible.
5. **Juste**, corrigé pour le picto : test de la pile « palette : le style Paragraphe une seule fois, avec notre picto ». Le défilement n'est pas testé : il demande un échange avec Margo, donc de l'IA ou un faux serveur ; vérifié à la main sur un volet vide seulement, à confirmer par Sylvain à l'usage.

## Arbitrage de Sylvain

(À compléter.)
