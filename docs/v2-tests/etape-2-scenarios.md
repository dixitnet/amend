# Scénarios adverses de l’étape 2 (2026-11-08)

- Relecteur : Mistral, modèle `mistral-large-latest` ; consommation : 129784 signes envoyés, 16031 reçus
- Pièces : `docs/v2-regles-developpement.md`, `docs/v2-renoncements.md`, `docs/v2-veille.md`, `v2/adr/0001-architecture-docs-allege.md`, `v2/adr/0002-couches.md`, `v2/adr/0003-blocknote.md`, `v2/adr/0004-yhub.md`, `v2/adr/0005-connexion.md`, `v2/adr/0006-licence.md`, `v2/adr/0007-relecteur-ia.md`, `v2/adr/0008-design.md`, `v2/adr/0009-traductions.md`, `docs/v2-etape-2-plan.md`, `Arborescence de v2/ (fichiers suivis)`, `v2/package.json`, `docs/v2-procedure-tests.md`, `docs/v2-mise-en-ligne.md`, `v2/.prettierrc.json`, `v2/adaptateurs/blocknote/dictionnaire.js`, `v2/adaptateurs/blocknote/index.jsx`, `v2/adaptateurs/blocknote/serveur.js`, `v2/adaptateurs/yhub/index.js`, `v2/adaptateurs/yjs/index.js`, `v2/application/client/App.jsx`, `v2/application/client/main.jsx`, `v2/application/collab/index.js`, `v2/application/serveur/index.js`, `v2/application/serveur/session.js`, `v2/design/auteurs.js`, `v2/design/composants/EcranSimple.jsx`, `v2/design/composants/PageEdition.jsx`, `v2/design/index.js`, `v2/design/jetons.css`, `v2/design/styles.css`, `v2/design/theme.js`, `v2/domaine/document.js`, `v2/domaine/index.js`, `v2/domaine/personne.js`, `v2/eslint.config.js`, `v2/exploitation/dev/captures.mjs`, `v2/exploitation/dev/demarrer.mjs`, `v2/exploitation/dev/mesurer.mjs`, `v2/exploitation/dev/pile.mjs`, `v2/exploitation/prod/Caddyfile.v2`, `v2/exploitation/prod/amend-v2-collab.service`, `v2/exploitation/prod/amend-v2.service`, `v2/exploitation/prod/deployer.sh`, `v2/exploitation/prod/installer.sh`, `v2/exploitation/prod/mesurer.sh`, `v2/exploitation/prod/postgresql-amend-v2.conf`, `v2/exploitation/prod/valkey-amend-v2.conf`, `v2/i18n/en.json`, `v2/i18n/exceptions.json`, `v2/i18n/fr.json`, `v2/i18n/index.js`, `v2/i18n/pseudo.js`, `v2/package.json`, `v2/vite.config.js`, `Tests existants (fichier, puis titres)`
- Commit relu : `f7f7d1e`
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Proposition de Mistral

## Scénarios par couche

### T1 Domaine et traductions
**T1.1 [moyen]** **Identifiant de document avec caractères réservés dans les URL**
Fichier : `v2/domaine/document.js`, fonction `identifiantDocument`
Entrées : `"doc?query=1"`, `"doc#fragment"`, `"doc[test]"`, `"doc space"`, `"doc%20encoded"`
Résultat attendu : `{ ok: false, code: 'document-caracteres' }` pour chacun (les caractères réservés dans les URL sont interdits, même si encodés)

