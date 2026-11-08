# Audit partiel avant fusion (2026-11-08)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 144767 signes envoyés, 3470 reçus (et 27224 de réflexion) ; réflexion `low` ; 35 s ; arrêt : stop
- Diff audité : `v2/` de `bec9478` à `c5b1abf` (41 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot cohérent et bien testé (typographie, notes, schéma, contrats statiques), respectant globalement les frontières et l'ADR 0008 révisé. Deux points structurants : l'adaptateur BlockNote importe les extensions (couche 3) alors que la règle des couches interdit de dépendre d'une couche supérieure, et la langue de l'interface est figée dans des mémos/dépendances qui ne la suivent pas. Le reste est de l'ordre de la question (durée de vie de l'annulation de frappe, types MIME, licence de la dépendance nouvelle).

## Constats
1. **[important]**, grille 1, `v2/adaptateurs/blocknote/index.jsx:15` `v2/adaptateurs/blocknote/index.jsx:16` `v2/adaptateurs/blocknote/schema.js:12` — L'adaptateur (couche 2) importe les extensions typographie et note (couche 3) ; ADR 0002 et le tableau des couches posent qu'une couche ne dépend que des couches en dessous d'elle. L'assemblage (quelles extensions, avec quelle langue) relève de l'application (couche 5), qui les passerait à l'adaptateur ; ou une révision de règle/ADR si ce câblage est jugé inséparable de la façade. À proposer à Sylvain plutôt qu'à laisser en l'état.
2. **[important]**, grille 6, `v2/application/client/App.jsx:118-123` `v2/adaptateurs/blocknote/index.jsx:47` — `libelles` est mémoïsé avec une liste de dépendances vide alors qu'il utilise `t` : si la langue d'interface change (?langue=), les libellés du menu « / » restent dans l'ancienne langue. De même, `langue` n'est pas dans les dépendances de `useCreateBlockNote` : les menus BlockNote ne suivraient pas non plus un changement de langue. Ajouter `t` (ou la langue) aux dépendances, et `langue` à celles de l'éditeur.
3. **[question]**, grille 6, `v2/extensions/typographie/index.js:67-77` — `annulerRemplacement` annule le dernier remplacement enregistré par le greffon d règles de saisie ; selon la durée de vie de cet état (conservé ou non au fil des transactions ordinaires), un Retour arrière après avoir tapé d'autres caractères pourrait annuler un remplacement ancien au lieu d'effacer un signe. Les tests couvrent le cas immédiat mais pas « taper, écrire autre chose, puis effacer ». À vérifier par un test.
4. **[question]**, grille 6, `v2/application/serveur/index.js:35-37` — Le type MIME `.svg` et `.json` disparaissent, `.woff` apparaît, sans justification visible dans le diff (inter.css référence du woff2, déjà présent). Si aucun actif ne l'exige, `.woff` est une entrée morte ; si un SVG est encore servi, il partira sans type. Préciser la raison ou retirer.
5. **[question]**, grille 10, `v2/package.json:15` — Dépendance nouvelle `@handlewithcare/prosemirror-inputrules` (et `prosemirror-model`/`prosemirror-state` en direct) : l'ADR 0006 exige que chaque dépendance nouvelle ait une licence compatible, vérifiée en revue. La licence du paquet `@handlewithcare` n'est pas notée dans le diff ; à vérifier et consigner.
6. **[mineur]**, grille 6, `v2/contrats/statiques/une-seule-copie-prosemirror.test.js:27` — La comparaison de versions ne gère que le préfixe `^` : une demande en `~`, en plage ou en version prépubliée (`1.4.4-rc.1`) donnerait un faux échec ou un faux succès. Simple à durcir si l'amont utilise ces formes.

## Points de grille sans remarque
2 (API publique : seuls imports publics), 3, 4, 5, 7 (couverture bonne, y compris cas signalés par l'audit précédent), 8 (NFC au collage, échappements testés), 9 (catalogues complets, exceptions à jour, langue du document distincte de celle de l'interface).

## Citations vérifiées par le script

(Numérotation « 1. » non reconnue par la première version du script, corrigée depuis ; citations vérifiées à la main par Claude : toutes valides.)

## Réponse de Claude

- **1 : juste, question pour Sylvain.** La règle dit « une couche ne dépend que des couches situées en dessous d'elle » (règles, l. 22). Or l'adaptateur BlockNote (2) importe les extensions (3), et les extensions (3) importent le domaine (4) ; le lint ne le vérifie pas. Écart introduit par Claude à l'étape 4, non corrigé avant décision : soit déplacer l'assemblage (schéma, extensions) dans l'application, soit réviser la règle. Voir la synthèse de l'essai.
- **2 : faux.** `t` et `langue` sont fixés au chargement de la page (`App.jsx`, l. 14) et ne changent jamais sans rechargement.
- **3 : faux.** L'état du greffon s'efface à toute transaction qui change le document ou la sélection (`@handlewithcare/prosemirror-inputrules`, `apply` : `tr.selectionSet || tr.docChanged ? null : prev`) : un Retour arrière après une autre frappe ne peut rien annuler.
- **4 : faux.** Justifié dans le commit de la passe : `dist/` contient des polices `.woff` (Inter de BlockNote) et aucun `.svg` ni `.json`.
- **5 : faux.** Licence MIT ; le contrat `licences.test.js` vérifie chaque dépendance.
- **6 : juste, mineur.** La comparaison ne lit que `^` ; à durcir (échouer explicitement sur toute autre forme).

Bilan : 6 constats, 2 justes (dont un écart d'architecture réel, important), 4 faux ; citations valides.

## Arbitrage de Sylvain

(À compléter.)
