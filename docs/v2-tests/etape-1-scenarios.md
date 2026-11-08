# Scénarios adverses de l’étape 1 (2026-11-08)

- Relecteur : Mistral, modèle `mistral-large-latest` ; consommation : 113234 signes envoyés, 7189 reçus
- Pièces : `docs/v2-regles-developpement.md`, `docs/v2-renoncements.md`, `docs/v2-veille.md`, `v2/adr/0001-architecture-docs-allege.md`, `v2/adr/0002-couches.md`, `v2/adr/0003-blocknote.md`, `v2/adr/0004-yhub.md`, `v2/adr/0005-connexion.md`, `v2/adr/0006-licence.md`, `v2/adr/0007-relecteur-ia.md`, `v2/adr/0008-design.md`, `v2/adr/0009-traductions.md`, `docs/v2-etape-1-plan.md`, `Arborescence de v2/ (fichiers suivis)`, `v2/package.json`, `docs/v2-procedure-tests.md`, `docs/v2-mise-en-ligne.md`, `v2/.prettierrc.json`, `v2/adaptateurs/blocknote/dictionnaire.js`, `v2/adaptateurs/blocknote/index.jsx`, `v2/adaptateurs/blocknote/serveur.js`, `v2/adaptateurs/yhub/index.js`, `v2/adaptateurs/yjs/index.js`, `v2/application/client/App.jsx`, `v2/application/client/main.jsx`, `v2/application/collab/index.js`, `v2/application/serveur/index.js`, `v2/application/serveur/session.js`, `v2/design/auteurs.js`, `v2/design/composants/EcranSimple.jsx`, `v2/design/composants/PageEdition.jsx`, `v2/design/index.js`, `v2/design/jetons.css`, `v2/design/styles.css`, `v2/design/theme.js`, `v2/eslint.config.js`, `v2/exploitation/dev/demarrer.mjs`, `v2/exploitation/dev/mesurer.mjs`, `v2/exploitation/dev/pile.mjs`, `v2/exploitation/prod/Caddyfile.v2`, `v2/exploitation/prod/amend-v2-collab.service`, `v2/exploitation/prod/amend-v2.service`, `v2/exploitation/prod/deployer.sh`, `v2/exploitation/prod/installer.sh`, `v2/exploitation/prod/mesurer.sh`, `v2/exploitation/prod/postgresql-amend-v2.conf`, `v2/exploitation/prod/valkey-amend-v2.conf`, `v2/i18n/en.json`, `v2/i18n/exceptions.json`, `v2/i18n/fr.json`, `v2/i18n/index.js`, `v2/package.json`, `v2/vite.config.js`, `Tests existants (fichier, puis titres)`
- Commit relu : `dd3a8df`
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Proposition de Mistral

## Scénarios