**T1.2 [moyen]** **Nom de personne avec marques de sens d'écriture (LTR/RTL)**
Fichier : `v2/domaine/personne.js`, fonction `nomPersonne`
Entrées : `"\u202ALTR\u202C"`, `"\u202BRTL\u202C"`, `"\u2066isolat\u2069"`, `"texte\u202Emiroir"`
Résultat attendu : `{ ok: false, code: 'nom-caracteres' }` pour chacun (les marques de sens d'écriture sont interdites)

**T1.3 [faible]** **Traduction avec paramètres manquants ou en excès**
Fichier : `v2/i18n/index.js`, fonction `creerTraducteur`
Entrées :
- `t('document.participants', {})` (paramètre `n` manquant)
- `t('document.participants', { n: 2, inconnu: 'valeur' })` (paramètre supplémentaire)
Résultat attendu : Erreur explicite pour le paramètre manquant ; le paramètre supplémentaire est ignoré sans erreur

**T1.4 [moyen]** **Clé de traduction absente dans une langue, présente dans une autre**
Fichier : `v2/i18n/index.js`, fonction `creerTraducteur`
Entrées :
- Catalogue `en.json` sans la clé `"document.zoneEdition"` (présente en français)
- Utilisation de `t('document.zoneEdition')` avec `langue: 'en'`
Résultat attendu : Retourne la valeur française (repli), jamais la clé brute

**T1.5 [grave]** **Injection de code via les paramètres de traduction**
Fichier : `v2/i18n/index.js`, fonction `creerTraducteur`
Entrées : `t('document.titre', { id: '<script>alert(1)</script>' })`
Résultat attendu : Le texte s'affiche tel quel (`Document &lt;script&gt;alert(1)&lt;/script&gt;`), sans exécution du script (échappement automatique par `IntlMessageFormat`)

---

### T2 Adaptateurs isolés
**T2.1 [grave]** **Document Yjs avec état corrompu (non binaire, taille invalide)**
Fichier : `v2/adaptateurs/blocknote/serveur.js`, fonction `lireBlocs`
Entrées :
- `Buffer.from('non binaire')` (texte brut)
- `Buffer.from('0000', 'hex')` (trop court pour un en-tête Yjs valide)
- `Buffer.alloc(1000000)` (taille excessive)
Résultat attendu : Erreur `{ code: 'document-illisible' }` pour chacun, jamais une erreur interne de Yjs

**T2.2 [moyen]** **Connexion y/hub avec cookie de session forgé (signature invalide)**
Fichier : `v2/adaptateurs/yhub/index.js`, fonction `demarrerCollaboration` (via `authenticate`)
Entrées :
- Cookie `"amend2_session=corps.invalide"` (signature tronquée)
- Cookie `"amend2_session=corps.."` (signature vide)
- Cookie `"amend2_session=corps.signature"` où `signature` est calculée avec un secret différent
Résultat attendu : Rejet avec `apiError(401, 'session absente')` pour chacun

**T2.3 [moyen]** **Requête à y/hub avec en-tête `Origin` non autorisé**
Fichier : `v2/adaptateurs/yhub/index.js`, fonction `demarrerCollaboration`
Entrées :
- `Origin: http://malicious.com` (non dans `origines`)
- `Origin: https://v2.amend.ink.evil.com` (sous-domaine non autorisé)
- `Origin: ""` (vide)
Résultat attendu : Rejet de la connexion WebSocket (CORS) ou réponse 403 pour les requêtes HTTP

**T2.4 [faible]** **Document BlockNote avec blocs imbriqués à profondeur excessive**
Fichier : `v2/adaptateurs/blocknote/serveur.js`, fonction `texteDesBlocs`
Entrées : Un arbre de blocs avec 100 niveaux d'imbrication (chaque bloc a un enfant)
Résultat attendu : Texte brut extrait sans erreur (la fonction `parcourir` doit gérer la récursion sans stack overflow)

**T2.5 [grave]** **WebSocket Yjs avec message malformé (taille invalide, opcode réservé)**
Fichier : `v2/adaptateurs/yjs/index.js`, fonction `ouvrirDocument`
Entrées : Simulation d'un message WebSocket avec :
- Opcode 8 (close) avec payload invalide
- Taille de payload supérieure à 10 Mo
- Message fragmenté incomplet
Résultat attendu : La connexion WebSocket est fermée proprement (événement `disconnected`), sans plantage du fournisseur

---

### T3 Serveur applicatif
**T2.6 [grave]** **Requête HTTP avec en-tête `Cookie` malformé (injection, taille excessive)**
Fichier : `v2/application/serveur/session.js`, fonction `lireCookie`
Entrées :
- `Cookie: amend2_session=valeur; evil=payload` (cookie supplémentaire)
- `Cookie: amend2_session="valeur non fermée` (guillemet non fermé)
- `Cookie: amend2_session=` + `"x".repeat(10000)` (taille excessive)
Résultat attendu : `lireCookie` retourne `null` pour les cookies malformés ; le serveur répond 401 pour les sessions invalides

**T3.1 [moyen]** **Route interne `/api/interne/droits` appelée sans jeton interne**
Fichier : `v2/application/serveur/index.js`, route `GET /api/interne/droits`
Entrées :
- Requête sans en-tête `x-amend-interne`
- En-tête `x-amend-interne: mauvais-jeton`
Résultat attendu : Réponse 403 avec `{ code: 'interdit' }` pour chacun

**T3.2 [grave]** **Requête POST avec corps JSON malformé (syntaxe invalide, taille excessive)**
Fichier : `v2/application/serveur/index.js`, fonction `lireCorps`
Entrées :
- `"{ malformé"` (syntaxe invalide)
- `"{}"` avec en-tête `Content-Length: 1000000` (taille annoncée > 10 Ko)
- `"{ "nom": "x".repeat(10000) }"` (taille réelle > 10 Ko)
Résultat attendu : Erreur `{ code: 'requete-trop-grosse' }` pour les tailles excessives ; `{ code: 'requete-invalide' }` pour la syntaxe invalide

**T3.3 [moyen]** **Route de développement `/api/dev/session` appelée en production**
Fichier : `v2/application/serveur/index.js`, route `POST /api/dev/session`
Entrées : Requête POST avec `V2_DEV=0` (production)
Résultat attendu : Réponse 404 avec `{ code: 'introuvable' }`

**T3.4 [faible]** **Fichier statique avec chemin relatif traversant (`../../etc/passwd`)**
Fichier : `v2/application/serveur/index.js`, fonction `servirFichier`
Entrées : Chemin `/../../../etc/passwd`
Résultat attendu : Réponse 404 (normalisation du chemin empêche la sortie du dossier `dist/`)

**T3.5 [grave]** **Session avec jeton signé par un secret différent (attaque par replay)**
Fichier : `v2/application/serveur/session.js`, fonction `lireJeton`
Entrées :
- Jeton signé avec `V2_SECRET=autre-secret`
- Jeton signé avec `V2_SECRET` vide
Résultat attendu : `lireJeton` retourne `null` ; le serveur répond 401

---

### T4 Design
**T4.1 [moyen]** **Pseudo-langue avec texte contenant des balises HTML/JS**
Fichier : `v2/i18n/pseudo.js`, fonction `pseudoMessage`
Entrées : Message français `"<script>alert('test')</script>"`
Résultat attendu : Texte pseudo-langue encadré (`⟦<script>alert('tést')</script>~⟧`), sans exécution du script

**T4.2 [faible]** **Composant avec texte traduit contenant des sauts de ligne**
Fichier : `v2/design/composants/EcranSimple.jsx`, composant `EcranMessage`
Entrées : Texte traduit `"Première ligne\nDeuxième ligne"` (via `i18n/fr.json`)
Résultat attendu : Les sauts de ligne sont préservés dans le rendu (balise `<p>` avec `white-space: pre-line` implicite)

**T4.3 [moyen]** **Thème sombre avec jeton de couleur non redéfini**
Fichier : `v2/design/jetons.css`, média `@media (prefers-color-scheme: dark)`
Entrées : Suppression de la redéfinition de `--couleur-accent` dans le thème sombre
Résultat attendu : Le test `v2/tests/unitaires/coherence.test.js` échoue (chaque variable doit être redéfinie dans le thème sombre)

**T4.4 [grave]** **Éditeur BlockNote avec thème contenant des valeurs CSS invalides**
Fichier : `v2/design/theme.js`, objet `themeEditeur`
Entrées : Modification de `themeEditeur.colors.editor.text` en `"invalid !important"`
Résultat attendu : L'éditeur affiche une erreur CSS (texte illisible), mais le test `v2/contrats/pile/pile.test.js` (contrat 5) échoue

**T4.5 [faible]** **Composant avec texte traduit contenant des espaces insécables**
Fichier : `v2/design/composants/PageEdition.jsx`, attribut `aria-label`
Entrées : Texte traduit `"Document\u00A0{id}"` (espace insécable)
Résultat attendu : L'espace insécable est préservé dans le rendu (vérifié par capture d'écran en pseudo-langue)

