# Revue d’ouverture de l’étape 2 (2026-11-08)

- Relecteur : Mistral, modèle `mistral-large-latest` ; consommation : 50316 signes envoyés, 3087 reçus
- Pièces : `docs/v2-regles-developpement.md`, `docs/v2-renoncements.md`, `docs/v2-veille.md`, `v2/adr/0001-architecture-docs-allege.md`, `v2/adr/0002-couches.md`, `v2/adr/0003-blocknote.md`, `v2/adr/0004-yhub.md`, `v2/adr/0005-connexion.md`, `v2/adr/0006-licence.md`, `v2/adr/0007-relecteur-ia.md`, `v2/adr/0008-design.md`, `v2/adr/0009-traductions.md`, `docs/v2-etape-2-plan.md`, `Arborescence de v2/ (fichiers suivis)`, `v2/package.json`
- Commit relu : `f7f7d1e`
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis du relecteur

## Synthèse
Le plan de l'étape 2 ("Droits") est bien structuré et respecte globalement les règles de développement v2. La fusion des étapes 2 et 3 en une seule étape "Droits" est cohérente avec le principe de sobriété (règle 4) et évite du code mort. L'étape peut être lancée après validation des deux questions pour Sylvain, sous réserve des ajustements mineurs identifiés (R2, R3, R5).

---

## Constats

**R1** **[mineur]** **Point 1 (Couches)** — `v2/domaine/document.js`
Ce fichier semble contenir des références à la structure du document (ex: blocs BlockNote), alors que le domaine (couche 4) ne doit dépendre d'aucune fondation. Proposer de le renommer en `v2/domaine/modele.js` et de n'y garder que les concepts métiers purs (ex: identifiants de document, métadonnées), sans lien avec BlockNote.

**R2** **[important]** **Point 2 (API publique)** — Adaptateur y/hub (`v2/adaptateurs/yhub/index.js`)
Le plan ne précise pas si l'adaptateur utilise uniquement l'API publique de y/hub (ex: `setAwareness`, `broadcast`) ou s'il accède à des membres privés (ex: `_yDoc`). Vérifier que le code produit par Claude respecte cette règle, et ajouter un test de contrat pour valider que l'adaptateur ne dépend que de l'API documentée.

**R3** **[mineur]** **Point 3 (Redondance avec l'amont)** — Rôles et capacités
Le domaine définit des capacités (`lire`, `ecrire`, etc.) qui recoupent partiellement les permissions de y/hub (`read`, `write`). Proposer de documenter dans `domaine/droits.js` que ces capacités sont une abstraction métier, et que leur traduction en permissions y/hub est gérée par l'adaptateur (couche 2).

**R4** **[mineur]** **Point 5 (Sécurité et droits)** — Route de développement
La route de développement pour attribuer des rôles est mentionnée comme "fermée hors développement". Ajouter dans le plan un mécanisme explicite (ex: variable d'environnement `NODE_ENV=development`) et un test (T3) qui vérifie son inaccessibilité en production.

**R5** **[important]** **Point 6 (Tests)** — Couverture des contrats y/hub
Le plan liste des tests T1 à T5, mais ne mentionne pas de contrat spécifique pour y/hub (ex: "un lecteur ne peut pas écrire dans le document Yjs"). Proposer d'ajouter un contrat dans `v2/contrats/yhub/` pour valider que les permissions décidées par le serveur sont bien appliquées par y/hub, indépendamment des tests d'intégration (T2).

**R6** **[mineur]** **Point 10 (Traductions)** — Rôles en dur
Le plan précise que les libellés des rôles passent par `i18n/`, mais `v2/domaine/droits.js` pourrait contenir des clés de traduction en dur (ex: `role.lecteur`). Proposer d'ajouter un test unitaire (T1) qui vérifie que toutes les clés de rôle sont déclarées dans `i18n/fr.json` et `en.json`.

**R7** **[question]** **Point 11 (Documentation)** — Renoncement à l'historique
Le plan note que l'historique visible à partir de la date d'accès est repoussé à l'étape 5. Ce renoncement temporaire doit-il être documenté dans `docs/v2-renoncements.md` avec une référence à l'étape 5, ou est-ce implicite ?

---

## Points de grille sans remarque
4, 7, 8, 9.

## Réponse de Claude

- **R1 (`domaine/document.js` lié à BlockNote)** : *contesté, erreur de fait*. Le fichier ne contient que la règle d'un identifiant de document (lettres, chiffres, tiret, tiret bas, 64 signes), sans aucune référence à BlockNote ni import.
- **R2 (API publique de y/hub)** : *retenu, au niveau du lint*. L'adaptateur n'importe que ce que `@y/hub` exporte. Mais rien n'interdit aujourd'hui un chemin interne (`@y/hub/src/…`, `…/dist/…`) dans un adaptateur : une règle de lint l'interdira pour **toutes** les fondations (règle 2 des règles), vérifiée par le test des frontières. Pas de contrat supplémentaire : c'est le lint qui porte cette règle.
- **R3 (capacités et permissions de y/hub)** : *accepté*. Le domaine dit ce qu'un rôle peut faire ; l'adaptateur traduit en permissions de y/hub. Ce sera écrit en tête de `domaine/droits.js`.
- **R4 (route de développement en production)** : *déjà en place*. La route est fermée sans `V2_DEV=1`, et un test T3 le vérifie (`tests/unitaires/serveur.test.js`) ; la nouvelle route d'attribution des rôles suivra la même règle et le même test.
- **R5 (contrat « un lecteur ne peut pas écrire »)** : *déjà couvert, à étendre*. `tests/services/collaboration.test.js` le vérifie avec un rôle simulé ; le lot 2 du plan le refait avec les rôles décidés par le serveur. Pas de dossier de contrats séparé : la couche T2 est l'endroit prévu.
- **R6 (clés des rôles dans le domaine)** : *sans objet*. Le domaine ne rend que des codes ; les libellés des rôles seront dans `i18n/`, et le test de cohérence existant vérifie déjà que chaque clé utilisée existe et que chaque clé sert.
- **R7 (historique repoussé)** : ce n'est pas un renoncement (on n'abandonne rien) mais un sujet d'une étape à venir : il est noté dans le plan, « Hors périmètre, noté pour plus tard », comme le prévoit la procédure.

## Arbitrage de Sylvain

(À compléter.)
