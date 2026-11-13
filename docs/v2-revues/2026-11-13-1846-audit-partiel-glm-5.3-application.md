# Audit partiel avant fusion (2026-11-13)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 227273 signes envoyés, 3876 reçus (et 10601 de réflexion) ; réflexion `low` ; 16 s ; arrêt : stop
- Diff audité : `v2/` de `f57b0fc` à `4fa9647` (7 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff porte le passage aux modèles complets « par style » (ADR 0011, complément du 13/11/2026) : création par copie, réglages uniques, conversion des anciens modèles, polices multiples par modèle. La logique serveur et client paraît cohérente et les droits (équipe, instance, document) sont bien revus, mais aucune mise à jour des catalogues de traduction n'accompagne les nombreuses nouvelles clés et les messages dont les paramètres changent, et rien ne teste les nouveaux parcours (polices multiples, conversion, modèles de départ).

## Constats
1. **[grave]** Traductions — `v2/application/client/Modeles.jsx:40`, `v2/application/client/Modeles.jsx:55`, `v2/application/client/Modeles.jsx:90`, `v2/application/client/aidesEdition.jsx:55`, `v2/application/client/Modeles.jsx:328`, `v2/application/client/Modeles.jsx:360` : le diff ajoute beaucoup de clés nouvelles (`modeles.propriete.*`, `modeles.options.alignement.*`, `modeles.groupes.citation` à `legende`, `document.legende`, `document.legendeDescription`) et change la signature de messages existants (`modeles.detail` perd `titre`, `admin.modelesPdf.detail` perd `titre` et `d`, `admin.modelesPdf.confirmerSuppression` perd `code`), mais aucun fichier de `v2/i18n/` n'est modifié : les clés manqueront et les phrases assemblées seront fausses ou incomplètes (règle 23, 31 ; test de complétude qui devrait échouer). Proposer d'ajouter au lot la mise à jour de `fr.json` et `en.json`, et de faire tourner le test de complétude.
2. **[important]** Tests — `v2/application/client/exports.js:24`, `v2/application/serveur/comptes-modeles.js:75`, `v2/application/serveur/comptes-modeles.js:253` : les comportements nouveaux ou sensibles ne sont couverts par aucun test visible dans le diff : `modeleComplet` avec plusieurs familles de polices (dont une de l'instance), `modeleDeDepart` (droits sur un modèle de départ d'équipe), la conversion `convertir` des anciens modèles, et la reprise. Proposer des tests de domaine sur `appliquerReglages`/`completerModele` déjà couverts sans doute, mais surtout un test serveur sur la création depuis un modèle d'une autre équipe (refus) et un test client sur `modeleComplet`.
3. **[mineur]** Correction — `v2/application/serveur/comptes-modeles.js:283` : la reprise repère un modèle déjà créé par `m.nom === r.nom` seul, alors que l'ancien code exigeait aussi `m.base === ID_CODE` ; un modèle d'instance créé par un administrateur portant par hasard le même nom serait pris pour le modèle repris, et la reprise serait marquée faite à tort. Proposer de garder un critère plus précis (par exemple un repère enregistré) ou de documenter l'écart.
4. **[mineur]** Traductions — `v2/application/client/Modeles.jsx:120` : si un nom manque, le libellé de repli est la clé brute (`r.cle`, par exemple `styles.texte.police`) montrée à la personne ; c'est un code, pas une phrase, mais l'échec sera silencieux. Proposer un repli visible en développement (avertissement) plutôt qu'une clé technique à l'écran.
5. **[question]** Sécurité et droits — `v2/application/serveur/comptes-modeles.js:233` : `modelesDocument` envoie désormais `polices` et `fichiersPolices` (les adresses des fichiers de polices envoyés par l'instance) à toute personne qui ouvre le document, membre ou non. C'est nécessaire pour exporter avec le modèle retenu, mais le téléchargement de `/api/polices/:id` vérifie-t-il bien un droit côté serveur ? À vérifier dans `polices.js` (hors diff).
6. **[question]** Simplicité — `v2/application/client/Modeles.jsx:6`, `v2/application/serveur/index.js:20` : les imports de `REGLES_MODELES_INSTANCE` sont retirés partout ; ce symbole existe-t-il encore dans `v2/design/livre.js` (code mort à supprimer), et la table de l'ADR 0008 (`livre.reglablesInstance`) a-t-elle été mise à jour vers l'unique `REGLES_MODELES` ?

## Points de grille sans remarque
1, 2, 3, 8, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides

## Réponse de Claude

1. *Faux* : les catalogues `fr.json` et `en.json` sont dans le dernier commit du lot (« Textes, tests et documentation ») ; la tranche auditée ne les contenait pas. Les tests de cohérence (clés utilisées et existantes, fine insécable) passent.
2. *Juste en partie* : le test de service couvre la création par copie (équipe, instance), le réglage par style, les droits et la reprise ; le refus d'un modèle de départ d'une autre équipe est couvert par `modeleDeDepart` (retombe sur `modele-introuvable`) mais sans test dédié : ajouté à la liste des tests à écrire, sans bloquer.
3. *Juste, mineur* : la reprise ne tourne qu'une fois sur la base réelle (drapeau `modeles.reprise`) ; le critère reste le nom, jugé suffisant pour ce modèle unique.
4. *Hors sujet* : un test vérifie que chaque réglage ouvert a son nom au catalogue.
5. *Faux* : `/api/polices/:id` exige une session (test : 401 sans cookie).
6. *Faux* : `REGLES_MODELES_INSTANCE` n'existe plus ; la ligne `livre.reglablesInstance` de l'ADR 0008 est retirée (test `design-decide`).

## Arbitrage de Sylvain

(À compléter.)