---

### T5 Pile complète (navigateur automatisé)
**T5.1 [grave]** **Connexion simultanée avec le même identifiant depuis deux onglets**
Fichier : `v2/application/client/App.jsx`, fonction `entrer`
Entrées :
- Onglet 1 : connexion avec le nom `"Alice"`
- Onglet 2 : connexion avec le même nom `"Alice"` (même identifiant généré)
Résultat attendu : Les deux onglets partagent la même session (même couleur d'auteur, même curseur visible dans l'éditeur)

**T5.2 [moyen]** **Document avec identifiant contenant des caractères encodés (NFC vs NFD)**
Fichier : `v2/domaine/document.js`, fonction `identifiantDocument`
Entrées :
- Document `#été` (NFC : `0xC3 0xA9`)
- Document `#été` (NFD : `0x65 0xCC 0x81 0x74 0x65 0xCC 0x81`)
Résultat attendu : Deux documents distincts (les identifiants sont comparés en brut, sans normalisation)

**T5.3 [grave]** **Frappe rapide avec perte de réseau (mode hors ligne)**
Fichier : `v2/adaptateurs/yjs/index.js`, fournisseur WebSocket
Entrées :
- Frappe de 100 caractères en 2 secondes
- Coupure réseau simulée pendant la frappe (via `page.setOffline(true)` dans Playwright)
- Rétablissement du réseau après 5 secondes
Résultat attendu : Tout le texte est synchronisé après le rétablissement, sans perte ni doublon

