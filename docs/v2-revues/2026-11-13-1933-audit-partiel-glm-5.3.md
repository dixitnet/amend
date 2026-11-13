# Audit partiel avant fusion (2026-11-13)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 242113 signes envoyés, 4397 reçus (et 12984 de réflexion) ; réflexion `low` ; 25 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `c13f523` (14 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le lot déplace le réglage d'un modèle d'une fenêtre vers une page dédiée (`PageModele`), remplace la liste par un tableau à menu d'actions, et ajoute un mécanisme de sessionStorage pour rouvrir la fenêtre des modèles de l'équipe au retour. L'architecture en couches et la séparation design/technique sont respectées, les traductions suivies dans les deux catalogues, et le parcours principal est couvert par le test de pile. Les constats portent surtout sur des cas limites (réglages sans groupe devenus invisibles, dépendances d'effet, réutilisation d'un réglage de design hors de son contexte décidé).

## Constats
1. **[important]** Grille 6 (correction) — `v2/design/composants/Modeles.jsx:319`, `v2/design/composants/Modeles.jsx:246`. L'ancien `FormulaireModele` affichait explicitement « un réglage sans groupe connu » après les groupes ; la nouvelle page ne montre que les champs dont `c.groupe` correspond à une rubrique existante (`champs.filter((c) => c.groupe === rubrique.cle)`, et la rubrique « general » ne montre que le nom). Un champ sans groupe, ou dont le groupe n'est pas dans `groupes()`, disparaît silencieusement sans erreur ni message. Proposer soit de réintroduire l'affichage de secours, soit une assertion (test ou contrat) qu'aucun champ de `champsDu` n'est orphelin.
2. **[mineur]** Grille 4 (simplicité) — `v2/application/client/Modeles.jsx:308`. Le `useEffect` dépend de `[equipe, modele]` alors que l'URL chargée (ligne 302) ne dépend pas de `modele` : changer de modèle rechargerait inutilement les mêmes données. En pratique on ne peut y arriver que par la liste, mais la dépendance est fausse ; la retirer (ou charger le modèle seul).
3. **[mineur]** Grille 1/9 (design) — `v2/design/composants/Modeles.jsx:169`. `Menu.Item {...REGLAGES.boutonDanger}` réutilise le réglage `boutonDanger` (`red`), décidé dans l'ADR 0008 pour « l'action d'une confirmation qui détruit » (un bouton), sur un élément de menu sans confirmation. La valeur n'est pas nouvelle, mais son emploi dans ce contexte n'est pas noté dans la table des réglages décidés ; à confirmer avec Sylvain ou à remplacer par le rendu par défaut d'un `Menu.Item`.
4. **[mineur]** Grille 6 (correction) — `v2/application/client/voletDocuments.jsx:69`. `useState(equipeDesModelesOuverts)` rouvre la fenêtre des modèles de l'équipe enregistrée en session, même si le document alors ouvert (`docId`) appartient à une autre équipe ou à aucune : la fenêtre s'ouvre sur une équipe sans lien avec le contexte affiché. Pas de fuite (le serveur vérifie les droits), mais le comportement peut surprendre ; vérifier que c'est voulu ou comparer avec l'équipe du document.
5. **[mineur]** Grille 7 (tests) — `v2/contrats/pile/exports.test.js:99`, `v2/tests/design/composants.test.js:573`. Le parcours équipe est couvert, mais pas le cas `modele-introuvable` de `PageModele` (`v2/application/client/Modeles.jsx:312`), ni la page d'un modèle de l'instance (`equipe` nul, route `/api/admin/modeles`), ni le refus serveur d'un PUT. Ajouter au moins le cas « modèle introuvable » au test de design.
6. **[mineur]** Grille 6 (correction) — `v2/design/composants/Modeles.jsx:210`. `setCreation({ nom: '', base: bases[0]?.value })` : si `bases` est vide, le `Select` contrôlé démarre sans valeur et la création peut partir avec `base` indéfinie. En pratique `bases` contient au moins le modèle du code, mais un garde-fou (désactiver le bouton) coûterait peu.
7. **[mineur]** Grille 4 — `v2/application/client/Administration.jsx:183`. `rubriqueInitiale` passe un titre traduit (`t('admin.modelesPdf.titre')`) comme identifiant de rubrique, comparé par égalité de titre dans `PageAdministration` (`v2/design/composants/PageAdministration.jsx:86`). Le mécanisme existait déjà, mais ce nouveau couplage par chaîne traduite est fragile (un changement de libellé casserait la sélection silencieusement) ; une clé stable serait plus sûr.
8. **[question]** Grille 9 (traductions) — `v2/i18n/exceptions.json:24-25`. `modeles.actions` et `modeles.format` sont ajoutés aux exceptions ; la sémantique exacte de ce fichier n'est pas dans le dossier fourni. `modeles.format` contient des nombres formatés par ICU (`{largeur, number}`), dont le rendu varie selon la locale (séparateur décimal) : confirmer que son inscription comme exception est bien voulue et ce qu'elle implique.

## Points de grille sans remarque
2, 3, 5, 8, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides
- 8 : citations valides

## Réponse de Claude

1. *Juste* : un test de cohérence vérifie désormais que le groupe de chaque réglage ouvert existe au formulaire (aucun champ orphelin).
2. *Juste* : la dépendance du chargement est réduite à l'équipe.
3. *Juste* : l'emploi est noté dans la ligne `boutonDanger.color` de l'ADR 0008 (même valeur, pas de réglage nouveau).
4. *Voulu* : la fenêtre rouverte est celle de l'équipe dont on réglait un modèle ; le serveur garde les droits. Cas limite (quitter par un autre chemin) accepté.
5. *Juste en partie* : le cas « modèle introuvable » et la page d'un modèle de l'instance n'ont pas de test dédié ; l'instance partage tout le code du parcours d'équipe (testé en navigateur). Noté, sans bloquer.
6. *Juste* : le bouton « Nouveau modèle » est désactivé sans modèle de départ.
7. *Noté* : couplage par le titre traduit, déjà celui de `PageAdministration` ; une clé stable viendra avec un changement de cette page.
8. *Voulu* : un texte identique dans les deux langues (« Actions » ; format en chiffres) s'inscrit en exception ; l'ICU formate selon la langue de l'interface.

## Arbitrage de Sylvain

(À compléter.)
