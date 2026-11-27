# Audit partiel avant fusion (2026-11-27)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 501694 signes envoyés, 3186 reçus (et 7836 de réflexion) ; réflexion `low` ; 247 s ; arrêt : stop
- Diff audité : `v2/` de `e8f8dde` à `dde4b3f` (3 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff ajoute la conversion des modèles en points vers la grille en lignes (27/11/2026), dans le domaine, avec un garde-fou de validation par pas (`multiple`). Les couches et les dépendances sont respectées : le domaine n'importe que du domaine, et les réglages abandonnés (folio en mm, en-têtes réglables) correspondent bien au renoncement n° 30. Les principaux manques sont l'absence de tests pour les nouvelles fonctions et une incohérence de garde sur `chapitre` absent, qui peut lever une exception.

## Constats
1. **[important]** Grille 7 (tests), `v2/domaine/migrationModeles.js:354`, `v2/domaine/migrationModeles.js:455`, `v2/domaine/miseEnPage.js:482` — Les trois nouveautés (`versModeleEnLignes`, `valeursEnLignes`, la validation `multiple`) n'ont aucun test dans le diff, alors que la règle 14 demande des tests unitaires nombreux au domaine et que la conversion « au plus proche » comporte many cas limites (blancs non finis, alignement, corps plafonné au pas). Proposer des tests unitaires : conversion de « A4 simple » en points, modèle déjà en lignes, réglage non multiple de 0,5 refusé.
2. **[important]** Grille 6 (correction), `v2/domaine/migrationModeles.js:433` contre `v2/domaine/migrationModeles.js:416` — `ouvrant('titre1', ancien.chapitre)` reçoit `ancien.chapitre` sans garde alors que la ligne 416 traite le même champ avec `?.` : un modèle sans `chapitre` lève un `TypeError` sur `o.ligneTitre` (`v2/domaine/migrationModeles.js:384`). `valeursEnLignes` passe par `completerModele` qui complète, mais `versModeleEnLignes` est exporté et appelable directement. Harmoniser : `ancien.chapitre ?? {}` (et de même si `ligneTitre` manque, `Math.max(0, undefined - occupe)` donne `NaN`).
3. **[mineur]** Grille 6 (correction), `v2/domaine/migrationModeles.js:384` — Le commentaire (`v2/domaine/migrationModeles.js:377`) promet que « sa ligne de base reste sur `ligneTitre` », mais si le titre occupe plus de lignes que `ligneTitre`, `blancAvant` est ramené à 0 et la ligne de base descend en dessous. Cas limite improbable (corps très grand), mais le commentaire et le code divergent : corriger le commentaire ou noter la limite.
4. **[mineur]** Grille 4 (simplicité), `v2/domaine/migrationModeles.js:177` — `A4_EN_POINTS` est une troisième copie de « A4 simple » dans le même fichier (avec `A4_ANCIEN` ligne 11 et le modèle courant du design). C'est du code transitoire documenté (lignes 1-4, 172-173), mais toute correction de l'une des copies n'atteint pas les autres ; vérifier qu'aucune autre constante « A4 en points » n'existe déjà ailleurs (miseEnPage, design) et sinon l'importer plutôt que la recopier.
5. **[question]** Grille 6, `v2/domaine/migrationModeles.js:456` — `valeursEnLignes` rend `valeurs` tel quel dès que `estEnLignes` est vrai, sans compléter les réglages ajoutés après le 27/11 ; si un modèle en lignes enregistré aujourd'hui manque demain d'un champ, il ne sera pas complété. Est-ce voulu (les modèles en lignes sont réputés complets) ou faut-il passer aussi par `completerModele` avec un défaut en lignes ?

## Points de grille sans remarque
1, 2, 3 (hors constat 4, sans certitude sur une duplication externe), 5, 8, 9, 10.

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

Audit découpé par couche (le lot entier dépassait la taille acceptée) : celui-ci ne voit que le commit du domaine (`e8f8dde` à `dde4b3f`).

1. **En partie faux, complété.** Les tests existent, dans le commit des tests que cet audit ne voit pas : `tests/unitaires/modeles-livre.test.js` (chaque modèle livré est la conversion du modèle en points ; un blanc qui n'est pas un multiple de 0,5 est refusé) et `tests/services/modeles.test.js` (un modèle enregistré en points est servi puis converti). Les cas limites cités manquaient : ajoutés dans `tests/unitaires/conversion-en-lignes.test.js` (modèle incomplet, blanc qui n'est pas un nombre, corps plafonné au pas, alignement, modèle déjà en lignes, valeurs partielles).
2. **Juste, corrigé.** Sans lignes d'ouverture lisibles (`chapitre` absent, `ligneTitre` qui n'est pas un nombre), le titre garde les blancs de son style au lieu de lever une erreur ou de rendre `NaN`. Testé.
3. **Juste, corrigé.** Le commentaire dit maintenant la limite (un titre plus gros que la place avant sa ligne descend d'autant) ; testé.
4. **Faux.** `A4_ANCIEN` est une autre forme, plus ancienne (modèle de base et écarts, avant le 13/11/2026) ; `A4_EN_POINTS` est le modèle complet par style du 13 au 27/11. Aucune autre copie n'existe : le design ne livre plus que le modèle en lignes. Les deux constantes sont figées par nature (elles décrivent le passé) et partent avec le code transitoire.
5. **Voulu.** `valeursEnLignes` ne fait que convertir. Le serveur complète ensuite par le modèle du code, en lignes (`completerModele(valeursEnLignes(…), CODE)` dans `application/serveur/comptes-modeles.js`) : un réglage ajouté demain atteindra un modèle enregistré aujourd'hui.

## Arbitrage de Sylvain

(À compléter.)