**T5.4 [moyen]** **Changement de langue en cours de session (via URL)**
Fichier : `v2/application/client/App.jsx`, paramètre `langue`
Entrées :
- Ouverture de `/#doc?langue=fr`
- Modification de l'URL en `/#doc?langue=en` sans rechargement
Résultat attendu : L'interface passe en anglais (vérifié par capture d'écran)

**T5.5 [faible]** **Document avec identifiant très long (64 caractères)**
Fichier : `v2/domaine/document.js`, constante `LONGUEUR_MAX_IDENTIFIANT`
Entrées : Document `#` + `"a".repeat(64)`
Résultat attendu : Le document s'ouvre ; un identifiant de 65 caractères est refusé

---

### T6 En ligne
**T6.1 [grave]** **Connexion WebSocket directe à y/hub sans session valide**
Fichier : `v2/adaptateurs/yhub/index.js`, fonction `authenticate`
Entrées :
- Connexion WebSocket à `wss://v2.amend.ink/collaboration/ws/v1/amend/doc` sans cookie
- Connexion avec un cookie de session expiré (jeton signé avec un ancien `V2_SECRET`)
Résultat attendu : La connexion est refusée (vérifié par `nc -zv` depuis un réseau externe)

**T6.2 [moyen]** **Requête HTTP avec en-tête `Host` forgé**
Fichier : `v2/exploitation/prod/Caddyfile.v2`
Entrées : Requête avec `Host: v2.amend.ink.evil.com`
Résultat attendu : Réponse 404 (Caddy ne route pas les hôtes non configurés)

**T6.3 [grave]** **Attaque par force brute sur la route de développement (si exposée)**
Fichier : `v2/application/serveur/index.js`, route `POST /api/dev/session`
Entrées : 100 requêtes POST avec des noms aléatoires (simulation de force brute)
Résultat attendu : Aucune réponse 200 (la route est désactivée en production, `V2_DEV=0`)

**T6.4 [faible]** **Requête à l'API avec méthode non autorisée (PUT, DELETE)**
Fichier : `v2/application/serveur/index.js`, gestion des méthodes
Entrées : Requête `PUT /api/moi` ou `DELETE /api/config`
Résultat attendu : Réponse 405 avec `{ code: 'methode-refusee' }`

