# Audit partiel avant fusion (2026-11-11)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 214948 signes envoyés, 3470 reçus (et 27438 de réflexion) ; réflexion `low` ; 32 s ; arrêt : stop
- Diff audité : `v2/` de `bd671c5` à `315e8fa` (23 fichiers)
- Statut : avis reçu ; réponse de Claude écrite (11/11/2026) ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce lot implémente les modèles d'équipe (ADR 0011) de façon globalement fidèle : écarts bornés vérifiés dans le domaine, droits contrôlés côté serveur, fuite vers l'extérieur évitée (le correcteur hors équipe ne voit que le modèle retenu), tests nombreux et pertinents aux trois niveaux. Le principal défaut est structurel : le serveur Node importe le design, donc transitivement `@mantine/core`, une fondation d'interface, dans un processus serveur. Quelques cas limites de l'interface d'export restent ouverts (ordre retenu/export, repli silencieux, « pas » non vérifié).
## Constats
1. **[important]** Grille 1 (couches) — `v2/application/serveur/comptes.js:75`, `v2/design/livre.js:4`, `v2/design/reglages.js:5`. Le serveur importe `design/livre.js`, qui importe `reglages.js`, qui importe `DEFAULT_THEME` de `@mantine/core` : une fondation d'interface se retrouve dans le processus serveur Node. L'arête application → design est permise par le graphe, mais l'effet contredit le principe de confinement des fondations (une montée de version de Mantine toucherait le serveur). Proposition : sortir les réglages du livre (bornes, catalogue des polices, modèles) dans un module de design sans import de Mantine (ou les passer en paramètre au serveur), pour que `reglages.js` reste le seul point de contact avec Mantine.
2. **[mineur]** Grille 6 (correction) — `v2/application/client/App.jsx:538-539`. Le modèle est retenu pour le document (PUT) avant l'export ; si l'export échoue ensuite, le choix reste enregistré alors que la personne n'a pas obtenu son fichier. Proposition : n'envoyer le PUT qu'après la réussite du téléchargement, ou assumer l'ordre et le documenter.
3. **[mineur]** Grille 6 (correction) — `v2/application/client/App.jsx:536-537`, `v2/application/client/exports.js:45`. Si l'entrée du modèle choisi n'est pas trouvée dans la liste (liste non chargée, modèle retiré entre-temps), l'export se fait silencieusement avec `MODELES_LIVRE[0]`, sans message. Proposition : dans ce cas, afficher l'erreur `modele-introuvable` plutôt que de replier sans le dire.
4. **[mineur]** Grille 6 (correction) — `v2/application/client/App.jsx:462` et `:479`. Quand `modeleDefaut` est `null`, le sélecteur affiche le premier modèle d'amend.ink ; le modifier enregistre alors son identifiant explicitement au lieu de `null`, ce qui figerait le défaut si un second modèle d'amend.ink apparaissait plus tard. Proposition : distinguer « null » de la valeur affichée (envoyer `null` quand la valeur choisie égale le premier modèle maison), ou assumer et le noter.
5. **[mineur]** Grille 6 (correction) — `v2/domaine/miseEnPage.js:167-174`, `v2/design/reglages.js:64-76`. Le `pas` de chaque réglable (0,5 mm, 0,1 pt…) n'est utilisé que dans le formulaire ; le domaine (donc le serveur) accepte des valeurs hors pas (par ex. 135,37 mm). L'ADR 0011 parle de « bornes et pas ». Proposition : vérifier le pas dans `valeurPermise`, ou retirer le pas des données serveur s'il n'est qu'une aide à la saisie (à trancher avec Sylvain).
6. **[question]** Grille 6 — `v2/application/client/App.jsx:429-431`. Si la base d'un modèle d'équipe disparaît du design (modèle retiré lors d'une décision future), `modeleMaison(regle.base)` rend `null` et le formulaire reçoit des champs sans valeur (`complet` null). Quel comportement voulu dans ce cas : bloquer le réglage avec un message, ou montrer le modèle comme cassé ?
## Points de grille sans remarque
2, 3, 5, 7, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides

## Réponse de Claude

1. **Juste, corrigé.** Les réglages des livres passent dans `design/reglagesLivre.js`, sans import de Mantine ; `reglages.js` les reprend sous `livre` (le contrat de l'ADR 0008 les voit toujours) et `design/livre.js`, lu par le serveur, n'importe plus que ce fichier. Le lint traite `reglagesLivre.js` comme `reglages.js` (seul autre fichier où une valeur de design est permise).
2. **Juste, corrigé.** Le modèle n'est retenu pour le document qu'après l'export réussi.
3. **Juste, corrigé.** Un modèle introuvable dans la liste donne le message `modele-introuvable`, sans repli silencieux sur le premier modèle.
4. **Juste, corrigé.** Choisir le premier modèle d'amend.ink comme défaut de l'équipe enregistre « aucun choix » (`null`), qui suit le premier modèle si le design change.
5. **Question pour Sylvain.** Le pas n'est qu'une aide à la saisie (flèches du champ) ; le domaine ne vérifie que les bornes, et l'ADR 0011 ne parle que de bornes (le « pas » n'apparaît que dans le commentaire de la reprise des valeurs de la v1). Proposition : garder ainsi ; une valeur comme 135,37 mm est permise et compose.
6. **Juste, corrigé.** « Régler » un modèle dont la base a quitté le design affiche `modele-introuvable` au lieu d'un formulaire vide. À l'export, le même cas donne déjà ce message (`modeleComplet`).

Contrôles après correction : lint, format, `npm test` (220 tests) et les exports de la pile (3 parcours) au vert.

## Arbitrage de Sylvain

(À compléter.)
