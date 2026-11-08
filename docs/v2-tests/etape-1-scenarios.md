# Scénarios adverses de l’étape 1 (2026-11-08)

- Relecteur : Mistral, modèle `mistral-large-latest` ; consommation : 115810 signes envoyés, 12181 reçus
- Pièces : `docs/v2-regles-developpement.md`, `docs/v2-renoncements.md`, `docs/v2-veille.md`, `v2/adr/0001-architecture-docs-allege.md`, `v2/adr/0002-couches.md`, `v2/adr/0003-blocknote.md`, `v2/adr/0004-yhub.md`, `v2/adr/0005-connexion.md`, `v2/adr/0006-licence.md`, `v2/adr/0007-relecteur-ia.md`, `v2/adr/0008-design.md`, `v2/adr/0009-traductions.md`, `docs/v2-etape-1-plan.md`, `Arborescence de v2/ (fichiers suivis)`, `v2/package.json`, `docs/v2-procedure-tests.md`, `docs/v2-mise-en-ligne.md`, `v2/.prettierrc.json`, `v2/adaptateurs/blocknote/dictionnaire.js`, `v2/adaptateurs/blocknote/index.jsx`, `v2/adaptateurs/blocknote/serveur.js`, `v2/adaptateurs/yhub/index.js`, `v2/adaptateurs/yjs/index.js`, `v2/application/client/App.jsx`, `v2/application/client/main.jsx`, `v2/application/collab/index.js`, `v2/application/serveur/index.js`, `v2/application/serveur/session.js`, `v2/design/auteurs.js`, `v2/design/composants/EcranSimple.jsx`, `v2/design/composants/PageEdition.jsx`, `v2/design/index.js`, `v2/design/jetons.css`, `v2/design/styles.css`, `v2/design/theme.js`, `v2/eslint.config.js`, `v2/exploitation/dev/demarrer.mjs`, `v2/exploitation/dev/mesurer.mjs`, `v2/exploitation/dev/pile.mjs`, `v2/exploitation/prod/Caddyfile.v2`, `v2/exploitation/prod/amend-v2-collab.service`, `v2/exploitation/prod/amend-v2.service`, `v2/exploitation/prod/deployer.sh`, `v2/exploitation/prod/installer.sh`, `v2/exploitation/prod/mesurer.sh`, `v2/exploitation/prod/postgresql-amend-v2.conf`, `v2/exploitation/prod/valkey-amend-v2.conf`, `v2/i18n/en.json`, `v2/i18n/exceptions.json`, `v2/i18n/fr.json`, `v2/i18n/index.js`, `v2/package.json`, `v2/vite.config.js`, `Tests existants (fichier, puis titres)`
- Commit relu : `be54b4b`
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Proposition de Mistral

## Scénarios par couche

### T1 Domaine et traductions
**T1.1 [moyen]** **Clés de traduction manquantes dans une langue cible**
Fichier : `v2/i18n/index.js`, fonction `creerTraducteur`
Entrées :
- Langue cible : `"en"`
- Clé : `"document.participants"` (existe en français mais supprimée volontairement de `en.json`)
- Valeurs : `{ n: 2 }`
Résultat attendu : Le traducteur utilise la clé française en repli, sans lever d'erreur ni afficher la clé brute.

**T1.2 [grave]** **Unicode NFD dans les identifiants de document**
Fichier : `v2/domaine/LISEZMOI.md` (à créer), fonction hypothétique `normaliserIdDocument` (à implémenter)
Entrées :
- Identifiant : `"été"` (NFD : `U+0065 U+0301 U+0074 U+0301`)
Résultat attendu : Normalisation en NFC (`"été"`, `U+00E9 U+00E9`) pour éviter les doublons de documents.

**T1.3 [faible]** **Traduction avec paramètres manquants**
Fichier : `v2/i18n/index.js`, fonction `creerTraducteur`
Entrées :
- Langue : `"fr"`
- Clé : `"document.titre"`
- Valeurs : `{}` (paramètre `id` manquant)
Résultat attendu : Le formatage échoue avec une erreur explicite (ex. : `"Missing parameter: id"`).