**T6.5 [moyen]** **Document avec identifiant réservé (collision avec une route API)**
Fichier : `v2/application/serveur/index.js`, fonction `servirFichier`
Entrées : Document `#api` (collision avec le préfixe `/api/`)
Résultat attendu : Le document s'ouvre (le préfixe `/api/` est vérifié avant le routage des fichiers)

---

## Données piégées
```json
{
  "noms": [
    "Jean\u202ALTR\u202C",  // Marque LTR (invisible)
    "Marie\u202BRTL\u202C", // Marque RTL (invisible)
    "Alice\u200B",         // Espace sans chasse (invisible)
    "Bob\uFEFF",           // Marque d'ordre des octets (invisible)
    "Charlie\u0000",       // Caractère nul (contrôle)
    "D\u0301e\u0301ja\u0300", // NFD (décomposé)
    "E\u00ADve",           // Trait d'union conditionnel (invisible)
    "F".repeat(81),        // Trop long (81 signes)
    "G<script>alert(1)</script>", // Injection HTML
    "H\uD83D\uDC69\u200D\uD83D\uDCBB" // Emoji composé (femme technologue)
  ],
  "raisons": [
    "Marque de sens d'écriture LTR (interdit)",
    "Marque de sens d'écriture RTL (interdit)",
    "Espace sans chasse (interdit)",
    "Marque d'ordre des octets (interdit)",
    "Caractère nul (interdit)",
    "Forme décomposée NFD (doit être refusé, même si équivalent NFC)",
    "Trait d'union conditionnel (invisible)",
    "Trop long (81 signes, max 80)",
    "Injection HTML (doit être échappé)",
    "Emoji composé (permis, doit être conservé)"
  ],
  "identifiantsDeDocument": [
    "doc?query=1",         // Caractère réservé dans les URL
    "doc#fragment",        // Caractère réservé dans les URL
    "doc space",           // Espace (interdit)
    "doc\u00A0space",      // Espace insécable (interdit)
    "doc\uD83D\uDC4B",     // Emoji (interdit)
    "doc\u0301",           // Accent seul (NFD, interdit)
    "a".repeat(65),        // Trop long (65 signes)
    "doc;DROP TABLE users", // Injection SQL (interdit)
    "doc<script>",         // Injection HTML (interdit)
    "doc\u202Emiroir"      // Texte miroir (RTL, interdit)
  ],
  "raisons": [
    "Caractère réservé '?' dans les URL (interdit)",
    "Caractère réservé '#' dans les URL (interdit)",
    "Espace (interdit)",
    "Espace insécable (interdit)",
    "Emoji (interdit)",
    "Accent seul (NFD, interdit)",
    "Trop long (65 signes, max 64)",
    "Injection SQL (interdit)",
    "Injection HTML (interdit)",
    "Texte miroir (marque RTL, interdit)"
  ],
  "textes": [
    "<script>alert('XSS')</script>", // Injection HTML
    "Texte avec\nsaut de ligne",     // Saut de ligne
    "Texte\u00A0insécable",          // Espace insécable
    "Texte\u2028avec saut de ligne LS", // Saut de ligne LS (U+2028)
    "Texte\u2029avec saut de paragraphe PS", // Saut de paragraphe PS (U+2029)
    "Texte\uFEFFavec BOM",           // Marque d'ordre des octets
    "Texte\u0000nul",                // Caractère nul
    "Texte\u001Fde contrôle",        // Caractère de contrôle (US)
    "Texte\uD800invalide",           // Demi-paire UTF-16 (invalide)
    "Texte".repeat(1000)             // Très long (10 000 signes)
  ],
  "raisons": [
    "Injection HTML (doit être échappé)",
    "Saut de ligne (doit être préservé)",
    "Espace insécable (doit être préservé)",
    "Saut de ligne LS (U+2028, doit être préservé)",
    "Saut de paragraphe PS (U+2029, doit être préservé)",
    "Marque d'ordre des octets (doit être préservé ou ignoré)",
    "Caractère nul (doit être refusé ou ignoré)",
    "Caractère de contrôle (doit être refusé ou ignoré)",
    "Demi-paire UTF-16 (doit être refusé)",
    "Très long (doit être géré sans erreur)"
  ],
  "cookies": [
    "amend2_session=valeur; evil=payload", // Cookie supplémentaire
    "amend2_session=\"non fermé",         // Guillemet non fermé
    "amend2_session=" + "x".repeat(10000), // Taille excessive
    "amend2_session=valeur\0nul",         // Caractère nul
    "amend2_session=valeur; Path=/; HttpOnly", // Attributs supplémentaires
    "amend2_session=corps.invalide",      // Signature tronquée
    "amend2_session=corps..",             // Signature vide
    "amend2_session=corps.signature",     // Signature calculée avec un autre secret
    "amend2_session=corps.signature; Domain=.amend.ink", // Domaine forgé
    "amend2_session=corps.signature; Secure" // Secure en HTTP (doit être ignoré)
  ],
  "raisons": [
    "Cookie supplémentaire (doit être ignoré)",
    "Guillemet non fermé (doit être refusé)",
    "Taille excessive (doit être refusé)",
    "Caractère nul (doit être refusé)",
    "Attributs supplémentaires (doivent être ignorés)",
    "Signature tronquée (doit être refusé)",
    "Signature vide (doit être refusé)",
    "Signature calculée avec un autre secret (doit être refusé)",
    "Domaine forgé (doit être ignoré)",
    "Attribut Secure en HTTP (doit être ignoré)"
  ]
}
```

