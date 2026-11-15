# Audit partiel avant fusion (2026-11-15)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 380273 signes envoyés, 3282 reçus (et 21233 de réflexion) ; réflexion `low` ; 29 s ; arrêt : stop
- Diff audité : `v2/` de `269a61d` à `a098745` (31 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot cohérent, bien testé (boutons collants, nouvel onglet, marge basse, table sans titre) et documenté (ADR 0008 tenue à jour, renoncements respectés). Les constats portent surtout sur un contournement de l'adaptateur BlockNote dans la couche application (sélecteur `.bn-thread`), une valeur de design codée en dur dans `telephone.css`, et quelques cas limites du domaine (modèles anciens mixtes). Rien de bloquant côté sécurité ; les textes libres des en-têtes sont correctement échappés et bornés.

## Constats
1. **[important]** Grille 1 (couches) — `v2/application/client/Edition.jsx:515` : la couche application interroge directement le DOM de BlockNote par sa classe interne `.bn-thread` (et sa structure de fils) pour fermer le tiroir au format S, contournant l'adaptateur ; une montée de version de BlockNote qui renomme ces classes cassera silencieusement ce comportement. Proposer de remonter cette logique dans `adaptateurs/blocknote/` (une option ou un rappel « clic sur une carte de fil »), l'application ne gardant que `setVolet(null)`.
2. **[mineur]** Grille 6 (correction) — `v2/application/client/Edition.jsx:519` : `setTimeout(() => setVolet(null), 0)` diffère la fermeture sans raison écrite ; si BlockNote traite le clic de façon asynchrone, l'ordre n'est pas garanti. Documenter l'ordre attendu (ou écouter la fin du défilement) plutôt qu'un délai magique.
3. **[mineur]** Grille 6 (correction) — `v2/domaine/miseEnPage.js:440` : `completerModele` ne convertit `grille.lignes` que si `marges.bas` est absent ; un modèle enregistré portant les deux garde un `grille.lignes` mort (ignoré par `grille()`, jamais nettoyé). Proposer de supprimer `grille.lignes` dès que `marges.bas` est fini, pour éviter une donnée zombie.
4. **[question]** Grille 1/8 (design) — `v2/design/feuilles/telephone.css:116-117` : la nouvelle règle `.amend-volet-onglets .amend-suggestions-actions` ne porte pas de commentaire `/* réglage : … */` (contrairement à `coquille.css:86`) et code en dur `3.75rem`, une valeur de Mantine (ModalBase) mais pas une variable ; vérifier que le contrat statique et la table de l'ADR 0008 couvrent ce décalage d'en-tête, sinon l'ajouter au réglage `css.suggestions.actions`.
5. **[mineur]** Grille 7 (tests) — `v2/contrats/statiques/typst.test.js:148`, `:171`, `:318` : les dossiers `mkdtempSync` ne sont jamais supprimés (fuite de fichiers temporaires à chaque exécution), et `pdftotext` (poppler) devient un outil externe requis sans qu'on voie où il est documenté. Proposer un nettoyage en fin de test et une note de prérequis.
6. **[question]** Grille 9 (traductions) — `v2/adaptateurs/blocknote/index.jsx:681` : l'usage de `textes.table?.titre` disparaît ; vérifier que la clé correspondante des catalogues (`…table.titre`) est retirée aussi, sinon elle reste morte.
7. **[question]** Grille 6 (correction) — `v2/design/composants/Modeles.jsx:257` : `visibleSi` compare `valeurs[c.visibleSi.cle]` avec une clé pointée (`enTete.gauche`) ; confirmer que l'état `valeurs` du formulaire utilise bien les clés pointées (comme `changer(c.cle)` le suggère) — sinon le champ texte libre n'apparaîtrait jamais.

## Points de grille sans remarque
2, 3, 5, 10 (pas de dépendance npm nouvelle ; `pdftotext` est un outil système, vu au constat 5).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides

## Réponse de Claude

1. *Juste*, corrigé : le clic sur une carte de fil est géré dans l'adaptateur (`surCarteDeFil`, enveloppe de la liste des fils) ; l'application ne garde que `setVolet(null)`.
2. *Juste*, supprimé avec le 1 : plus de `setTimeout` ; le gestionnaire de l'enveloppe s'exécute après celui de la carte, dans le même clic.
3. *Juste*, corrigé : `completerModele` retire `grille.lignes` dès qu'il y en a un, la marge basse fait foi ; test ajouté.
4. *Faux*, avec la preuve : la règle suit le bloc `/* réglage : css.telephone.volets */` et le contrat `design-decide.test.js` passe ; la valeur 3,75 rem est celle de l'en-tête de `ModalBase.css` de Mantine (déjà dit dans l'audit du 15/11/2026, 13 h 23).
5. *Juste*, corrigé : un assistant `texteDuPdf` supprime son dossier temporaire ; `pdftotext` (poppler-utils) est noté dans `v2/LISEZMOI.md`.
6. *Faux*, avec la preuve : la clé `table.titre` sert encore (titre de la table dans l'éditeur, nom accessible) ; seul le titre exporté en Markdown a disparu.
7. *Faux*, avec la preuve : `valeurs` est construit avec `Object.fromEntries(champs.map((c) => [c.cle, c.valeur]))`, donc les clés pointées ; `visibleSi.cle` y est une clé de réglage.

## Arbitrage de Sylvain

(À compléter.)
