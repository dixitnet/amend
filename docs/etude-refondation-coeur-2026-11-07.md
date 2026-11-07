# Refonder le cœur d'amend.ink sur Yjs 14, `@y/prosemirror` 2 et ProseMirror (07/11/2026)

Question posée par Sylvain : les nouvelles versions de Yjs, de y-prosemirror et de ProseMirror permettent-elles de **reconstruire** le cœur d'amend.ink (éditeur, suivi des modifications, synchronisation, IA dans le texte) de façon plus simple et plus robuste, en s'appuyant sur leurs fonctions et en limitant le code propre à amend.ink, quitte à faire des compromis fonctionnels ? L'objectif n'est pas une mise à jour de l'application. Et comment développer un prototype en attendant que ces versions se stabilisent ?

Étude sur pièces : notre code, nos études du 02/11 (`diagnostic-editeur`, `alternatives-suivi`, `essai-y-prosemirror-v2`), la documentation et le journal des changements des dépôts `yjs/y-prosemirror` (branche `master`, versions jusqu'à 2.0.0-15 et entrées non publiées) et `yjs/yjs` (`renderer.md`, `src/utils/meta.js`), les tickets ouverts de ces deux dépôts, le registre npm. Rien n'a été installé dans l'application.

## Réponse courte

1. **Oui, sur le fond.** La conception de Yjs 14 et de `@y/prosemirror` 2 (les suggestions dans un document à part, l'auteur de chaque modification tenu par Yjs) supprime la cause commune de nos défauts : **nous réécrivons à la main chaque transaction de ProseMirror** pour en faire du suivi. Reconstruit sur elles, le cœur ne réécrit plus rien : on écrit normalement, dans le bon document. Le suivi, la règle du correcteur et l'écriture de l'IA deviennent des questions de **droits sur un document**, plus des analyses de texte.
2. **Pas encore, sur le calendrier.** `@y/y` (Yjs 14) est en 14.0.0-rc.29, `@y/prosemirror` en 2.0.0-15, sans date de version stable. Des tickets de fond sont encore ouverts sur Yjs 14 (intégration des mises à jour, annulation), et trois de nos six critères (touche morte, Ctrl+Z, suggestion d'autrui) échouent toujours.
3. **On peut commencer maintenant** par un prototype isolé, conçu pour absorber les changements d'API. Il servira à la fois à juger la refonte et à faire remonter nos défauts en amont.
4. **Prix à payer** : surtout l'affichage des modifications (moins fin que le nôtre au début), la règle D2 (on ne fait pas disparaître la proposition d'un autre) à renégocier, et une migration des documents existants. Voir § 6.

## 1. Le circuit d'une frappe en suivi, aujourd'hui

Une correctrice tape « ê » sur le mot « noir » sélectionné. Dix étapes, dont six sont du code à nous.

1. **Le navigateur** modifie la zone éditable (`contenteditable`) : touche morte « ^ » (composition ouverte), puis « ê ».
2. **ProseMirror** (`prosemirror-view`) lit le changement du DOM et en fait une transaction : un pas « remplacer `noir` par `^` », puis « remplacer `^` par `ê` ». La transaction porte la méta `composition`.
3. **Notre répartiteur** (`client/src/suivi/greffons.js`, `makeDispatchTransaction`) intercepte la transaction **avant** qu'elle soit appliquée. Si le suivi est actif et que la transaction est locale, il appelle la réécriture.
4. **La réécriture** (`client/src/suivi/reecriture.js`, `rewriteForTracking`) construit une autre transaction : « noir » est **gardé** avec la marque `deletion` (auteur, couleur, date, groupe), « ê » est inséré avec la marque `insertion`, la mise en forme et le lien du texte remplacé sont repris, le groupe est conservé pendant la composition (`suivi/composition.js`). Si elle ne sait pas faire, elle renvoie `null` : le geste est **refusé** s'il effacerait du texte (famille A du diagnostic), et passe hors suivi sinon.
5. **L'état** est mis à jour (`view.updateState`) : nos greffons recalculent leurs décorations (commentaires, panneau des modifications, notes, table des matières, curseurs).
6. **y-prosemirror 1.3.7** (`ySyncPlugin`) compare l'ancien et le nouveau paragraphe et écrit la différence dans le `Y.XmlFragment` du `Y.Doc` : le texte devient des `Y.XmlText` dont les **attributs** portent nos marques (`insertion: {user, userColor, ts, groupe}`). Notre correctif local (`client/patches/y-prosemirror+1.3.7.patch`, `updateYText`) n'y reformate plus que ce qui a changé.
7. **Yjs 13** produit une mise à jour binaire. Notre transport (`client/src/provider.js`) l'envoie au serveur sur la WebSocket.
8. **Le serveur** (`server/rooms.js`, `_onMessage`) regarde le rôle. Lecteur : seuls les commentaires sont admis (`verifierLecteur`). Correctrice : `appliquerCorrecteur` (`server/replique.js`) applique l'opération à la réplique, puis `server/correcteur.js` calcule la **base** (le texte sans rien d'en attente) avant et après, vérifie qu'elle n'a pas bougé et que tout ce qui est nouveau est signé de son nom. En cas de violation, la réplique est rechargée depuis le journal et le client prévenu.
9. **Persistance et relais** : l'opération est ajoutée au journal (`storage.appendUpdate`), puis relayée aux autres.
10. **Chez les autres**, y-prosemirror 1.x reconstruit le document ProseMirror à partir de Yjs (en remplaçant tout le document, d'où le curseur qui saute au même endroit : écart 11), puis nos greffons redessinent.

Ce qu'il faut retenir : **le suivi est une traduction**, faite à l'étape 4, de ce que le navigateur a produit à l'étape 2. Chaque forme de geste (Entrée sur une sélection, collage multi-blocs, gras, fusion de paragraphes, dictée) demande sa traduction ; ce qui n'en a pas est refusé ou fuit. Et la règle du correcteur doit être **revérifiée** à l'étape 8 sur la structure Yjs, faute de pouvoir faire confiance au client. Deux implémentations de la même règle, l'une qui écrit, l'autre qui contrôle.

## 2. Les points faibles propres à ProseMirror

ProseMirror est solide sur son modèle (schéma, transactions, positions). Sa partie fragile est **la vue**, c'est-à-dire la traduction du `contenteditable` en transactions. Le journal des changements de `prosemirror-view` des douze derniers mois en est presque entièrement fait : composition sur Chrome et Safari, Entrée et Retour arrière mal interprétés sur Android (SwiftKey, GBoard, claviers chinois), sélection dans le shadow DOM de Safari, curseur autour des nœuds atomiques. La 1.42.9 (31/10/2026) corrige encore « l'éditeur pouvait envoyer Entrée ou Retour arrière pendant une composition ». Nous sommes en 1.42.6.

Les points faibles qui nous concernent :

1. **La composition** (touches mortes du Mac français, saisie asiatique, correction automatique). Pendant une composition, le navigateur tient le texte en cours dans le DOM ; ProseMirror attend la fin pour la valider. Tout ce qui touche le DOM au même moment peut la casser : un curseur distant dessiné à côté (notre écart 6, corrigé en masquant les curseurs), une réécriture du document par y-prosemirror 1.x, **ou notre réécriture en suivi**, qui remplace la transaction que la composition attend. C'est pourquoi la frappe d'une composition reste au début d'une sélection multi-blocs (écart 7a) : la déplacer cassait la composition.
2. **La dictée et la saisie prédictive** (macOS, iOS, Android) remplacent des plages entières, parfois jusqu'à la fin du bloc suivant : ProseMirror reçoit un pas plus large que le geste (écart 3, le doublon).
3. **Les claviers virtuels Android** ne disent pas toujours quelle touche a été pressée ; ProseMirror devine à partir des mutations du DOM.
4. **Safari** a ses propres défauts de sélection et de composition, contournés version après version.

Notre code aggrave ces points sur un axe précis : **plus on intercepte et réécrit les transactions issues de la saisie, plus on se met entre ProseMirror et ses propres contournements**. La leçon pour une refonte : ne jamais réécrire une transaction issue de la saisie. Laisser ProseMirror appliquer ce que le navigateur a fait, et capter le sens (qui, quoi) ailleurs. C'est exactement ce que fait `@y/prosemirror` 2 : la transaction est appliquée telle quelle, la différence est écrite dans le document de suggestions, et c'est Yjs qui sait que c'est une suggestion et de qui.

À part, sans rapport avec la refonte : passer `prosemirror-view` de 1.42.6 à 1.42.9 est un petit lot utile (correctifs de composition et de Retour arrière sur Android).

## 3. Ce que la v2 garderait et jetterait de notre code

Lecture fichier par fichier, dans l'hypothèse d'une reconstruction sur `@y/prosemirror` 2 et Yjs 14 (chiffres : lignes de code actuelles).

| Fichier | Lignes | Sort | Pourquoi |
|---|---|---|---|
| `client/src/suivi/reecriture.js` | 590 | **supprimé** | plus de réécriture : la suggestion est écrite telle quelle dans le document de suggestions |
| `client/src/suivi/greffons.js` (répartiteur, collage) | 312 | **supprimé** pour l'essentiel | le répartiteur n'a plus rien à intercepter ; un collage riche reste un greffon ordinaire |
| `client/src/suivi/composition.js`, `curseursComposition.js` | 73 | supprimés ou réduits | à revoir selon le comportement des curseurs de la v2 |
| `client/src/suivi/etat.js`, `trackChanges.js` | 124 | **remplacés** | le mode suggestion devient « quel document la vue édite » (`configureYProsemirror`) |
| `client/src/suivi/decision.js` (accepter, rejeter) | 173 | **remplacé** | `acceptChanges`, `rejectChanges`, `acceptAllChanges`, `rejectAllChanges` fournis |
| `client/src/suivi/inventaire.js` (liste des modifications, appariement) | 254 | **réécrit, plus court** | lire les marques `y-attributed-*` au lieu des nôtres ; plus de `groupe` stocké, l'appariement se fait par voisinage |
| `client/src/suivi/suggestions.js` (insertion d'une suggestion de l'IA côté client) | 448 | **réécrit, plus court** | l'IA écrit dans le document de suggestions comme n'importe qui |
| `client/src/changesPanel.js`, `carteModification.js` | 671 | **gardés, adaptés** | l'interface reste la nôtre ; elle lit une autre source |
| `client/src/schema.js` | 481 | **gardé, durci** | marques `insertion` / `deletion` / `authorColor` et attributs `trackedBreak`, `suivi` retirés ; marques `y-attributed-*` ajoutées partout ; contenus des listes, tableaux et citations assouplis (recette de `ATTRIBUTION.md`) |
| `client/patches/` (correctif y-prosemirror 1.3.7) | 69 | **supprimé** | la v2 écrit vers Yjs par différences incrémentales |
| `client/src/provider.js` | 319 | **gardé, porté** | même rôle ; passer à `@y/protocols` et à deux documents par salle |
| `client/src/comments.js`, `commentsGutter.js` | 1 541 | **gardés, simplifiés** | ancrage par positions relatives (fourni et documenté par la v2) ; la logique des orphelins (marques datées, délai de 7 jours) peut se réduire : une position qui pointe dans un nœud supprimé se résout à `null` |
| `client/src/footnotes.js`, `images.js` | 703 | **gardés, allégés** | l'attribut `suivi` des notes et images disparaît : un nœud inséré ou supprimé en suggestion porte la marque de nœud correspondante |
| `client/src/exportVariante.js` et exports | 135 + ~1 800 | **gardés** | les exports parcourent un arbre ProseMirror ; on le leur fournit par `ynodeToPmnode` (texte de base, ou rendu avec suggestions) |
| `server/correcteur.js` | 229 | **supprimé** | la règle du correcteur devient un droit : il n'écrit que dans le document de suggestions (§ 5) |
| `server/replique.js`, `rooms.js` | 966 | **gardés, simplifiés** | un document de base et un document de suggestions par salle ; plus de contrôle du texte, seulement des droits par document ; ajout de l'attribution (qui a écrit quoi) |
| `server/agentTexte.js` (Margo, Inviter Claude) | 1 575 | **réécrit, nettement plus court** | il imite aujourd'hui, à la main, la forme que y-prosemirror 1.x donne à nos marques ; demain il lit le texte (`ynodeToPmnode`) et écrit un delta (`applyDelta`) dans le document de suggestions, attribué à l'agent |
| `server/comparaison.js`, `routes/versions.js` | 312 + | **à revoir** | Yjs 14 rend la différence entre deux versions (`SnapshotRenderer`) avec le même affichage que les suggestions |
| Le reste (comptes, droits, courrier, publication, back-office, IA, modèles, profils CSS) | ~25 000 | **inchangé** | hors du cœur |

Ordre de grandeur : sur ~7 000 lignes au cœur du suivi et de la synchronisation, environ 2 000 disparaissent, 2 000 sont réécrites plus courtes, le reste est adapté. Le gain principal n'est pas le nombre de lignes : ce sont **deux invariants qui deviennent structurels** au lieu d'être vérifiés.

- « En suivi, rien ne passe hors suivi » : vrai par construction, puisqu'on écrit dans un autre document.
- « Le correcteur ne touche pas au texte accepté » : vrai par les droits, puisque le serveur ne lui ouvre pas l'écriture du document de base.

## 4. Les alternatives à ProseMirror

| Éditeur | Licence, version | Collaboration | Suivi des modifications | Pour nous |
|---|---|---|---|---|
| **ProseMirror** (actuel) | MIT, `prosemirror-view` 1.42.9 (31/10/2026) | y-prosemirror 1.x (Yjs 13), `@y/prosemirror` 2 (Yjs 14) | aucun en propre ; mode suggestion via `@y/prosemirror` 2 | la base de tout l'écosystème ci-dessous ; maintenance très active, pas de version 2 annoncée |
| **Tiptap 3** | cœur MIT, 3.33.0 (05/11/2026) | `@tiptap/y-tiptap` (dérivé de y-prosemirror 1, Yjs 13) | extension « Tracked Changes » **payante** | une couche au-dessus de ProseMirror : extensions prêtes, mais notre schéma et nos greffons à réécrire en extensions. La démo phare de `@y/prosemirror` 2 est en Tiptap 3 : c'est compatible, mais Tiptap n'apporte rien au suivi lui-même |
| **BlockNote** | MPL-2.0, 0.57.0 (30/10/2026) | dépend **déjà** de `@y/prosemirror` 2 et de `@y/y` 14, à côté de la 1.x | via `@y/prosemirror` 2 | éditeur « par blocs » à la Notion, interface imposée ; peu adapté au livre (notes de bas de page, mise en page). Signal utile : un produit réel adopte la v2 |
| **Lexical** (Meta) | MIT, 0.53.0 | `@lexical/yjs` (Yjs 13) | aucun | modèle de document propre, moins de garanties de schéma, pas de suivi : on repartirait de zéro |
| **Slate** | MIT, 0.147 | `@slate-yjs/core` 1.0.2, **non publié depuis 2023** | aucun | écarté |
| **CKEditor 5** | GPL ou commercial | serveur de collaboration sous licence | complet | écarté le 02/11 : dépendance commerciale au cœur du produit, refonte totale |

Conclusion : **changer d'éditeur ne règle rien** de ce qui nous coûte. Nos défauts viennent du suivi et de la synchronisation, pas du modèle de ProseMirror. Toutes les alternatives sérieuses sont soit ProseMirror lui-même (Tiptap, BlockNote), soit sans suivi des modifications (Lexical, Slate). Le levier est la couche Yjs + y-prosemirror. Garder ProseMirror nu est aussi ce qui laisse le moins de code entre nous et la v2 (pas de couche Tiptap à suivre).

## 5. Les perspectives des nouvelles versions

### Yjs 14 (`@y/y`)

- **Où on en est** : 14.0.0-rc.29 (15/10/2026). L'étiquette « latest » de npm pointe encore sur 14.0.0-rc.7 : aucune version déclarée stable. Tickets ouverts fin octobre et début novembre sur l'intégration de mises à jour reçues avec des trous d'horloge (#824, #825), l'annulation (#823), les deltas de liste (#819). Autrement dit, la correction de fond est encore en cours. Pas de date annoncée.
- **Ce qu'elle apporte** :
  - un type unique (`Y.Node`) et le format `lib0/delta` pour décrire le contenu et ses changements ;
  - l'**attribution** : chaque morceau de contenu peut être rendu avec `{ insert: [qui], delete: [qui], format: {…}, insertAt, deleteAt }`. L'information « qui a fait quoi » vit dans une **table de contenu** (`ContentMap`) à part, tenue par un tiers de confiance, le serveur ;
  - les **moteurs de rendu** : `DiffRenderer` (différence entre deux documents : base et suggestions), `SnapshotRenderer` (entre deux instantanés : versions), `AttributionsRenderer` ;
  - des **schémas Yjs** annoncés, volontairement moins expressifs que ceux de ProseMirror, pour que des outils et des modèles de langue puissent écrire directement des modifications valides. C'est notre cas d'usage (Margo, Inviter Claude).
- **Compatibilité** : un document écrit par y-prosemirror 1.x sur Yjs 13 se charge et s'édite avec la v2 (testé en amont, y compris les positions relatives stockées). L'inverse est faux : **pas de clients 1.x et 2 sur un même document**.

### `@y/prosemirror` 2

- **Où on en est** : 2.0.0-15 (11/10/2026), réécriture complète ; BlockNote y contribue et l'a déjà intégrée (dépendance de `@blocknote/core` 0.57). Documentation sérieuse (`ARCHITECTURE.md`, `ATTRIBUTION.md`, `CAVEATS.md`). Le README conseille encore la 1.3.7 aux utilisateurs ordinaires.
- **Ce qu'elle apporte** :
  - **synchronisation incrémentale** dans les deux sens (fin du remplacement du document entier : notre famille D) ;
  - **mode suggestion et différences de versions** rendus en marques `y-attributed-insert`, `-delete`, `-format`, `-attrs` (changement d'attribut d'un nœud, par exemple le niveau d'un titre) ;
  - commandes accepter et rejeter, une à une ou en bloc ;
  - curseurs et annulation par personne, positions relatives documentées ;
  - conversion sans éditeur (`ynodeToPmnode`, `pmnodeToDelta`), donc utilisable côté serveur ;
  - variantes de nœuds `--attributed` pour garder un schéma strict tout en affichant un nœud en cours de suppression.
- **Ce qu'elle exige** :
  - un **schéma durci** (marques autorisées partout, cardinalités assouplies pour les listes et les tableaux, variantes) ;
  - des noms de marques imposés ;
  - une fonction d'affichage déterministe (sinon boucle de réconciliation) ;
  - des greffons « réparateurs » neutralisés (`fixTables` de `prosemirror-tables`).
- **Ce qui reste ouvert** :
  - l'affichage, qualifié en amont de « grossier » (« coarse red / yellow / green ») : notre écart « diff caractère par caractère sur plusieurs paragraphes » vient de là ;
  - les fusions et coupures de paragraphes, qui n'ont pas de représentation propre dans Yjs (« Node splitting, merging, and lifting ») ;
  - le ticket #288, un cas de suggestion qui fait échouer le calcul de différences, trouvé par test aléatoire le 04/11.
  - **Nos trois échecs (touche morte sur une sélection, Ctrl+Z, suggestion d'autrui effacée) ne figurent dans aucun ticket ouvert** : personne ne les a signalés.

### Le serveur de l'écosystème : y/hub

`@y/hub` (0.10.1, 16/10/2026) est le serveur de référence de Yjs 14 : historique, activité, différences, retour arrière, attribution. Mais il est **sous double licence AGPL ou commerciale** et demande Redis, PostgreSQL et un stockage S3. Ni la licence ni la charge (VPS de 1 Go) ne nous conviennent. **Nous gardons notre serveur.** Ce qu'y/hub fait pour l'attribution, nous le ferions nous-mêmes : à chaque opération reçue d'une personne authentifiée, ajouter ses identifiants de contenu à la table de contenu avec son identité et la date. Yjs 14 en fournit les briques (`createContentIdsFromDocDiff`, `createContentMapFromContentIds`, `mergeContentMaps`, encodage). Taille et API exactes à vérifier dans le prototype.

### ProseMirror

Pas de rupture en vue. Des correctifs de saisie toutes les deux à quatre semaines, l'API stable depuis des années. C'est une bonne nouvelle : la refonte peut garder ProseMirror nu, notre schéma (durci) et nos greffons d'interface. `prosemirror-changeset` (2.4.6, 02/11/2026) reste une solution de repli pour un suivi « par différence » fait maison si la v2 décevait (candidat 8 de l'étude du 02/11).

## 6. Le cœur reconstruit : architecture cible

### Les principes

1. **Deux documents Yjs par document amend.ink** : le **texte** (la base, ce qui est accepté) et les **suggestions** (une copie de travail où l'on propose). Le moteur `DiffRenderer` montre la différence entre les deux.
2. **Les rôles deviennent des droits sur ces deux documents**, vérifiés par le serveur sans analyser le texte :

   | Rôle | Texte (base) | Suggestions | Commentaires |
   |---|---|---|---|
   | lecteur | lire | lire | écrire les siens |
   | correcteur | lire | **écrire** | écrire |
   | éditeur | **écrire** (dont accepter et rejeter) | écrire | écrire |

3. **Personne ne réécrit les transactions de la saisie.** La vue ProseMirror est liée à l'un ou l'autre document ; l'éditeur passe de « modifier » à « suggérer » en changeant de document (`configureYProsemirror`).
4. **Le serveur attribue** chaque opération à un compte authentifié (table de contenu). Le client ne déclare plus son nom dans les marques : impossible de signer à la place d'un autre.
5. **L'IA est un auteur comme un autre** : elle lit le texte (`ynodeToPmnode`), calcule ses corrections (`shared/diff.js` garde son rôle), et écrit un delta dans le document de suggestions, attribué à « Margo (IA) » ou à « Claude (pour <prénom>) ».
6. **Les exports et la publication** reçoivent un arbre ProseMirror : la base seule (texte accepté) ou la base avec suggestions rendues, selon le mode. `nfc()` et `documentPourExport` restent le point d'entrée unique.
7. **Notre code ne porte plus que ce qui est propre à amend.ink** : interface du suivi (panneau, cartes, couleurs), commentaires, notes de bas de page, typographie française, mise en page et exports, IA, droits.

### Les compromis fonctionnels à accepter

1. **Affichage des modifications moins fin** au départ : une modification sur plusieurs paragraphes s'affiche comme une différence caractère par caractère. Atténuation possible de notre côté, sans toucher aux données : regrouper à l'affichage les morceaux voisins d'un même auteur dans le panneau et les cartes.
2. **Règle D2 renégociée** : dans la v2, effacer la proposition d'une autre personne la fait disparaître. Trois issues : l'accepter (comme Google Docs ? à vérifier), la signaler en amont, ou la faire respecter par le serveur (refuser l'opération d'un correcteur qui supprime du contenu attribué à un autre ; faisable avec la table de contenu, mais c'est du code à nous).
3. **Plus de « groupe » stocké** pour apparier une suppression et un ajout : l'appariement se fait par voisinage, à l'affichage.
4. **Couleur d'auteur calculée** à partir de l'identifiant (fonction déterministe imposée par la v2), et non plus choisie et stockée dans chaque marque.
5. **Commentaires orphelins plus simples** : un commentaire dont le passage a disparu passe dans une liste « passage supprimé », sans marques datées ni délai de 7 jours.
6. **Schéma assoupli** : une liste ou un tableau peut se retrouver vide après deux suppressions concurrentes (il faut alors un repère visuel) ; la table des matières, les listes de tâches et les colonnes passent en second, après validation du reste.
7. **Migration des documents existants avec une règle simple** : un document est migré **sans suggestions en attente** (tout accepté ou rejeté avant). On évite ainsi de convertir nos marques en attribution Yjs. Les documents avec suggestions en attente restent sur l'ancien cœur jusqu'à ce qu'on les solde.
8. **Pas de cohabitation** : un document est soit sur l'ancien cœur, soit sur le nouveau. Les deux applications peuvent coexister sur le même serveur pendant la transition, avec une bascule par document.

### Les risques

1. **Calendrier amont inconnu** : Yjs 14 et la v2 peuvent rester des mois en pré-version, et leur API bouge encore (renommage `AttributionManager` en `Renderer` à la rc.19, suppression de fonctions à la 2.0.0-12).
2. **Une petite équipe en amont** (Kevin Jahns et quelques contributeurs, dont l'équipe BlockNote) : nos défauts ne seront corrigés que si quelqu'un les signale, ou les corrige.
3. **La composition** (touches mortes) en mode suggestion est rédhibitoire pour notre public et n'est pas encore traitée en amont.
4. **Charge du serveur** : un document de suggestions sans ramasse-miettes (`gc: false`, comme dans la démo) grossit plus vite ; à mesurer sur un livre.
5. **Attribution côté serveur** : c'est la seule pièce importante sans modèle libre à reprendre (y/hub est AGPL). Elle est à concevoir et à tester.

## 7. Évaluation

| Critère | Cœur actuel (corrigé au fil de l'eau) | Cœur reconstruit sur Yjs 14 et la v2 |
|---|---|---|
| Fuites hors suivi (familles A, B) | refusées au cas par cas ; chaque nouvelle forme de geste est un nouveau chantier | impossibles par construction |
| Synchronisation (famille D) | correctif local d'une bibliothèque figée en 1.3.7 | incrémentale, maintenue en amont |
| Règle du correcteur | deux implémentations (client, serveur) d'une analyse de texte | un droit d'écriture par document |
| IA dans le texte | imitation à la main de la forme Yjs de nos marques | un auteur qui écrit un delta |
| Suivi de la mise en forme, des fusions, des attributs (écarts 7b, 10, 12) | non fait (« attendre la v2 ») | fournis (affichage à améliorer) |
| Affichage des modifications | fin, à notre main | plus grossier au départ |
| Touches mortes, Ctrl+Z en suggestion | conformes | **en échec** aujourd'hui |
| Maturité | en production | pré-version |
| Code à nous au cœur | ~7 000 lignes | ~4 000 à 5 000, plus simples |

**Verdict** : la refonte est **la bonne direction** et rend le cœur plus simple et plus robuste là où il casse aujourd'hui. Elle n'est **pas déployable avant** une version stable de Yjs 14 et le passage de nos six critères. D'ici là, un prototype vaut mieux qu'une attente passive, parce qu'il réduit trois incertitudes que la veille mensuelle ne lève pas : notre schéma durci, l'attribution côté serveur, la tenue sur nos vrais documents.

## 8. Un prototype en attendant

### Principes

1. **Isolé de l'application** : un dossier `proto/` (ou un dépôt à part), avec ses propres dépendances aux **versions exactes**, comme `tools/essai-y-prosemirror-v2/`. Rien n'est livré en production, aucun lien avec `client/` ni `server/` hors du code partagé qu'on copie.
2. **Une couche d'adaptation unique** (un seul module qui importe `@y/y` et `@y/prosemirror`) : quand l'API change d'une pré-version à l'autre, on ne corrige qu'un fichier.
3. **Petit et complet plutôt que large** : un schéma réduit mais durci, les trois rôles, l'attribution, l'IA, un export. Pas d'interface finale.
4. **Mesuré avec nos outils** : la campagne (`tools/campagne/`), les critères de passage de `docs/ecarts-editeur.md`, le banc d'ouverture. Chaque jalon a un critère de sortie vérifiable.
5. **Le prototype nourrit l'amont** : chaque défaut reproduit en quelques lignes devient un ticket bien documenté sur `yjs/y-prosemirror` (à décider par Sylvain, puisque c'est une prise de parole publique).

### Jalons

1. **Schéma durci** : notre schéma (paragraphe, titres, citation, listes, notes de bas de page, images, gras, italique, lien) passé par la recette de `ATTRIBUTION.md`. Sortie : l'audit de la v2 ne signale aucun nœud ; `doc.check()` reste valide dans les scénarios « suppression concurrente » et « suppression en suggestion ».
2. **Deux documents et trois rôles** : un petit serveur Node (`@y/y`, `@y/protocols`, WebSocket) qui tient la base et les suggestions par salle et applique le tableau des droits du § 6. Sortie : un correcteur ne peut pas modifier la base même en forçant depuis la console ; un lecteur n'écrit que des commentaires.
3. **Attribution par le serveur** : la table de contenu alimentée par compte authentifié, l'affichage par auteur (nom, couleur calculée), le panneau des modifications minimal (liste, accepter, rejeter). Sortie : deux correctrices et un éditeur, chaque modification au bon nom ; un client qui ment sur son identité n'y change rien.
4. **Saisie réelle** : la campagne rejouée sur le prototype (touches mortes, dictée, collage, Entrée, Ctrl+A, deux personnes au même endroit), puis à la main sur Safari, iPhone et Android. Sortie : le tableau des six critères, à jour à chaque nouvelle pré-version.
5. **L'IA comme auteur** : une version réduite de `agentTexte.js` qui lit par `ynodeToPmnode` et écrit un delta dans les suggestions (corriger un paragraphe, commenter). Sortie : les propositions de Margo apparaissent comme celles d'une personne, acceptables et rejetables, sans code spécifique à l'IA côté client.
6. **Nos documents** : charger des copies de documents réels sans suggestions en attente (les nôtres, ou ceux du compte de test), les éditer, les exporter en PDF et Word par le code d'export actuel nourri par `ynodeToPmnode`. Sortie : export identique à celui de l'application pour un document sans suggestions ; temps d'ouverture et mémoire serveur mesurés sur un livre.
7. **Bilan** : ce qui passe, ce qui manque en amont, ce qui reste à nous ; décision de migration ou nouvelle attente.

Les jalons 1 à 3 ne dépendent pas de la maturité de la v2 et valent dès maintenant. Les jalons 4 à 6 se rejouent à chaque pré-version : la veille mensuelle de `docs/ecarts-editeur.md` s'étend naturellement au prototype.

### Ce que le prototype ne fait pas

- Pas d'interface complète (barre d'outils, menus, téléphone), pas de modèles ni de profils CSS, pas de publication.
- Pas de migration des documents avec suggestions en attente (compromis 7).
- Pas de production : aucun document réel modifié, aucun déploiement.

## Décisions à prendre (Sylvain)

1. Valider la direction : reconstruction du cœur sur Yjs 14 et `@y/prosemirror` 2, ProseMirror nu, sans Tiptap ni BlockNote.
2. Valider ou amender les compromis fonctionnels du § 6 (en particulier 1, 2 et 7).
3. Lancer le prototype, jalons 1 à 3 d'abord.
4. Autoriser ou non le signalement en amont (tickets publics sur `yjs/y-prosemirror`) des défauts touche morte, Ctrl+Z et suggestion d'autrui.
5. À part : passer `prosemirror-view` en 1.42.9 dans l'application actuelle (petit lot, correctifs de composition).

## Sources

- Code d'amend.ink : `client/src/suivi/`, `client/src/editor.js`, `client/src/provider.js`, `client/patches/`, `server/rooms.js`, `server/replique.js`, `server/correcteur.js`, `server/agentTexte.js`.
- Études précédentes : `docs/diagnostic-editeur-2026-11-02.md`, `docs/alternatives-suivi-2026-11-02.md`, `docs/essai-y-prosemirror-v2-2026-11-02.md`, `docs/ecarts-editeur.md`.
- `yjs/y-prosemirror` (branche `master`, 07/11/2026) : `README.md`, `ATTRIBUTION.md`, `CAVEATS.md`, `PROJECT_GOALS.md`, `CHANGELOG.md`, `yhub-tiptap-demo/README.md` et `src/main.js`.
- `yjs/yjs` (branche `main`) : `README.md`, `renderer.md`, `src/index.js`, `src/utils/meta.js`.
- Tickets : `yjs/y-prosemirror` #235, #245, #275, #288 ; `yjs/yjs` #819, #823, #824, #825, #838.
- Registre npm (07/11/2026) : `@y/y`, `@y/prosemirror`, `@y/hub`, `@y/websocket`, `prosemirror-*`, `@tiptap/core`, `@tiptap/y-tiptap`, `@blocknote/core`, `lexical`, `@lexical/yjs`, `slate`, `@slate-yjs/core`.
- Journal des changements de `prosemirror-view` 1.42.9.
