# Audit partiel avant fusion (2026-11-12)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 197206 signes envoyés, 2088 reçus (et 7508 de réflexion) ; réflexion `low` ; 79 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `2f241da` (9 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff ajoute le compteur de signes et de mots dans le bandeau (adaptateur BlockNote → application → design), avec ses réglages décidés et ses traductions, et réorganise le back-office (synthèse, système réunis). L'ensemble respecte le graphe des couches et les réglages de l'ADR 0008 sont bien consignés. Les constats portent sur du code possiblement mort, une incertitude sur ce que compte `compterBlocs`, et l'absence de test visible pour la refonte du back-office.

## Constats
1. **[question]** Grille 4 (simplicité), `v2/application/client/Edition.jsx:53` et `v2/application/client/Edition.jsx:716` — le retrait de `pied` et `surOuvrir` des actions du téléphone laisse `compterAuMenu` et `piedMenu` définis lignes 52-54 ; sont-ils encore utilisés ailleurs (menu « … » du format L/M) ? Si non, c'est du code mort à retirer.
2. **[question]** Grille 6 (correction), `v2/adaptateurs/blocknote/index.jsx:498` — le commentaire dit « le texte de base » : `compterBlocs` exclut-il bien les suggestions en mode relecture (le total du bandeau ne doit pas compter le texte suggéré deux fois, ou omettre les refus) ? À vérifier dans `export.js` ; si c'est déjà garanti par un test existant, le constat tombe.
3. **[mineur]** Grille 6, `v2/adaptateurs/blocknote/index.jsx:493-506` — `signaler` (déclenché par `onSelectionChange`) utilise `total`, qui n'est rafraîchi que 500 ms après la frappe : pendant ce délai, le bandeau peut afficher un total périmé à côté d'une sélection fraîche. Probablement acceptable (c'est le but du repos), mais à savoir ; si gênant, appeler `signaler` aussi à la fin de `recompter` (déjà fait) suffit, rien à changer sauf plainte réelle.
4. **[question]** Grille 7 (tests), `v2/application/client/Administration.jsx:176-216` — la fusion des rubriques « suivi » et « journal » en « Système », le renommage en « Synthèse » et la ligne « mémoire aucune » ne sont couverts par aucun test visible dans ce diff. Un parcours Playwright du back-office existe-t-il et a-t-il été mis à jour ?

## Points de grille sans remarque
1, 2, 3, 5, 8, 9 (hors test), 10.

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides

## Réponse de Claude

1. **Faux** depuis la correction qui suit l'audit : `piedMenu` et `compterAuMenu` servent toujours, au menu « … » du format S (l. 600-601) et de nouveau au menu du bandeau (l. 718-719), car le compteur du bandeau ne s'affiche qu'à partir de `lg` (iPad et téléphone gardent le compteur dans le menu).
2. **Faux** : `blocsDuTexte` lit le fragment par `yfragmentToBlocks`, sans les attributions de suivi ; le total est celui du texte de base, le même que l'ancien compteur du menu (`compter`, l. 583). Les suggestions en attente n'y sont pas comptées, ce qui est le comportement voulu tant qu'elles ne sont pas acceptées.
3. **Juste**, accepté tel quel : le total a au plus 500 ms de retard pendant la frappe, et la sélection est rafraîchie aussitôt. Rien à changer sans plainte réelle.
4. **Juste** : le back-office n'a pas de parcours dans la pile (seul le refus pour un non-administrateur est testé), car les comptes d'essai ne sont pas administrateurs. Le renommage en « Synthèse » et la fusion en « Système » ne changent que l'agencement des rubriques ; ils sont couverts par le lint et la cohérence des clés. **Question pour Sylvain** : ouvrir un parcours du back-office dans la pile avec un administrateur de développement, lors d'un prochain lot ?

Correction faite après l'audit (commit suivant) : le compteur du bandeau coupait le titre en pseudo-langue sur l'iPad en paysage et manquait de contraste en gris. Il n'apparaît plus qu'à partir de `lg` (1 200 px), en couleur normale, et reste au menu « … » sinon ; ADR 0008 et journal à jour, pile complète au vert (74 tests).

## Arbitrage de Sylvain

(À compléter.)
