# Audit partiel avant fusion (2026-11-11)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 272468 signes envoyés, 4514 reçus (et 32330 de réflexion) ; réflexion `low` ; 56 s ; arrêt : stop
- Diff audité : `v2/` de `819bc5e` à `bdc5528` (36 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse

Lot « stabiliser, fiabiliser » : suivi de l'instance (journal, mémoire), transactions PostgreSQL pour la suppression de compte, cache des auteurs de suggestions, scripts d'exploitation (veille, alerte, essai en ligne, export de tous les documents) et tests associés. L'architecture est respectée (couches, design séparé, i18n, NFC testé) et la couverture de tests est bonne. Trois défauts de correction subsistent, dont deux dans les scripts d'exploitation qui sont précisément ceux qui doivent « fiabiliser », plus quelques questions à trancher.

## Constats

**A1 — [important] (6, correction)** `v2/exploitation/prod/alerter.sh:43`
`ADMINS=$(valeur V2_ADMINS | tr -d '[:space:]')` supprime purement les espaces : deux adresses séparées par une espace (« a@x.fr b@y.fr ») deviennent « a@x.frb@y.fr », une adresse invalide, et personne n'est prévenu — pour un script dont c'est l'unique fonction. Remplacer les espaces par des virgules (`tr '[:space:]' ','` puis nettoyage), ou documenter que `V2_ADMINS` est une liste séparée par des virgules et refuser toute autre forme.

**A2 — [important] (6, correction)** `v2/exploitation/prod/exporter-tout.mjs:115-119`
Le remplacement de l'export n'est pas sûr contre un arrêt brutal : si le processus meurt entre `rename(DEST, ANCIEN)` et `rename(TMP, DEST)`, l'export courant n'existe plus qu'en `ANCIEN` ; au passage suivant, la ligne 116 (`rm(ANCIEN)`) supprime cette unique copie **avant** que le nouvel export soit en place — et si l'export échoue alors (sortie 4), la « porte de sortie » est perdue. Au démarrage, restaurer `ANCIEN` vers `DEST` si `DEST` manque, et ne vider `ANCIEN` qu'une fois `DEST` écrit.

**A3 — [mineur] (9, traductions)** `v2/exploitation/prod/veiller.sh:50-52`, `v2/exploitation/prod/alerter.sh:27-29`, `v2/exploitation/prod/essayer.sh:55-58`, `v2/exploitation/prod/exporter-tout.mjs:30`
Les courriels d'alerte et messages d'exploitation sont des phrases en français en dur, contrairement à la règle 23 (« aucune couche »). Un script bash ne peut pas raisonnablement lire les catalogues JSON : proposer à Sylvain soit une exception écrite (ADR 0010 ou registre des renoncements) pour les textes d'exploitation, soit leur passage par un mécanisme simple.

**A4 — [mineur] (6/9, correction)** `v2/i18n/fr.json:271` contre `v2/application/collab/index.js:75` et `v2/application/serveur/index.js:595`
Le message dit « le premier relevé arrive cinq minutes après le démarrage », mais le premier relevé part à 30 s (`setTimeout(..., 30_000)`), puis toutes les cinq minutes. Corriger le texte (ou le premier délai, si les 30 s n'étaient pas voulus).

**A5 — [question] (6, correction)** `v2/adaptateurs/blocknote/suggestions.js:89-110`
Le cache suppose que la table des auteurs est **remplacée** (nouvel objet) à chaque réponse de y/hub — un objet muté en place servirait des auteurs périmés — et qu'un même objet nœud ProseMirror ne porte jamais deux suggestions d'auteurs différents. Vérifier dans `adaptateurs/yjs` (suivreAuteurs) que la table est bien recréée ; sinon, invalider autrement.

**A6 — [question] (6, correction)** `v2/application/serveur/index.js:527`
`adresseSansSecret(...)` est utilisée dans `noterReponse` mais n'apparaît ni dans les imports ajoutés du diff ni dans une définition visible. Si elle n'existe pas déjà dans ce fichier, c'est une erreur au premier 5xx ; confirmer sa présence (préexistante) ou l'ajouter.

**A7 — [mineur] (6, cohérence)** `v2/domaine/administration.js:50` contre `v2/application/serveur/index.js:262` et `v2/i18n/fr.json:272`
Le journal est purgé à 30 jours mais la route et le libellé le limitent à 7 jours (`DUREE_MESURES_MS` sert aux deux), et `journal(depuis, limite = 200)` (`v2/adaptateurs/postgres/comptes-suivi.js:14`) tronque silencieusement à 200 lignes sans que l'administrateur le sache. Si les 30 jours sont une marge voulue, le dire en commentaire ; sinon aligner. Signaler la troncature (ou compter les lignes écartées).

**A8 — [mineur] (7, tests)** `v2/adaptateurs/blocknote/suggestions.js:100-110`
Le cache des auteurs n'a pas de test propre : le cas « la table des auteurs arrive après le premier rendu, les noms se remplissent ensuite » (le non-cache des auteurs introuvables, ligne 107-108) n'est couvert nulle part — `pannes.test.js:117` coupe `/api/personnes` entièrement, autre mécanisme. Un test d'extension ou de contrat sur l'arrivée tardive de la table sécuriserait ce qui a été la cause des 14 s.

## Points de grille sans remarque

1, 2, 3, 4, 5, 8, 10

## Citations vérifiées par le script

- A1 : citations valides
- A2 : citations valides
- A3 : citations valides
- A4 : citations valides
- A5 : citations valides
- A6 : citations valides
- A7 : citations valides
- A8 : citations valides

## Réponse de Claude

Lot « stabiliser, fiabiliser » (Sylvain, 11/11/2026 : points 1, 2, 3, 5, 6, 7, 8, 10 et 12). Par Claude : suppression de compte en une transaction, suivi de l'instance (journal, mémoire, back-office), correctif de la liste des suggestions. Par un modèle plus léger (Sonnet), relus par Claude : alertes et veille, essai en ligne après déploiement, nettoyage de la base d'essai, export de tous les documents, parcours de panne, mesure de la relecture à plusieurs.

- **A1 : juste, corrigé.** Les adresses de `V2_ADMINS` séparées par des blancs ou des points-virgules (formes que le serveur accepte) sont ramenées à une liste à virgules ; essayé sur « a@x.fr b@y.fr; c@z.fr , ».
- **A2 : juste, corrigé.** L'ancien export n'est plus supprimé avant que le nouveau soit en place, et un export resté sous son nom d'attente après un arrêt brutal est remis en place au lancement suivant.
- **A3 : juste, question pour Sylvain.** Les courriels d'alerte et les messages des scripts d'exploitation sont en français en dur ; ils ne sont lus que par les administrateurs de l'instance. Je propose de l'écrire comme une exception (ADR 0010), plutôt que de faire lire les catalogues à des scripts bash.
- **A4 : juste, corrigé.** Le texte dit maintenant « dans la minute qui suit le démarrage » (le premier relevé part à 30 s).
- **A5 : vérifié.** La table des auteurs est un objet neuf à chaque réponse de y/hub (`Y.decodeContentMap`, `adaptateurs/yjs/index.js`), donc le cache repart de zéro. Un même nœud de texte ne porte qu'une marque de suggestion.
- **A6 : faux.** `adresseSansSecret` est importée en tête de `application/serveur/index.js` depuis le lot du matin.
- **A7 : voulu, commenté.** Sept jours à l'écran, 30 jours gardés en base ; la limite de 200 lignes est dite en commentaire. Un compte des lignes écartées attendra un besoin.
- **A8 : juste, noté.** Le cache des auteurs n'a pas de test propre ; la mesure de la relecture (`npm run mesurer:relecture`) en tient lieu pour l'instant. À écrire avec le prochain lot qui touche la relecture.

Résumé : deux défauts réels corrigés dans les scripts d'exploitation, un texte corrigé, une question pour Sylvain (textes des alertes en dur).

## Arbitrage de Sylvain

(À compléter.)
