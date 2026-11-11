# Audit partiel avant fusion (2026-11-11)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 149439 signes envoyés, 3036 reçus (et 9142 de réflexion) ; réflexion `low` ; 43 s ; arrêt : stop
- Diff audité : `v2/` de `fd1a2f3` à `23c7baf` (8 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce lot ajoute le bouton de lien à la palette (hors mode Suggérer), une barre de lien réduite en Suggérer, un réglage de plan (`css.plan.titres`), un cas amont reproductible pour `prosemirror-inputrules` et des tests. L'ensemble respecte les couches et les décisions citées. Deux points demandent vérification : la prop `linkToolbar` reçoit un booléen `true` là où BlockNote attend un composant ou `false`, et le sélecteur `amend-plan-niveau-` de la feuille ne correspond à rien dans le diff. Le contournement documenté dans le code ne s'accompagne d'aucune entrée visible dans la veille ou le registre.

## Constats
1. **[important]** grille 6 (correction), `v2/adaptateurs/blocknote/index.jsx:497` — `linkToolbar={mode !== 'suggerer'}` passe `true` à la prop quand on n'est pas en Suggérer ; l'API de BlockNote pour cette prop (comme `slashMenu` et `formattingToolbar`) attend un composant ou `false`, pas un booléen vrai : rendre `true` comme composant est invalide. Le motif correct serait d'omettre la prop hors Suggérer (défaut de BlockNote) et de poser `linkToolbar={false}` en Suggérer, comme fait pour `slashMenu` ligne 496. À vérifier dans la documentation de BlockNote et corriger.
2. **[question]** grille 4 (simplicité / code mort), `v2/design/feuilles/coquille.css:46` et `v2/design/feuilles/coquille.css:51` — le sélecteur `.mantine-NavLink-root[class*='amend-plan-niveau-']` vise une classe `amend-plan-niveau-…` qui n'apparaît nulle part dans ce diff. Si aucune couche ne pose cette classe, c'est un sélecteur mort ; si elle existe ailleurs (plan du format S ?), c'est bon, mais alors la moitié des règles du réglage `css.plan.titres` repose sur du code hors du lot de design. À éclaircir.
3. **[question]** grille 1 / documentation, `v2/adaptateurs/blocknote/index.jsx:147` — le commentaire qualifie la barre de lien réduite de « contournement, veille ; Sylvain, 11/11/2026 », mais le diff ne montre ni entrée dans `docs/v2-veille.md` ni renoncement dans `docs/v2-renoncements.md` pour « pas de modification ni de retrait de lien en mode Suggérer ». Si c'est dans un autre lot, ignorer ; sinon, l'inscrire (règle 9 et § 4.3 de la veille).
4. **[mineur]** grille 6, `v2/exploitation/dev/cas-amont/inputrules.mjs:78-85` — `writeHead(200)` est appelé avant `readFile` : si la lecture échoue, le `catch` tente `writeHead(404)` alors que les en-têtes sont déjà partis, ce qui lève une exception non gérée dans le gestionnaire de requête. Déplacer le `writeHead` après la lecture réussie (script de développement, impact faible).
5. **[mineur]** grille 7, `v2/contrats/pile/margo.test.js:47-50` — les assertions s'appuient sur la classe interne `.bn-formatting-toolbar` et les attributs `data-test` de BlockNote ; c'est toléré pour un test, mais ces sélecteurs internes casseront à chaque refonte de la palette amont, là où un rôle ARIA ou une clé de composant serait plus stable. À noter pour les montées de version.

## Points de grille sans remarque
2 (API publique, hors le sélecteur de test), 3, 5, 8, 9, 10.

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

(Pour chaque constat : *juste* et corrigé, *faux* avec la preuve, *hors sujet*, ou *question pour Sylvain*.)

## Arbitrage de Sylvain

(À compléter.)
