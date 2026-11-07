# BlockNote, Tiptap, y/hub : simplifient-ils la refonte ? (07/11/2026)

Suite de `docs/etude-refondation-coeur-2026-11-07.md`. Question posée par Sylvain : approfondir l'option BlockNote (ou Tiptap), si elle simplifie l'éditeur, et l'option y/hub pour le serveur.

Étude sur pièces : paquets npm téléchargés et lus (`@blocknote/core` 0.57.0, types et code compilé ; `@y/hub` 0.10.1, code source), documentation en ligne de BlockNote (`blocknotejs.org`, pages Markdown), de Tiptap (`tiptap.dev`, extension Tracked Changes et tarifs) et de y/hub (`README.md`, `API.md`, `GETTING-STARTED.md`, `STORAGE-ARCHITECTURE.md`, `benchmarks/RESULTS.md` du dépôt `yjs/yhub`). Rien n'a été installé dans l'application ni lancé.

## Réponse courte

1. **BlockNote est l'intégration la plus avancée de la v2** : mode suggestion, info-bulles par auteur, versions, commentaires et client y/hub, tout est déjà câblé. Mais il impose son **modèle par blocs** (à la Notion), **React** pour son interface, **quatre couches** entre nous et le navigateur, et des licences **GPL ou commerciales** pour ses exports et son IA. Il simplifierait l'éditeur au prix du produit : amend.ink deviendrait un éditeur par blocs. **Pas comme fondation ; oui comme référence et comme banc d'essai.**
2. **Tiptap** (le cœur, MIT, sans React) apporte un cadre d'extensions et de commandes, rien sur le suivi : son suivi des modifications est une **option payante** d'une offre en nuage, et son extension de collaboration reste sur Yjs 13. La démo phare de `@y/prosemirror` 2 est écrite en Tiptap 3 : on peut s'en servir de modèle. **Gain modeste, facultatif.**
3. **y/hub fait exactement ce que nous aurions à construire** : attribution par compte, branche de suggestions avec ses propres droits, historique, retour arrière par auteur, versions nommées, agents IA attribués. Il remplacerait environ 2 500 lignes de notre serveur. Mais il est **sous AGPL ou licence commerciale**, il **exige Redis et PostgreSQL** (difficile sur le VPS de 1 Go), il est **en bêta** et ne sait pas dire « lecteur, mais commentaires permis » dans un même document. **Pas pour la production aujourd'hui ; oui dans le prototype**, pour apprendre et comparer, et à réexaminer si amend.ink grandit.
4. La simplification de l'éditeur vient de `@y/prosemirror` 2, pas de la couche au-dessus. La recommandation de l'étude précédente tient : **ProseMirror nu, `@y/prosemirror` 2, notre serveur**. Elle s'enrichit de deux essais courts dans le prototype (§ 4).

## 1. BlockNote

### Ce que c'est

Éditeur « par blocs » à la Notion, construit sur Tiptap 3 et ProseMirror, par l'équipe TypeCell. Version 0.57.0 (30/10/2026), toujours en 0.x. Interface fournie en React (variantes Mantine, shadcn, Ariakit), français compris dans les traductions.

| Paquet | Licence | Rôle |
|---|---|---|
| `@blocknote/core`, `react`, `mantine`, `server-util`, `code-block` | MPL-2.0 | l'éditeur, son interface, le traitement côté serveur |
| `@blocknote/xl-docx-exporter`, `xl-pdf-exporter`, `xl-odt-exporter`, `xl-typst-exporter` | **GPL-3.0 ou commerciale** | exports Word, PDF (PDF/UA), ODT, Typst |
| `@blocknote/xl-ai` | **GPL-3.0 ou commerciale** | IA dans l'éditeur |
| `@blocknote/xl-multi-column` | **GPL-3.0 ou commerciale** | colonnes |

La licence commerciale des paquets `xl-` fait partie de leur abonnement « Business ».

### Ce qu'il apporte déjà sur la v2

`@blocknote/core` 0.57 dépend **à la fois** de y-prosemirror 1.3.7 / Yjs 13 (`@blocknote/core/yjs`, la collaboration habituelle) et de `@y/prosemirror` 2 / `@y/y` 14 (`@blocknote/core/y`, la nouvelle). Dans la seconde, lue dans les types publiés :