## Classement par Claude

**Constat** : ces scénarios passent à côté du sujet de l'étape (les droits) : presque aucun ne porte sur les rôles, la plupart reprennent des tests existants, et plusieurs attendent un comportement contraire aux décisions prises. La consigne de Mistral est resserrée pour les étapes suivantes (`tools/revue-ia.mjs` : se concentrer sur ce que le plan introduit). Les scénarios des droits sont donc proposés par Claude.

**Retenus** :

- T1.2 (marques de sens d'écriture dans un nom) : déjà refusées par `nomPersonne` ; les quatre cas sont ajoutés aux données piégées, sans code nouveau.
- T1.3, partie « paramètre en trop » : ajouté au test des traductions (doit être ignoré sans erreur).

**Déjà couverts** : T1.1, T1.4, T1.5, T2.1, T2.2, T2.3, T2.6, T3.1 à T3.5, T4.3, T5.3, T5.5, T6.1, T6.3, T6.4.

**Écartés** :

- T5.2 : attend deux documents distincts pour « été » en NFC et en NFD ; la règle décidée refuse ces identifiants (`document-caracteres`).
- T5.4 : changement de langue sans rechargement ; la langue se choisit au chargement, par conception.
- T5.1 : deux onglets d'une même personne qui partagent leur identité : voulu.
- T2.4 (cent niveaux d'imbrication), T2.5 (trames WebSocket malformées, gérées par le navigateur et par y/hub), T4.1, T4.2, T4.4, T4.5, T6.2, T6.5 : sans entrée d'utilisateur réaliste ou hors de notre code.

**Scénarios des droits, proposés par Claude** (de la couche la plus basse à la plus haute) :

| Couche | Scénario |
|---|---|
| T1 | chaque rôle et ses capacités ; rôle inconnu → lecteur ; aucun rôle → rien ; la traduction des capacités en accès (`ecriture`, `lecture`, rien) ; un correcteur n'écrit pas tant que la suggestion n'existe pas |
| T3 | route des droits : rôle connu, inconnu, absent, document inconnu ; route d'attribution des rôles fermée hors développement ; la personne qui ouvre un document la première en devient éditrice, les suivantes non |
| T2 | y/hub, avec les rôles décidés par le serveur : écriture refusée à un lecteur et à un correcteur, acceptée à un éditeur ; retrait du rôle d'une personne connectée (les droits sont redemandés à la connexion suivante) |
| T5 | un éditeur et un lecteur sur le même document : la frappe du lecteur n'arrive pas chez l'éditeur, et le lecteur voit un état « lecture seule » traduit |

## Arbitrage de Sylvain

(À compléter.)
