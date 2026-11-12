# Audit partiel avant fusion (2026-11-12)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 204824 signes envoyés, 3021 reçus (et 4286 de réflexion) ; réflexion `low` ; 34 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `c033be8` (6 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le lot refait le back-office en « brique Mantine » (menu de rubriques, chiffres en cartes), conformément aux décisions de Sylvain du 12/11/2026 et aux réglages `admin.*` ajoutés à l'ADR 0008 et à `reglages.js`. La séparation design/technique est respectée (`chiffres: true` est bien un nom de rôle posé par l'application). Les constats portent sur des cas limites du composant à état (rubriques vides ou asynchrones, lignes à choix dans une rubrique « chiffres »), la couverture incomplète de l'interaction du menu, et un test de reprise dont le ménage protège la suppression mais pas la création en double.

## Constats
1. **[mineur]** Grille 6 (cas limite), `v2/design/composants/PageAdministration.jsx:83` — `useState(rubriques[0]?.titre ?? null)` fige le choix au premier rendu : si la liste des rubriques arrive ou change après (chargement des données du serveur), `choisie` reste `null` et le repli `?? rubriques[0]` masque le problème ; deux rubriques de même titre feraient aussi pointer `find` sur la première. Le repli rend le comportement correct en pratique ; proposer de le documenter ou d'initialiser paresseusement.
2. **[mineur]** Grille 6 (cas limite), `v2/design/composants/PageAdministration.jsx:58-70` — `Chiffres` ne rend que `l.valeur` : une ligne portant un `choix` (contrat documenté ligne 73-74) dans une rubrique `chiffres` perdrait silencieusement son sélecteur. Aujourd'hui aucune rubrique `chiffres` n'a de choix, mais le contrat du composant l'autorise ; proposer soit de gérer `choix` dans `Chiffres`, soit de noter l'exclusion dans le JSDoc.
3. **[important]** Grille 7 (tests), `v2/tests/design/composants.test.js:709-712` — le test vérifie que le menu nomme les rubriques et que la première est marquée `aria-current`, mais pas que cliquer sur une autre rubrique change le contenu affiché : l'état interactif du composant (`setChoisie`) n'est couvert par aucun test. Proposer un test d'interaction (clic sur « Journal » → son contenu seul visible).
4. **[mineur]** Grille 7 (tests), `v2/tests/design/composants.test.js:711` — `new RegExp(`<button[^>]*>[\\s\\S]*?${r}`)` injecte le titre tel quel dans une expression rationnelle ; un titre contenant `(`, `.` ou `*` casserait ou affaiblirait l'assertion. Échapper la valeur (ou comparer autrement).
5. **[question]** Grille 6, `v2/tests/services/modeles.test.js:340-359` — le ménage protège la suppression des modèles d'instance préexistants (`deja`), mais si « tat-poche » figurait déjà parmi eux avant l'effacement de `modeles.reprise`, `reprendreModeles()` en créerait un second et l'assertion « une seconde fois : rien de plus » ne testerait plus ce qu'elle annonce. Le scénario suppose-t-il une base sans tat-poche préexistant ? Si oui, le dire dans le test ; sinon, exclure ce cas explicitement.

## Points de grille sans remarque
1 (couches), 2 (API publique), 3 (redondance amont), 4 (simplicité — pas d'option « au cas où » constatée), 5 (sécurité), 8 (exports), 9 (traductions), 10 (licences — aucun paquet nouveau).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. *Voulu*, documenté : la rubrique choisie est retenue par son titre ; si elle n'existe pas (ou plus), la première est montrée. Les titres des rubriques sont distincts (catalogue).
2. *Juste*, documenté : une rubrique en cartes ne montre que des valeurs ; une ligne à choix va dans une rubrique en tableau (JSDoc).
3. *Juste*, non couvert par un test automatique : les tests de design rendent le HTML sans navigateur ; le changement de rubrique au clic est vérifié en capture dans Chromium (clic sur « Modèles de mise en page », rubrique montrée seule). Un parcours de la pile demanderait un compte administrateur dans la pile : à ajouter avec le prochain lot du back-office.
4. *Faux* en pratique : les titres injectés sont des chaînes fixes du test, sans caractère spécial.
5. *Faux* : la reprise cherche d'abord un modèle de l'instance du même nom sur l'A4 et le reprend (protection anti-doublon de l'audit précédent) ; un « TàT - Poche » préexistant est donc repris, pas doublé, et le ménage ne l'efface pas.

## Arbitrage de Sylvain

(À compléter.)