- `SuggestionsExtension` : activer, désactiver, voir les suggestions ; appliquer ou rejeter une suggestion (par plage) ou toutes ; retrouver la suggestion sous le curseur ou sous la souris ;
- `AttributionExtension` : les marques `y-attributed-*` avec couleur par auteur tirée d'un annuaire d'utilisateurs, info-bulle (« inséré », « supprimé », « mis en forme », « attribut changé », avec les noms) ;
- `YVersioningExtension` et un stockage des versions **branché sur y/hub** (`YHubVersionStorage` : lister, comparer, restaurer, renommer, supprimer) ;
- `ForkYDocExtension` : travailler sur une copie du document, puis garder ou jeter les changements ;
- `DiffVersioningExtension` : montrer la différence entre deux versions, même sans serveur ;
- commentaires : fils, réponses, réactions, stockage dans Yjs (`YjsThreadStore`) ou derrière une API REST.

C'est, à notre connaissance, **le seul paquet publié qui intègre déjà le mode suggestion de la v2** (pas encore décrit dans sa documentation en ligne).

### Ce qu'il coûterait à amend.ink

1. **Le modèle par blocs.** Un document BlockNote est une liste de blocs (`id`, `type`, `props`, `content`, `children`) ; l'imbrication se fait par enfants (indentation), une liste est une suite de blocs « élément de liste ». Notre schéma (citation qui contient des paragraphes, listes imbriquées, tableaux, table des matières, séparateurs, images, notes de bas de page en ligne avec leur propre texte) serait à **refaire en blocs personnalisés**. Les notes de bas de page n'existent pas en standard : ce serait un contenu en ligne personnalisé (faisabilité de leur texte riche à vérifier).
2. **Les exports.** Les nôtres (`docxExport.js`, `typstExport.js`, `mdExport.js`, publication) lisent un arbre ProseMirror de **notre** schéma. Avec BlockNote : les réécrire sur son JSON, ou prendre ses exports `xl-` (GPL ou commerciale) et perdre notre mise en page (profils CSS, livre, colonnes, marges miroir).
3. **React.** Son interface est en React. Sans React, la documentation le dit : « on perd l'expérience prête à l'emploi », il faut écrire ses menus soi-même. amend.ink est en JavaScript sans cadre : l'adopter, c'est ajouter React, ou ne garder de BlockNote que son moteur.
4. **Quatre couches** au-dessus du navigateur : BlockNote → Tiptap → ProseMirror → `@y/prosemirror` → `@y/y`. Nos défauts de saisie (touches mortes en suggestion, Ctrl+Z) se corrigent au niveau de `@y/prosemirror` ou de ProseMirror. BlockNote ne les règle pas, il ajoute une couche à suivre, en 0.x, avec des ruptures fréquentes.
5. **L'expérience Notion** (poignées de blocs, menu « / », glisser-déposer de blocs) n'est pas celle d'un éditeur de livre à la Google Docs. Elle se personnalise, mais contre le sens de l'outil.
6. **Les licences GPL des paquets `xl-`** : pour un produit fermé, l'abonnement est nécessaire dès qu'on en utilise un.

### Verdict

BlockNote simplifierait l'éditeur **si amend.ink acceptait de devenir un éditeur par blocs** et de reprendre ses exports. Ce n'est pas notre produit : notre valeur est dans le livre (mise en page, exports propres, notes, typographie). **On ne le prend pas comme fondation.**

Mais il a deux usages précieux :

1. **Référence de code** : `SuggestionsExtension`, `AttributionExtension`, la gestion des versions sont l'intégration la plus aboutie de la v2. Lire comment ils font (licence MPL-2.0 : on peut reprendre un fichier, à condition de publier nos modifications de ce fichier).
2. **Banc d'essai** : rejouer nos six critères (touche morte sur une sélection, Ctrl+Z, suggestion d'autrui, plusieurs paragraphes, touche morte contre un curseur, tout accepter / tout rejeter) sur BlockNote en mode suggestion. S'il passe là où la v2 nue échoue, c'est qu'il a contourné le défaut dans sa couche, et on saura où regarder.

## 2. Tiptap

### Ce que c'est

