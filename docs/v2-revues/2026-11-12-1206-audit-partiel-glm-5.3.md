# Audit partiel avant fusion (2026-11-12)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 367004 signes envoyés, 3407 reçus (et 16486 de réflexion) ; réflexion `low` ; 64 s ; arrêt : stop
- Diff audité : `v2/` de `aeb8b42` à `6dfe64a` (12 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce lot étend les modèles de mise en page (folio, titre courant, séparateurs, modèles d'instance) en restant dans les couches design/domaine, conformément à l'ADR 0011 et à la table de l'ADR 0008. Le code est globalement sobre et bien testé, y compris la reprise de « TàT - Poche ». Je relève surtout un défaut probable dans les tests (imports manquants), un contournement discret de la frontière présentation/logique via `r.contenu`, et des bornes de réglages qui ne figurent pas dans la table des décisions.

## Constats
1. **[important]** Grille 7 (tests), `v2/tests/unitaires/miseEnPage.test.js:5` — La ligne d'import ne contient que `grille, gabaritTypst, chaineTypst, nomDeFichier, titreDocument, resoudreModele`, mais les tests ajoutés utilisent `appliquerEcarts` (lignes 242-243) et `modeleRetenu` (lignes 248-251) sans les importer : `ReferenceError` à l'exécution, sauf s'ils sont importés ailleurs dans le fichier (hors diff, à vérifier). Proposer d'ajouter les deux noms à l'import et de relancer la suite.
2. **[mineur]** Grille 9 (traductions), `v2/design/reglages.js:103` — `decimalSeparator: ','` fige la virgule décimale quelle que soit la langue de l'interface, alors que la règle 26 veut que les nombres suivent la langue de la personne (via `Intl`). Quand l'anglais sera publié, les formulaires de modèles garderont la virgule française. Proposer de dériver ce séparateur de la langue de l'interface plutôt que d'un réglage fixe (à soumettre à Sylvain, car la table ADR 0008 note ce réglage).
3. **[mineur]** Grille 6 (correction), `v2/design/composants/Modeles.jsx:228` — Quand `groupes` est fourni, un champ dont `groupe` ne correspond à aucune entrée de `groupes` est silencieusement masqué (filtre ligne 228-229) : un réglage réglable deviendrait invisible sans erreur. Proposer un repli (champs orphelins rendus hors `Fieldset`) ou un avertissement en développement.
4. **[question]** Grille 9 (ADR 0008), `v2/design/reglagesLivre.js:51` — Les bornes de `chapitre.graisse` et `titre.graisse` (100 à 900, pas 100) et de `folio.bas` (0 à 100 par le helper `mm`, `v2/design/reglagesLivre.js:58`) ne figurent pas dans la table « Réglages décidés » de l'ADR 0008, qui mentionne ces réglages sans bornes. S'agit-il de valeurs décidées par Sylvain ou proposées par Claude à faire entériner ?
5. **[question]** Grille 1/16 (couches), `v2/design/composants/PageAdministration.jsx:38` — `{r.contenu ?? null}` fait rendre par un composant de présentation un nœud React arbitraire fourni par l'application, ce qui contourne le contrat « données simples et fonctions de rappel » de la règle 16. Si c'est un choix assumé pour la rubrique Apparence, il mériterait une note ; sinon, préférer des données descriptives.
6. **[mineur]** Grille 6 (correction), `v2/domaine/miseEnPage.js:228` — `Math.trunc(f.depart)` transforme silencieusement un `depart` non entier (12,7 → 12) au lieu de le refuser ; la validation `entier` n'existe que côté `appliquerEcarts`. Proposer un refus explicite (ou une assertion) pour un modèle construit hors ce chemin.
7. **[question]** Grille 4 (simplicité), `v2/design/composants/Modeles.jsx:85` — La prop optionnelle `essayer` (défaut `null`) n'a pas d'appelant visible dans le diff. Si elle sert l'export d'essai prévu par le plan des modèles, rien à dire ; sinon c'est une option « au cas où » à retirer.

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

## Réponse de Claude

1. *Faux* : `appliquerEcarts` et `modeleRetenu` sont importés plus bas dans le fichier (ligne 94, import existant) ; la suite passe (20 tests).
2. *Question pour Sylvain* : la virgule décimale est sa demande (chantier des modèles, point 12). Quand l'anglais sera publié, le séparateur pourra suivre la langue de l'interface ; noté, sans changement aujourd'hui.
3. *Juste*, corrigé : un réglage sans groupe connu est rendu après les groupes, jamais masqué.
4. *Question pour Sylvain* : bornes proposées par Claude (graisses 100 à 900 par 100, ligne du folio 0 à 100 mm, lignes blanches 0 à 10), comme les valeurs de l'A4 ; à valider avec elles.
5. *Voulu* : la rubrique « Modèles » du back-office a besoin d'un contenu riche (liste, formulaire) ; le composant de présentation reçoit un emplacement, l'application y place un composant de présentation (`PanneauModeles`, `FormulaireModele`), sans règle dans le design.
6. *Juste*, corrigé : un numéro de départ qui n'est pas un entier positif est ignoré (1), sans arrondi silencieux.
7. *Faux* : `essayer` est branché par l'application (`voletDocuments.jsx`, « Essayer » des modèles d'équipe sur le document ouvert).

## Arbitrage de Sylvain

(À compléter.)
