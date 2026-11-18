# Audit partiel avant fusion (2026-11-18)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 291929 signes envoyés, 3405 reçus (et 6030 de réflexion) ; réflexion `low` ; 16 s ; arrêt : stop
- Diff audité : `v2/` de `debc6c2` à `74cb8a7` (9 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff ajoute trois fonctions : la correction des étiquettes dupliquées du menu « / », « Se déconnecter » au menu du format S, et le défilement vers le curseur d'une autre personne depuis son rond de présence. Les deux premières sont propres et testées. La troisième repose sur une recherche d'éléments DOM de BlockNote par leurs classes CSS internes et sur le nom affiché, ce qui contredit l'esprit de la règle 2 (API publique seulement) et casse au premier changement de rendu de BlockNote. Quelques points mineurs de documentation et d'accessibilité.

## Constats
1. **[important]** Grille 2 (API publique), `v2/adaptateurs/blocknote/index.jsx:706` — `allerAuCurseur` retrouve le curseur distant par les classes CSS internes de BlockNote (`.bn-collaboration-cursor__base`, `.bn-collaboration-cursor__label`), qui ne font partie d'aucune API publique : une montée de version de BlockNote qui renomme ou restructure ce rendu cassera silencieusement la fonction (le clic n'amènera plus rien, ou pire, au mauvais endroit). Le commentaire « sans rien importer de plus » montre que la fragilité était connue. Proposer : lire la position du curseur dans l'état de présence (awareness) côté Yjs — l'adaptateur Yjs tient déjà la connexion — et faire défiler via la vue ProseMirror ; à défaut, un test de contrat qui échoue si ces classes disparaissent.
2. **[mineur]** Grille 6 (cas limite), `v2/adaptateurs/blocknote/index.jsx:708` — l'appariement se fait sur le nom affiché (`String(nom).trim()`) : deux personnes portant le même nom mènent au premier curseur trouvé, et un nom dont l'étiquette diffère (espaces insécables, troncature future) ne matche plus. Même correction que A1 : la clé d'appariement devrait être l'identifiant de la personne, pas son libellé.
3. **[mineur]** Grille 4 (documentation trompeuse), `v2/application/client/commun.js:34-38` — le commentaire JSDoc décrivant `compteDe` (« Le compte, dans le bandeau… ») se retrouve orphelin au-dessus du nouveau JSDoc de `seDeconnecter` : deux blocs de documentation consécutifs, le premier ne décrit plus la fonction qui suit. Déplacer le commentaire de `compteDe` avec elle.
4. **[mineur]** Grille 9 / accessibilité, `v2/design/composants/Coquille.jsx:249-251` — l'`Avatar` devient un bouton natif mais porte `role="listitem"`, qui remplace le rôle implicite « button » : un lecteur d'écran n'annoncera pas l'élément comme activable, alors qu'il l'est (nouveau comportement introduit par ce diff). Vérifier au lecteur d'écran ; si besoin, envelopper le bouton dans l'élément de liste ou utiliser `aria-label` sans écraser le rôle.
5. **[question]** Grille 7, `v2/contrats/pile/editeur.test.js:559` — les `waitForTimeout(200)` fixes entre chaque lettre rendent le test dépendant de la vitesse de la machine (un rendu plus lent que 200 ms laisserait passer des étiquettes en trop). Existe-t-il un moyen d'attendre la mise à jour du menu (par exemple attendre que le nombre d'éléments change) plutôt qu'un délai arbitraire ?
6. **[question]** Grille 6, `v2/application/client/Edition.jsx:810` — `montrerMessage` est utilisé mais n'apparaît pas dans le diff ; je suppose qu'il existe déjà dans ce fichier, sinon c'est une référence non définie. À confirmer.

## Points de grille sans remarque
3, 5, 8, 10 (et 1 : rien hors du graphe des dépendances ; les classes CSS internes sont traitées au point 1 sous l'angle de l'API publique).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides

## Réponse de Claude

1. Juste, corrigé en partie : un contrat statique (`fondations-suivi.test.js`) épingle les deux classes de BlockNote utilisées ; une montée qui les renomme échoue là. Lire la position dans l'awareness demanderait d'étendre l'exception de la règle 1 pour `@y/prosemirror` (conversion de position) : non fait, voir 2.
2. Accepté : appariement par le nom affiché ; deux personnes de même nom mènent au premier curseur (noté au journal). L'identifiant demanderait le même élargissement que 1.
3. Juste, corrigé : le commentaire de `compteDe` est revenu au-dessus de sa fonction.
4. Juste, corrigé : le groupe de présence est un `role="group"` de boutons (plus de `listitem` posé sur un bouton) ; tests adaptés.
5. Juste, corrigé : plus d'attente fixe ; le test attend que le menu soit à jour (jamais plus d'étiquettes que d'éléments, toutes différentes), condition qui échoue sur le défaut d'origine.
6. Confirmé : `montrerMessage` est importé en tête d'`Edition.jsx` (ligne 18).

## Arbitrage de Sylvain

Fusion demandée par Sylvain le 18/11/2026.