Une couche au-dessus de ProseMirror : le schéma et les greffons y deviennent des « extensions », avec une API de commandes enchaînées. Le cœur (`@tiptap/core` 3.33.0, 05/11/2026) et les extensions de base sont **MIT et sans cadre** : utilisables sans React, contrairement à BlockNote.

### Le suivi et la collaboration chez Tiptap

- **Collaboration** : l'extension officielle repose sur `@tiptap/y-tiptap`, dérivé de y-prosemirror 1.x, **sur Yjs 13**. Pas de v2.
- **Suivi des modifications** : `@tiptap-pro/extension-tracked-changes`, présenté comme **option payante** (« paid add-on ») des offres Tiptap ; ces offres sont pensées pour leur nuage (« cloud documents »), l'hébergement privé est réservé à l'offre Entreprise. Tarifs publiés : Start 59 $/mois, Team 179 $/mois, Business 1 199 $/mois (facturation mensuelle), le suivi en sus, prix non publié.
- **Avec la v2** : la démo phare de `@y/prosemirror` 2 (`yhub-tiptap-demo`) est en Tiptap 3, avec un schéma durci et des gardes contre les greffons « réparateurs ». Tiptap et la v2 cohabitent, mais c'est nous qui câblons, comme avec ProseMirror nu.

### Ce que Tiptap simplifierait

1. Les extensions toutes faites : listes, tableaux, listes de tâches, typographie, compteur de caractères, texte d'attente.
2. Les commandes (`editor.chain().focus().toggleBold().run()`) : une partie de `commandesBarre.js`, `barreOutils.js`, `raccourcis.js` deviendrait plus courte.
3. Un schéma durci tout prêt à reprendre (celui de la démo), pour les nœuds standard.

### Ce qu'il ne simplifie pas

1. Le suivi, les rôles, l'attribution, l'IA dans le texte : rien de plus que la v2.
2. Notre schéma propre (notes, coupures, images à dimensions, table des matières, styles de paragraphe) reste à écrire, en extensions au lieu de nœuds.
3. Une couche de plus à suivre (Tiptap 3 publie toutes les semaines).
4. L'audit de la v2 rejette **10 types de nœuds** du schéma standard de Tiptap (`StarterKit` et tableaux) : il faut les durcir comme les nôtres.

### Verdict

Tiptap n'apporte rien au cœur du problème (le suivi) et sa version payante est hors de question. Son cœur libre rendrait le code d'interface un peu plus court si l'on réécrivait l'éditeur de zéro. **Facultatif, non recommandé par défaut** : ProseMirror nu garde une couche de moins entre nous et `@y/prosemirror` 2, dont la documentation est écrite pour ProseMirror. On réexaminera la question si le prototype montre que la plomberie des commandes pèse.

## 3. y/hub

### Ce que c'est

Le serveur de référence de Yjs 14, écrit par l'auteur de Yjs (Kevin Jahns). `@y/hub` 0.10.1 (16/10/2026), 42 versions depuis février 2026, dit « logiciel bêta » dans son README. Serveur WebSocket compatible y-websocket (et le fournisseur de Tiptap), plus une API REST.

### Ce qu'il fait (et que nous aurions à construire)

| Fonction de y/hub | Chez amend.ink aujourd'hui, ou à construire |
|---|---|
| **Attribution automatique** : chaque opération est inscrite dans la table de contenu au nom du compte authentifié, avec la date ; attributions libres par connexion (`customAttributions`, ex. `source:ai`) | à construire (étude précédente, jalon 3) |
| **Branches** : une copie du document (`?branch=suggestions`) avec ses propres droits | à construire (deux documents par salle) |
| **Droits par document et par branche** : lire, écrire, présence, historique, versions, suppression, retour arrière, chacun accordé à part (`createAuthorize`) | `roles.js` + `rooms.js` + `correcteur.js` |
| **Historique et activité** : liste des modifications groupées par auteur et par intervalle, différence rendue à n'importe quel moment (`/activity`, `/changeset`) | `routes/versions.js`, `comparaison.js` (partiellement) |
| **Retour arrière** : annuler toutes les modifications d'un auteur, ou d'un intervalle, ou depuis une version (`/rollback`) | restaurer une version entière seulement |
| **Versions nommées** (`/version`) | `routes/versions.js` |
| **Agents IA** : `agentTask` ouvre le document, l'agent écrit, ses modifications sont diffusées en direct, attribuées à l'agent et à qui l'a sollicité (`promptBy`), avec sa présence (curseur, nom) | `agentTexte.js` (écriture), `presenceAgents.js` (présence) |
| **Compactage**, documents avec et sans ramasse-miettes, suppression douce ou définitive, import | `journal.js`, `replique.js`, corbeille |
| Mise à l'échelle sur plusieurs serveurs | sans objet pour nous |