**S1. [grave] Contournement de l'authentification y/hub par session forgée**
*Élément visé* : `v2/adaptateurs/yhub/index.js`, fonction `authenticate` du greffon d'authentification.
*Gestes* :
1. Préconditions : y/hub écoute sur toutes les interfaces (pas de réglage d'adresse dans y/hub 0.10.1), et le port 4400 n'est pas fermé par le pare-feu (cas non détecté par `installer.sh`).
2. Action : depuis un navigateur extérieur, forger un cookie de session valide (ex. : `amend2_session=dev-Zm9yZ2Vk.abc123`) et l'envoyer à y/hub via WebSocket (`wss://v2.amend.ink/collaboration/ws/v1/amend/essai`).
*Résultat attendu* : y/hub refuse la connexion (code 401) car la session n'est pas signée par le secret du serveur (`V2_SECRET`).
*Niveau* : **automatique** (tester la vérification de signature dans `lireJeton` de `v2/application/serveur/session.js`).

---

**S2. [grave] Accès au document d'un autre utilisateur via docId forgé**
*Élément visé* : `v2/application/client/App.jsx`, gestion du `docId` depuis `location.hash`.
*Gestes* :
1. Préconditions : un utilisateur légitime est connecté sur `https://v2.amend.ink/#doc1`.
2. Action : modifier manuellement l'URL en `https://v2.amend.ink/#doc2` (document appartenant à un autre utilisateur).
*Résultat attendu* : y/hub vérifie les droits via `droits(docId, idPersonne)` et refuse l'accès si l'utilisateur n'a pas les permissions.
*Niveau* : **automatique** (tester le contrat y/hub avec un `docId` non autorisé).

---

**S3. [moyen] Concurrence : deux utilisateurs modifient le même bloc simultanément**
*Élément visé* : `v2/adaptateurs/blocknote/index.jsx`, utilisation de `withCollaboration` de BlockNote.
*Gestes* :
1. Préconditions : deux navigateurs ouverts sur le même document.
2. Action : taper simultanément dans le même paragraphe (ex. : "Bonjour" vs "Hello").
*Résultat attendu* : Yjs résout le conflit (ordre des transactions), et le texte final est cohérent (ex. : "BonjourHello" ou "HelloBonjour").
*Niveau* : **à la main** (vérifier visuellement la convergence, puis automatiser avec Playwright si le comportement est stable).

---

**S4. [moyen] Réseau coupé pendant la frappe : perte de données ou corruption**
*Élément visé* : `v2/adaptateurs/yjs/index.js`, gestion des états de connexion (`connected`, `disconnected`).
*Gestes* :
1. Préconditions : un document ouvert, synchronisé.
2. Action : couper le réseau (mode avion), taper du texte, rétablir le réseau.
*Résultat attendu* : le texte saisi hors ligne est synchronisé après reconnexion, sans perte ni duplication.
*Niveau* : **à la main** (tester sur mobile avec un vrai réseau instable).

---

**S5. [moyen] Redémarrage de y/hub pendant la frappe : perte de données non persistées**
*Élément visé* : `v2/adaptateurs/yhub/index.js`, paramètre `delaiPersistance` (2s en dev, 5s en prod).
*Gestes* :
1. Préconditions : un document ouvert, modifications en cours.
2. Action : tuer le processus y/hub (`kill -9`), le relancer immédiatement.
*Résultat attendu* : les modifications non persistées (dans Redis) sont perdues, mais le document retrouve son état après le dernier `delaiPersistance`.
*Niveau* : **automatique** (tester avec `delaiPersistance=10000` et un script qui tue y/hub après 5s de frappe).

---

**S6. [moyen] Document vide : comportement de BlockNote et des exports**
*Élément visé* : `v2/adaptateurs/blocknote/serveur.js`, fonction `lireBlocs`.
*Gestes* :
1. Préconditions : créer un document vide (aucun bloc).
2. Action : exporter via Typst ou lire côté serveur.
*Résultat attendu* : pas d'erreur, le JSON de BlockNote est valide (liste vide), et l'export génère un PDF vide.
*Niveau* : **automatique** (tester avec un état Yjs vide).

---

**S7. [moyen] Document très long : mémoire et performance**
*Élément visé* : `v2/exploitation/dev/mesurer.mjs`, mesure de la mémoire avec un livre de 500 000 signes.
*Gestes* :
1. Préconditions : un document avec 1 000 paragraphes de 500 signes chacun.
2. Action : ouvrir le document, mesurer la mémoire (PSS) et le temps d'ouverture.
*Résultat attendu* : mémoire < 300 Mo (critère de l'étape 1), ouverture < 1s.
*Niveau* : **automatique** (étendre `mesurer.mjs` pour inclure le temps d'ouverture).

---

**S8. [faible] Caractères combinants et NFC : corruption à l'export**
*Élément visé* : `v2/domaine/` (à créer), fonction de normalisation NFC (règle 15).
*Gestes* :
1. Préconditions : saisir "é" (U+0065 + U+0301) dans l'éditeur.
2. Action : exporter en PDF via Typst.
*Résultat attendu* : le texte exporté est normalisé en "é" (U+00E9), sans corruption.
*Niveau* : **automatique** (tester avec des chaînes NFC/NFD et comparer les exports).

---

**S9. [faible] Emoji et noms de documents : encodage et affichage**
*Élément visé* : `v2/application/client/App.jsx`, gestion du `docId` dans `location.hash`.
*Gestes* :
1. Préconditions : créer un document avec un nom contenant des emoji (ex. : `#📖-mon-livre`).
2. Action : recharger la page, vérifier l'affichage du titre.
*Résultat attendu* : le titre s'affiche correctement, sans corruption ni erreur 404.
*Niveau* : **à la main** (tester avec des emoji et des caractères réservés dans les URLs).

---

**S10. [moyen] Redis indisponible : perte de données ou blocage**
*Élément visé* : `v2/adaptateurs/yhub/index.js`, dépendance à Redis pour la persistance temporaire.
*Gestes* :
1. Préconditions : un document ouvert, modifications en cours.
2. Action : arrêter Redis (`systemctl stop valkey-server`), continuer à taper.
*Résultat attendu* : y/hub échoue gracieusement (log d'erreur), mais le document reste utilisable en mémoire jusqu'à Redis rétabli.
*Niveau* : **automatique** (tester avec Redis arrêté et vérifier les logs de y/hub).

---

**S11. [faible] Traduction manquante : comportement des composants de présentation**
*Élément visé* : `v2/design/composants/EcranSimple.jsx`, gestion des textes traduits.
*Gestes* :
1. Préconditions : supprimer une clé de traduction dans `v2/i18n/en.json` (ex. : `connexion.titre`).
2. Action : ouvrir l'interface en anglais.
*Résultat attendu* : le composant affiche la clé manquante en français (repli), sans erreur.
*Niveau* : **automatique** (tester avec un catalogue incomplet).

---

**S12. [moyen] Configuration Caddy : WebSocket non protégée par le mot de passe**
*Élément visé* : `v2/exploitation/prod/Caddyfile.v2`, bloc `basic_auth`.
*Gestes* :
1. Préconditions : Caddy configuré avec `basic_auth` sur tout le site.
2. Action : tenter d'accéder à la WebSocket (`wss://v2.amend.ink/collaboration/ws/v1/amend/essai`) sans mot de passe.
*Résultat attendu* : Caddy refuse la connexion (401), même pour les WebSocket.
*Niveau* : **à la main** (vérifier depuis un navigateur extérieur avec les outils de développement).

---

## Ce qui me semble bien couvert
Les tests existants couvrent bien :
1. **Les frontières entre couches** (lint strict, contrats statiques comme `une-seule-copie-yjs.test.js`).
2. **L'authentification y/hub** (contrat 4 : refus des sessions invalides).
3. **La collaboration basique** (deux navigateurs convergent, persistance après redémarrage).

Les contrats de l'étape 1 (pile locale) sont un bon filet de sécurité pour les montées de version des fondations.

## Classement par Claude

**Automatique, à ajouter** (contrats sur la pile locale, `v2/contrats/pile/`) :

- **S3, frappe simultanée dans le même paragraphe** : deux navigateurs tapent en même temps au même endroit ; les deux voient le même texte, et chaque mot reste entier (pas de lettres mêlées). C'est un défaut connu de la v1 (écart 11) : à vérifier sur la nouvelle pile.
- **S4, réseau coupé pendant la frappe** : un navigateur passe hors ligne (Playwright `setOffline`), tape, revient ; l'autre reçoit tout, sans doublon. Aussi en recette à la main (ligne 4).
- **S5, y/hub tué net pendant la frappe** (`SIGKILL`, puis relance) : rien n'est perdu une fois le navigateur reconnecté (le navigateur garde ses modifications et les renvoie), et un troisième navigateur voit tout. Résultat attendu corrigé : Mistral prévoyait une perte des modifications non écrites, ce que le protocole de Yjs doit éviter tant que le navigateur reste ouvert.
- **S6, document vide** (partiel) : lecture côté serveur d'un document jamais écrit, sans erreur. L'export du document vide sera testé avec les exports (étape 7).
- **S9, nom de document inhabituel** (emoji, accents, espaces encodées dans l'adresse) : le document s'ouvre, se synchronise et se rouvre.
- **S10, Redis indisponible** : Redis arrêté pendant la frappe puis relancé ; rien n'est perdu. Test exploratoire : son premier résultat dira comment y/hub se comporte, puis il deviendra un contrat.

**À la main** : S4 (réseau coupé sur iPhone) et S3 (deux appareils) figurent dans la recette (`etape-1-recette.md`).

**Reportés** :

- **S2, document d'un autre** : à l'étape 1, toute personne connectée écrit partout, par décision (les droits arrivent à l'étape 3). Versé aux scénarios de l'étape 3.
- **S8, NFC et caractères combinants** : la normalisation arrive avec le domaine (étape 2) et les exports (étape 7).

**Écartés, déjà couverts** :

- **S1, session forgée** : contrat 4 (`v2/contrats/pile/pile.test.js`), qui envoie un jeton à la signature fausse et attend 401.
- **S7, document très long** : `npm run mesurer` (livre de 500 000 signes, ouverture en 0,3 s, mémoire mesurée).
- **S11, traduction manquante** : `v2/tests/unitaires/i18n.test.js` (complétude des catalogues, repli sur le français).
- **S12, WebSocket sans mot de passe** : vérifié en ligne le 08/11/2026 (401 sans mot de passe sur la WebSocket).

## Arbitrage de Sylvain

(À compléter.)
