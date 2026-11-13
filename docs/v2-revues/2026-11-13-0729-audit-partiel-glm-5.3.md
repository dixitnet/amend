# Audit partiel avant fusion (2026-11-13)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 277892 signes envoyés, 4645 reçus (et 13846 de réflexion) ; réflexion `low` ; 25 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `b2ded42` (22 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff remplace le refus systématique de la frappe au contact d'une suggestion (y-prosemirror#245) par un correctif temporaire dans l'adaptateur BlockNote, qui replace la frappe simple dans le texte ; il renomme « Suggestions » en « Corrections », retire la case « Retenir ce modèle », et restreint les fils de commentaires à la colonne de droite. L'ensemble est bien testé (unitaire, pile, design) et documenté (ADR 0008 et 0011 mises à jour). Les constats portent surtout sur la surface d'API de Yjs utilisée par le correctif, l'inscription du correctif dans la veille, et deux points d'accessibilité et de logique en marge.

## Constats
1. **[question]** Grille 2 (API publique) — `v2/adaptateurs/blocknote/correctif-245.js:86`, `v2/adaptateurs/blocknote/correctif-245.js:164`, `v2/adaptateurs/blocknote/correctif-245.js:168-170`. Le correctif s'appuie sur `afficheur.suggestionOrigins`, `afficheur.attributed`, `afficheur.inserts`, `Y.iterateStructsByIdSet`, `Y.createDeleteSetFromStructStore`, `Y.intersectSets`, `Y.diffIdSet` : le commentaire affirme que seule la surface publique est utilisée, mais rien dans le dossier ne prouve que ces membres du `DiffRenderer` et ces exports de `@y/y` sont documentés (règle 2 : seulement l'API publique). Proposer de vérifier chacun dans la documentation de Yjs 14 et de l'écrire dans le contrat du correctif ; tout membre non documenté devrait être signalé ou remplacé.
2. **[question]** Grille 11 / § 4.5 des règles — `v2/adaptateurs/blocknote/correctif-245.js:1-6`. Le correctif temporaire doit être « listé dans `docs/v2-veille.md` » avec son ticket amont et sa date de réexamen ; l'en-tête y renvoie, mais le diff ne montre aucune mise à jour de `docs/v2-veille.md`. Vérifier que le ticket y-prosemirror#245 et la date du 13/12/2026 y figurent bien ; sinon, compléter la veille dans le même lot.
3. **[mineur]** Grille 22 (accessibilité) — `v2/design/composants/PanneauSuggestions.jsx:76`. Le nom de l'auteur devient un bouton cliquable mais `tabIndex={-1}` l'exclut de la navigation au clavier ; le commentaire dit que « le passage dessous fait la même chose », mais rien ne garantit que le passage (une `Paper` en `li`) soit activable au clavier. Proposer de vérifier au clavier le parcours de la carte, ou de rendre le passage lui-même focusable.
4. **[question]** Grille 6 (cas limite) — `v2/design/composants/PanneauSuggestions.jsx:46`. Le titre « Aucune correction » ne s'affiche que si `lignes`, `invitation` et `actionsGlobales` sont tous absents/vides ; si l'application passe encore `actionsGlobales` quand la liste est vide (cas « invisibles »), le message n'apparaîtra jamais. Les tests de pile semblent passer, mais confirmer que `actionsGlobales` n'est jamais fourni avec une liste vide, ou assouplir la condition.
5. **[question]** Grille 7 (tests) — `v2/adaptateurs/blocknote/suggestions.js:281-289` et `v2/contrats/pile/relecture.test.js:129-139`. Le test de pile vérifie l'absence de bulle au clic et l'insertion du texte replacé, mais ni la position du curseur après une frappe replacée (`curseurApresFrappe`), ni la saisie flottante d'un nouveau commentaire avec `comments={false}` (`v2/adaptateurs/blocknote/index.jsx:836-838`) ne sont testés. Proposer un scénario de pile pour les deux, ou noter pourquoi ils ne peuvent pas l'être.
6. **[mineur]** Grille 1 (couches) — `v2/adaptateurs/blocknote/correctif-245.js:24`. L'adaptateur BlockNote importe `@y/y` directement, alors que le graphe réserve chaque fondation à son adaptateur et qu'un adaptateur `yjs/` existe ; le motif est toutefois préexistant (`suggestions.js` importe déjà `@y/y` et `@y/prosemirror`). Si c'est un écart assumé, l'inscrire dans les règles (comme les exceptions de la règle 1) ; sinon, faire passer le correctif par l'adaptateur yjs.
7. **[mineur]** Grille 6 (correction) — `v2/application/client/useExport.jsx:47`. Le `.catch(() => {})` avale toute erreur de rétention du modèle, y compris les erreurs autres que réseau (droit perdu entre-temps, document supprimé) : la décision de l'audit du 12/11/2026 est respectée, mais un échec répété restera invisible pour la personne et pour les journaux. Proposer d'au moins tracer l'échec côté client ou serveur.

## Points de grille sans remarque
8 (licences), 9 (traductions : renommage cohérent dans les deux catalogues, suppression de `export.retenir` des deux, ICU intact), 3 (redondance amont : le correctif contourne un défaut signalé, avec test d'amont qui sonnera le départ), 5 (sécurité et droits : l'arbitrage en Corriger reste conditionné à `caps.includes('arbitrer')`, côté client pour l'affichage, le serveur garde la décision).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides

## Réponse de Claude

1. **Déjà répondu** (audit de 06 h 44, constat 1) : ce sont des exports du paquet `@y/y` et des champs documentés de l'afficheur dans son code (`Renderer.js`). Yjs 14 est en préversion et n'a pas d'autre documentation que son code : la veille demande de les vérifier à chaque montée.
2. **Faux** : `docs/v2-veille.md` est à jour dans ce lot (ligne de #245 complétée ; ligne du correctif dans « Contournements en place », avec la date du 13/12/2026 et la marche de débranchement). Le diff envoyé à l'auditeur était tronqué.
3. **Faux** : le passage est un bouton (`UnstyledButton`, `data-amend-carte`), atteint au clavier, qui amène le texte à la suggestion.
4. **Faux** : `actionsGlobales` n'est fourni que dans le cas « invisibles », où l'invitation dit déjà ce qui se passe ; sans rien en attente, le titre « Aucune correction » s'affiche (tests de la pile : « Aucune correction »).
5. **Juste** pour le curseur, corrigé : le test de la pile tape deux lettres au contact et vérifie leur ordre dans le texte. La saisie flottante d'un commentaire est déjà couverte (« commentaire du correcteur » : il crée le fil par la saisie flottante).
6. **Question pour Sylvain** : l'adaptateur BlockNote importe `@y/y` depuis l'origine (`suggestions.js`), parce que l'afficheur de Yjs se monte avec l'éditeur. Inscrire cette exception dans les règles, ou déplacer ce code dans l'adaptateur Yjs dans un lot à part ?
7. **Accepté tel quel** : décision de l'audit du 12/11 ; l'échec côté serveur est déjà journalisé par la route.

## Arbitrage de Sylvain

(À compléter.)
