# Audit partiel avant fusion (2026-11-13)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 253057 signes envoyés, 3108 reçus (et 6214 de réflexion) ; réflexion `low` ; 21 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `f29f686` (43 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce lot ajoute huit familles de polices OFL au catalogue des modèles de livre (décision de Sylvain du 13/11/2026), avec fichiers, licences et un contrat statique qui vérifie lisibilité, styles et incorporation au PDF. L'ensemble est cohérent avec l'ADR 0008 révisée, l'ADR 0011 et le renoncement n° 25 (Marianne absente). Les constats portent surtout sur le nouveau test de contrat : un import dont le statut d'API publique est incertain, une possible incohérence de noms entre le test et le module modifié, et le quatrième style jamais vérifié à la compilation.

## Constats
1. **[question]** grille 2 (API publique), `v2/contrats/statiques/polices-catalogue.test.js:60` — le test résout `@blocknote/xl-typst-compiler/wasm`, un sous-chemin de paquet qui peut ne pas être un export public déclaré (règle 2 : aucun chemin interne). Si ce sous-chemin est bien exporté par le paquet, le constat tombe ; sinon il faut passer par l'API publique du compilateur. À vérifier dans les `exports` du paquet.
2. **[question]** grille 6/7, `v2/contrats/statiques/polices-catalogue.test.js:14` contre `v2/design/reglagesLivre.js:89-91` — le test importe `MODELES_LIVRE`, `REGLES_MODELES`, `REGLES_MODELES_INSTANCE` depuis `design/livre.js`, mais le fichier modifié est `design/reglagesLivre.js` et n'exporte que `REGLAGES_LIVRE`. Si `livre.js` re-exporte ces noms dérivés, tout va bien ; sinon le test ne peut pas passer. À confirmer.
3. **[mineur]** grille 7 (tests), `v2/contrats/statiques/polices-catalogue.test.js:63` — le test de compilation n'utilise pas de texte en gras italique : le fichier `BoldItalic` de chaque famille n'est vérifié que par métadonnées (`lirePolice`), jamais incorporé dans un PDF. Le titre du test est honnête (« romain, italique, gras »), mais le quatrième style livré n'a pas de contrat d'incorporation. Proposer une portion en gras italique dans le texte d'essai.
4. **[mineur]** grille 6, `v2/contrats/statiques/polices-catalogue.test.js:42-52` — la boucle s'applique aussi à EB Garamond, dont les fichiers sont SemiBold/SemiBoldItalic (« demi-gras », ADR 0008 ligne 151) et non Bold/BoldItalic ; l'assertion `styles` triés égaux à `STYLES_POLICE` suppose que `lirePolice` ramène le demi-gras à « gras ». Si ce n'est pas le cas, le contrat échoue ; si c'est le cas, une phrase dans le test le dirait utilement. À confirmer dans `domaine`.
5. **[mineur]** grille 4 (simplicité), `v2/design/reglagesLivre.js:20` — la fonction d'aide `famille` prend un paramètre homonyme `famille` qui masque son propre nom : lisible mais source de confusion. Renommer le paramètre (par ex. `nom`).
6. **[mineur]** grille 8, `v2/design/polices/spectral/OFL.txt:93` — le fichier de licence se termine sans saut de ligne (« No newline at end of file ») ; sans conséquence juridique, mais incohérent avec les autres familles. Corriger pour l'homogénéité.

## Points de grille sans remarque
1, 3, 5, 9, 10 (les polices ajoutées sont sous SIL OFL, licences livrées à côté de chaque famille, conforme à l'ADR 0006 et à la décision `livre.polices` ; aucune dépendance npm nouvelle visible dans ce diff).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides

## Réponse de Claude

1. **Faux** : `./wasm` est un export déclaré du paquet (`exports` de `@blocknote/xl-typst-compiler`) ; les autres tests de Typst le résolvent de la même façon.
2. **Faux** : `design/livre.js` dérive ces noms de `REGLAGES_LIVRE` (`reglagesLivre.js`) ; le test les importe de là, comme les autres tests du livre.
3. **Juste**, corrigé : le texte d'essai a une portion en gras italique, et le test vérifie que le PDF incorpore au moins quatre polices de la famille (un sous-ensemble par fichier utilisé).
4. **Faux**, noté : `lirePolice` range à partir de 600 dans « gras » ; le test le dit maintenant en commentaire.
5. **Juste**, corrigé : le paramètre s'appelle `nom`.
6. **Juste**, corrigé : un saut de ligne final dans chaque licence.

## Arbitrage de Sylvain

(À compléter.)
