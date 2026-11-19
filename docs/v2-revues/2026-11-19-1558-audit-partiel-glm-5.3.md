# Audit partiel avant fusion (2026-11-19)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 931687 signes envoyés, 3613 reçus (et 30729 de réflexion) ; réflexion `low` ; 299 s ; arrêt : stop
- Diff audité : `v2/` de `668e173` à `98dcea7` (32 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff ajoute le bloc « Bibliographie », l'ouverture des titres 2, le style des en-têtes, les petites capitales et le modèle « TàT 140 × 220 », avec des tests nombreux et bien ciblés (unitaires, pile, contrats, livre de référence). Le domaine reste pur, les imports respectent le graphe des couches, les catalogues fr/en sont symétriques. Les principaux manques portent sur l'ADR 0008 : deux réglages de design sont appliqués dans le code sans décision de Sylvain notée, dont une ligne de table mal formée ; et une validation de grille peut bloquer un modèle dont les lignes cachées du titre 2 sont devenues invalides.

## Constats
1. **[important]** Grille 9 (design, ADR 0008) — `v2/adr/0008-design.md:184`, `v2/adr/0008-design.md:191`, `v2/design/feuilles/editeur.css:114`, `v2/design/reglages.js:209`, `v2/design/pictos.jsx:96`. Les deux nouveaux réglages `css.editeur.bibliographie` (retrait suspendu d'un espacement `md`) et `pictos.editeur.bibliographie` (18 px) sont déjà appliqués dans le code, mais leur ligne de la table « Réglages décidés » n'a **aucune décision de Sylvain** : la première dit « proposé par Claude… à valider par Sylvain », la seconde n'a que deux cellules au lieu de trois (colonne Décision absente). La règle 18 et l'ADR 0008 exigent une décision notée pour toute valeur de design, et le contrat statique `design-decide.test.js` est censé vérifier la concordance. Proposer : faire valider par Sylvain (ou retirer en attendant), et réparer la ligne incomplète de la table.
2. **[important]** Grille 6 (correction, cas limite) — `v2/domaine/miseEnPage.js:97` à `v2/domaine/miseEnPage.js:101`. `grille()` valide les lignes de `ouverture2` même quand `debut === 'continuer'` : un modèle dont les lignes (cachées par le formulaire, `v2/design/reglagesLivre.js:50`) deviennent invalides après un changement de marges ou de format sera rejeté `modele-impossible` alors que ces lignes ne servent à rien, et l'utilisateur ne peut plus les corriger puisque le formulaire les masque. Proposer : ne valider `ligneTitre`/`ligneTexte` que lorsque le titre 2 ouvre une page (ou les réinitialiser au passage à `continuer`).
3. **[mineur]** Grille 6 (cas limite, traductions) — `v2/application/client/Modeles.jsx:162` à `v2/application/client/Modeles.jsx:165`, `v2/i18n/fr.json:569`. Si aucune police du catalogue n'avait de petites capitales, `aidePetitesCapitales` produirait « Les petites capitales sont celles de la police : en ont » avec une liste vide. Prévoir une variante du message (ou masquer l'aide) quand la liste est vide.
4. **[mineur]** Grille 4 (simplicité) — `v2/design/reglagesLivre.js:623`, `v2/design/reglagesLivre.js:636` à `v2/design/reglagesLivre.js:654`. Dans « TàT 140 × 220 », l'assistant `bibliographie(corps, espace, retraitSuspendu)` sert aussi à construire les styles `citation`, `titre2` à `titre5`, `titre`, `sousTitre` et `legende` : son nom dit un style précis mais elle fabrique un style quelconque. Renommer en un assistant générique (par ex. `unStyle(corps, espace, retraitSuspendu)`) pour ne pas tromper le lecteur.
5. **[question]** Grille 7 (tests) — `v2/contrats/statiques/polices-catalogue.test.js:64`. La détection des petites capitales par `Buffer…includes('smcp', 0, 'latin1')` cherche la balise OpenType dans les octets bruts : une occurrence fortuite de ces quatre octets dans une table quelconque ferait annoncer à tort une police. Le contrat l'assume-t-il (le commentaire dit « lues dans ses fichiers ») ? Si c'est voulu, un mot dans le commentaire suffirait ; sinon, lire la table GSUB.

## Points de grille sans remarque
2, 3, 5, 8, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. **Juste pour la ligne mal formée, question pour Sylvain pour le fond.** Les deux lignes de l'ADR 0008 ont maintenant leurs trois colonnes. La décision de Sylvain porte sur le style « Bibliographie » (19/11/2026, `docs/v2-modeles-140x220-plan.md`) ; son apparence à l'écran (retrait suspendu d'un espacement `md` de Mantine) et son picto (un « B », 18 px comme les autres) sont proposés par Claude et notés « à confirmer », comme l'avait été le picto de la légende le 13/11. Sans apparence, le bloc ne se distinguerait pas d'un paragraphe : la question est posée à Sylvain avec la demande de fusion.
2. **Juste, corrigé.** `grille()` ne contrôle les lignes du titre 2 que s'il ouvre une page ; tant qu'il reste dans le texte, des lignes devenues trop grandes après un changement de format ne bloquent plus le modèle. Test ajouté (`tests/unitaires/miseEnPage.test.js`).
3. **Juste, corrigé.** Sans aucune police à petites capitales, l'aide n'est pas affichée (`application/client/Modeles.jsx`).
4. **Juste, corrigé.** L'assistant s'appelle `styleDeBloc` ; `bibliographie` en est le nom pour ce style seulement (`design/reglagesLivre.js`).
5. **Juste, corrigé.** Le contrat lit la liste des fonctions de la table GSUB de chaque fichier au lieu de chercher quatre octets (`contrats/statiques/polices-catalogue.test.js`) ; le résultat est le même : trois familles sur onze.

Après corrections : `npm run format:check`, `npm run lint` et `npm test` (539 tests) au vert ; pile des exports, de l'éditeur et du téléphone passée avant l'audit.

## Arbitrage de Sylvain

(À compléter.)
