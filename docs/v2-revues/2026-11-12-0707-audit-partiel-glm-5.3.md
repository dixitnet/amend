# Audit partiel avant fusion (2026-11-12)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 363581 signes envoyés, 4641 reçus (et 7803 de réflexion) ; réflexion `low` ; 17 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `fa897d6` (31 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot cohérent : blocs « Titre »/« Sous-titre » en extension, « /date », « Nouvelle note », menu « Nouveau » remplaçant les boutons et le tri. Les couches sont respectées (extension isolée, domaine pur, design dans `v2/design/`), les réglages nouveaux sont inscrits dans l'ADR 0008 et les tests accompagnent chaque ajout. Les constats portent surtout sur des cas limites de `creerNote`, un réglage Mantine non inscrit dans la table de l'ADR, et un test dont le commentaire annonce plus que ce qu'il vérifie.

## Constats

**A1 — [important]** Grille 5 (et 6), `v2/application/client/voletDocuments.jsx:154-156` : le nom du dossier « Notes » est pris dans la langue de l'interface (`t('documents.dossierNotes')`) et rangé comme donnée du compte ; la recherche du dossier existant compare ce nom à la langue courante. Si un jour la traduction diffère de « Notes » (la clé est d'ailleurs dans `exceptions.json`, `v2/i18n/exceptions.json:11`), une personne dans l'autre langue créera un second dossier au lieu de trouver le premier — c'est la confusion langue d'interface / langue des données que la règle 28 interdit par principe. Proposer à Sylvain un nom fixe indépendant de la langue (ou documenter que « Notes » est la valeur dans toutes les langues).

**A2 — [mineur]** Grille 6, `v2/application/client/voletDocuments.jsx:153-158` : `creerNote` cherche le dossier puis le crée s'il manque : deux déclenchements quasi simultanés (deux onglets, double clic) peuvent créer deux dossiers « Notes » — le test (`v2/contrats/pile/comptes.test.js:266-293`) ne couvre que la séquence. Par ailleurs, si la création du document échoue après celle du dossier, le dossier reste orphelin. Un nommage serveur (dossier unique par compte, créé atomiquement) ou une vérification au retour suffirait.

**A3 — [mineur]** Grille 6, `v2/application/client/voletDocuments.jsx:155` : la recherche de l'existant ne filtre que `parent === null` et `nom` ; si `donnees.dossiers` contient aussi les dossiers d'équipes (non visible dans ce diff), un dossier d'équipe « Notes » à la racine pourrait être choisi pour une note personnelle. À vérifier ; sinon préciser le filtre.

**A4 — [mineur]** Grille 1/ADR 0008, `v2/design/composants/Coquille.jsx:347` et `v2/design/composants/PageEditionS.jsx:21` : `Tabs.List` perd `grow` pour le volet droit compact (`grow={!compact}`) et l'onglet compact n'affiche son texte que s'il est actif. Le comportement compact est une décision de Sylvain du 12/11/2026 (citée en commentaire), mais ni `grow` ni ce mode ne figurent dans la table « Réglages décidés » de l'ADR 0008, alors que la règle 18 y inscrit toute prop de composant Mantine. Ajouter la ligne (la décision existe, il ne manque que l'écriture).

**A5 — [mineur]** Grille 6, `v2/design/composants/PageEditionS.jsx:17-20` : `Volet` pilote désormais toujours la valeur (`volet.actif ?? local ?? …`) avec `onChange={volet.surOnglet ?? setLocal}` ; si un appelant fournit `actif` sans `surOnglet`, un clic appelle `setLocal`, ignoré puisque `actif` l'emporte — l'onglet ne change plus, alors qu'avant (`defaultValue`) le cas non piloté restait interactif. Même schéma dans `VoletRelecture` (`v2/design/composants/Coquille.jsx:346`). Cas limite probablement absent des appelants actuels ; le signaler ou ne passer `value` que quand `surOnglet` existe.

**A6 — [mineur]** Grille 7, `v2/tests/design/composants.test.js:347-348` : le commentaire dit « ses éléments s'affichent à l'ouverture », mais le test ne vérifie que la présence du libellé du bouton « Nouveau » ; le `Menu.Dropdown` de Mantine n'est pas rendu sans ouverture, donc aucun élément du menu n'est testé ici (le test suivant non plus, ligne 397). La couverture réelle vient des tests de pile ; corriger le commentaire ou ouvrir le menu dans le test.

**A7 — [question]** Grille 4, `v2/domaine/index.js:67` : `ORDRES_TRI` reste exporté du domaine alors que le volet n'importe plus lui (`v2/application/client/voletDocuments.jsx:5`) et que le sélecteur de tri a disparu. S'il n'a plus d'utilisateur, c'est du code mort à retirer (avec `lireTri`/`noterTri`, déjà supprimés) ; vérifier les autres usages avant suppression.

**A8 — [question]** Grille 6/8, `v2/adaptateurs/blocknote/export.js:86-94` : le titre/sous-titre convertis pour le Markdown gardent `children: preparer(b.children ?? [])` alors que ces blocs sont `content: 'inline'` sans enfants — inoffensif, mais si l'export Word ou le compteur de signes parcours les blocs, il faudrait vérifier qu'ils traitent `titre`/`sousTitre` (pas visible dans ce diff). À confirmer sur les fichiers concernés.

## Points de grille sans remarque
2, 3, 9, 10

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

- A1. *Question pour Sylvain*, sans changement : « Notes » s'écrit de même en français et en anglais (exception déclarée), donc un seul dossier dans les deux langues. Si une langue future le traduisait autrement, un second dossier apparaîtrait ; on choisira alors un nom fixe.
- A2. *Juste*, accepté sans correction (sobriété) : un double clic très rapide peut créer deux dossiers « Notes », visibles et réunissables à la main ; un dossier resté vide après un échec ne gêne pas. Pas de route serveur dédiée pour ce cas.
- A3. *Faux* : `donnees.dossiers` vient de `comptes.dossiersDe(p.id)`, les dossiers personnels seuls ; ceux des équipes arrivent par `/api/equipes/:id`.
- A4. *Hors contrat* : le contrat lie la table de l'ADR aux clés de `reglages.js` et des feuilles ; l'onglet compact est un comportement du composant, décidé par Sylvain le 12/11/2026 et cité dans son commentaire, sans valeur de design nouvelle.
- A5. *Juste*, sans effet : tous les appelants passent `actif` et `surOnglet` ensemble ; le cas non piloté (ni l'un ni l'autre) reste interactif par l'état local.
- A6. *Juste*, corrigé : le commentaire dit où les éléments du menu sont vérifiés (pile).
- A7. *Faux* : `ORDRES_TRI` sert au domaine lui-même (`trierDocuments` vérifie l'ordre demandé) ; la page d'accueil trie encore par ce domaine.
- A8. *Faux* : `textesDesBlocs` et `compterBlocs` lisent le contenu en ligne de tout bloc, titre et sous-titre compris ; l'export Word n'existe pas encore dans la v2.

## Arbitrage de Sylvain

(À compléter.)
