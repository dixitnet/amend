# Audit partiel avant fusion (2026-11-09)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 78002 signes envoyés, 3056 reçus (et 5516 de réflexion) ; réflexion `low` ; 19 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `ca225d7` (12 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot de design conforme dans l'ensemble : la marque (picto + nom) arrive dans `v2/design/`, les réglages sont notés dans l'ADR 0008, la feuille `picto.css` porte les clés des réglages, et le test de pile est mis à jour pour le changement de niveau de titre. Deux points retiennent l'attention : le nom « amend.ink » passe par une clé de traduction alors que la règle 24 dit qu'il ne se traduit jamais, et un test annonce plus qu'il ne vérifie. Quelques questions sur la robustesse des chemins relatifs et le contenu de la feuille CSS restent à trancher.

## Constats
1. **[important]** Grille 9 (traductions), `v2/application/client/App.jsx:78` et `v2/application/client/App.jsx:180` — Le nom de l'application est passé par `t('application.nom')`, une clé de catalogue, alors que la règle 24 dispose que le nom « amend.ink » ne se traduit jamais. Rien n'empêche qu'un catalogue anglais futur traduise cette clé. Proposer une constante (par exemple dans le design ou un module partagé) plutôt qu'une clé i18n, ou documenter que cette clé est exclue de toute traduction.
2. **[mineur]** Grille 7 (tests), `v2/tests/design/composants.test.js:131` — Le test s'intitule « les icônes de l'onglet **et de l'iPad** reprennent le dessin de référence » mais ne vérifie que `favicon.svg` (ligne 135) ; `apple-touch-icon.png`, binaire, n'est pas contrôlé. L'ADR 0008 assume qu'un seul des deux est vérifié, mais le titre du test est trompeur. Proposer de renommer le test pour qu'il annonce exactement ce qu'il vérifie (et noter le PNG comme non couvert).
3. **[question]** Grille 6 (correction), `v2/application/client/index.html:7` et `v2/application/client/index.html:8` — Les icônes sont référencées par un chemin relatif `../../design/picto/…` depuis le HTML du client. Selon l'outil de build et le répertoire servi, ce chemin risque de ne pas résoudre une fois le client construit et servi. À vérifier dans le montage réel (test de pile) ; si ça casse, préférer un import résolu par le bundler.
4. **[question]** Grille 1/ADR 0008, `v2/design/feuilles/picto.css:11-14` — Sous la clé `css.picto.taille` (« le picto prend la taille du texte qui le porte, 1 em »), la règle pose aussi `display: inline-flex` et `vertical-align: middle`, qui ne sont pas la taille décidée par Sylvain. Le contrat statique exige que chaque règle porte la clé d'un réglage ; ces deux déclarations sont-elles couvertes par la décision C9 ou constituent-elles des valeurs non décidées ? À faire trancher par Sylvain ou à noter dans la table.
5. **[question]** Grille 5 (sécurité), `v2/design/composants/Picto.jsx:8` — `dangerouslySetInnerHTML` injecte le contenu brut du SVG de référence. Le fichier est local et statique, donc pas d'injection exploitable en l'état, mais tout ajout futur au SVG (par exemple un `<script>`) passerait sans filtrage. Confirmer que le fichier est figé par la décision ADR 0008 (c'est le cas) et que le lint/contrat le protège ; sinon, envisager un rendu par composant plutôt que par injection HTML.

## Points de grille sans remarque
2, 3, 8, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. **Juste en partie, verrouillé par un test.** La clé `application.nom` existait déjà (titre de l'onglet, `App.jsx`) et figure dans `i18n/exceptions.json` (textes identiques dans toutes les langues). Un catalogue pouvait pourtant la traduire : un test vérifie maintenant qu'elle vaut « amend.ink » dans chaque langue (`tests/unitaires/i18n.test.js`).
2. **Juste, corrigé.** Le test s'intitule désormais « l'icône de l'onglet reprend le dessin de référence… » ; il note que le PNG de l'iPad n'est pas contrôlé.
3. **Faux.** Vite résout ces chemins au build : `dist/index.html` contient `/assets/favicon-….svg` et `/assets/apple-touch-icon-….png`, servis par le serveur ; la pile complète passe et les captures montrent le picto.
4. **Juste, précisé.** L'alignement sur la ligne (`inline-flex`, `vertical-align: middle`) sert la taille décidée (C9) : la ligne `css.picto.taille` de l'ADR 0008 le dit maintenant.
5. **Juste en partie, verrouillé.** Le fichier est figé par l'ADR 0008 ; un test vérifie en plus qu'il ne contient ni script, ni attribut d'événement, ni `foreignObject`, ni lien, ni style.

## Arbitrage de Sylvain

(À compléter.)
