# Audit partiel avant fusion (2026-11-14)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 231883 signes envoyés, 1637 reçus (et 3002 de réflexion) ; réflexion `low` ; 7 s ; arrêt : stop
- Diff audité : `v2/` de `9fca869` à `ef1fd88` (4 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot de design conforme à la décision de Sylvain du 14/11/2026 : harmonisation des deux tiroirs du format S en onglets à pictos seuls, avec le nom de l'onglet ouvert en titre. Le réglage est bien inscrit dans l'ADR 0008 et la feuille porte sa clé. Deux points à vérifier : un composant probablement devenu mort (`OngletCompact`) et des sélecteurs de test qui dépendent de classes internes de Mantine.

## Constats
1. **[mineur]** Grille 4 (simplicité) — `v2/design/composants/PageEditionS.jsx:10`. L'import de `OngletCompact` est retiré, ce qui suggère que ce composant de `Coquille.jsx` n'a plus d'usage après la disparition du mode `compact`. Vérifier s'il reste employé ailleurs ; sinon le supprimer pour éviter du code mort.
2. **[mineur]** Grille 7 (tests) — `v2/contrats/pile/telephone.test.js:296`, `v2/contrats/pile/telephone.test.js:300`. Le test s'appuie sur les classes internes de Mantine (`.mantine-Drawer-title`, `.mantine-Tabs-tab` via la feuille) : une montée de version de Mantine qui renomme ces classes cassera le contrat sans que le comportement ait changé. Préférer, autant que possible, des rôles ARIA ou des attributs stables (`getByRole('heading')` pour le titre du tiroir, par exemple).
3. **[question]** Grille 6 (correction) — `v2/design/composants/PageEditionS.jsx:22`. Le repli `?? volet.titre` quand aucun onglet ne correspond à `valeur` : si `actif` désigne une clé inconnue, le tiroir affiche l'ancien titre général et aucun panneau. Cas improbable en pratique, mais à trancher : repli sur le premier onglet plutôt que sur `volet.titre` ?

## Points de grille sans remarque
1, 2, 3, 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides

## Réponse de Claude

1. *Faux*, avec la preuve : `OngletCompact` sert encore dans `Coquille.jsx` (`VoletRelecture`, volet droit des formats L et M) ; seul le format S ne l'emploie plus.
2. *Juste*, corrigé : le titre du tiroir se lit par son rôle (`getByRole('heading')`) ; la classe de la feuille ne s'emploie plus dans le test.
3. *Hors sujet* : une clé d'onglet inconnue n'arrive pas (les clés viennent de l'application) ; le titre général reste un repli sûr, sans panneau.

## Arbitrage de Sylvain

(À compléter.)