Ce que y/hub remplacerait dans notre serveur : `ws.js` (319 lignes), `rooms.js` (357), `replique.js` et son worker (609 +), `journal.js` (426), `correcteur.js` (229), `presenceAgents.js` (104), l'essentiel de `routes/versions.js` (154) et de `comparaison.js` (312). **Environ 2 500 lignes**, plus l'attribution qu'on n'aurait pas à écrire.

### Ce qu'il coûterait

1. **La licence : AGPL-3.0 ou commerciale.** Sous AGPL, quiconque utilise le service par le réseau doit pouvoir obtenir le code source du programme qui le rend, modifications comprises. Le serveur y/hub de notre installation inclurait **notre greffon d'authentification et nos règles de droits** (ils tournent dans le même processus) : ce code-là serait à publier sous AGPL. Le reste d'amend.ink, processus séparé qui parle à y/hub par HTTP, est en principe un programme distinct, mais **c'est à faire confirmer par un juriste**, surtout si amend.ink devait un jour être installé chez des tiers. Licence commerciale : sur demande à l'auteur, prix non publié.
2. **L'infrastructure** : Redis (6.2 ou plus, ou Valkey) et PostgreSQL obligatoires ; S3 facultatif (les données restent alors dans PostgreSQL). Aujourd'hui : un seul service Node, des fichiers dans `data/`, MemoryMax 700 Mo sur un VPS de 1 Go. Ajouter PostgreSQL, Valkey et le processus y/hub (uWebSockets.js, binaire natif récupéré depuis GitHub) sur 1 Go est **très serré** : probablement un VPS plus grand, à mesurer. Les sauvegardes changent de nature (le NAS tire des fichiers ; il faudrait des exports PostgreSQL).
3. **Trois services à exploiter au lieu d'un** : démarrage, surveillance, mises à jour, pannes. Pour une petite structure, c'est le coût le plus durable.
4. **Le modèle de performance** : y/hub ne garde pas le document en mémoire. Après des modifications, chaque synchronisation initiale redécode le document entier : d'après leurs mesures (machine de 62 Go), ~40 ms pour 1 Mo, ~200 ms pour 5 Mo, ~830 ms pour 20 Mo, avant compactage. Notre réplique en mémoire ouvre plus vite les documents actifs ; sur 1 vCPU, l'écart serait plus marqué. À mesurer sur un livre.
5. **Les commentaires et le lecteur** : les droits de y/hub portent sur un document ou une branche entière. « Lire le texte mais écrire ses commentaires dans le même document Yjs » (notre règle `verifierLecteur`) ne s'exprime pas. Il faudrait sortir les commentaires du document Yjs (une API à part, comme le fait BlockNote avec son stockage REST des fils de commentaires) : un changement de conception de `comments.js`.
6. **La maturité** : bêta, 0.x, dépend de `@y/y` en pré-version ; des versions toutes les semaines en août, toutes les deux à quatre semaines depuis.

### Les trois façons de s'en servir

1. **L'adopter en production** : pas aujourd'hui (licence, infrastructure, bêta, commentaires).
2. **S'en inspirer** : garder notre serveur et reprendre ses idées et la forme de son API : branche de suggestions, table de contenu par compte, activité groupée par auteur, retour arrière par auteur, `agentTask` pour Margo. Les briques sont dans `@y/y` (MIT). C'est la voie recommandée.
3. **L'utiliser dans le prototype** : son conteneur autonome (`docker run ghcr.io/yjs/yhub/standalone`) peut servir de serveur de référence aux jalons 2 et 3. On compare ensuite avec notre implémentation de l'attribution. Le prototype n'est offert à personne par le réseau : l'AGPL n'y crée pas d'obligation de publication.

Si amend.ink grandissait au point de demander plusieurs serveurs, la question d'une licence commerciale de y/hub se reposerait : c'est son cas d'usage.

