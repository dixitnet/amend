# Audit partiel avant fusion (2026-11-10)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 146177 signes envoyés, 4029 reçus (et 20590 de réflexion) ; réflexion `low` ; 58 s ; arrêt : stop
- Diff audité : `v2/` de `e902b8d` à `d9727b5` (30 fichiers)
- Statut : avis reçu ; répondu par Claude ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff corrige les constats de l'audit du 10/11/2026 (ancre des commentaires, auteur du fil, export des tableaux et images mortes, typographie des adresses, battement SSE, pare-feu) et renforce le lint (imports dynamiques, textes en dur dans les expressions). L'ensemble est conforme aux couches et aux règles, bien testé, sans dépendance nouvelle. Les points relevés sont surtout des vérifications à faire (schéma `auteur` des fils, route `#/partages`, promesse « votre commentaire est gardé ») et quelques fragilités mineures.

## Constats
1. **[question]**, grille 6 — `v2/adaptateurs/postgres/index.js:50`, `v2/application/serveur/commentaires.js:119` : `enFil` rend `f.auteur` et le serveur s'en sert pour les droits, mais le diff ne montre ni la colonne `auteur` dans la création de la table des fils, ni son alimentation à la création, ni une reprise des fils existants. Si la colonne manque ou n'est pas écrite, `auteur` vaut `undefined` et les droits de suppression/résolution du fil changent de sens. Vérifier le schéma et l'écriture (le test `tests/services/commentaires.test.js:314` passe sur une base neuve et ne couvre pas ce cas).
2. **[question]**, grille 6 — `v2/application/client/App.jsx:1074` : le lien « Partagé avec moi » pointe vers `#/partages`, mais `viseeDansAdresse` (`App.jsx:78-81`) ne montre que `equipe:`, `!` et « sinon c'est un document » ; si rien ne reconnaît `partages` plus haut dans la fonction, le hash `/partages` sera traité comme un identifiant de document. Vérifier que cette route existe, sinon corriger le lien.
3. **[question]**, grille 7 — `v2/adaptateurs/blocknote/commentaires.js:106-109`, `v2/application/client/App.jsx:835` : en cas d'échec d'ancre, le fil est supprimé puis l'erreur relancée, et le message affiché promet « Votre commentaire est gardé » (`i18n/fr.json:45-48`). Rien ne prouve que BlockNote rouvre le brouillon dans ce cas ; aucun test ne couvre `surEchecAncre`. Vérifier le comportement réel de BlockNote et ajuster le message ou le mécanisme.
4. **[mineur]**, grille 6 — `v2/application/client/App.jsx:915-917` : le test « nom introuvable » repose sur l'heuristique `p.username !== p.id`, qui suppose que le serveur rend `username = id` pour une personne inconnue — fragile et non documenté côté serveur. Par ailleurs la promesse de `nomsDe(manquants)` n'a pas de `catch` : un échec réseau laisse les identifiants dans `demandes.current` et ne les redemande jamais. Proposer un marqueur explicite du serveur et un `catch`.
5. **[mineur]**, grille 4 — `v2/eslint.config.js:71` : la liste `ADAPTATEURS` est écrite à la main ; l'arborescence prévoit `typst/` et `ia/`, absents de la liste — un adaptateur à venir oublié ne serait pas protégé contre les imports croisés. La dériver du contenu de `adaptateurs/` rendrait le garde-fou complet.
6. **[mineur]**, grille 9 — `v2/application/client/App.jsx:835-839` : le `useMemo` des commentaires capture `t` et `messageErreur` sans les lister dans ses dépendances (`[caps, docId]`) ; un changement de langue en cours de session afficherait l'alerte d'ancre dans l'ancienne langue. Ajouter `t` aux dépendances.
7. **[mineur]**, grille 7 — `v2/package.json:53` : le script `test:contrats` est retiré ; vérifier qu'aucune documentation (règles § 3, procédure de tests, CI) ne l'appelle encore.
8. **[mineur]**, grille 6 — `v2/adaptateurs/blocknote/export.js:94` : la détection d'image vide analyse la source Typst générée par une expression rationnelle (`image\("([^"]+)"`) ; un nom de fichier contenant un guillemet échappé y échapperait et l'export échouerait de nouveau. Un test avec un nom de fichier à guillemet trancherait ; sinon documenter la limite.
9. **[question]**, grille 7 — `v2/exploitation/campagne/invariants.mjs:191` : écouter toutes les erreurs de console peut créer de faux échecs (messages bénins de BlockNote ou de y/hub en cas de coupure réseau pendant la campagne). Vérifier sur une exécution réelle que le bruit est nul, sinon filtrer.

## Points de grille sans remarque
1, 2, 3, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides
- 8 : citations valides
- 9 : citations valides

## Réponse de Claude

- **1 : faux.** La colonne existe depuis l'étape 5 (`auteur text not null`, `v2/adaptateurs/postgres/index.js:14`) et elle est écrite à la création de chaque fil (`index.js:117`) : aucun fil n'en est dépourvu, aucune reprise n'est nécessaire.
- **2 : faux.** `viseeDansAdresse` reconnaît `/partages` (`App.jsx:74`).
- **3 : vérifié dans BlockNote.** En cas d'échec, BlockNote n'appelle pas `stopPendingComment` : la saisie reste ouverte (`@blocknote/react`, `blocknote-react.js:3998`, vérifié pendant l'audit complet). Le message dit vrai.
- **4 : faux.** `nomsDe` rattrape déjà les erreurs et rend l'identifiant quand le nom manque (`application/client/commentaires.js`, même couche) : la promesse ne rejette pas, et l'identifiant non trouvé est redemandé.
- **5 : sans suite.** Aucun adaptateur `typst/` ni `ia/` n'existe ; la liste est explicite et commentée, à compléter avec l'adaptateur qui viendrait.
- **6 : faux.** `t` est créé une fois au chargement du module (`App.jsx:52`) et ne change pas en cours de session.
- **7 : vérifié.** Aucun document ni flux de la CI n'appelle `test:contrats`.
- **8 : faux.** Les chemins des fichiers sont produits par BlockNote (`/assets/asset-N`), jamais par un nom saisi.
- **9 : à observer.** La campagne se joue aux étapes ; un message bénin, s'il apparaît, sera filtré nommément à ce moment-là.

## Arbitrage de Sylvain

(À compléter.)
