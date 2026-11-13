# Audit partiel avant fusion (2026-11-12)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 209147 signes envoyés, 4520 reçus (et 8682 de réflexion) ; réflexion `low` ; 17 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `ec44329` (10 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff porte sur trois sujets : l'ajout des types de bloc « Titre »/« Sous-titre » dans la palette, le retrait de la case « Retenir ce modèle » (rétention automatique après export), et l'ouverture des fils de commentaires uniquement dans le volet droit. L'ensemble est cohérent avec les décisions citées de Sylvain, mais deux points méritent attention : le nom d'auteur rendu invisible aux lecteurs d'écran, et une contradiction apparente avec l'ADR 0011 non révisée. Quelques questions sur le comportement en mode suggestion et la couverture de test des commentaires.

## Constats
1. **[important]** Grille 6 / accessibilité (règle 22) — `v2/design/composants/PanneauSuggestions.jsx:72`. Le nom de l'auteur, auparavant un `Text` lisible, est maintenant enveloppé dans un `UnstyledButton` portant `aria-hidden` : le nom disparaît des lecteurs d'écran, alors que le commentaire voiron (ligne 76) dit « un nom par ligne pour les lecteurs d'écran ». Proposer un `aria-hidden` sur le bouton mais garder le nom visible à l'AT (par exemple bouton sans `aria-hidden`, ou nom rendu hors du bouton), et vérifier au passage d'axe.

2. **[important]** Grille 6 / documentation — `v2/application/client/useExport.jsx:12` vs `v2/adr/0011-modeles-equipe.md` § 3. Le nouveau comportement (« le modèle d'un export réussi devient celui du document ») contredit l'ADR 0011 en vigueur : « quiconque exporte peut en prendre un autre **pour un seul export** » et « qui écrit un document choisit le modèle enregistré avec lui ». La décision de Sylvain du 12/11/2026 est citée en commentaire de code mais l'ADR n'est pas révisée dans ce diff. Proposer une révision de l'ADR 0011 (qui peut retenir, et quand).

3. **[question]** Grille 6 — `v2/adaptateurs/blocknote/index.jsx:190`. En mode suggestion, la palette reçoit `tous` (qui contient désormais le sélecteur de type de bloc de `blockTypeSelectItems`) ; le commentaire des lignes 743-744 dit pourtant « pas de changement de type de bloc » en Suggérer (d'où le `slashMenu={false}`). `boutonsGardesEnSuggestion` filtre-t-il bien le sélecteur de type ? Si non, un correcteur pourrait changer le type d'un bloc en mode suggestion. À vérifier et couvrir par un test.

4. **[mineur]** Grille 7 — `v2/adaptateurs/blocknote/index.jsx:750`. Le passage à `comments={false}` (plus de bulle au clic sur un passage commenté) et l'ajout de `FloatingComposerController` ne sont couverts par aucun test visible dans ce diff : rien ne vérifie qu'un clic sur un passage commenté n'ouvre pas de bulle et que la saisie d'un nouveau commentaire fonctionne toujours. Ajouter un cas au test de pile des commentaires.

5. **[mineur]** Grille 6 — `v2/application/client/useExport.jsx:45-47`. Si le téléchargement réussit mais que le `PUT …/modele` échoue, le `catch` affiche un message d'erreur et laisse la fenêtre ouverte alors que le fichier est déjà obtenu : la personne croit l'export raté. Proposer de fermer la fenêtre et d'ignorer (ou de signaler discrètement) l'échec de la rétention.

6. **[mineur]** Grille 4 — `v2/adaptateurs/blocknote/index.jsx:181`. Le `.filter(([cle]) => textes?.[cle])` et le chaînage optionnel `textes?.` sont une option « au cas où » : `textes` est toujours fourni (ligne 683). Simplifier en accédant directement, ou justifier le cas où un titre manquerait.

7. **[question]** Grille 1 — `v2/adaptateurs/blocknote/index.jsx:182`. `icon: () => textes[cle].picto` fait rendre par l'adaptateur un picto qui, selon l'ADR 0008, vient de `design/pictos.jsx` (Tabler, importé par le design seul). L'adaptateur ne l'importe pas (il le reçoit par props via l'application), ce qui respecte la lettre du graphe, mais la frontière mérite d'être confirmée : est-ce un motif accepté (design passé en données) ou une dérive à éviter ? À trancher avec Sylvain ou à documenter.

8. **[mineur]** Grille 4 / montées de version — `v2/design/feuilles/coquille.css:86`. La règle cible des noms de classes internes de BlockNote (`.bn-threads-sidebar .bn-thread`), non garantis par son API publique : une montée de version peut les renommer silencieusement. Le réglage est bien décidé (ADR 0008, `css.commentaires.largeur`), mais un contrat statique ou de pile devrait vérifier que la règle s'applique encore (sélecteur trouvé dans le DOM rendu).

## Points de grille sans remarque
3 (redondance amont : `blockTypeSelectItems` et `FloatingComposerController` réutilisent l'existant, avec la référence à Docs exigée par la règle 0), 8 (NFC : rien d'impacté), 10 (aucune dépendance nouvelle).

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

1. **Juste**, corrigé : le bouton du nom n'a plus `aria-hidden` ; il reste hors de la tabulation (`tabIndex={-1}`), le passage dessous faisant la même chose au clavier.
2. **Juste**, corrigé : l'ADR 0011 (§ 3) note la révision du 12/11/2026.
3. **Faux** : `boutonsGardesEnSuggestion` retire `blockTypeSelect` (`palette.js`, liste `BOUTONS_DE_FORME`), quels que soient les types qu'il contient.
4. **Juste**, corrigé : le test de la pile « commentaire du correcteur » vérifie qu'un clic sur le passage commenté n'ouvre pas de bulle. La saisie flottante d'un nouveau commentaire est déjà couverte par ce test (le correcteur crée le fil).
5. **Juste**, corrigé : un échec de l'enregistrement du modèle n'empêche plus de fermer la fenêtre d'un export réussi.
6. **Faux** : `titre` et `sousTitre` sont facultatifs dans les textes de l'éditeur (JSDoc de `EditeurDuLivre`) ; le filtre reste, avec un commentaire.
7. **Hors sujet** pour ce lot : c'est le motif déjà en place pour le menu « / » et la note (le picto vient du design par l'application, l'adaptateur ne l'importe pas). Règle respectée.
8. **Juste** : ajouté à la veille (`docs/v2-veille.md`), avec le réglage des suggestions, à vérifier à chaque montée de BlockNote.

## Arbitrage de Sylvain

(À compléter.)
