# Audit partiel avant fusion (2026-11-27)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 588287 signes envoyés, 3005 reçus (et 7156 de réflexion) ; réflexion `low` ; 21 s ; arrêt : stop
- Diff audité : `v2/` de `2ecb2d5` à `3d0eee1` (11 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le lot refait le back-office en « fiche » (accordéon sans menu) : cohérent avec la maquette validée du 27/11, couches respectées, textes passés par les catalogues avec pluriels ICU corrects. Le principal écart est la perte silencieuse du réglage décidé `admin.page.size` (`lg`), toujours déclaré mais plus appliqué. Sinon : une redondance de nommage, un cas limite sur le modèle par défaut, et une question sur `exceptions.json`.

## Constats
1. **[important]** Grille 1 / 9 (design décidé non appliqué, code mort) — `v2/design/composants/PageAdministration.jsx:105`, `v2/design/reglages.js:254`. Le `<Container>` ne porte plus `{...REGLAGES.admin.page}` : le réglage `admin.page.size: 'lg'` (décision de Sylvain du 12/11, table de l'ADR 0008) n'est plus appliqué, alors qu'il reste déclaré dans `reglages.js` et dans la table de l'ADR — le contrat statique passe donc sans rien révéler, mais la page du back perd sa largeur décidée. Proposer à Sylvain : soit réappliquer le réglage, soit le retirer de `reglages.js` et de la table ADR 0008 avec sa décision (le format S est maintenant visé, un `Container` par défaut peut être voulu — mais c'est une décision, pas un oubli).
2. **[mineur]** Grille 4 (redondance) — `v2/application/client/Modeles.jsx:105-106`, `v2/application/client/Administration.jsx:5` et `:7`. Deux noms pour la même fonction : `nomDuModele` importé de `commun.js` et `nomDuModeleDeMiseEnPage` (alias local `const nomDuModele = nomDuModeleDeMiseEnPage` dans Modeles.jsx). Si `commun.js` fait déjà ce travail, l'export doublon est une abstraction de plus ; sinon, unifier sur un seul nom.
3. **[mineur]** Grille 6 (cas limite) — `v2/application/client/Administration.jsx:284-288`, `v2/application/client/Modeles.jsx:105`. Le résumé « par défaut : X » fait `.find((m) => m.id === (modeles.defaut ?? modeles.modeleCode.id))` ; si l'identifiant n'est trouvé dans aucune liste (modèle supprimé entre-temps, par exemple), `find` rend `undefined` et le `?? ''` de `nomDuModeleDeMiseEnPage` masque le cas : le résumé affiche « par défaut : » vide. Vérifier que le serveur garantit l'existence du défaut, sinon afficher un repli explicite.
4. **[question]** Grille 9 (traductions) — `v2/i18n/exceptions.json:34`. L'ajout de `admin.resume.apparence` aux exceptions n'est pas expliqué par le diff ; je ne sais pas ce que ce fichier exempte exactement (les autres entrées sont des résumés de fiche, ce qui suggère une exemption d'allongement en pseudo-langue). À confirmer avec Claude : si c'est une exemption de longueur, `admin.resume.modeles` ou `polices`, tout aussi courts, auraient-ils dû y figurer aussi ?
5. **[mineur]** Grille 7 (test incomplet) — `v2/contrats/pile/administration.test.js:70-71`. Le test vérifie trois des quatre cartes de chiffres (« Comptes », « Documents », « Équipes ») mais pas « Comptes d'essai » (`c.essai`, passé à la ligne 194 de Administration.jsx). Ajouter la quatrième pour couvrir ce qui change.

## Points de grille sans remarque
2, 3, 5, 8, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. **En partie faux, ADR précisé.** `admin.page` n'est pas mort : la fiche d'un modèle l'emploie (`FicheModele.jsx`, la fiche et son aperçu côte à côte). Le back-office, lui, prend la colonne par défaut de Mantine (`sm`) : c'est la largeur de la maquette que Sylvain a validée (« Ok pour tout », 27/11/2026). La ligne de l'ADR 0008 disait encore « largeur de la page du back-office » : elle dit maintenant les deux.
2. **Faux.** Ce sont deux choses différentes : `nomDuModele` de `commun.js` nomme un modèle d'IA (celui de Margo), `nomDuModeleDeMiseEnPage` un modèle de mise en page. Le back-office a besoin des deux, d'où le nom explicite à l'export.
3. **Faux.** Le serveur le garantit : `GET /api/admin/modeles` ne rend `defaut` que s'il désigne un modèle existant, `null` sinon (`comptes-modeles.js` : `typeof defaut === 'string' && (CODE.has(defaut) || parId.has(defaut)) ? defaut : null`), et la suppression du modèle par défaut remet le réglage à zéro. Le résumé retombe alors sur le modèle du code.
4. **Réponse.** `exceptions.json` liste les textes identiques en français et en anglais (le test « aucune recopie du français hors exceptions »). `{modele}, {couleur}` ne contient que deux paramètres : il est le même dans les deux langues. `admin.resume.modeles` et `polices` contiennent des mots, traduits : ils n'y ont pas leur place.
5. **Juste, corrigé.** La quatrième carte est vérifiée.

## Arbitrage de Sylvain

(À compléter.)