**T1.4 [moyen]** **Texte très long dans les traductions**
Fichier : `v2/i18n/fr.json`, clé `"connexion.explication"`
Entrées :
- Texte : Une chaîne de 10 000 caractères (simulant une traduction malveillante ou une erreur de saisie).
Résultat attendu : Le texte est affiché sans tronquer, mais le composant de présentation (`EcranSimple.jsx`) gère le débordement avec `overflow-wrap: break-word`.

**T1.5 [grave]** **Injection de code via les paramètres de traduction**
Fichier : `v2/i18n/index.js`, fonction `creerTraducteur`
Entrées :
- Langue : `"fr"`
- Clé : `"document.titre"`
- Valeurs : `{ id: "<script>alert('xss')</script>" }`
Résultat attendu : Le texte est échappé automatiquement par `IntlMessageFormat` (pas d'exécution du script).

---

### T2 Adaptateurs isolés
**T2.1 [grave]** **Document Yjs avec des caractères de contrôle**
Fichier : `v2/adaptateurs/blocknote/serveur.js`, fonction `lireBlocs`
Entrées :
- État Yjs : Un document contenant un bloc avec un caractère `U+0000` (null) ou `U+001F` (unit separator).
Résultat attendu : Le caractère est soit ignoré, soit remplacé par un espace, sans planter la désérialisation.

**T2.2 [moyen]** **Connexion WebSocket avec un identifiant de document invalide**
Fichier : `v2/adaptateurs/yjs/index.js`, fonction `ouvrirDocument`
Entrées :
- `docId` : `"doc/<script>"` (caractères réservés) ou une chaîne vide.
Résultat attendu : Le fournisseur WebSocket échoue avec une erreur claire (ex. : `"Invalid document ID"`), sans tentative de connexion.

**T2.3 [grave]** **Session y/hub avec un cookie falsifié**
Fichier : `v2/adaptateurs/yhub/index.js`, fonction `demarrerCollaboration` (via `authenticate`)
Entrées :
- Cookie : `"amend2_session=malformed.jwt.signature"`
Résultat attendu : y/hub refuse la connexion avec le code `401` (vérifié par le contrat existant).

**T2.4 [moyen]** **Bloc BlockNote avec une structure JSON invalide**
Fichier : `v2/adaptateurs/blocknote/serveur.js`, fonction `lireBlocs`
Entrées :
- État Yjs : Un document où le type racine `"doc"` est remplacé par un tableau ou un nombre.
Résultat attendu : La fonction lève une erreur spécifique (ex. : `"Invalid Yjs document structure"`), sans planter le serveur.

**T2.5 [faible]** **Traduction BlockNote avec une langue inconnue**
Fichier : `v2/adaptateurs/blocknote/dictionnaire.js`, fonction `dictionnaire`
Entrées :
- Langue : `"xx"` (code ISO inexistant).
Résultat attendu : Retourne le dictionnaire français par défaut, sans erreur.

---

### T3 Serveur applicatif
**T3.1 [grave]** **Requête POST avec un corps JSON malformé**
Fichier : `v2/application/serveur/index.js`, fonction `lireCorps`
Entrées :
- Corps : `"{"nom": "Alice"` (guillemet manquant).
Résultat attendu : Le serveur répond avec le code `400` et `{ code: "requete-invalide" }`.

**T3.2 [moyen]** **Cookie de session expiré ou trop long**
Fichier : `v2/application/serveur/session.js`, fonction `lireJeton`
Entrées :
- Cookie : `"amend2_session=" + "a".repeat(10_000)` (10 Ko).
Résultat attendu : Le serveur répond avec `401` (session invalide), sans planter.

**T3.3 [grave]** **Requête interne avec un jeton manquant**
Fichier : `v2/application/serveur/index.js`, route `GET /api/interne/droits`
Entrées :
- En-tête : `X-AMEND-INTERNE` absent.
Résultat attendu : Réponse `403` avec `{ code: "interdit" }`.

**T3.4 [moyen]** **Document ID avec des caractères réservés (URL)**
Fichier : `v2/application/serveur/index.js`, route `GET /api/interne/droits`
Entrées :
- Paramètre : `document="doc%2F1"` (équivalent à `"doc/1"`).
Résultat attendu : Le serveur répond avec `400` (paramètres invalides), sans interpréter le `/`.

**T3.5 [faible]** **Requête GET avec un chemin traversant**
Fichier : `v2/application/serveur/index.js`, fonction `servirFichier`
Entrées :
- Chemin : `"/../../../etc/passwd"`.
Résultat attendu : Réponse `404` (fichier introuvable), sans fuite de données.

---

### T4 Design
**T4.1 [moyen]** **Thème sombre avec des jetons manquants**
Fichier : `v2/design/jetons.css`, média `@media (prefers-color-scheme: dark)`
Entrées :
- Suppression volontaire de `--couleur-accent` dans le thème sombre.
Résultat attendu : Le navigateur utilise la valeur du thème clair en repli, sans casser l'affichage.

**T4.2 [faible]** **Texte en pseudo-langue (traduction manquante)**
Fichier : `v2/design/composants/EcranSimple.jsx`
Entrées :
- Langue : `"xx"` (pseudo-langue).
- Clé : `"connexion.titre"` (absente de `xx.json`).
Résultat attendu : Le composant affiche le texte français en repli, avec un style visible (ex. : fond rouge) pour signaler l'absence.

**T4.3 [moyen]** **Éditeur BlockNote avec une police introuvable**
Fichier : `v2/design/theme.js`, jeton `--police-texte`
Entrées :
- Police : `"NonExistentFont"` (remplace `Source Serif 4`).
Résultat attendu : BlockNote utilise sa police par défaut (Inter), sans planter.

**T4.4 [grave]** **Injection CSS via les jetons de couleur**
Fichier : `v2/design/jetons.css`, variable `--couleur-accent`
Entrées :
- Valeur : `"red; background: url('http://evil.com/exfil')"`.
Résultat attendu : Le CSS est invalidé par le navigateur (la valeur n'est pas appliquée), sans exfiltration.

**T4.5 [faible]** **Composant de présentation avec un rôle ARIA invalide**
Fichier : `v2/design/composants/PageEdition.jsx`
Entrées :
- Rôle : `role="invalid-role"`.
Résultat attendu : Le navigateur ignore le rôle, mais le composant reste utilisable (vérifié par un outil comme `axe-core`).

---

### T5 Pile complète (navigateur automatisé)
**T5.1 [grave]** **Collision de noms dans la connexion de développement**
Fichier : `v2/application/client/App.jsx`, fonction `entrer`
Entrées :
- Nom : `"Alice"` (utilisé simultanément par deux navigateurs).
Résultat attendu : Les deux sessions coexistent (identifiants uniques générés côté serveur), sans écrasement.

**T5.2 [moyen]** **Document avec un identifiant Unicode combinant**
Fichier : `v2/application/client/App.jsx`, `docId` extrait de `location.hash`
Entrées :
- Hash : `"#été"` (NFD, comme T1.2).
Résultat attendu : Le document est ouvert avec l'ID normalisé en NFC (`"été"`), sans duplication.

**T5.3 [faible]** **Navigation avec un hash vide ou absent**
Fichier : `v2/application/client/App.jsx`, `docId` extrait de `location.hash`
Entrées :
- Hash : `""` ou absent.
Résultat attendu : Le document `"essai"` est ouvert par défaut, sans erreur.

**T5.4 [grave]** **WebSocket fermée brutalement par le serveur**
Fichier : `v2/adaptateurs/yjs/index.js`, événement `status`
Entrées :
- Fermeture du port 4400 pendant l'édition.
Résultat attendu : L'état passe à `"deconnecte"`, et l'éditeur affiche un message clair (vérifié par Playwright).

**T5.5 [moyen]** **Changement de langue en cours de session**
Fichier : `v2/application/client/App.jsx`, `choisirLangue`
Entrées :
- Langues du navigateur : `["en-US", "fr"]` puis modification dynamique via `navigator.languages = ["de"]`.
Résultat attendu : L'interface ne change pas de langue (la langue est choisie au chargement uniquement), sans erreur.

---

### T6 En ligne
**T6.1 [grave]** **Port 4400 accessible depuis Internet**
Fichier : `v2/exploitation/prod/installer.sh`, vérification du pare-feu
Entrées :
- Vérification depuis un navigateur externe : `ws://v2.amend.ink:4400`.
Résultat attendu : La connexion est refusée (vérifié par un test manuel depuis le Mac).

**T6.2 [moyen]** **Cookie de session non sécurisé en production**
Fichier : `v2/application/serveur/session.js`, `creerJeton`
Entrées :
- Variable d'environnement : `V2_COOKIE_SECURE=0` (forcée à `0` en production).
Résultat attendu : Le cookie est marqué `Secure` malgré tout (vérifié par les en-têtes HTTP).

**T6.3 [faible]** **Mot de passe Caddy trop faible**
Fichier : `v2/exploitation/prod/Caddyfile.v2`
Entrées :
- Mot de passe : `"1234"`.
Résultat attendu : Caddy refuse le mot de passe (vérifié par `caddy hash-password`).

**T6.4 [grave]** **Origines non autorisées dans y/hub**
Fichier : `v2/adaptateurs/yhub/index.js`, option `cors`
Entrées :
- Origine : `"http://evil.com"` (ajoutée à `V2_ORIGINES`).
Résultat attendu : y/hub refuse les connexions WebSocket depuis cette origine (vérifié par un test manuel).

**T6.5 [moyen]** **Jeton interne divulgué dans les logs**
Fichier : `v2/application/collab/index.js`, variable `CONF.jetonInterne`
Entrées :
- Jeton : `"secret123"` (affiché dans les logs de y/hub).
Résultat attendu : Le jeton n'apparaît jamais dans les logs (vérifié par `journalctl -u amend-v2-collab`).

---

## Données piégées
```json
{
  "noms": [
    "Alice",                     // Nominal
    "été",                     // NFD (U+0065 U+0301 U+0074 U+0301)
    "👩🏽‍💻",                  // Emoji combiné (U+1F469 U+1F3FD U+200D U+1F4BB)
    "A".repeat(1000),           // Très long
    "Alice<script>",            // Injection XSS
    "Alice\u0000Null"           // Caractère de contrôle
  ],
  "raisons": [
    "Cas nominal",
    "Normalisation Unicode (NFD → NFC)",
    "Emoji combiné (test de stabilité)",
    "Longueur excessive (débordement)",
    "Injection XSS (échappement)",
    "Caractère de contrôle (U+0000)"
  ],
  "identifiantsDeDocument": [
    "doc1",                     // Nominal
    "été",                     // NFD
    "doc/1",                    // Caractère réservé (URL)
    "doc%2F1",                  // Encodage URL
    "doc\u001Fcontrol",         // Caractère de contrôle
    "doc<script>",              // Injection
    "",                         // Vide
    "a".repeat(256)             // Très long
  ],
  "raisons": [
    "Cas nominal",
    "Normalisation Unicode (NFD → NFC)",
    "Caractère réservé (URL)",
    "Encodage URL (décodage)",
    "Caractère de contrôle (U+001F)",
    "Injection (échappement)",
    "Vide (comportement par défaut)",
    "Longueur excessive (limite)"
  ],
  "textes": [
    "Bonjour",                  // Nominal
    "Bonjour\u0000Monde",       // Caractère null
    "Bonjour\u001FMonde",       // Unit separator
    "A".repeat(10000),          // Très long
    "<script>alert('xss')</script>",  // Injection
    "Bonjour\n\tMonde",         // Sauts de ligne et tabulations
    "👋🌍",                     // Emojis
    "été"                      // NFD
  ],
  "raisons": [
    "Cas nominal",
    "Caractère null (U+0000)",
    "Caractère de contrôle (U+001F)",
    "Longueur excessive (débordement)",
    "Injection XSS (échappement)",
    "Sauts de ligne et tabulations (normalisation)",
    "Emojis (stabilité)",
    "Normalisation Unicode (NFD → NFC)"
  ],
  "cookies": [
    "amend2_session=valid.jwt.signature",  // Nominal
    "amend2_session=",                     // Vide
    "amend2_session=malformed",            // Invalide
    "amend2_session=" + "a".repeat(10000), // Très long
    "amend2_session=valid.jwt.signature; Path=/; HttpOnly",  // Avec attributs
    "amend2_session=expired.jwt.signature"  // Expiré
  ],
  "raisons": [
    "Cas nominal",
    "Vide (session absente)",
    "Format invalide (rejet)",
    "Longueur excessive (rejet)",
    "Avec attributs (parsing)",
    "Expiré (rejet)"
  ]
}
```

## Classement par Claude

Le jeu de données piégées de Mistral n'était pas du JSON valide (commentaires, `.repeat()`, clés répétées) : réécrit et complété dans `v2/tests/donnees/piegees.json` (noms, identifiants de document, textes, cookies), rejoué par les tests T1 à T3.

### Retenus, par couche

| Couche | Scénarios | Test |
|---|---|---|
| **T0** statique | T4.1 (jetons du thème sombre) ; **C11** chaque clé de traduction utilisée existe, et chaque clé existante est utilisée ; **C12** chaque variable CSS utilisée est définie dans `jetons.css`, et tout jeton de couleur du jeu clair existe dans le jeu sombre | analyse des fichiers |
| **T1** domaine, traductions | T1.1 (repli d'une clé absente sur le français) ; T1.3 (paramètre manquant : erreur explicite) ; T1.2, T2.2, T3.4, T5.2, T5.3 regroupés en **un identifiant de document valide** (fonction de domaine : NFC, vide, caractères interdits, longueur) | `node:test` |
| **T2** adaptateurs | T2.1 et T2.4 (`lireBlocs` : caractères de contrôle, structure inattendue, sans planter) ; T6.4 (y/hub refuse une origine étrangère) ; T6.5 (le jeton interne n'apparaît jamais dans les journaux) ; T2.3 redescendu ici (session falsifiée, client Node sans navigateur) | `node:test`, Redis et PostgreSQL locaux pour y/hub |
| **T3** serveur | T3.1 (JSON malformé : 400) ; T3.2 (cookie de 10 Ko : 401) ; T3.3 (route interne sans jeton : 403) ; T3.5 (chemin traversant : 404) ; **C2** jeton dont le contenu a été modifié ; **C3** jeton signé avec un autre secret ; **C4** route de développement fermée hors développement ; **C5** nom en NFD enregistré en NFC ; **C10** route inconnue et méthode refusée | `node:test`, serveur en processus |
| **T4** design | T1.4 et T4.2 regroupés : **pseudo-langue** (textes allongés, accentués) sur tous les composants ; T1.5 (un paramètre `<script>` s'affiche comme du texte) ; captures claires et sombres, fr, en et pseudo-langue, **jugées par Mistral** à la clôture | rendu React sans navigateur ; captures Chromium |
| **T5** pile | T5.4 (y/hub coupé : l'état passe à « Hors ligne », puis « Synchronisé » au retour) ; **C6** y/hub tué net pendant la frappe : rien n'est perdu après reconnexion ; **C8** accessibilité des écrans (axe-core) ; **C9** changement de document par l'adresse ; **C13** les mêmes parcours sous WebKit (Safari) et Firefox | Playwright ; WebKit et Firefox dans GitHub |
| **T6** en ligne | T6.1 (port 4400 fermé, testé depuis GitHub, qui n'a pas la limite de ports de la session) ; T6.2 (cookie `Secure` sur `v2.amend.ink`) ; parcours complet avec WebSocket, chaque nuit | GitHub Actions ; HTTP depuis la session |

### Écartés

- T2.5 et T2.3 dans leur forme d'origine : déjà couverts (dictionnaire par défaut ; contrat 4).
- T4.3 (police introuvable) : la pile de polices a ses replis, sans risque.
- T4.4 (injection CSS par les jetons) : les jetons sont nos fichiers, aucune donnée d'utilisateur n'y entre.
- T4.5 (rôle ARIA invalide) : remplacé par un contrôle d'accessibilité réel (C8).
- T5.1 (deux personnes du même nom) : voulu pour la connexion de développement (un nom, une identité) ; disparaît à l'étape 6 avec le lien magique.
- T5.5 (langue changée en cours de session) : la langue se choisit au chargement, par conception.
- T6.3 (mot de passe Caddy faible) : une règle de conduite, pas un test.

### Défauts probables, à confirmer par les tests

1. **Identifiant de document** : `#été` en NFD et en NFC ouvriraient deux documents différents ; aucun caractère n'est refusé ; un identifiant vide ou très long n'est pas borné.
2. **Paramètre manquant** dans une traduction : comportement à vérifier (erreur ou texte incomplet silencieux).

Méthode : chaque défaut est d'abord écrit en test qui échoue, puis corrigé.

## Arbitrage de Sylvain

(À compléter.)
