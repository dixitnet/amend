# Audit partiel avant fusion (2026-11-11)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 139313 signes envoyés, 4009 reçus (et 10978 de réflexion) ; réflexion `low` ; 21 s ; arrêt : stop
- Diff audité : `v2/` de `2f1581e` à `f28896f` (17 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitré par Sylvain le 11/11/2026 (accord avec les réponses de Claude).

## Avis de l'auditeur

## Synthèse
Le diff corrige les constats A1 à A4 de l'audit du 10/11/2026 (NFD, historique borné, ancre sans fil, réponse illisible) et ajoute le choix du modèle de Margo au back-office, avec tests. L'ensemble respecte les couches et les traductions. Points à vérifier : un appel possible de `messageErreur` sans le paramètre `max`, une limite de corps absente sur `PUT /api/admin/ia`, la définition de `premier` avant son usage, et l'absence de test unitaire du nouveau `situerCitation` en NFD.

## Constats
1. **[important]** Grille 6/9, `v2/i18n/index.js:69` — `messageErreur` transmet désormais `valeurs` au message ICU ; `erreurs.demande-invalide` exige `{max, number}` (`v2/i18n/fr.json:77`). Tout autre appel de `messageErreur` qui peut recevoir le code `demande-invalide` sans `max` produira un message mal formé (paramètre manquant en format nombre). Vérifier tous les appelants (par exemple les gestions d'erreur génériques d'écrans) ; proposer soit une valeur par défaut (`max` absent → repli), soit de ne paramétrer que l'appel de Margo.
2. **[important]** Grille 5, `v2/application/serveur/index.js:257` — `lireCorps(req)` est appelé sans limite de taille, alors que la route voisine de Margo passe `200_000` (`v2/application/serveur/margo.js:131`). Si `lireCorps` n'a pas de défaut, un corps arbitrairement gros peut être lu. Passer une limite explicite.
3. **[question]** Grille 6, `v2/application/serveur/margo.js:179` — `signesDemande: signes(premier)` : le diff ne montre pas où `premier` est défini ; s'il est calculé après le bloc `compte` (const, zone morte), c'est une erreur à l'exécution. Confirmer l'ordre dans le fichier final.
4. **[important]** Grille 7, `v2/domaine/margo.js:88-98` — la réécriture de `situerCitation` (recherche en NFC, NFD et forme brute, dédoublonnage par position et longueur) est un changement de logique délicat (faux « ambigu » si deux formes tombent à la même position, positions valides seulement parce que `memesSignes` est un pour un), mais aucun test unitaire du domaine ne l'accompagne dans le diff. Ajouter des tests : texte NFD, citation NFC, citation NFD dans texte NFC, cas ambigu.
5. **[mineur]** Grille 4, `v2/application/serveur/index.js:438` — `comptes.reglage?.(REGLAGE_MODELE)` : l'optionnel `?.` est une précaution « au cas où » alors que `reglage` existe désormais toujours dans l'adaptateur (`v2/adaptateurs/postgres/comptes.js:562`) ; le `.catch(() => null)` masque de plus une panne de base en repli silencieux sur le modèle par défaut. Simplifier et laisser l'erreur se voir (ou la journaliser).
6. **[mineur]** Grille 4, `v2/application/client/App.jsx:417-423` — `NOMS_MODELES` duplique côté client les identifiants connus du serveur (`MODELES`) ; un modèle ajouté au serveur s'affichera par son identifiant brut (repli prévu, mais la liste devra être maintenue deux fois). Acceptable, mais noter la redondance ; à terme, le serveur pourrait renvoyer le libellé.
7. **[mineur]** Grille 22/9, `v2/application/client/App.jsx:449` et `v2/design/composants/PageAdministration.jsx:432` (test) — un message d'erreur est rendu avec `role="status"` (le même canal que le succès). Pour l'accessibilité, une erreur devrait être annoncée plus fort (rôle « alert ») ; à proposer à Sylvain comme réglage de présentation.
8. **[question]** Grille 9, `v2/i18n/exceptions.json:10-13` — les clés `admin.modeles.*` sont ajoutées au fichier d'exceptions, dont la raison n'est pas décrite dans les pièces fournies. Si c'est une exemption de la pseudo-langue ou du contrôle de longueur, le justifier ; sinon les retirer.
9. **[mineur]** Grille 6, `v2/domaine/margo.js:113-114` — dans `situerRemplacement`, le contexte passé à `typographier` (`t.slice(0, ou.debut)`) n'est plus normalisé en NFC alors que `apres` l'est : un remplacement dans un texte NFD produit un bloc à normalisations mélangées. Les exports appliquant `nfc`, c'est probablement sans conséquence, mais le mélange mérite une note ou un test.

## Points de grille sans remarque
1, 3, 8, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : **citation invalide** (v2/design/composants/PageAdministration.jsx:432)
- 8 : citations valides
- 9 : citations valides

## Réponse de Claude

Audit complémentaire de la clôture : le code ajouté après le premier audit partiel (correctifs, rubrique IA du back-office).

- **1, faux en pratique.** Le code `demande-invalide` n'est rendu que par la route de Margo, et le seul écran qui l'affiche passe `max` (`App.jsx`). La règle de l'i18n est d'ailleurs qu'un paramètre manquant se voie (test « un paramètre manquant lève une erreur explicite »).
- **2, faux.** `lireCorps` a une limite par défaut de 10 000 signes (`application/serveur/index.js`, `lireCorps(req, max = 10_000)`) ; la route de Margo la relève pour l'historique.
- **3, faux.** `premier` est défini avant `compte` (ligne 156 contre 179) ; les tests de service passent par ce chemin.
- **4, faux en partie, complété.** Le test de l'A1 existait déjà (`tests/unitaires/margo.test.js`, « un texte en NFD se retrouve… ») ; ajouté : citation NFD dans un texte NFC, passage présent sous deux formes (ambigu), apostrophe.
- **5, juste en partie, corrigé.** Le `?.` reste (des tests passent un dépôt de comptes simulé sans réglages) ; la panne de base n'est plus silencieuse : une ligne au journal.
- **6, juste, noté.** Les noms des modèles sont des textes d'interface (catalogue) ; le serveur rend des identifiants, comme la règle 25 le demande. Un modèle ajouté demandera sa ligne de catalogue.
- **7, question pour Sylvain** (design) : le message du back-office est en `role="status"`, succès comme erreur.
- **8, faux.** `exceptions.json` liste les clés identiques en français et en anglais (noms propres des modèles) : c'est son rôle.
- **9, juste, sans conséquence.** Le nouveau texte est en NFC ; tout export passe par `nfc()`.

## Arbitrage de Sylvain

Accord avec les réponses de Claude (11/11/2026, revue de clôture de l'étape 8, Q1).
