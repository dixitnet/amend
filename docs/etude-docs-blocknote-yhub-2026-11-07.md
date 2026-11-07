# Docs (La Suite numérique), BlockNote, y/hub : quelle architecture pour amend.ink ? (07/11/2026)

Troisième étude du jour, après `docs/etude-refondation-coeur-2026-11-07.md` et `docs/etude-blocknote-tiptap-yhub-2026-11-07.md`. Les prémisses ont changé : **peu d'utilisateurs, des règles qu'on peut changer, pas de perspective commerciale arrêtée, et la préférence pour un noyau stable bâti sur des applications solides développées par d'autres.** Sylvain demande une réflexion d'architecture générale : reprendre les pistes BlockNote et y/hub, analyser en détail l'architecture de Docs, mesurer les écarts avec nos besoins, dire ce qui peut nous inspirer, et examiner un fork de Docs ou des propositions à Docs.

Étude sur pièces : dépôts et documentation de Docs, BlockNote, y/hub et y-prosemirror (liens en fin de document), paquets npm. Pas d'essai.

## Réponse courte

1. **Docs, BlockNote, y/hub et `@y/prosemirror` 2 forment une seule chaîne**, européenne et en bonne partie financée par des fonds publics :
   - **y/hub** est le serveur de Yjs 14, par l'auteur de Yjs ;
   - **BlockNote** est l'éditeur, co-développé avec `@y/prosemirror` 2 (Nick Perez contribue aux deux) ;
   - **Docs** est l'application de l'État français (DINUM), avec ZenDiS (Allemagne). Elle est passée de Hocuspocus à y/hub dans sa version 6.0.0 (05/10/2026). L'équipe BlockNote y prépare la migration vers Yjs 14 et l'historique des versions ([PR #2895](https://github.com/suitenumerique/docs/pull/2895)).
   - Docs a ouvert une épopée « Suggestion mode » fondée sur cette même technique ([#2491](https://github.com/suitenumerique/docs/issues/2491)).

   **Le suivi des modifications que nous voulons est en train d'être construit, dans cette chaîne, par d'autres.**
2. **Avec les nouvelles prémisses, les objections de licence tombent** : l'AGPL de y/hub et la GPL des paquets `xl-` de BlockNote demandent de publier notre code, pas de le vendre. Restent deux objections de fond : le **modèle par blocs** de BlockNote, moins adapté au livre, et le **poids d'exploitation** de Docs.
3. **Docs tel quel ne nous convient pas.**
   - Il exige une authentification OIDC (Keycloak ou autre), Django, Celery, deux PostgreSQL, Redis, Valkey, S3 et Next.js : environ 4 Go de mémoire au minimum selon sa propre documentation, contre 1 Go aujourd'hui.
   - Il est pensé pour la base de connaissances (à la Notion), pas pour le livre.
   - Il lui manque nos besoins propres : notes de bas de page, typographie française, mise en page de livre, correcteur, Margo sur un livre entier.
4. **Un fork de Docs serait une erreur** : l'équipe publie environ 160 commits en cinq semaines, et nos ajouts touchent le cœur de l'éditeur et du backend. Nous passerions notre temps à rattraper l'amont.
5. **La voie recommandée est un « Docs allégé »** : reprendre l'architecture et les briques de Docs (BlockNote, y/hub, séparation « qui a le droit » / « ce que dit le document »), mais garder notre serveur Node pour les comptes, les droits, l'IA, les exports et la publication. En parallèle, **proposer en amont** ce qui est générique (rôle de correcteur dans le mode suggestion, notes de bas de page, typographie française, modèle d'export PDF) pour que la chaîne commune porte nos besoins. Si Docs les adopte, devenir un jour une simple instance de Docs plus des services satellites reste possible.

## 1. Ce que changent les nouvelles prémisses

| Objection des études précédentes | Avec les nouvelles prémisses |
|---|---|
| AGPL de y/hub (notre greffon d'authentification serait à publier) | acceptable : publier ce code, voire tout amend.ink sous AGPL, ne coûte rien sans projet commercial |
| GPL des paquets `xl-` de BlockNote (exports, IA, colonnes) | acceptable au même titre ; ou s'en passer (Docs sait se construire sans eux : `PUBLISH_AS_MIT=true`) |
| Règles actuelles du suivi (D2, groupes, couleurs stockées) | renégociables : on adopte les règles de l'outil |
| Migration des documents | peu de documents, peu d'utilisateurs : une migration accompagnée, document par document, est envisageable |
| « Garder la main sur tout » | remplacé par « un noyau stable fait par d'autres, et nos ajouts autour » |

Restent : le **modèle par blocs** (§ 3), le **poids d'exploitation** (§ 4 et 5), le **calendrier** de Yjs 14 et du mode suggestion, et la **règle 4** de nos notes (ne pas alourdir l'application de fonctions marginales), qui s'applique aussi à ce que nous proposerions en amont.

## 2. La chaîne : qui fait quoi

```
Yjs 14 (@y/y)  ─ Kevin Jahns
   │
@y/prosemirror 2 ─ Kevin Jahns, Nick Perez (BlockNote)
   │
BlockNote 0.57 ─ TypeCell (Yousef El-Dardiry, Matthew Lipski, Nick Perez), soutien NLnet
   │                              ┌─ y/hub 0.10 (@y/hub) ─ Kevin Jahns, AGPL ou commerciale
Docs v6 ─ DINUM, ZenDiS, communauté (MIT) ─┘
```

- Docs dépend de BlockNote 0.57 et l'utilise pour l'éditeur, les commentaires, les exports et l'IA. Son serveur de collaboration est y/hub depuis la v6.0.0 ([CHANGELOG](https://github.com/suitenumerique/docs/blob/main/CHANGELOG.md), [PR #2556](https://github.com/suitenumerique/docs/pull/2556)).
- BlockNote embarque déjà le mode suggestion de `@y/prosemirror` 2, l'historique des versions et un client pour y/hub (`@blocknote/core/y`).
- L'équipe BlockNote prépare dans Docs le passage du navigateur à Yjs 14, l'historique des versions et des exports PDF par Typst ([PR #2895](https://github.com/suitenumerique/docs/pull/2895), brouillon).
- Instances connues : `docs.numerique.gouv.fr` (DINUM), `docs.suite.anct.gouv.fr` (ANCT), openDesk de ZenDiS, des coopératives et des associations ([liste](https://github.com/suitenumerique/docs/blob/main/documentation/instances.md)).

C'est un écosystème cohérent, actif, européen, en partie financé par des fonds publics. S'appuyer dessus répond exactement à « un noyau stable bâti par d'autres ».

## 3. Piste BlockNote, reprise

### Ce qu'il apporte

| Besoin d'amend.ink | BlockNote 0.57 |
|---|---|
| Éditeur collaboratif | oui, sur Yjs 13 (`@blocknote/core/yjs`) ou Yjs 14 (`@blocknote/core/y`) |
| Mode suggestion, accepter, rejeter, auteur et couleur par personne | oui sur Yjs 14 (`SuggestionsExtension`, `AttributionExtension`) |
| Historique des versions, comparaison, restauration | oui (`YVersioningExtension`), stockage sur y/hub fourni |
| Commentaires : fils, réponses, réactions, résolution | oui ; stockage dans Yjs, ou **écriture par une API REST** (`RESTYjsThreadStore`), ce qui permet à un lecteur de commenter sans écrire dans le document |
| IA dans l'éditeur, propositions acceptables ou rejetables | oui (`xl-ai`, GPL), sur le Vercel AI SDK, tout modèle |
| Exports Word, ODT, PDF, **Typst** | oui (`xl-*`, GPL) ; Markdown et HTML en MPL |
| Traitement côté serveur (Yjs ↔ blocs, Markdown, HTML) | oui (`@blocknote/server-util`) |
| Interface en français | oui |

### Ce qui coince

1. **Le modèle par blocs.** Un document est une liste de blocs imbriqués (`id`, `type`, `props`, `content`, `children`) ; une citation est un bloc à un seul paragraphe, une liste une suite de blocs « élément ».
   - Pour un livre, c'est acceptable : paragraphes, titres, citations, listes, images, tableaux, séparateurs.
   - Les **notes de bas de page** sont à créer en « contenu en ligne personnalisé » à texte riche (`content: "styled"`, prévu par l'API) : faisable, pas fourni.
   - Notre table des matières, nos styles de paragraphe et nos coupures deviennent des blocs ou des propriétés personnalisés.
2. **React.** L'interface fournie est en React (variantes Mantine, shadcn, Ariakit). Une refonte de l'écran d'édition est de toute façon prévue ; la faire en React avec BlockNote est cohérent.
3. **L'expérience Notion** (poignées de blocs, menu « / »). Docs l'a gardée ; pour un livre, on peut masquer poignées et menu latéral (composants personnalisables).
4. **Une 0.x qui bouge** : une version mineure toutes les deux à quatre semaines, souvent avec des ruptures annoncées ([CHANGELOG](https://github.com/TypeCellOS/BlockNote/blob/main/CHANGELOG.md)). Docs suit ce rythme ; nous le suivrions aussi.
5. **Nos défauts de saisie ne sont pas réglés par BlockNote** : son mode suggestion enveloppe `@y/prosemirror` 2 en 174 lignes, et les défauts touche morte et Ctrl+Z viennent de la couche du dessous. Ils seront corrigés pour tout le monde, ou pour personne.

**Verdict révisé** : BlockNote devient **un bon candidat de fondation pour l'éditeur**, au prix du modèle par blocs. Ce prix est acceptable pour un livre, à condition d'ajouter les notes de bas de page.

## 4. Piste y/hub, reprise

### Ce qu'il apporte

Ce que l'étude précédente avait relevé (attribution par compte, branches, historique, activité, retour arrière par auteur, versions nommées, agents IA attribués, droits fins par document) reste vrai. Deux faits nouveaux changent son évaluation :

1. **Il tourne en production chez Docs** depuis la v6.0.0. L'intégration est publique et très bien documentée ([`src/yhub-server/README.md`](https://github.com/suitenumerique/docs/blob/main/src/yhub-server/README.md)) : greffon d'authentification qui interroge le backend, tableau des droits, cache des autorisations, métriques, migration des anciens documents, suppression et restauration.
2. **Docs l'utilise avec des navigateurs encore sur Yjs 13** (y-prosemirror 1.3.7). Le serveur est en Yjs 14, les clients migreront ensuite. Une migration progressive est donc possible.

### Ce qui coince

1. **Exploitation** : Valkey (ou Redis) et PostgreSQL obligatoires, S3 facultatif. Un processus peut faire serveur et worker à la fois (`YHUB_ROLE` non défini), ce qui suffit à notre échelle.
2. **Un seul mainteneur** (Kevin Jahns signe les commits récents), en bêta, 0.x. La dépendance de Docs, et donc de l'État, à ce projet le rend toutefois moins fragile qu'il n'y paraît.
3. **AGPL** : notre adaptateur serait publié sous AGPL, comme celui de Docs (section « License warning (AGPL) » de [son README](https://github.com/suitenumerique/docs/blob/main/src/yhub-server/README.md)). Le reste de l'application, qui ne lui parle que par HTTP et WebSocket, n'est pas concerné, selon Docs.
4. **Les commentaires d'un lecteur** : y/hub donne des droits par document entier. Docs a réglé la question en stockant les commentaires dans **sa base PostgreSQL**, par l'API de son backend. Avec BlockNote, `RESTYjsThreadStore` fait de même. Notre règle « un lecteur écrit ses commentaires dans le document » disparaît au profit de ce schéma.

**Verdict révisé** : y/hub devient **le bon candidat de serveur de collaboration**, sous condition d'exploitation (un VPS plus grand, à mesurer).

## 5. L'architecture de Docs, en détail

Source principale : [`documentation/architecture.md`](https://github.com/suitenumerique/docs/blob/main/documentation/architecture.md).

### Le principe

> « **Django owns who may do what, and the collaboration server owns what a document says.** »

Le backend décide qui a le droit ; y/hub tient le contenu. Le backend ne lit jamais le texte dans sa propre base, il ne l'a pas : il le demande à y/hub par son API REST, avec un jeton d'administration.

### Les services

| Service | Technique | Possède | Rôle |
|---|---|---|---|
| Frontend | Next.js exporté en fichiers statiques, BlockNote, servi par Nginx | rien | l'application dans le navigateur (avec un mode hors ligne par service worker) |
| Backend | Django, Django REST Framework | documents, utilisateurs, accès, invitations, pièces jointes, commentaires | seul juge des droits ; API REST ; « resource server » pour d'autres applications |
| Celery | Python | rien | courriers, indexation, cascades vers y/hub (suppression, changement d'accès sur une arborescence) |
| y/hub (serveur + worker) | Node, `@y/hub` | le contenu vivant des documents | WebSocket, historique, activité, retour arrière |
| y-provider | Node, Express, `@blocknote/server-util` | rien | conversions Yjs ↔ Markdown, HTML, JSON (export, recherche, IA) |
| Docspec | image externe | rien | import de `.docx` |

Stockages : PostgreSQL (backend), Redis (sessions, cache, file Celery), S3 ou MinIO (pièces jointes, anciennes versions), Valkey et PostgreSQL propres à y/hub, S3 facultatif pour y/hub.

### Les mécanismes à retenir

1. **Routage sur un seul nom de domaine** : `/` (frontend), `/api/v1.0/` (backend), `/collaboration/ws/…` et quelques routes REST de y/hub (historique, activité, retour arrière). Les routes d'administration de y/hub ne sont pas publiées.
2. **Autorisation déléguée** : à chaque ouverture de WebSocket, y/hub demande au backend l'identité (`users/me`) puis les droits sur le document (`documents/{id}/abilities`). Un backend muet donne une erreur 503, jamais une décision. Quand les droits changent, le backend demande à y/hub de revérifier les connexions ouvertes (`reset-connections`).
3. **Tableau des droits** ([`permissions.ts`](https://github.com/suitenumerique/docs/blob/main/src/yhub-server/src/permissions.ts)) : lecteur (`ydoc -r--`, ne publie pas sa présence), éditeur (`-ru-`, plus le retour arrière), jeton d'administration (tout). L'historique n'est visible **qu'à partir de la date d'accès** de la personne.
4. **Rôles** ([`choices.py`](https://github.com/suitenumerique/docs/blob/main/src/backend/core/choices.py)) : lecteur, commentateur, éditeur, administrateur, propriétaire ; accès par lien (restreint, authentifié, public) avec un rôle de lien. Les documents forment une **arborescence** dont les accès se transmettent.
5. **Confiance entre services** : jetons RS256 de courte durée dans les deux sens, chaque côté publiant sa clé publique (JWKS). Aucun secret partagé.
6. **Pièces jointes** : jamais servies directement ; chaque `/media/` passe par une sous-requête Nginx (`auth_request`) au backend, qui vérifie le droit de lecture et signe l'accès à l'objet.
7. **Conversions isolées** : seul y-provider comprend à la fois Yjs et le schéma BlockNote ; tout export, toute indexation et toute IA côté serveur passent par lui.
8. **IA** : v1 « sélection → remplacement » côté backend ; v2 avec BlockNote AI (barre d'outils, curseur IA qui agit comme un collaborateur, propositions acceptables ou rejetables). Fournisseur au choix (compatible OpenAI, Mistral), traces dans Langfuse.
9. **Authentification** : **OIDC uniquement** (ProConnect en production d'État, Keycloak en développement, tout fournisseur conforme ailleurs). Pas de mot de passe ni de lien magique.
10. **Exploitation** : Kubernetes (chart Helm) ou Docker Compose. Mémoire minimale annoncée pour la production, hors authentification et stockage : **environ 4 Go** ([`system-requirements.md`](https://github.com/suitenumerique/docs/blob/main/documentation/system-requirements.md), document de juin 2025, d'avant y/hub).

### Ce qui est en cours chez Docs

- **Mode suggestion** ([#2491](https://github.com/suitenumerique/docs/issues/2491), ouvert le 03/07/2026) : suggestions dans une copie du document, réservé aux personnes qui ont le droit d'éditer, couleur par nature de modification (insertion, suppression, mise en forme), puis mise en forme et propriétés de blocs.
- **Demande de modification avec relecture** ([#2156](https://github.com/suitenumerique/docs/issues/2156)) : proposer sans modifier, faire approuver.
- **Différence riche avec attribution par auteur** ([#119](https://github.com/suitenumerique/docs/issues/119)).
- **Yjs 14, historique BlockNote, export PDF par Typst** ([PR #2895](https://github.com/suitenumerique/docs/pull/2895), brouillon).
- **Modèle d'export PDF personnalisé** ([#680](https://github.com/suitenumerique/docs/issues/680), ouvert depuis mars 2025).
- **Serveur MCP** ([#1183](https://github.com/suitenumerique/docs/issues/1183), [PR #2646](https://github.com/suitenumerique/docs/pull/2646)).

## 6. Écarts entre Docs et nos besoins

| Besoin d'amend.ink | Docs aujourd'hui | Écart | Proposable en amont ? |
|---|---|---|---|
| Suivi des modifications (mode suggestion) | prévu (#2491), pour les éditeurs | calendrier | oui : y contribuer |
| **Correcteur** : propose, ne modifie pas | rôle « commentateur » sans suggestion | rôle manquant | **oui** : « commentateur qui peut suggérer » dans #2491 |
| Notes de bas de page | absentes, aucun ticket | manque | **oui**, dans BlockNote (contenu en ligne) puis Docs |
| Typographie française (espaces insécables, NFC, guillemets) | absente | manque | **oui**, extension BlockNote activée selon la langue |
| Mise en page de livre (profils, colonnes, marges miroir, veuves et orphelines) | exports simples ; modèle PDF demandé (#680) | gros écart | en partie : Typst arrive (#2895) ; notre mise en page de livre est trop spécifique pour l'amont (règle 4) |
| Margo : relecture d'un livre entier, côté serveur, limites en signes | IA sur la sélection, ou curseur IA dans l'éditeur | écart de nature | plutôt non (spécifique) ; à brancher par l'API ou par MCP |
| Inviter Claude (MCP) | en cours (#1183, PR #2646) | convergence | oui : suivre et contribuer |
| Connexion par lien magique, invitations nominatives | OIDC seulement | manque | peu probable en amont ; contournable par un fournisseur OIDC qui fait le lien magique |
| Page publiée | documents publics par lien, mode présentation | proche | non nécessaire |
| Compteur en signes | compteur de mots (#716) | petit | oui, petit |
| Back-office, journaux d'usage de l'IA | non | spécifique | non |
| Hébergement sur un petit VPS | ≥ 4 Go, une dizaine de services | gros écart | non : c'est leur choix d'échelle |
| Arborescence de documents | oui (sous-pages) | **avance de Docs** | utile pour nous : un livre = un document par chapitre |

## 7. Ce qui peut nous inspirer, quelle que soit l'option

1. **Séparer « qui a le droit » de « ce que dit le document »** : notre serveur garderait comptes, rôles et décisions ; le serveur de collaboration ne déciderait rien et demanderait.
2. **Un tableau de droits par facette** (contenu, présence, historique, retour arrière), testable sans base de données.
3. **L'historique limité à la date d'accès** de chacun : simple, sûr, et utile pour un correcteur invité en cours de route.
4. **Le retour arrière comme une opération ajoutée** (rien n'est détruit, tout se restaure), pas comme un remplacement du document.
5. **Les commentaires hors du document Yjs**, écrits par l'API : un lecteur commente sans droit d'écriture sur le texte.
6. **Un convertisseur unique** (y-provider) qui seul comprend Yjs et le schéma : exports, recherche et IA passent par lui. Chez nous : un module serveur unique pour lire le texte, comme `documentPourExport` aujourd'hui.
7. **Les pièces jointes sous `auth_request`** : Caddy sait faire la même chose (`forward_auth`).
8. **Les jetons RS256 et leurs JWKS** entre services, si nous en avons un jour plusieurs.
9. **L'arborescence de documents** : un livre en chapitres, chacun son document, avec des accès hérités.
10. **La construction sans les paquets GPL** (`PUBLISH_AS_MIT`), si nous voulions garder le choix de la licence.

## 8. Les options

### A. Refonte maison : ProseMirror nu, `@y/prosemirror` 2, notre serveur

Recommandation de la première étude. Nous gardons tout en main, mais **nous écrivons nous-mêmes ce que BlockNote et y/hub fournissent** (interface du suivi, versions, attribution, historique). Elle ne répond plus à la nouvelle prémisse.

### B. « Docs allégé » : BlockNote et y/hub, avec notre serveur Node pour le reste

- **Navigateur** : BlockNote (React) avec son mode suggestion, ses commentaires et son historique. Nos ajouts : notes de bas de page, typographie française, barre d'outils de livre, Margo.
- **Collaboration** : y/hub, un seul processus (serveur et worker), avec Valkey et PostgreSQL. Notre adaptateur sur le modèle de celui de Docs, publié sous AGPL.
- **Notre serveur Node** (l'actuel, allégé) : comptes et lien magique, rôles et décisions de droits (`abilities`), commentaires, IA (Margo, MCP, limites en signes), exports (notre Typst de livre, nourri par `server-util`), publication, back-office.
- **Ce qui disparaît chez nous** : `client/src/suivi/`, notre éditeur et ses greffons de cœur, `ws.js`, `rooms.js`, `replique.js`, `journal.js`, `correcteur.js`, `versions` et `comparaison`. C'est l'essentiel des chantiers difficiles de ces derniers mois.
- **Ce que ça coûte** :
  - un VPS plus grand, à mesurer ; ordre de grandeur 2 à 4 Go ;
  - React ;
  - la réécriture des exports sur le JSON de BlockNote ;
  - la migration des documents ;
  - suivre le rythme de BlockNote et de y/hub, comme Docs le fait.

### C. Fork de Docs

- **Ce qu'on gagne** : tout Docs d'un coup (arborescence, partage, commentaires, versions, imports et exports, IA, recherche, hors ligne, accessibilité).
- **Ce qu'on perd** :
  - le choix de la technique (Python et Django en plus de Node et React) et de l'exploitation (une dizaine de services, environ 4 Go ou plus, un fournisseur OIDC) ;
  - surtout, la maîtrise du rythme : nos ajouts (rôle de correcteur, notes, typographie, livre, Margo, lien magique) touchent l'éditeur et le backend. À environ 160 commits en cinq semaines en amont, chaque mise à jour serait une fusion douloureuse.
- **À écarter**, sauf si l'essentiel de nos ajouts était accepté en amont. Mais alors ce n'est plus un fork, c'est l'option D.

### D. Devenir une instance de Docs, avec des services satellites, et contribuer en amont

- Héberger Docs (ou le faire héberger, par exemple par une coopérative comme lasuite.coop, sans pouvoir le modifier dans ce cas), et brancher autour : Margo par l'API ou MCP, export de livre par l'API de contenu, publication.
- **Ce qu'on gagne** : le noyau le plus solide et le plus entretenu possible.
- **Ce qu'on perd** : la maîtrise du produit. Docs vise la base de connaissances du secteur public. Son équipe produit décide, et nos besoins de livre ne seront pas tous retenus. L'exploitation reste lourde.
- **Possible à terme**, si nos propositions (§ 9) sont acceptées. **Pas un point de départ.**

### Évaluation

| Critère | A. Maison | B. Docs allégé | C. Fork | D. Instance + satellites |
|---|---|---|---|---|
| Noyau fait par d'autres | partiel (Yjs, `@y/prosemirror`) | **éditeur et collaboration** | tout | tout |
| Code à nous au cœur | le plus | faible | élevé (le fork) | le moins |
| Adapté au livre | oui | oui, avec nos ajouts | oui, avec nos ajouts | partiellement |
| Exploitation | légère (1 Go) | moyenne (2 à 4 Go, 3 services) | lourde (~4 Go et plus, ~10 services, OIDC) | lourde, ou hébergée sans modification |
| Langages | JS | JS (React) | JS + Python | JS (satellites) |
| Dépendance au rythme d'autrui | faible | moyenne (BlockNote, y/hub) | **très forte** | totale |
| Maîtrise du produit | totale | forte | moyenne | faible |
| Licences | libres au choix | AGPL (adaptateur), GPL si `xl-` | MIT + AGPL + GPL | celles de Docs |
| Calendrier | Yjs 14 stable | Yjs 14 stable + suggestion BlockNote mûre | idem + Docs | idem + #2491 livré |

**Recommandation : B**, avec des contributions en amont qui gardent D ouverte.

## 9. Ce qu'on pourrait proposer à Docs et à BlockNote

Par ordre d'utilité pour nous et de chances d'être accepté :

1. **Dans le mode suggestion de Docs** ([#2491](https://github.com/suitenumerique/docs/issues/2491)) : un rôle « peut suggérer, ne peut pas modifier », entre commentateur et éditeur. C'est notre correcteur, et c'est aussi le besoin de [#2156](https://github.com/suitenumerique/docs/issues/2156). Contribution par l'expérience d'usage (nos campagnes de tests, nos règles), voire par du code.
2. **Signaler à `@y/prosemirror` les défauts de saisie en mode suggestion** (touche morte sur une sélection, Ctrl+Z après un remplacement), reproduits sur la v2 nue le 02/11 et sur BlockNote 0.57. Ils toucheront Docs dès qu'il passera en suggestion. C'est la contribution la plus utile à tous, et la moins coûteuse.
3. **Notes de bas de page** dans BlockNote (contenu en ligne à texte riche), puis dans Docs et ses exports. Utile à l'édition scientifique et administrative, pas seulement au livre.
4. **Typographie française** en extension BlockNote (espaces insécables avant `; : ! ?`, guillemets, NFC), activée par la langue du document. Reprend `shared/typographie.js`.
5. **Modèle d'export PDF** ([#680](https://github.com/suitenumerique/docs/issues/680)) par Typst, dès que #2895 aura fait entrer Typst : un mécanisme de modèle générique, pas notre mise en page de livre.
6. **Compteur en signes** à côté du compteur de mots : petit, utile à tout le monde de l'écrit.

Canaux : tickets GitHub (en anglais, selon leur [CONTRIBUTING](https://github.com/suitenumerique/docs/blob/main/CONTRIBUTING.md)), salon Matrix `#docs-official:matrix.org`, chef de produit (virgile-dev). Toute prise de parole publique est à décider par Sylvain.

## 10. Conséquences pour le prototype

Le plan de prototype de la première étude change de fondation :

1. **Éditeur** : BlockNote 0.57 sur Yjs 14, mode suggestion activé ; notes de bas de page en contenu personnalisé ; typographie française en extension.
2. **Collaboration** : y/hub en un seul processus avec Valkey et PostgreSQL. Adaptateur sur le modèle de celui de Docs : droits demandés à notre serveur, tableau lecteur / correcteur / éditeur, historique depuis la date d'accès.
3. **Notre serveur** : endpoint `abilities`, commentaires par API (`RESTYjsThreadStore`), Margo écrivant dans la copie de suggestions (agent attribué), export Typst à partir de `server-util`.
4. **Mesures** : mémoire totale sur une machine de la taille visée, ouverture d'un livre, nos critères de saisie à chaque nouvelle version de BlockNote.

Ce prototype vaut aussi pour l'option D : ce qu'il produit de générique (notes, typographie, rôle de suggestion) est ce que nous proposerions en amont.

## Décisions à prendre (Sylvain)

1. Retenir l'option B (« Docs allégé ») comme cible, plutôt que A (maison), C (fork) ou D (instance de Docs).
2. Accepter le modèle par blocs de BlockNote pour le livre, notes de bas de page ajoutées.
3. Accepter React pour l'écran d'édition.
4. Accepter l'AGPL (adaptateur y/hub), et choisir entre publier tout amend.ink sous licence libre ou seulement les parties qui l'exigent.
5. Accepter un VPS plus grand (mémoire à mesurer dans le prototype).
6. Choisir les propositions en amont à porter (§ 9), et qui les porte (prise de parole publique).
7. Lancer le prototype sur cette fondation.

## Liens

**Docs (La Suite numérique)**
- Dépôt : https://github.com/suitenumerique/docs
- Architecture : https://github.com/suitenumerique/docs/blob/main/documentation/architecture.md
- Collaboration : https://github.com/suitenumerique/docs/blob/main/documentation/collaboration.md
- Adaptateur y/hub : https://github.com/suitenumerique/docs/blob/main/src/yhub-server/README.md
- Droits y/hub : https://github.com/suitenumerique/docs/blob/main/src/yhub-server/src/permissions.ts
- Rôles : https://github.com/suitenumerique/docs/blob/main/src/backend/core/choices.py
- Ressources nécessaires : https://github.com/suitenumerique/docs/blob/main/documentation/system-requirements.md
- Variables d'environnement : https://github.com/suitenumerique/docs/blob/main/documentation/env.md
- Instances : https://github.com/suitenumerique/docs/blob/main/documentation/instances.md
- Journal des versions : https://github.com/suitenumerique/docs/blob/main/CHANGELOG.md
- Passage à y/hub : https://github.com/suitenumerique/docs/pull/2556
- Yjs 14, historique, PDF Typst (brouillon) : https://github.com/suitenumerique/docs/pull/2895
- Mode suggestion : https://github.com/suitenumerique/docs/issues/2491
- Demande de modification et relecture : https://github.com/suitenumerique/docs/issues/2156
- Différence avec attribution : https://github.com/suitenumerique/docs/issues/119
- Modèle d'export PDF : https://github.com/suitenumerique/docs/issues/680
- Serveur MCP : https://github.com/suitenumerique/docs/issues/1183 et https://github.com/suitenumerique/docs/pull/2646
- Contribuer : https://github.com/suitenumerique/docs/blob/main/CONTRIBUTING.md
- Démonstration : https://demo.docs.la-suite.eu/docs/6d1b6f7f-db33-4673-9277-4bf47b9881ec/

**BlockNote**
- Dépôt : https://github.com/TypeCellOS/BlockNote
- Documentation : https://www.blocknotejs.org/docs
- Collaboration : https://www.blocknotejs.org/docs/features/collaboration
- Commentaires : https://www.blocknotejs.org/docs/features/collaboration/comments
- Structure des documents : https://www.blocknotejs.org/docs/foundations/document-structure
- Contenu en ligne personnalisé : https://www.blocknotejs.org/docs/features/custom-schemas/custom-inline-content
- Traitement côté serveur : https://www.blocknotejs.org/docs/features/server-processing
- IA : https://www.blocknotejs.org/docs/features/ai
- Export Typst : https://www.blocknotejs.org/docs/features/export/typst
- Extension de suggestions : https://github.com/TypeCellOS/BlockNote/blob/main/packages/core/src/y/extensions/Suggestions.ts
- Exemple de suggestions à plusieurs : https://github.com/TypeCellOS/BlockNote/tree/main/examples/07-collaboration/10-suggestion-multi-editor
- Journal des versions : https://github.com/TypeCellOS/BlockNote/blob/main/CHANGELOG.md

**y/hub, Yjs, y-prosemirror**
- y/hub : https://github.com/yjs/yhub (API : https://github.com/yjs/yhub/blob/master/API.md ; démarrage : https://github.com/yjs/yhub/blob/master/GETTING-STARTED.md ; stockage : https://github.com/yjs/yhub/blob/master/STORAGE-ARCHITECTURE.md ; mesures : https://github.com/yjs/yhub/blob/master/benchmarks/RESULTS.md)
- Paquet : https://www.npmjs.com/package/@y/hub
- Yjs : https://github.com/yjs/yjs (attribution : https://github.com/yjs/yjs/blob/main/renderer.md)
- y-prosemirror v2 : https://github.com/yjs/y-prosemirror (attribution : https://github.com/yjs/y-prosemirror/blob/master/ATTRIBUTION.md ; limites : https://github.com/yjs/y-prosemirror/blob/master/CAVEATS.md)
