# Audit partiel avant fusion (2026-11-27)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 515387 signes envoyés, 2127 reçus (et 3797 de réflexion) ; réflexion `low` ; 29 s ; arrêt : stop
- Diff audité : `v2/` de `1585c49` à `0dc4e6f` (2 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Diff très court : la police propre à chaque style est rétablie dans les modèles en lignes (décision de Sylvain du 27/11/2026), à la fois dans la migration des anciens modèles et dans le gabarit Typst. Le principe est cohérent avec la décision et le renoncement n° 30 (« ajouter le choix de police »). Deux points à vérifier : des références (`texte`, `chaineTypst`) dont la définition n'apparaît pas dans le diff, et l'absence de test accompagnant ce changement de comportement.

## Constats
1. **[question]** Grille 6 (correction), `v2/domaine/miseEnPageLignes.js:198` — `caractere` compare `st.police !== texte.police` et appelle `chaineTypst(st.police)`, mais ni la variable `texte` ni la fonction `chaineTypst` n'apparaissent dans le diff ; je ne peux pas vérifier que `texte` est bien défini avant le premier appel de `caractere` (sinon erreur « Cannot access 'texte' before initialization ») ni que `chaineTypst` existe et échappe correctement une police au format Typst. À vérifier dans le fichier complet ; si `texte` est déclaré après la ligne 198 mais appelé seulement plus bas, c'est correct.
2. **[important]** Grille 7 (tests), `v2/domaine/miseEnPageLignes.js:197` et `v2/domaine/migrationModeles.js:363` — le comportement change (un style peut porter sa propre police dans le gabarit, et la migration la conserve ou la vide si elle est celle du texte), mais le diff ne contient aucun test : ni un test du gabarit avec une police par style, ni un test de `versModeleEnLignes` vérifiant la conservation/vidage de la police. Proposer d'ajouter ces deux cas aux tests du domaine.
3. **[mineur]** Grille 6 (cas limite), `v2/domaine/migrationModeles.js:361` — `policeDuTexte` vaut `undefined` quand l'ancien modèle n'a pas de style `texte` (ou pas de police) ; la comparaison `st.police !== policeDuTexte` fonctionne alors par hasard (toute police définie est gardée), mais un style sans police devient `''` — ce qui est le comportement voulu. Si c'est bien l'intention, un mot dans le commentaire existant (ligne 360) le dirait ; sinon expliciter.

## Points de grille sans remarque
1, 2, 3, 4, 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides

## Réponse de Claude

Audit découpé par couche (le lot entier dépasse la taille acceptée, à cause du fichier des modèles livrés) : celui-ci ne voit que le commit du domaine. La couche design n'est pas auditée.

1. **Faux.** `texte` est déclaré en tête de `gabaritEnLignes`, avant `caractere` ; `chaineTypst` est importé de `ecritureTypst.js` et échappe déjà la police du texte. Le gabarit avec une police par style se compile (test de pile `contrats/pile/exports.test.js`, export PDF d'un modèle dont le titre 3 est en Inter).
2. **Faux.** Les deux tests sont dans le commit des tests, que cet audit ne voit pas : `tests/unitaires/miseEnPageLignes.test.js` (« la police d'un style : la sienne dans le gabarit, celle du texte quand elle est vide ») et `tests/unitaires/conversion-en-lignes.test.js` (« la police d'un style est gardée par la conversion »).
3. **Voulu, commenté.** Un style sans police, ou à la police du texte, devient « la même que le texte » ; sans police de texte connue, toute police de style est gardée. Le commentaire le dit.

## Arbitrage de Sylvain

(À compléter.)