## 4. Synthèse

| Combinaison | Code à nous | Couches au-dessus du navigateur | Licences | Infrastructure | Adapté au livre | Maturité |
|---|---|---|---|---|---|---|
| **A. ProseMirror nu + `@y/prosemirror` 2 + notre serveur** (recommandée) | moyen (attribution et branches à écrire, ~500 lignes estimées) | 2 | MIT | inchangée | oui | pré-versions Yjs 14 |
| B. Tiptap (cœur libre) + `@y/prosemirror` 2 + notre serveur | un peu moins d'interface, autant de cœur | 3 | MIT | inchangée | oui | idem + Tiptap |
| C. ProseMirror nu + `@y/prosemirror` 2 + y/hub | le moins de serveur (−2 500 lignes) | 2 | **AGPL ou commerciale** | **+ PostgreSQL + Valkey** | oui | + bêta de y/hub |
| D. BlockNote + y/hub (clé en main) | le moins de tout | 4 | MPL + **GPL / commerciale** (exports, IA) + **AGPL / commerciale** | **+ PostgreSQL + Valkey** | **non** (blocs à la Notion, React) | 0.x partout |

La combinaison D est la plus rapide pour obtenir « un Google Docs avec suggestions et historique ». Ce n'est pas notre produit. La combinaison C est la plus économe en code, au prix d'une dépendance de licence et d'exploitation qui pèse plus lourd pour une petite structure que les ~2 000 lignes de serveur qu'elle remplace. **A reste la cible.**

## 5. Ce que cela change au prototype

Deux essais courts s'ajoutent au plan de l'étude précédente, sans en changer l'ordre :

1. **Jalon 0, BlockNote comme banc d'essai** : monter son exemple de suggestions (`@blocknote/core/y`, versions exactes), rejouer nos six critères. Résultat attendu : savoir si les défauts touche morte et Ctrl+Z tiennent à `@y/prosemirror` lui-même ou à la façon de l'intégrer, et lire leur code là où il passe.
2. **Jalons 2 et 3, y/hub comme serveur de référence** : brancher le prototype une fois sur y/hub (conteneur autonome), une fois sur notre serveur minimal ; comparer l'attribution, les droits par branche, l'activité. Résultat attendu : une implémentation à nous, calquée sur ce qui marche chez y/hub, et une mesure réelle de son coût en mémoire et en temps d'ouverture.

## Décisions à prendre (Sylvain)

1. Écarter BlockNote comme fondation, le garder comme référence et banc d'essai (jalon 0).
2. Écarter Tiptap par défaut (ProseMirror nu), quitte à y revenir après le prototype.
3. Écarter y/hub en production pour l'instant ; l'utiliser comme serveur de référence dans le prototype et reprendre sa conception dans notre serveur.
4. Si l'option y/hub en production devait être rouverte un jour : consulter un juriste sur l'AGPL et demander le prix d'une licence commerciale.

## Sources

- `@blocknote/core` 0.57.0 (npm) : `package.json`, `types/src/y/` (extensions `Suggestions`, `AttributionExtension`, `ForkYDoc`, `DiffVersioningExtension`, `versioning/yhub`), `dist/y.js`. Licences des paquets `@blocknote/*` sur npm.
- `blocknotejs.org` : `llms.txt`, pages Collaboration, Comments, Document Structure, Typst export, Vanilla JS.
- `tiptap.dev` : extension Tracked Changes, page des tarifs (07/11/2026). `@tiptap/extension-collaboration` 3.33.0 et `@tiptap/y-tiptap` 3.2.0 (npm).
- `@y/hub` 0.10.1 (npm) : `README.md`, `LICENSE`, `src/agents.js` ; dépôt `yjs/yhub` (branche `master`) : `API.md`, `GETTING-STARTED.md`, `STORAGE-ARCHITECTURE.md`, `benchmarks/RESULTS.md`.
- `yjs/y-prosemirror` : `yhub-tiptap-demo/README.md`, `ATTRIBUTION.md`.
- Code d'amend.ink : `server/ws.js`, `rooms.js`, `replique.js`, `journal.js`, `correcteur.js`, `presenceAgents.js`, `routes/versions.js`, `comparaison.js`.
