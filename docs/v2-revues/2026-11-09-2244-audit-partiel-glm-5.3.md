# Audit partiel avant fusion (2026-11-09)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 132974 signes envoyés, 3343 reçus (et 14837 de réflexion) ; réflexion `low` ; 22 s ; arrêt : stop
- Diff audité : `v2/` de `c497961` à `28bc01a` (24 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le lot étape 7 (exports) est globalement bien placé : gabarit Typst au domaine, parcours des blocs dans l'adaptateur, modèle de mise en page dans les réglages du design, licences des paquets `xl-` anticipées, NFC et échappement testés. Les constats portent surtout sur des cas limites (langue du document ignorée à l'export, états d'erreur silencieux) et sur deux fragilités de tests. Rien de bloquant sur les frontières de couches.

## Constats
1. **[question]** grille 9 (langues) — `v2/application/client/App.jsx:803`. L'export PDF déclare toujours `LANGUE_DOCUMENT_PAR_DEFAUT` comme langue du document, alors que la règle 28 en fait une propriété du document choisie par ses éditeurs (elle règle le `lang` de Typst). Si la langue du document n'est pas encore enregistrée à cette étape, le noter ; sinon, passer la langue réelle du document à `exporter`.
2. **[mineur]** grille 4 (simplicité) — `v2/adaptateurs/blocknote/export.js:32`, `v2/adaptateurs/blocknote/export.js:41`. L'option `recupererFichier` n'est utilisée par aucun appelant (l'App n'en passe pas, les tests non plus) : c'est une option « au cas où ». Proposer de la retirer et de garder seulement le repli par `fetch`.
3. **[mineur]** grille 7 (tests) — `v2/contrats/statiques/typst.test.js:36`. `blocs()` insère à nouveau les blocs dans un éditeur partagé entre les tests : le deuxième test (`versTypst` puis PDF) exporte le contenu en double. Les assertions `match` passent quand même, mais le contrat ne vérifie pas ce qu'il annonce (un livre, pas deux concaténés). Créer l'éditeur (ou le document) dans chaque test.
4. **[mineur]** grille 6 (correction) — `v2/adaptateurs/blocknote/export.js:107-110`. Si `resultat.error` est vrai avec `compileErrors` vide, `every(…)` renvoie `true`, on recompile inutilement puis on lève une erreur dont le message est une chaîne vide. Ajouter une garde sur `compileErrors.length > 0` avant le repli PDF/UA.
5. **[mineur]** grille 6 (correction) — `v2/application/client/exports.js:18-19` et `v2/adaptateurs/blocknote/index.jsx:194-195`. Si `controle.current?.exporter` est absent (ou si `editeur`/`contexte` ne sont pas prêts), l'export se termine en silence : aucun téléchargement, aucun message, alors que l'App affiche « Réessayez » pour les autres échecs. Renvoyer une erreur (ou désactiver les boutons) plutôt que `return`.
6. **[mineur]** grille 6 (correction) — `v2/adaptateurs/blocknote/export.js:70-76`. Un premier paragraphe de chapitre vide est sauté, et le paragraphe suivant (qui devient le premier) garde son alinéa : la décision « pas d'alinéa au premier paragraphe d'un chapitre » n'est respectée que si ce paragraphe n'est pas vide. Suivre l'état « après un titre de niveau 1 » plutôt que le bloc précédent.
7. **[question]** grille 1/17 (design) — `v2/application/client/App.jsx:804`. `window.alert` place une présentation (fenêtre, texte affiché) hors de `v2/design/`. C'est peut-être un choix transitoire cohérent avec l'existant, mais à confirmer avec Sylvain et à remplacer par un composant de notification Mantine au moment du travail sur l'interface.

## Points de grille sans remarque
1 (couches), 2 (API publique), 3 (redondance amont), 5 (sécurité et droits), 8 (exports propres : NFC couvert par `nfc` et testé), 10 (licences : `GPL-3.0 OR PROPRIETARY` ajouté au contrat, conforme à l'ADR 0006).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides

## Réponse de Claude

1. *Question pour Sylvain*, notée : la langue du document n'est pas encore enregistrée avec lui (`domaine/document.js`, `LANGUE_DOCUMENT_PAR_DEFAUT` : « tant qu'elle n'est pas enregistrée avec lui (étape 6) »). L'export prend la même langue que la typographie à la frappe ; il prendra la langue réelle dès qu'elle existera.
2. *Juste*, corrigé : option `recupererFichier` retirée ; les images passent par `fetch`.
3. *Juste*, corrigé : un éditeur neuf par test, et le contrat vérifie que le livre n'est exporté qu'une fois.
4. *Faux* : `TypstCompiler.compilePdf` de BlockNote garantit qu'une erreur porte au moins un diagnostic ; s'il n'y a ni PDF ni erreur, il lève lui-même « TypstCompiler invariant violated » (`@blocknote/xl-typst-compiler`, `src/typstCompiler.ts`). Le cas décrit ne peut pas se produire.
5. *Juste*, corrigé : un éditeur pas prêt lève une erreur (`export-impossible`), affichée comme les autres échecs.
6. *Juste*, corrigé : un paragraphe vide est sauté sans compter ; le premier paragraphe écrit après un titre de chapitre reste sans alinéa (cas ajouté au contrat).
7. *Question pour Sylvain* : `window.alert` suit la décision du 09/11/2026 (« boîtes de dialogue natives gardées jusqu'aux écrans de 6b ») ; à remplacer par une notification Mantine avec ces écrans.

## Arbitrage de Sylvain

(À compléter.)
