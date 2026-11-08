# Audit complet de la v2 (2026-11-08)

- Auditeur : Scaleway, modèle `glm-5.3`, réflexion `low` ; consommation totale : 708810 signes envoyés, 39759 reçus
- Code audité : `v2/` au commit `9e0aee2`, module par module
- Outils déterministes : `couverture.txt`, `knip.txt`, `npm-audit.txt`, `semgrep.txt`
- Statut : avis reçus ; réponses de Claude écrites ; arbitrage de Sylvain à venir.

## Synthèse de Claude

Environ 75 constats sur 9 modules, chacun vérifié dans le code : **à peu près 40 % justes**, dont 6 importants, une douzaine de faux, le reste sans suite, déjà noté ou renvoyé à une étape à venir. Les outils déterministes n'ont rien trouvé de grave (vulnérabilités hors de notre code, faux positifs de Semgrep, aucun code mort après une petite retouche).

**Importants, à corriger maintenant** : demande de droits qui échoue sans refus explicite (y/hub) ; secret de session non exigé en ligne ; adresse `#%` qui fait planter le client ; repère « contenu principal » effacé (`role="document"`) ; sauvegarde et restauration de la base v2 absentes (avant tout essai avec de vrais textes) ; vulnérabilités de la chaîne de y/hub à inscrire dans la veille.

**Mineurs, regroupables en un lot** : typographie après un emoji et après une note collée ; caractères invisibles manquants dans les noms ; `catch` trop large des messages d'erreur ; délais et refus dans le processus de collaboration ; codes HTTP et journal des erreurs internes ; chemin statique comparé avec séparateur ; client (connexion en panne, `lang`) ; `texteDesBlocs` incomplet ; contrat du nom `link` ; durcissement systemd, pare-feu et vérification du déploiement ; garde-fous (feuilles de style importables, `reglages.js`, unités, licence GPL-3.0) ; documentation (ADR 0004 sur le client, arborescence, veille).

**Pour plus tard** : présence et identifiant publié, expiration des sessions, CSRF (étape 6) ; en-têtes et HSTS (mise en ligne) ; lecture du numéro de note, lien liste-appel, titre de page (interface) ; test de la présence d'un lecteur (étape 5).

## Domaine

- Fichiers : `v2/domaine/document.js`, `v2/domaine/droits.js`, `v2/domaine/index.js`, `v2/domaine/personne.js`, `v2/domaine/typographie.js`
- Consommation : 76851 signes envoyés, 2753 reçus (et 18448 de réflexion) ; réflexion `low` ; 24 s ; arrêt : stop

### Avis de l'auditeur

#### Synthèse
Le module Domaine est conforme à l'architecture : JavaScript pur, aucune dépendance, codes et non phrases, gel des objets rendus, tests nombreux et bien ciblés. Les fonctions pures de typographie et de droits sont soigneuses (pièges `__proto__`, idempotence, zones protégées). Restent des cas limites de faible ampleur : le traitement par unités UTF-16 dans la typographie, des caractères invisibles de la catégorie Cf non couverts dans les noms, et une question de sécurité sur le sort d'un rôle inconnu.

