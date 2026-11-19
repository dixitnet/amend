# Audit partiel avant fusion (2026-11-19)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 432016 signes envoyés, 3120 reçus (et 12115 de réflexion) ; réflexion `low` ; 30 s ; arrêt : stop
- Diff audité : `v2/` de `278adac` à `1ceaaf6` (73 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Diff de reprise d'audit : beaucoup de correctifs défensifs bien testés (NFC, prototypes, bornes, secrets d'exploitation), et la mise en traduction des pages publiques du site, propre dans l'ensemble. Je relève un correctif incomplet (noms réservés de Windows), un `throw` serveur sans réponse visible, une phrase assemblée dans l'aide du site, et deux points à vérifier (appelants non visibles dans le diff).

## Constats
1. **[important]** Correction — `v2/domaine/document.js:59` : le correctif des noms réservés teste `court` seul (`/^(con|prn|…)$/i`), mais Windows réserve ces noms **quelle que soit l'extension** : le fichier produit `CON.pdf` reste un périphérique sous Windows, le correctif ne protège donc pas ce qu'il annonce. De même, un titre finissant par un point ou une espace (`"Nom."` → `Nom..pdf`) pose problème sous Windows. Proposer : tester le nom **sans extension** contre les réservés (et les variantes `CON.txt`-style, c'est-à-dire le préfixe avant le premier point), et retirer points/espaces en fin de nom ; compléter le test `miseEnPage.test.js:362`.
2. **[question]** Correction — `v2/application/serveur/comptes-documents.js:64` : après une restauration réussie côté y/hub puis un échec en base, le code `throw e` sans `err(res, …)` visible ; sans un gestionnaire d'erreur global sur la route, la réponse HTTP ne part jamais (requête pendante). Vérifier qu'un tel gestionnaire existe ; sinon renvoyer un code (par ex. 500 `restauration-impossible`) comme le fait la branche y/hub juste au-dessus.
3. **[mineur]** Traductions (règle 26) — `v2/i18n/site/fr.json:157`, `v2/exploitation/site/construire.mjs:78` : la phrase « Écrivez à contact@dixit.net. » est assemblée par morceaux (`question.texte` + lien + point). C'est un catalogue statique sans paramètre nommé ; proposer de mettre l'adresse dans le paramètre d'un seul message (ou d'inclure le point dans le texte) pour que la phrase ne soit pas recomposée.
4. **[question]** Tests / API publique — `v2/adaptateurs/blocknote/export.js:149` : la signature de `versMarkdown` change (le paramètre `textes` disparaît) ; aucun appelant mis à jour n'apparaît dans le diff. Vérifier que tous les appelants (écran d'export, tests) ont été adaptés, sinon erreur à l'exécution.
5. **[mineur]** Correction / domaine rend des codes — `v2/domaine/miseEnPage.js:380` : `poser` ignore silencieusement une clé interdite (`__proto__`) au lieu de rendre `reglage-inconnu` comme les autres clés hors liste fermée ; une personne qui soumet un tel réglage reçoit un succès sans effet. Proposer de renvoyer le refus `reglage-inconnu` (ou `reglages-invalides`) pour rester cohérent avec le contrat du domaine.
6. **[mineur]** Simplicité — `v2/domaine/polices.js:59` : `new RegExp(INVISIBLES.source, 'gu')` est recréé à chaque enregistrement de nom lu dans la table `name` d'une police (des dizaines par fichier). Proposer une constante module (`const INVISIBLES_RE = new RegExp(INVISIBLES.source, 'gu')`), comme sans doute fait dans `personne.js`.

## Points de grille sans remarque
1, 2, 3 (hors constat 4 en partie), 5, 7, 8, 9 (hors constat 3), 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides

## Réponse de Claude

1. Juste, corrigé : un nom réservé de Windows l'est quelle que soit la suite (on regarde ce qui précède le premier point) ; ni point ni espace en fin de nom ; tests ajoutés.
2. Vérifié : le serveur attrape toute erreur d'une route et répond 500 `erreur-interne` (`application/serveur/index.js`, gestionnaire général) ; la trace ajoutée précède ce renvoi.
3. Juste, corrigé : les deux phrases sont entières dans le catalogue, avec `{contact}` remplacé par le lien.
4. Faux : un seul appelant (`adaptateurs/blocknote/index.jsx`), qui passait déjà deux arguments.
5. Faux : `appliquerReglages` refuse d'abord toute clé hors de la liste fermée des réglables (`reglage-inconnu`) ; `poser` n'est jamais atteint avec une clé interdite, sa garde est une défense en profondeur.
6. Juste, corrigé : l'expression est une constante du module.

## Arbitrage de Sylvain

Fusion demandée par Sylvain le 19/11/2026.
