# Audit partiel avant fusion (2026-11-11)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 354410 signes envoyés, 4244 reçus (et 24210 de réflexion) ; réflexion `low` ; 36 s ; arrêt : stop
- Diff audité : `v2/` de `5991f2a` à `52fddca` (52 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir (constats 1 et 5).

## Avis de l'auditeur

## Synthèse
Lot cohérent avec l'architecture : les nouvelles fonctions (corbeille, copie, images, exposant, table des matières, zoom, suppression de compte) sont bien placées par couche, testées largement, et les écarts avec Docs sont justifiés dans les commentaires. Les constats portent surtout sur des cas limites (dossier pendant après restauration, exposant perdu dans les cellules de tableaux au Markdown, caractères à usage privé), sur le réglage CSS du zoom dont la sémantique ne correspond pas à l'ADR, et sur deux questions de frontière (pages statiques hors i18n, réglages de design lus par la technique). Rien de bloquant.

## Constats
1. **[question]**, grille 6 / règle 18, `v2/design/feuilles/editeur.css:22` — Le réglage `css.editeur.zoom` de l'ADR 0008 dit « la taille du texte de BlockNote (16 px) réduite ou agrandie d'autant », mais `font-size: 50 %` est relatif à la police de l'élément parent, pas aux 16 px de BlockNote : si le parent n'est pas à 16 px, le palier est faux. Proposer `font-size: calc(16px * 0.5)` (ou vérifier que le parent est toujours à 16 px) et le noter dans l'ADR.
2. **[mineur]**, grille 6, `v2/adaptateurs/postgres/comptes.js:374` — Un dossier dont les documents sont tous à la corbeille peut être supprimé ; si l'un de ces documents est restauré ensuite, il garde un `dossier` qui n'existe plus (référence pendante, le document peut disparaître de l'arbre). Au moment de restaurer, remettre `dossier` à `null` si le dossier n'existe plus (ou vérifier l'emplacement dans `mettreALaCorbeille(v.id, false)`).
3. **[mineur]**, grille 6/8, `v2/adaptateurs/blocknote/export.js:27` — Les marques d'exposant utilisent deux caractères à usage privé (U+E000/E001) : un texte tapé par une personne contenant ces caractères serait transformé en `<sup>` à l'export Markdown (`poserExposants`, ligne 72). Les échapper d'abord (ou les remplacer dans le texte source avant marquage).
4. **[mineur]**, grille 6, `v2/adaptateurs/blocknote/export.js:66` — `marquerExposants` n'est appliqué qu'à `b.content` des blocs : l'exposant dans une cellule de tableau (contenu `tableContent`) est perdu au Markdown (le compteur, lui, le lit bien, `textesDesBlocs` ligne 83). Étendre le marquage aux cellules.
5. **[question]**, grille 9 / règle 23, `v2/exploitation/site/aide/index.html:17` — Les pages publiques (accueil, aide) écrivent leurs textes en dur en français, hors des catalogues `v2/i18n/`, alors que la règle 23 vise « aucune couche ». Si ces pages sont considérées comme du contenu statique (décision à confirmer), le noter dans le registre ou l'ADR ; sinon les faire passer par les catalogues.
6. **[question]**, grille 1 / règle 16, `v2/application/client/App.jsx:1550` — La couche application lit `REGLAGES.zoom.paliers` (un réglage de design) pour sa logique (validation du `localStorage`, lignes 1550 et 1762). Le graphe l'autorise (l'application importe le design), mais les paliers sont une règle de produit ; confirmer que `design/reglages.js` est bien leur place, ou les déplacer au domaine.
7. **[mineur]**, grille 6, `v2/application/serveur/comptes.js:437` — Le plan de suppression du compte est calculé puis exécuté sans transaction : un accès donné ou retiré entre l'aperçu et la confirmation peut rendre le plan faux (par exemple un éditeur ajouté entre-temps n'est pas pris en compte, un document « refusé » ne l'est plus). Re-calculer le plan au moment de l'exécution (c'est déjà fait, ligne 437) mais exécuter dans une transaction, ou accepter l'écart en le notant.
8. **[mineur]**, grille 6, `v2/application/serveur/images.js:24` — Quand `lireOctets` dépasse `max`, il résout `null` et met la requête en pause, mais n'interrompt pas la lecture : des données déjà en transit continuent d'être reçues et accumulées en mémoire jusqu'à la réponse 413. Appeler `req.destroy()` (ou `removeAllListeners`) après le dépassement.
9. **[mineur]**, grille 7, `v2/adaptateurs/postgres/comptes.js:261` — `noterModification` ignore volontairement les documents à la corbeille (`supprime_le is null`), mais aucun test ne couvre ce cas (ni le fait qu'une restauration ne remette pas `modifie_le`). Un test de service le vérifierait.

## Points de grille sans remarque
10 (licences : aucune dépendance nouvelle).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides
- 8 : citations valides
- 9 : citations valides

## Réponse de Claude

1. **Question pour Sylvain** (juste en partie). `font-size: 50 %` est relatif au parent de `.bn-default-styles`, qui hérite de la taille de Mantine (1 rem, 16 px) : le palier tombe juste aujourd'hui. Écrire `calc(16px * 0.5)` serait une valeur de design de plus, que Claude ne pose pas sans décision. À 50 %, le texte fait 8 px : à voir sur capture.
2. **Faux.** `documents.dossier` est une clé étrangère `on delete set null` (`adaptateurs/postgres/comptes.js`, migration de l'étape 6c) : supprimer le dossier remet `dossier` à `null`, et le document restauré revient à la racine. Vérifié par une assertion ajoutée au test « corbeille : purge… » (`tests/services/partage.test.js`).
3. **Juste, corrigé.** Les deux marques à usage privé sont retirées du texte tapé avant le marquage (`sansMarques`, `adaptateurs/blocknote/export.js`) ; test ajouté.
4. **Juste, corrigé.** Le marquage descend dans les cellules des tableaux (`tableContent`) ; test ajouté (`tests/unitaires/export-ajouts.test.js`).
5. **Question pour Sylvain.** Les pages publiques sont du contenu, comme l'était l'aide de la v1 (un document publié) ; proposé : les traiter comme du contenu (hors de la règle 23), une page par langue le jour venu, et le noter dans l'ADR 0009.
6. **Contesté.** Les paliers du zoom sont une décision d'affichage de Sylvain (50, 100, 150 %), inscrite dans l'ADR 0008 ; l'application les lit comme elle lit les autres réglages, ce que le graphe des couches permet. Aucune règle de produit n'en dépend.
7. **Juste, accepté et noté.** Le plan est recalculé à la confirmation ; l'écart restant (un accès changé dans la même seconde) ne laisse jamais un document sans propriétaire, car chaque retrait passe par `modifierAcces`, qui refuse de retirer le dernier propriétaire. Une transaction sur l'ensemble demanderait de faire passer y/hub dans la même transaction, ce qui n'est pas possible.
8. **Juste en partie, corrigé.** La requête était bien mise en pause (rien n'était reçu après), mais les morceaux déjà lus restaient en mémoire et la connexion restait ouverte : ils sont maintenant vidés, et la connexion se ferme après la réponse 413 (`application/serveur/images.js`).
9. **Juste, corrigé.** Assertion ajoutée : une modification signalée pendant la corbeille ne change pas la date (`tests/services/partage.test.js`).

## Arbitrage de Sylvain

(À compléter.)