#### Constats
1. **[question]** Sécurité (contrôle d'accès) — `v2/domaine/droits.js:43`, `v2/domaine/droits.js:35` : `roleEffectif(['inconnu'])` renvoie `'lecteur'` (rang 0), donc `capacites` donne `lire` et `acces` donne `'lecture'` : une entrée de rôle invalide dans la table accorde la lecture au lieu d'aucun accès. Le commentaire documente « rôle inconnu vaut le plus restrictif », mais le plus restrictif parmi les rôles n'est pas « aucun rôle » ; le serveur teste bien ce comportement, donc c'est un choix — à confirmer avec Sylvain si accorder la lecture sur une donnée corrompue est voulu plutôt que `null`.
2. **[mineur]** Correction (cas limites) — `v2/domaine/typographie.js:48`, `v2/domaine/typographie.js:51` : `corps` itère par unités UTF-16 ; après un emoji (paire de substitution), `out[out.length - 1]` est un substitut bas, que `OUVRANT` ne reconnaît pas, donc un `"` tapé juste après un emoji est traité comme fermant (« … ») au lieu d'ouvrant. Proposer d'itérer par points de code (`[...s]`) ou de tester la fin de chaîne par `endsWith` sur le dernier point de code.
3. **[mineur]** Correction (cas limites) — `v2/domaine/personne.js:7` : `INVISIBLES` couvre `Cc`, quelques Cf explicites et les isolats, mais pas d'autres caractères formatifs de `Cf` (par ex. U+00AD tiret conditionnel, U+2061–U+2064) ; un nom peut donc contenir un caractère invisible non détecté. Remplacer la liste par `\p{Cf}` (plus large et plus simple) ou l'étendre.
4. **[mineur]** Tests — `v2/domaine/typographie.js:113` : la branche `langue !== 'fr'` de `saisie` (retour `null`) n'a pas de test dédié, alors que `typographier` a le sien (« hors du français, rien ne change ») ; un test « la frappe hors du français ne change rien » verrouillerait la symétrie entre les deux fonctions.
5. **[question]** Tests / exploitation — `v2/application/serveur/index.js:15` (lignes non couvertes 15-23, 172, 180-182 d'après `couverture.txt`) : ces branches du serveur ne sont couvertes par aucun test rapide ; sans voir le code, je ne peux dire si ce sont des branches de développement seul — à vérifier qu'aucune branche de production (erreurs, pannes) ne reste sans test.

#### Points de grille sans remarque
1, 2, 3 (hors constat 2), 6, 7, 8, 9, 10.

### Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : **citation invalide** (v2/application/serveur/index.js:15)

### Réponse de Claude

- **1 : faux.** « Un rôle inconnu vaut le plus restrictif » est une décision établie (v1, plan de l'étape 2) ; le plus restrictif des rôles est le lecteur, et « aucun rôle » vaut rien : c'est voulu et testé.
- **2 : juste, mineur.** Après un emoji, le dernier signe vu est une demi-paire UTF-16 : un `"` collé à un emoji serait pris pour un guillemet fermant. Correctif : comparer le dernier point de code.
- **3 : juste en partie, mineur.** `\p{Cf}` en bloc interdirait le liant sans chasse (U+200D) des emojis composés, que la règle permet ; mais le trait d'union conditionnel (U+00AD) et U+2061–2064 manquent : à ajouter à la liste.
- **4 : faux.** Le test « hors du français, rien ne change » vérifie aussi `saisie(…, { langue: 'en' })`.
- **5 : hors sujet** (citation invalide ; le serveur est audité plus bas).

## Traductions

- Fichiers : `v2/i18n/en.json`, `v2/i18n/exceptions.json`, `v2/i18n/fr.json`, `v2/i18n/index.js`, `v2/i18n/pseudo.js`
- Consommation : 72854 signes envoyés, 2914 reçus (et 9526 de réflexion) ; réflexion `low` ; 15 s ; arrêt : stop

### Avis de l'auditeur

#### Synthèse
Le module Traductions est globalement conforme aux règles 23 à 31 et à l'ADR 0009 : catalogues ICU, repli français, pseudo-langue, exceptions de recopie formalisées, tests de complétude et de cohérence présents. Les constats portent sur des angles morts de robustesse (entrée chaîne dans `choisirLangue`, `catch` trop large dans `messageErreur`) et sur des détails de la pseudo-langue. Rien de grave ; deux points restent des questions faute de certitude sur les appelants et les exports du paquet FormatJS.

#### Constats
1. **[question]** Grille 3 (robustesse), `v2/i18n/index.js:27` — `choisirLangue` itère `preferences` avec `for…of` : si un appelant passe une chaîne (`'en-US'`) au lieu d'un tableau, la boucle itère caractère par caractère et la fonction retombe silencieusement sur le français. Vérifier les appelants (client et serveur) et soit documenter l'entrée tableau, soit normaliser une chaîne en tableau d'un élément.
2. **[mineur]** Grille 10 (traductions), `v2/i18n/index.js:53-55` — le repli sur le français pour une clé absente construit le format avec la locale de la langue cible : un texte français serait rendu avec nombres et pluriels formatés dans la locale cible. Proposer de formater le repli avec `LANGUE_SOURCE` (ou l'assumer en commentaire).
3. **[mineur]** Grille 3 (robustesse), `v2/i18n/index.js:67-71` — le `catch` de `messageErreur` attrape toutes les erreurs, y compris « paramètre manquant » que le test unitaire veut explicite ; un message d'erreur mal formé serait ainsi masqué par le message générique. Restreindre le repli au seul cas « clé inconnue » (vérifier `chercher` avant de formater).
4. **[mineur]** Grille 4 (simplicité), `v2/i18n/index.js:39-46` — `LANGUE_PSEUDO` et `CATALOGUES_CONTROLE` sont déclarés après leur usage dans `creerTraducteur` ; cela ne plante que parce que l'appel est différé, mais l'ordre est fragile à la relecture. Remonter les deux déclarations au-dessus de la fonction.
5. **[mineur]** Grille 10 (traductions), `v2/i18n/pseudo.js:9-24` — `ACCENTS` couvre les voyelles, `c`, `n` en minuscule mais pas `N` majuscule (ni `y`) : la pseudo-langue est légèrement incohérente, sans impact fonctionnel. Compléter ou assumer en commentaire.
6. **[question]** Grille 5 (tests), `v2/i18n/pseudo.js:25` — `allonger` ajoute 40 % des signes *hors espaces* ; pour un texte très espacé, l'allongement peut tomber sous les 30 % de la longueur totale que le test semble exiger. Vérifier ce que le test mesure (longueur totale ou hors espaces) et aligner l'un sur l'autre.
7. **[question]** Grille 1/2 (API publique), `v2/i18n/pseudo.js:7` — l'import `@formatjs/icu-messageformat-parser/printer.js` passe par un sous-chemin ; vérifier qu'il est bien déclaré dans les `exports` du paquet (API publique au sens de la règle 2), sinon exiger un point d'entrée exporté.

#### Points de grille sans remarque
1 (hors le point 7 en question), 2, 6, 7, 8, 9.

### Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides
- 1 : **sans citation** (écarté d'office)

### Réponse de Claude

- **1 : faux.** Les deux appelants passent un tableau.
- **2 : faux en pratique.** Un test exige que chaque langue ait toutes les clés du français : le repli ne sert jamais en production.
- **3 : juste, mineur.** Le `catch` masquerait une erreur de format sous le message générique : ne replier que sur une clé absente.
- **4 : juste, mineur.** Remonter les deux déclarations au-dessus de leur usage, pour la lecture.
- **5 : juste, mineur** (cosmétique) : `N` majuscule manquant.
- **6 : faux.** Le test mesure la longueur totale et passe : l'allongement des signes hors espaces suffit.
- **7 : faux.** `./printer.js` est déclaré dans les `exports` du paquet (contrat « API publique seulement » vert).

## Adaptateurs Yjs et y/hub

- Fichiers : `v2/adaptateurs/yjs/index.js`, `v2/adaptateurs/yhub/index.js`
- Consommation : 70111 signes envoyés, 5305 reçus (et 5199 de réflexion) ; réflexion `low` ; 11 s ; arrêt : stop

### Avis de l'auditeur

#### Synthèse
Les deux adaptateurs sont courts et lisibles, conformes à l'esprit « très peu de code ». Les points sensibles se concentrent sur l'accord entre le client (`@y/websocket`) et le serveur y/hub (schéma d'URL, présence, historique), sur la gestion d'erreurs dans le rappel `droits`, et sur des contrats de la règle § 5 qui ne sont pas testés. Rien de bloquant, mais plusieurs points méritent vérification ou correctif avant l'étape suivante.

#### Constats

1. **[important]** Grille 1 et 3 — `v2/adaptateurs/yjs/index.js:6`, `v2/adaptateurs/yjs/index.js:19`, `v2/adaptateurs/yhub/index.js:74`
Le client utilise `WebsocketProvider` de `@y/websocket`, qui construit son URL comme `url + '/' + roomname`, alors que l'adaptateur y/hub expose `cheminWebSocket = /collaboration/ws/v1/amend` : les deux adaptateurs ne partagent aucune définition commune du chemin de connexion, et le client n'utilise pas `cheminWebSocket`. Si cela fonctionne aujourd'hui, c'est par convention implicite non vérifiée par un contrat ; un changement de format d'URL côté y/hub cassera silencieusement l'accord. Proposition : un test de contrat qui connecte le client en construisant l'URL à partir de `cheminWebSocket` (ou une fonction partagée), et une note sur le choix de `@y/websocket` plutôt que le client officiel de y/hub (voir constat 2).

2. **[question]** Grille 1 et 4 — `v2/adaptateurs/yjs/index.js:6`
y/hub fournit son propre SDK client (c'est la fondation retenue, ADR 0004) ; utiliser `@y/websocket` (famille Yjs, protocole y-websocket) côté client peut être une redondance avec l'amont, contraire à l'ordre de préférence (règle 6) et au principe « une fondation n'est importée que par son adaptateur » — ici l'adaptateur « yjs » importe un paquet qui n'est ni Yjs ni y/hub. Si y/hub accepte le protocole y-websocket documentément, le noter dans l'ADR 0004 ; sinon, question pour Sylvain sur l'adaptateur à utiliser.

3. **[important]** Grille 3 — `v2/adaptateurs/yhub/index.js:56`
`droits(docRef.docid, personne.userid)` est appelé sans protection : si la fonction de l'application rejette (base indisponible, requête malformée), l'erreur se propage dans `authorize` sans traitement visible. Vérifier le comportement de y/hub dans ce cas (refus propre ou plantage du processus) et l'écrire en test de contrat ; à défaut, encadrer l'appel pour échouer fermé (`null`).

4. **[important]** Grille 5 — `v2/adaptateurs/yhub/index.js:12`, `v2/adaptateurs/yhub/index.js:18`
`history: { from: 0 }` donne l'historique depuis l'origine, alors que la règle § 5 exige comme contrat « l'historique commence à la date d'accès » (reprise à l'étape 5). Ce n'est peut-être qu'un réglage provisoire d'étape, mais aucun test ne couvre le comportement historique attendu, et la valeur contredit le contrat écrit. Proposition : soit aligner la valeur sur la règle, soit noter dans le plan de l'étape 5 que `from: 0` est provisoire, avec un test de contrat à cette étape.

5. **[important]** Grille 5 — `v2/adaptateurs/yjs/index.js:20`, `v2/adaptateurs/yhub/index.js:15-20`
Le contrat « un lecteur ne publie pas sa présence » (règles § 5, exemple y/hub) n'apparaît dans aucun test de la liste, alors que le client publie systématiquement son état de présence (`setLocalStateField('user', …)`) sans connaître le rôle, et que la permission `awareness: '-r--'` du rôle lecture est censée l'empêcher côté serveur. Proposition : un test de contrat (lecteur connecté : son état de présence n'est pas diffusé aux autres).

6. **[mineur]** Grille 3 — `v2/adaptateurs/yjs/index.js:38-41`
`fermer()` détruit le fournisseur puis le document, mais les rappels `surEtat` et `surParticipants` ne sont pas désabonnés : si l'application ne conserve pas les fonctions de désabonnement, les écouteurs d'awareness survivent à `fournisseur.destroy()`. Vérifier que `destroy()` supprime bien les écouteurs (contrat), ou désabonner dans `fermer()`.

7. **[mineur]** Grille 8 — `v2/adaptateurs/yhub/index.js:61`
`minMessageLifetime: 60000` et `taskConcurrency: 2` (ligne 64) sont des réglages d'exploitation codés en dur dans l'adaptateur, non configurables ni documentés pour la petite machine. Proposition : les passer en paramètres avec les valeurs par défaut actuelles, et les noter dans la documentation d'exploitation avec la mesure de mémoire de l'étape 1.

8. **[question]** Grille 3 et 7 — `v2/adaptateurs/yhub/index.js:77`
`lireEtat` appelle `yhub.getDoc({ gc: true })` sans libération visible du document obtenu : selon l'API de y/hub, un `getDoc` peut charger l'état en mémoire du processus serveur à chaque lecture. Vérifier dans l'API publique de y/hub si le handle doit être fermé/détruit après lecture, et l'écrire en contrat.

9. **[mineur]** Grille 2 — `v2/adaptateurs/yjs/index.js:20`
L'état de présence publie `id`, `name` et `color` à tous les participants du document, y compris les simples lecteurs. C'est probablement voulu (curseurs), mais l'identifiant interne de la personne (`id`) diffusé à tout participant est une donnée personnelle exposée au-delà du besoin (le nom et la couleur suffisent à l'affichage). Question à trancher : l'id est-il nécessaire côté client ? Sinon, ne publier que nom et couleur.

#### Points de grille sans remarque
6 (accessibilité), 10 (traductions et licences — rien de visible dans ces fichiers).

### Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides
- 8 : citations valides
- 9 : citations valides
- 6 : **sans citation** (écarté d'office)

### Réponse de Claude

- **1 : faux.** L'accord client-serveur sur l'adresse est vérifié par les tests de pile (contrat 4, deux navigateurs, coupures).
- **2 : juste (documentation).** Le client `@y/websocket` (protocole que y/hub sert) n'est pas justifié dans l'ADR 0004 : à y écrire.
- **3 : juste, important.** Si la demande de droits au serveur échoue, l'erreur remonte telle quelle dans `authorize` : échouer fermé explicitement (`null`, donc refus), avec un test.
- **4 : faux.** L'historique depuis la date d'accès est noté pour l'étape 5 (plan de l'étape 2, « hors périmètre »).
- **5 : juste, test manquant.** Aucun test ne prouve qu'un lecteur ou un correcteur ne publie pas sa présence (constat déjà noté à l'étape 2 : sujet de l'étape 5) ; un test T2 à ajouter.
- **6 : faux.** L'application se désabonne par ses effets ; `destroy` du fournisseur détruit aussi la présence.
- **7 : sans suite.** Réglages mesurés à l'étape 1 sur la petite machine.
- **8 : sans suite.** `lireEtat` ne sert qu'aux tests pour l'instant ; à revoir quand les exports l'utiliseront (étape 7).
- **9 : juste, à noter pour l'étape 6.** L'identifiant publié dans la présence sera, avec de vrais comptes, une donnée personnelle : ne publier que nom et couleur, ou un identifiant opaque.

## Adaptateur BlockNote et extensions

- Fichiers : `v2/adaptateurs/blocknote/dictionnaire.js`, `v2/adaptateurs/blocknote/index.jsx`, `v2/adaptateurs/blocknote/schema.js`, `v2/adaptateurs/blocknote/serveur.js`, `v2/extensions/note/index.js`, `v2/extensions/typographie/index.js`
- Consommation : 82059 signes envoyés, 4776 reçus (et 16974 de réflexion) ; réflexion `low` ; 21 s ; arrêt : stop

### Avis de l'auditeur

#### Synthèse

Le module est fidèle à l'architecture : couches respectées, extensions isolées, aucune valeur de design, textes passés par `libelles` et le domaine. Les constats portent surtout sur des états figés à la création de l'éditeur (langue, personne), sur des accès heuristiques à des noms internes de BlockNote, et sur deux comportements dont la sémantique exacte dépend de l'amont et mérite une vérification ou un contrat. Rien de bloquant pour l'étape 4.

#### Constats

**A1** **[question]**, grilles 1 et 3 — `v2/adaptateurs/blocknote/index.jsx:48`
Le tableau de dépendances de `useCreateBlockNote` est `[contexte, langueDocument]` : ni `langue` (ligne 39, dictionnaire des menus) ni `personne` (ligne 45, nom et couleur de collaboration) n'y figurent. Si la langue d'interface ou l'identité change sans recréer `contexte`, l'éditeur garde l'ancien dictionnaire et l'ancien utilisateur. Si ces valeurs sont garanties stables par l'application, le documenter ; sinon les ajouter aux dépendances.

**A2** **[mineur]**, grilles 2 et 3 — `v2/adaptateurs/blocknote/dictionnaire.js:6`
`dictionnaires[langue]` lit aussi les propriétés héritées : une valeur imprévue (par exemple `"constructor"`, ou un code non géré) rend un objet qui n'est pas un dictionnaire, avec un plantage différé au lieu du repli français voulu. Proposer `Object.hasOwn(dictionnaires, langue) ? dictionnaires[langue] : dictionnaires.fr`, et un test du repli pour une langue inconnue.

**A3** **[question]**, grille 3 — `v2/extensions/note/index.js:37-51`
`fleche` retourne sa valeur (`true`/`false`) depuis le rappel passé à `editor.transact`. Si l'API publique de `transact` ne propage pas la valeur de retour du rappel, le raccourci clavier rend toujours `undefined` : le cas traité ne serait pas marqué « géré » et le comportement par défaut de la flèche s'ajouterait au déplacement posé. Les tests de pile couvrent le déplacement, mais pas l'absence de double saut. À vérifier dans la documentation de BlockNote, ou à écrire en retournant le résultat hors du `transact`.

**A4** **[mineur]**, grille 3 — `v2/adaptateurs/blocknote/serveur.js:46`
`texteDesBlocs` ne compte ni les cellules de tableau (`b.content` de type `tableContent` n'est pas un tableau), ni le texte des notes (contenu en ligne de type `note`, `c.text` indéfini). La fonction annoncée « pour comparer, compter, indexer » sous-estime donc un document avec tableaux ou notes. Réutiliser la traversée de `notesDuDocument` (`v2/extensions/note/index.js:96-112`) ou parcourir `tableContent` explicitement.

**A5** **[question]**, grille 3 — `v2/extensions/typographie/index.js:67-77`
`annulerRemplacement` inverse les pas de la dernière règle de frappe sans vérifier que rien n'a changé depuis (déplacement du curseur, frappe d'un autre signe, modification distante en collaboration) : un Retour arrière tardif pourrait réécrire l'ancien signe brut à un endroit qui a bougé. Si le module amont vide bien son état à chaque transaction étrangère, le risque est nul ; sinon, garder une marque de position et vérifier la sélection avant d'inverser. À trancher d'après la sémantique de `@handlewithcare/prosemirror-inputrules` (déjà suivie dans la veille).

**A6** **[mineur]**, grille 1 — `v2/extensions/typographie/index.js:39`
Le nom de marque `'link'` est comparé en dur : c'est un nom du schéma par défaut de BlockNote, pas une constante exportée par son API publique. Une rupture silencieuse à la montée de version (le lien se ferait typographier) est possible. Un petit contrat (le schéma du livre contient une marque `link`) protégerait ce point.

**A7** **[mineur]**, grille 3 — `v2/extensions/typographie/index.js:48`
Après un nœud non textuel, `precedent` est remis à `''` : au collage, le premier texte qui suit par exemple une note de bas de page sera traité comme en début de bloc, ce qui peut déclencher la règle des guillemets ouvrants là où elle ne s'applique pas. Vérifier ce que `typographier` fait de `avant: ''` et, si besoin, distinguer « début de bloc » d'« après un nœud ».

**A8** **[mineur]**, grilles 3 et 7 — `v2/extensions/note/index.js:74-77`
Chaque note s'abonne à `onSelectionChange` pour toute la durée de sa vie : à chaque déplacement de curseur, les `suivre` de toutes les notes du document s'exécutent. À l'échelle d'un livre, c'est acceptable, mais un abonnement unique côté extension (une seule écoute qui met à jour toutes les notes ouvertes) serait plus sobre et plus proche de ce qu'attendrait l'amont.

#### Points de grille sans remarque

2 (rien d'exploitable côté sécurité dans ce module : pas d'entrée externe directe, pas de secret), 5 (les comportements nouveaux ont leurs tests de pile et de contrat), 6 (attributs sémantiques et `aria-label` présents, navigation clavier testée), 8, 9, 10.

### Citations vérifiées par le script

- A1 : citations valides
- A2 : citations valides
- A3 : citations valides
- A4 : citations valides
- A5 : citations valides
- A6 : citations valides
- A7 : citations valides
- A8 : citations valides
- 2 : **sans citation** (écarté d'office)

### Réponse de Claude

- **A1 : faux.** Langue et personne sont fixées au chargement de la page.
- **A2 : faux.** Une langue inconnue (« pseudo ») retombe sur le français ; un module JavaScript n'a pas de propriétés héritées (`constructor` rend `undefined`).
- **A3 : faux.** Le test des flèches vérifie le texte exact obtenu (« Avant!Note après ») : aucun double déplacement.
- **A4 : juste, mineur.** `texteDesBlocs` ignore les cellules de tableau et le texte des notes : à compléter (il servira aux exports et au compte des signes).
- **A5 : faux.** L'état du module s'efface à toute transaction qui change le document ou la sélection, modification distante comprise.
- **A6 : juste, mineur.** Le nom `link` est celui du schéma de BlockNote : un petit contrat (le schéma du livre a une marque `link`).
- **A7 : juste, mineur.** Après une note collée, le signe suivant est traité comme en début de bloc : un `"` collé juste après un appel de note s'ouvrirait. Correctif : traiter la note comme un objet (`\uFFFC`), comme les autres nœuds.
- **A8 : à mesurer.** Un abonnement par note : sans effet sensible sur l'essai ; à mesurer sur un livre réellement annoté avant de changer.

## Serveur et collaboration

- Fichiers : `v2/application/serveur/acces.js`, `v2/application/serveur/index.js`, `v2/application/serveur/session.js`, `v2/application/collab/index.js`
- Consommation : 78964 signes envoyés, 5092 reçus (et 6444 de réflexion) ; réflexion `low` ; 13 s ; arrêt : stop

### Avis de l'auditeur

#### Synthèse
Le module est globalement solide : codes d'erreur sans phrases, fail-closed sur le jeton interne, comparaisons à temps constant, tests nombreux et bien ciblés. Les principaux écarts portent sur le repli silencieux du secret de session (qui neutralise la vérification d'absence et rend les sessions éphémères sans erreur), l'absence d'expiration des jetons de session, la robustesse du service de fichiers statiques (préfixe de chemin, en-têtes) et l'absence de délai sur les appels internes du processus de collaboration. Rien de bloquant pour l'étape 2, mais plusieurs points gagneraient à être corrigés avant l'étape 6.

#### Constats
1. **[important]** Sécurité (secrets, session) — `v2/application/serveur/index.js:16` : `secret: process.env.V2_SECRET || randomBytes(32)…` fait qu'en production un `V2_SECRET` oublié ne provoque aucune erreur : le serveur démarre avec un secret aléatoire, toutes les sessions sont invalidées à chaque redémarrage, et le garde-fou `if (!CONF.secret)` de la ligne 161 devient mort (le repli n'est jamais vide). Proposer : pas de repli en ligne (`V2_DEV !== '1'` → erreur si absent), repli aléatoire seulement en développement.
2. **[important]** Sécurité (session, ASVS 3.7) — `v2/application/serveur/session.js:9-12` : le jeton de session n'a ni expiration ni date d'émission ; un jeton volé est valable pour toujours, et aucun mécanisme de rotation n'existe. Même si l'identité est de développement à cette étape, le format posé maintenant sera repris à l'étape 6. Proposer d'ajouter `iat`/`exp` (et une durée maximale) dès maintenant dans `creerJeton`/`lireJeton`.
3. **[mineur]** Sécurité (traversée de chemin) — `v2/application/serveur/index.js:147` : `fichier.startsWith(CONF.statique)` est une comparaison de préfixe sans séparateur : si `CONF.statique` vaut `/srv/dist`, un chemin résolvant vers `/srv/distX/…` passerait le contrôle. Le test « pas de sortie du dossier statique » ne couvre probablement pas ce cas voisin. Proposer `fichier === CONF.statique || fichier.startsWith(CONF.statique + sep)`.
4. **[mineur]** Sécurité (en-têtes, ASVS 14.x) — `v2/application/serveur/index.js:150` : les fichiers sont servis sans `X-Content-Type-Options: nosniff` (le repli `application/octet-stream` peut être reniflé en HTML par d'anciens navigateurs), ni `Content-Security-Policy` ni `Cache-Control` sur les ressources statiques. Si ces en-têtes relèvent de Caddy (couche exploitation), le noter dans l'ADR 0004 ou le plan d'exploitation ; sinon les ajouter dans `servirFichier`.
5. **[mineur]** Robustesse — `v2/application/collab/index.js:18` et `v2/application/collab/index.js:24` : les `fetch` vers le serveur d'identité et de droits n'ont ni délai ni traitement d'échec réseau (refus de connexion, timeout) ; si le serveur Node est lent ou tombé, chaque connexion WebSocket attend indéfiniment. Proposer `AbortSignal.timeout(...)` et un comportement défini (refuser la connexion, fail-closed).
6. **[mineur]** Robustesse — `v2/application/collab/index.js:31-35` : dans le gestionnaire de signaux, si `collab.fermer()` rejette, `process.exit(0)` n'est jamais appelé et le processus reste suspendu. Proposer `try { await collab.fermer() } finally { process.exit(0) }`.
7. **[mineur]** Correction — `v2/application/serveur/index.js:173-174` : le `catch` global renvoie tout en 400, y compris les erreurs internes inattendues (qui devraient être 500 et tracées) et le corps trop gros (`requete-trop-grosse` mériterait 413). Aucun journal d'erreur n'est écrit : une panne sera invisible. Proposer de distinguer erreurs de requête (400/413) et erreurs internes (500 + journal).
8. **[question]** Sécurité (CSRF, ASVS 3.2.2) — `v2/application/serveur/index.js:94` : les routes qui changent l'état ne portent aucune protection CSRF, seulement `SameSite=Lax` sur le cookie. Aujourd'hui toutes ces routes sont de développement (`/api/dev/*`), donc l'exposition est faible ; mais je ne sais pas si la protection CSRF est prévue ailleurs (Caddy, étape 6). À poser comme question pour l'étape 6.
9. **[question]** Exploitation — `v2/application/serveur/index.js:181` : le serveur ne journalise rien (ni démarrage, ni erreurs, ni accès) ; le test en ligne vérifie HSTS et cookies mais je ne vois pas de stratégie de journaux pour ce processus. Est-elle prévue à l'étape 9 (back-office) ou chez Caddy ? À confirmer, sinon les points 5 et 7 seront difficiles à diagnostiquer en production.
10. **[mineur]** Sécurité (validation d'entrée) — `v2/application/serveur/index.js:125` : dans `/api/dev/acces`, `personne` est acceptée comme n'importe quelle chaîne non vide, sans validation de format d'identifiant (contrairement aux documents et aux noms). Route de développement seulement, mais un identifiant arbitraire peut être injecté dans la table puis présenté à y/hub. Proposer une validation minimale (format d'identifiant du domaine).

#### Points de grille sans remarque
1, 4, 5, 6, 10 (aucun défaut trouvé sur l'architecture, la simplicité — knip concorde —, les tests, l'accessibilité de ce module, les traductions et le RGPD pour ce qui est fourni).

### Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides
- 8 : citations valides
- 9 : citations valides
- 10 : citations valides

### Réponse de Claude

- **1 : juste, important.** Un `V2_SECRET` absent en ligne passerait inaperçu (secret aléatoire, sessions perdues à chaque redémarrage) : exiger le secret hors développement.
- **2 : juste, pour l'étape 6.** Expiration des sessions avec le lien magique (ADR 0005).
- **3 : juste, mineur.** Comparer le chemin avec le séparateur de dossier.
- **4 : juste, pour la mise en ligne.** En-têtes `nosniff`, CSP, `Referrer-Policy` : au niveau de Caddy (plan de mise en ligne).
- **5 : juste, mineur.** Délai sur les appels du processus de collaboration au serveur, et refus en cas d'échec.
- **6 : juste, mineur.** `finally` dans l'arrêt du processus.
- **7 : juste, mineur.** Distinguer 400, 413 et 500, et journaliser les erreurs internes.
- **8 : question pour l'étape 6** (CSRF avec les vraies routes ; aujourd'hui seules des routes de développement changent l'état).
- **9 : question pour l'exploitation** (journaux du serveur ; journald recueille la sortie des services).
- **10 : sans suite.** Route de développement, retirée à l'étape 6.

## Client

- Fichiers : `v2/application/client/App.jsx`, `v2/application/client/index.html`, `v2/application/client/main.jsx`
- Consommation : 72005 signes envoyés, 3947 reçus (et 6439 de réflexion) ; réflexion `low` ; 11 s ; arrêt : stop

### Avis de l'auditeur

#### Synthèse
Le module Client respecte globalement le graphe des dépendances (adaptateurs, domaine, i18n, design, aucune fondation directe) et la règle des textes traduits. Les principaux écarts sont des robustesses : un `decodeURIComponent` non protégé sur le fragment d'adresse, un `entrer` sans gestion d'erreur réseau, et une perte du code d'erreur quand la création de document échoue. Quelques points d'accessibilité et de simplicité (rechargement complet de la page au changement de document) méritent attention.

#### Constats

**A1 — [important] Grille 3 (robustesse)** — `v2/application/client/App.jsx:63`
`decodeURIComponent(location.hash.slice(1))` lève une exception sur un fragment mal formé (par ex. `#%`), non interceptée : écran blanc au lieu d'un message traduit. Le test « un nom de document refusé affiche un message » couvre les noms invalides mais pas ce plantage en amont. Proposer : encapsuler dans un `try` et renvoyer le code du domaine (ou un code `adresse-invalide`).

**A2 — [important] Grille 3 (robustesse)** — `v2/application/client/App.jsx:37-45`
`entrer` n'a pas de `try/catch` ni de gestion de rejet : une erreur réseau au moment de la connexion laisse une promesse rejetée non traitée et l'écran sans réaction, alors que `charger` (lignes 25-35) gère ce cas. Proposer : même traitement que `charger` (`code: 'reseau'`).

**A3 — [mineur] Grille 3 (robustesse)** — `v2/application/client/App.jsx:74-82`
Si la création de document (ligne 75) échoue, la fonction retourne le code lu dans la réponse `r` d'origine (le 404), pas celui de la création : l'utilisateur voit « document inconnu » au lieu de la vraie raison. Proposer : lire et retourner le code de `creation` en cas d'échec.

**A4 — [mineur] Grille 6 (accessibilité, RGAA 8.3)** — `v2/application/client/index.html:2`, `v2/application/client/index.html:6`
`<html>` n'a pas d'attribut `lang` et `<title>` est vide dans le HTML servi ; ils ne sont remplis qu'au chargement du module (`App.jsx:17-18`). Avant exécution du JS (ou si celui-ci échoue), la page n'a ni langue ni titre. Proposer : `lang="fr"` (langue source) et un titre par défaut dans `index.html`.

**A5 — [mineur] Grille 6 (accessibilité)** — `v2/application/client/App.jsx:18`
Le titre de la page reste `application.nom` même quand un document est ouvert ; le titre du document (`document.titre`, ligne 130) n'apparaît que dans la page. Plusieurs documents dans des onglets se confondent. Proposer : mettre à jour `document.title` à l'ouverture du document — question pour Sylvain si c'est un choix d'étape 6.

**A6 — [mineur] Grille 4 (simplicité) / Grille 7 (performance)** — `v2/application/client/App.jsx:97-101`
Le changement de document recharge toute la page (`location.reload()`), ce qui re-télécharge et ré-exécute l'application pour un simple changement de fragment. Acceptable à cette étape, mais à noter pour l'étape 6. Proposer : une note dans le plan de l'étape 6, pas un changement maintenant.

**A7 — [question] Grille 1 (architecture)** — `v2/application/client/App.jsx:5`, `v2/application/client/App.jsx:110`
L'application appelle `couleurAuteur` (une fonction de `v2/design/` qui calcule une valeur, ADR 0008) plutôt que de recevoir la couleur d'un composant de présentation. Le graphe permet à l'application d'importer le design, mais la frontière règle 16 (« le technique délègue tout l'affichage ») est ici franchie par une valeur calculée côté design. À trancher : est-ce un usage prévu de `design/auteurs.js` ou un contournement à documenter ?

**A8 — [question] Grille 3** — `v2/application/client/App.jsx:13-18`
La langue et le titre sont fixés au chargement du module, hors de React : un changement de langue demandé ensuite (autre que par rechargement) n'est pas possible. Cohérent avec le rechargement de A6, mais cela fige l'architecture i18n côté client. À confirmer que c'est un choix assumé pour les étapes 1-5.

#### Points de grille sans remarque
2, 5, 8, 9, 10

### Citations vérifiées par le script

- A1 : citations valides
- A2 : citations valides
- A3 : citations valides
- A4 : citations valides
- A5 : citations valides
- A6 : citations valides
- A7 : citations valides
- A8 : citations valides

### Réponse de Claude

- **A1 : juste, important.** `#%` dans l'adresse fait planter l'écran : intercepter et afficher le message du domaine.
- **A2 : juste, mineur.** Erreur réseau à la connexion : même traitement que `charger`.
- **A3 : faux.** Voulu : un 409 à la création veut dire que le document existe sans accès pour la personne ; on montre « introuvable » pour ne pas révéler qu'il existe.
- **A4 : juste, mineur.** `lang="fr"` dans `index.html` (langue source) ; le titre reste posé par l'application.
- **A5 et A6 : à noter pour l'interface (étape 6).**
- **A7 : faux.** La couleur vient du design par décision (ADR 0008, palette de Mantine) ; l'application ne fait que la transmettre.
- **A8 : faux.** Choix assumé : la langue se choisit au chargement.

## Design

- Fichiers : `v2/design/Cadre.jsx`, `v2/design/auteurs.js`, `v2/design/composants/EcranSimple.jsx`, `v2/design/composants/ListeNotes.jsx`, `v2/design/composants/PageEdition.jsx`, `v2/design/feuilles/notes.css`, `v2/design/index.js`, `v2/design/reglages.js`
- Consommation : 72077 signes envoyés, 3899 reçus (et 3896 de réflexion) ; réflexion `low` ; 9 s ; arrêt : stop

### Avis de l'auditeur

#### Synthèse
Le module Design est globalement conforme : Mantine tel quel, réglages réduits à `reglages.js`, feuille de notes conforme à la révision de l'ADR 0008, composants de présentation sans logique. Les constats portent surtout sur l'accessibilité (`role="document"` sur `main`, numéros de notes non vocalisés, absence de lien note ↔ appel), sur la perte silencieuse de contenus riches dans `ListeNotes` (liens, code en ligne), et sur quelques points mineurs de robustesse et de simplicité.

#### Constats

**A1 — [important]** Accessibilité (grille 6), `v2/design/composants/PageEdition.jsx:19` — `<main role="document">` remplace le rôle implicite de région principale (`main`) par `document`, ce qui supprime le repère de navigation et dégrade la traversée au clavier/lecteur d'écran (RGAA 12.7, rôle non pertinent pour la zone principale). Proposer de retirer `role="document"` (le rôle natif de `main` suffit).

**A2 — [important]** Accessibilité (grille 6), `v2/design/feuilles/notes.css:14-18` — le numéro de note est généré par `content: counter(note)` dans un pseudo-élément `::before` : il n'est pas vocalisé de façon fiable par les lecteurs d'écran, et ne fait pas partie du contenu accessible. Proposer que l'extension (couche 3) pose le numéro dans un élément réel (`<sup>` avec texte), conformément à la règle 19, le CSS ne réglant que l'apparence.

**A3 — [important]** Correction (grille 3), `v2/design/composants/ListeNotes.jsx:6-15` — `Morceau` ne rend que `bold`, `italic`, `underline`, `strike` : tout autre contenu riche d'une note (lien, code en ligne, si le schéma du livre les retient) serait silencieusement perdu à l'affichage de la liste. Question pour Sylvain/Claude : le schéma retenu exclut-il ces styles en ligne dans les notes ? Si non, c'est une perte de données à l'affichage ; proposer de traiter le cas ou de l'ajouter aux renoncements.

**A4 — [mineur]** Accessibilité (grille 6), `v2/design/composants/ListeNotes.jsx:21-31` — la liste des notes n'a aucun lien vers l'appel correspondant dans le texte (ni `aria-describedby`), ce qui gêne la navigation en lecture pour un utilisateur de lecteur d'écran. Proposer d'examiner ce point avec l'extension note (règle 19 : attributs sémantiques posés par la couche 3).

**A5 — [mineur]** Correction (grille 3), `v2/design/composants/ListeNotes.jsx:24-27` — clés React par index (`key={i}`, `key={j}`) : acceptable pour une liste en lecture seule, mais fragile si les notes deviennent éditables plus tard. Noter et laisser, ou utiliser un identifiant de bloc si disponible.

**A6 — [mineur]** Simplicité (grille 4), `v2/design/Cadre.jsx:12` — `createTheme({})` crée un thème vide, équivalent à ne rien passer : une indirection sans effet tant que `REGLAGES.theme` est vide. Acceptable pour garder la structure des réglages décidés ; au besoin, simplifier en passant `REGLAGES.theme` directement.

**A7 — [question]** Accessibilité (grille 6), `v2/design/composants/PageEdition.jsx:15` et `v2/design/composants/EcranSimple.jsx:11` — `role="status"` (région `aria-live` implicite) est posé sur l'état de synchronisation et les messages : correct, mais si l'élément n'existe pas au premier rendu ou change de nœud, l'annonce peut être perdue. À vérifier dans les tests de pile avec un lecteur d'écran ; pas de changement proposé sans mesure.

**A8 — [question]** Robustesse (grille 3), `v2/design/auteurs.js:10-13` — deux personnes différentes peuvent recevoir la même couleur (hachage modulo) ; le test « couleur d'auteur : stable » ne garantit pas l'unicité. Si la distinction visuelle des curseurs est un besoin de produit, noter la limite ; sinon rien à faire.

#### Points de grille sans remarque
1, 2, 5, 7, 8, 9, 10 — rien à signaler sur ce module (les tests de frontières, de design décidé et de composants couvrent les règles 16-22 ; les vulnérabilités `npm audit` relèvent de l'adaptateur y/hub, pas du design).

### Citations vérifiées par le script

- A1 : citations valides
- A2 : citations valides
- A3 : citations valides
- A4 : citations valides
- A5 : citations valides
- A6 : citations valides
- A7 : citations valides
- A8 : citations valides

### Réponse de Claude

- **A1 : juste, important.** `role="document"` sur `<main>` efface le repère « contenu principal » : retirer le rôle (lot de design, sans valeur à décider) et ajuster le test.
- **A2 : juste, déjà noté.** Le numéro d'appel n'existe que dans la feuille de style ; sa lecture par les lecteurs d'écran est un point ouvert de l'étape 4, à traiter avec l'interface.
- **A3 : faux.** Le contenu d'une note n'admet que les styles du livre (gras, italique, souligné, barré) : ni lien ni code.
- **A4 : juste, à noter pour l'interface** (lien entre la liste et l'appel).
- **A5 à A8 : sans suite** (liste en lecture ; structure des réglages voulue ; rien à mesurer ; couleurs partagées possibles, sans enjeu).

## Exploitation

- Fichiers : `v2/exploitation/dev/captures.mjs`, `v2/exploitation/dev/demarrer.mjs`, `v2/exploitation/dev/mesurer.mjs`, `v2/exploitation/dev/pile.mjs`, `v2/exploitation/prod/Caddyfile.v2`, `v2/exploitation/prod/amend-v2-collab.service`, `v2/exploitation/prod/amend-v2.service`, `v2/exploitation/prod/deployer.sh`, `v2/exploitation/prod/installer.sh`, `v2/exploitation/prod/mesurer.sh`, `v2/exploitation/prod/postgresql-amend-v2.conf`, `v2/exploitation/prod/valkey-amend-v2.conf`
- Consommation : 90421 signes envoyés, 4874 reçus (et 3618 de réflexion) ; réflexion `low` ; 10 s ; arrêt : stop

### Avis de l'auditeur

#### Synthèse
Le module « Exploitation » est globalement sobre et cohérent avec l'ADR 0004 (trois services, petite machine, mesures de mémoire). Le défaut le plus sérieux est un fichier d'environnement de production généré avec `V2_DEV=1`, qui ouvre en ligne les routes de développement (session, création, rôles) que les tests unitaires déclarent fermées hors développement. Restent à traiter : l'absence de sauvegarde/restauration PostgreSQL, des durcissements systemd et Caddy mineurs, et une dépendance de service possiblement manquante.

#### Constats
1. **[grave]** Sécurité (contrôle d'accès, ASVS V2/V4) — `v2/exploitation/prod/installer.sh:33`. Le fichier `/opt/amend/v2.env` généré pour la production contient `V2_DEV=1`, alors que les tests (`v2/tests/unitaires/serveur.test.js` : « hors développement : routes de création et de rôles fermées ») montrent que ce drapeau ouvre la route de session de développement, la création de documents et l'attribution de rôles sans authentification réelle. Sur `v2.amend.ink`, derrière le `basic_auth` de Caddy, quiconque connaît le mot de passe (ou le récupère) devient propriétaire de documents. Proposer : retirer `V2_DEV=1` du gabarit (ou l'expliciter en commentaire « à n'activer que pour un essai »), et ajouter un contrôle au déploiement qui échoue si `V2_DEV=1` est trouvé dans l'environnement de production.
2. **[important]** Exploitation (grille 8 : sauvegarde et restauration) — `v2/exploitation/prod/installer.sh:48` (création de la base), `v2/exploitation/prod/deployer.sh:14` (schéma y/hub). Aucun script de sauvegarde ni de restauration de PostgreSQL (et de l'AOF Valkey) n'existe dans `v2/exploitation/prod/`, alors que la base `amendv2_yhub` est la seule copie durable du contenu (règle 10 : le document Yjs est la seule source). L'ADR 0004 note « sauvegardes à revoir » comme conséquence, mais l'installation crée déjà une base de production. Proposer : un script `sauvegarder.sh`/`restaurer.sh` (pg_dump + copie de l'AOF) et un essai de restauration documenté, au plus tard avant tout essai avec de vrais textes.
3. **[mineur]** Exploitation / robustesse — `v2/exploitation/prod/amend-v2.service:9`. Le service serveur ne déclare `After=network.target` que lui (`v2/exploitation/prod/amend-v2-collab.service:5` déclare en plus `postgresql.service` et `valkey-server.service`). Si le serveur lit ou écrit dans PostgreSQL/Valkey (droits, sessions), un démarrage après reboot peut échouer ou rejeter des requêtes tant que les bases ne sont pas prêtes ; `Restart=on-failure` atténue mais ne garantit pas. Question pour Claude : le serveur touche-t-il PostgreSQL ? Si oui, aligner les unités `After`/`Wants`.
4. **[mineur]** Sécurité (en-têtes, ASVS V4.1/V3.2) — `v2/exploitation/prod/Caddyfile.v2:5`. HSTS limité à 7 jours : acceptable pour un essai, mais à allonger (au moins 6 mois, ASVS) une fois l'essai confirmé ; aucun autre en-tête de sécurité (CSP, `X-Content-Type-Options`, `Referrer-Policy`) n'est posé au niveau Caddy. Proposer : noter ces en-têtes dans le plan de mise en ligne (la revue de sécurité de mise en ligne est prévue § 6 des règles) plutôt que de les ajouter maintenant.
5. **[mineur]** Exploitation (durcissement systemd) — `v2/exploitation/prod/amend-v2.service:18`, `v2/exploitation/prod/amend-v2-collab.service:19`. Seul `NoNewPrivileges=true` est posé ; manquent `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, `ReadWritePaths=` (le dépôt et les ports locaux suffisent aux deux services). Proposer : ajouter ces lignes aux deux unités, sans coût.
6. **[mineur]** Exploitation (pare-feu) — `v2/exploitation/prod/installer.sh:64`. Si aucun pare-feu n'est détecté, le script ne fait qu'afficher un avertissement et termine sur « ✓ installation terminée » : l'installation peut laisser le port 4400 (y/hub, écoute sur toutes les interfaces) exposé à Internet, contournant Caddy et son `basic_auth`. Proposer : faire échouer l'installation (ou exiger une confirmation explicite) tant que le port n'est pas vérifié fermé.
7. **[question]** Sécurité (secrets) — `v2/exploitation/dev/pile.mjs:9`. Les identifiants de développement (`amendv2:amendv2-dev`) sont en dur ; c'est la base locale de l'environnement de développement, et `V2_POSTGRES` permet de les remplacer, donc pas un défaut en soi — mais à confirmer : la base de production utilise bien un mot de passe aléatoire distinct (`installer.sh:27` le fait, ce qui va dans le bon sens).
8. **[mineur]** Exploitation (déploiement) — `v2/exploitation/prod/deployer.sh:16`. Le redémarrage n'est suivi que d'un `sleep 2` et d'un affichage de statut : si un service plante au démarrage (migration de schéma, env manquant), le script se termine sans erreur. Proposer : vérifier `systemctl is-active` des deux services et échouer sinon.

#### Points de grille sans remarque
1, 3 (partiellement, hors le point 3 ci-dessus), 4, 5, 6, 7, 9, 10.

### Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides
- 8 : citations valides

### Réponse de Claude

- **1 : faux (décision documentée).** `V2_DEV=1` est voulu sur `v2.amend.ink`, site d'essai derrière mot de passe, tant que le lien magique n'existe pas : limite assumée, écrite dans la revue de clôture de l'étape 2.
- **2 : juste, important.** Aucune sauvegarde ni restauration de la base v2 : à écrire avant tout essai avec de vrais textes (question de calendrier pour Sylvain).
- **3 : faux.** Le serveur ne touche ni PostgreSQL ni Valkey.
- **4 : juste, pour la mise en ligne** (HSTS plus long, en-têtes).
- **5 : juste, mineur.** Durcir les deux unités systemd (`ProtectSystem`, `PrivateTmp`…), sans coût.
- **6 : juste, mineur.** L'installation doit échouer si le port 4400 n'est pas fermé.
- **7 : faux.** Identifiants de la base locale de développement.
- **8 : juste, mineur.** Le déploiement doit vérifier que les deux services tournent.

## Garde-fous (lint, contrats statiques, configuration)

- Fichiers : `v2/eslint.config.js`, `v2/contrats/statiques/api-publique.test.js`, `v2/contrats/statiques/design-decide.test.js`, `v2/contrats/statiques/dictionnaire-blocknote.test.js`, `v2/contrats/statiques/licences.test.js`, `v2/contrats/statiques/sources-sans-invisibles.test.js`, `v2/contrats/statiques/une-seule-copie-prosemirror.test.js`, `v2/contrats/statiques/une-seule-copie-yjs.test.js`, `v2/package.json`, `v2/vite.config.js`, `v2/knip.json`
- Consommation : 93468 signes envoyés, 6199 reçus (et 19749 de réflexion) ; réflexion `low` ; 26 s ; arrêt : stop

### Avis de l'auditeur

#### Synthèse

Le module garde-fous est d'une qualité rare : le lint des frontières, les contrats statiques (API publique, licences, réglages décidés) et les tests sont cohérents avec les règles et les ADR. Les constats portent surtout sur des angles morts du lint lui-même : des fondations déclarées mais permises à personne, les feuilles de style de n'importe quel paquet npm acceptées dans le design, l'interdiction des textes en dur limitée au JSX, et des vulnérabilités hautes non traitées dans la chaîne de production de `@y/hub`. Rien de bloquant, mais plusieurs garde-fous croient protéger plus large qu'ils ne le font.

#### Constats

**A1** **[important]**, architecture (grille 1), `v2/eslint.config.js:23`, `v2/eslint.config.js:175` — La clé `serveur: 'uws|postgres|redis'` est déclarée dans `FONDATIONS` mais n'apparaît dans aucune liste `permises` : aucune couche ne peut importer un client PostgreSQL, Valkey/Redis ou uws. Or l'ADR 0004 prévoit que notre serveur Node (couche 5) exploite PostgreSQL et Valkey ; soit cette entrée est du code mort (à retirer), soit elle bloquera le serveur au premier `import 'postgres'`. Proposer à Sylvain soit de retirer l'entrée, soit de la permis à `application/serveur/**` avec une révision notée (règle 5 des « six vérifications »).

**A2** **[important]**, architecture/sécurité (grilles 1 et 2), `v2/eslint.config.js:37`, `v2/eslint.config.js:45` — Dans le design, le premier motif exclut tous les `.css` du contrôle des fondations, et le second ne vise que les chemins relatifs (`\.{1,2}/`) : une feuille de style de **n'importe quel paquet npm** (`import 'nimportequoi/dist/x.css'`) passe le lint, contrairement au commentaire « seulement celles des fondations » (ligne 29). Restreindre les `.css` de paquets à une liste explicite (`@mantine/.*`, `@blocknote/.*`).

**A3** **[important]**, exploitation/sécurité (grille 8), `v2/package.json:18` — `@y/hub` 0.10.1 tire minio → query-string → decode-uri-component (high, DoS) et stream-json (moderate), dans la chaîne de production. Le dossier fourni ne montre ni entrée dans `docs/v2-veille.md`, ni `overrides` dans package.json, ni renoncement écrit ; « non utilisé » n'est pas un traitement au sens de la règle 9. Proposer : documenter dans la veille avec date de réexamen, et étudier des `overrides` npm pour les transitives si y/hub le permet.

**A4** **[important]**, traductions (grille 10), `v2/eslint.config.js:57`, `v2/eslint.config.js:131`, `v2/eslint.config.js:154` — `TEXTE_EN_DUR` ne vise que `JSXText` et des attributs JSX : le serveur, le domaine, l'i18n et les adaptateurs yjs/yhub (qui n'ont pas de JSX) peuvent écrire des phrases en dur sans que le lint ne bronche, alors que la règle 23 vise « à aucune couche » (messages d'erreur, courriers, back-office) et la règle 25 des codes côté serveur. De plus, un `TemplateLiteral` dans un attribut JSX échappe aussi la règle. Compléter le lint (au minimum : interdire les chaînes littérales renvoyées ou journalisées côté serveur) ou noter le renoncement dans le registre.

**A5** **[mineur]**, licences (grille 10), `v2/contrats/statiques/licences.test.js:10` — `GPL-3.0` n'est pas dans `COMPATIBLES`, alors que l'ADR 0006 (décision 2 de Sylvain) déclare les paquets `xl-` de BlockNote (GPL-3.0) utilisables. Dès qu'un paquet `xl-` sera installé, le contrat échouera en contradiction avec la décision. Ajouter `'GPL-3.0'` avec le renvoi à l'ADR 0006.

**A6** **[mineur]**, simplicité/design (grille 4), `v2/eslint.config.js:196` — Pour `design/reglages.js`, c'est **tout** `no-restricted-syntax` qui est éteint, y compris `TEXTE_EN_DUR` et `STYLE_EN_DUR`, alors que seule l'exemption de valeurs de design est justifiée. Éteindre uniquement les règles de valeurs, garder textes et `style`/`className`.

**A7** **[mineur]**, design (grille 1), `v2/eslint.config.js:71` — `VALEUR_VISUELLE` oublie `%`, `ch`, `ex`, `fr`, `cm/mm/in` et les couleurs nommées (`red`, `blue`) : une taille en pourcentage ou une couleur nommée dans le code technique échappe au lint. Compléter la classe des unités et les couleurs nommées CSS.

**A8** **[question]**, architecture (grille 1), `v2/knip.json:5` — `application/collab/index.js` est un point d'entrée knip, mais l'arborescence des règles (§ 2) ne décrit que `application/client/` et `application/serveur/`. Ce dossier `collab/` est-il voulu (et l'arborescence à mettre à jour), ou un reste d'un découpage antérieur ?

**A9** **[mineur]**, tests/API publique (grille 5), `v2/contrats/statiques/api-publique.test.js:70` — Le contrat vérifie les chemins d'import, mais rien ne vérifie le second volet de la règle 2 : les membres privés (`_x`) et le code de fondation copié. C'est assumé par endroits (« vérifié par la machine » ne vise que les frontières), mais autant le noter comme limite connue du garde-fou, ou ajouter un contrôle simple des imports `_…`.

**A10** **[question]**, exploitation (grille 8), `v2/package.json:46` — `"format": "prettier --write"` sans chemin : selon les versions, prettier sans motif de fichier ne formate rien ou échoue (la commande usuelle est `prettier --write .`). Vérifier que `npm run format` formate bien le dépôt ; sinon corriger en `--write .`.

**A11** **[mineur]**, tests (grille 5), couverture (`application/serveur/index.js`, lignes 15-23 et 180-182 non couvertes) — Les branches non couvertes du serveur ressemblent aux chemins d'arrêt et d'erreur de démarrage ; les tests de pile couvrent le redémarrage de y/hub mais visiblement pas l'arrêt propre du serveur Node. Un test d'arrêt/redémarrage du serveur lui-même (pas seulement de y/hub) sécuriserait le comportement en panne.

**A12** **[mineur]**, exploitation (grille 8), `v2/package.json:34` — eslint 10.14.0 est dans une plage signalée vulnérable (minimatch, DoS, correctif annoncé 9.39.5) ; chaîne de développement seulement, mais l'audit est daté du 08/11/2026 sans suivi visible. Noter dans la veille avec la montée de version mensuelle.

#### Points de grille sans remarque

6 (accessibilité), 9 (données personnelles) — rien de jugé sur le code fourni ; 2 (sécurité ASVS) et 3 (robustesse) : rien de nouveau au-delà de A3 et A11 ; 7 (performance) : rien à signaler sur les fichiers fournis.

### Citations vérifiées par le script

- A1 : citations valides
- A2 : citations valides
- A3 : citations valides
- A4 : citations valides
- A5 : citations valides
- A6 : citations valides
- A7 : citations valides
- A8 : citations valides
- A9 : citations valides
- A10 : citations valides
- A11 : **sans citation** (écarté d'office)
- A12 : citations valides
- 6 : **sans citation** (écarté d'office)

### Réponse de Claude

- **A1 : faux, à revoir à l'étape 6.** Volontaire : notre code ne parle pas directement à PostgreSQL ni à Valkey ; l'ADR de stockage dira qui le fera.
- **A2 : juste, mineur.** Restreindre les feuilles de style importables par le design à celles de Mantine et de BlockNote.
- **A3 : juste.** Les vulnérabilités de la chaîne de y/hub doivent figurer dans la veille, avec leur évaluation (client S3 non utilisé) et une date de réexamen.
- **A4 : juste en partie, limite connue.** Le lint ne peut pas reconnaître une phrase hors du JSX ; le serveur et le domaine rendent des codes (testés). À noter comme limite du garde-fou.
- **A5 : juste, mineur.** Ajouter `GPL-3.0` aux licences admises, comme le décide l'ADR 0006.
- **A6 : juste, mineur.** Dans `reglages.js`, n'éteindre que la règle des valeurs, pas celle des textes et des styles.
- **A7 : juste en partie.** Ajouter `%` et les unités manquantes ; pas les couleurs nommées (trop de mots ordinaires).
- **A8 : juste (documentation).** Ajouter `application/collab/` à l'arborescence des règles.
- **A9 : limite connue,** à noter.
- **A10 : faux.** `npm run format` prend les fichiers en argument, à dessein.
- **A11 et 6 : sans citation.**
- **A12 : juste.** À noter dans la veille avec les montées de version mensuelles.

## Arbitrage de Sylvain

(À compléter.)
