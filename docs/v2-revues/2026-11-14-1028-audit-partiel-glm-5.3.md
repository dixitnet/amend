# Audit partiel avant fusion (2026-11-14)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 234805 signes envoyés, 3088 reçus (et 11397 de réflexion) ; réflexion `low` ; 17 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `f796191` (6 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff applique la décision du 14/11/2026 (images à 100 % de la largeur utile) à trois niveaux : retrait de la largeur d'éditeur dans l'adaptateur, réglage `image.largeur` dans les modèles, règle `#set image` dans le gabarit, avec deux tests (statique et de pile). L'ensemble est cohérent et testé ; je relève surtout une redondance de valeur par défaut entre le code et les modèles stockés, un risque de boucle dans l'outil d'analyse du PDF du test, et une question sur l'utilité d'un réglage que personne ne peut modifier.

## Constats
1. **[question]** Grille 6 (correction) / simplicité — `v2/domaine/miseEnPage.js:256`, `v2/design/reglagesLivre.js:131` et `v2/design/reglagesLivre.js:208`. Le gabarit fait `modele.image?.largeur ?? 100` : les modèles stockés en base (copies complètes, ADR 0011) créés avant ce changement n'ont pas de champ `image` et recevront silencieusement 100. La conversion des modèles au démarrage (comme celle de `base`/`ecarts`) serait-elle préférable à une valeur par défaut cachée dans le domaine ? À trancher avec Sylvain ; sinon le documenter.
2. **[mineur]** Grille 4 (simplicité) — `v2/design/reglagesLivre.js:131`, `v2/domaine/miseEnPage.js:256`. `image.largeur` est un réglage porté par chaque modèle, mais il ne figure pas dans `livre.reglables` (ADR 0008, ligne 158) ni dans la liste fermée ouverte aux gestionnaires : seule la valeur 100, fixée dans le code, existe. Un réglage qu'aucune équipe ne peut changer ressemble à une option « au cas où » (règle 12, sobriété) ; une constante dans le gabarit suffirait. Si la variabilité future est voulue, le dire dans l'ADR.
3. **[mineur]** Grille 6 (correction, cas limite) — `v2/contrats/pile/exports.test.js:141`. Si un `stream` n'a pas de `\nendstream` après lui, `j = -1` et `debut = j + 10 = 9` : la recherche reprend depuis le début, retrouve le même `stream`, `inflateSync` échoue, `continue`… boucle infinie du test. Peu probable avec un PDF de Typst, mais un `if (j < 0) break` coûte une ligne.
4. **[question]** Grille 7 (tests) — `v2/contrats/pile/exports.test.js:148`. Le sélecteur `([\d.]+) 0 0 ([\d.]+) … cm /… Do` suppose la forme exacte du flux que Typst émet pour poser une image ; un changement de générateur rendrait le test muet (aucune largeur trouvée) plutôt que faux — l'assertion `largeurs.length >= 1` le détectera, c'est acceptable, mais vérifier que le message d'échec dira bien « aucune image posée » et non une comparaison obscure.
5. **[question]** Grille 3 (redondance avec l'amont) — `v2/adaptateurs/blocknote/export.js:288`. Le retrait de `width:` par expression régulière sur le Typst produit par l'exportateur de BlockNote repose sur son format de sortie exact. Le contrat statique (`v2/contrats/statiques/typst.test.js:239`) le couvre, ce qui est le bon garde-fou ; mais BlockNote offre-t-il une option d'export sans largeur (à vérifier dans sa documentation, règle « seulement l'API publique ») ? Si oui, la configuration vaut mieux que le post-traitement.

## Points de grille sans remarque
1, 2 (hors constat 5, qui reste une question), 5, 8, 9, 10.

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. *Voulu, documenté* : le serveur complète tout modèle enregistré par celui du code (`completerModele`), donc les modèles déjà en base reçoivent `image.largeur = 100` ; la valeur par défaut du gabarit (`?? 100`) n'est qu'un filet pour un modèle fourni sans cette clé. Pas de conversion à faire.
2. *Voulu* : la valeur est dans le modèle parce que les règles du lint (valeurs de design hors du design) interdisent d'écrire `100 %` dans le domaine ou l'adaptateur, et que le design décide des valeurs (ADR 0008, `livre.modeles`). Non réglable par les équipes : décision de Sylvain (« 100 % »), notée ; rien à ouvrir.
3. *Juste* : `if (j < 0) break` ajouté.
4. *Voulu* : le test échoue avec « une image est posée sur une page » si le format change ; vérifié aussi qu'il échoue sans le correctif (largeur 2 000 px au lieu de 481,9 pt).
5. *Vérifié* : l'exportateur de BlockNote n'offre pas d'option de largeur (il lit `previewWidth`, sinon 80 %). Le post-traitement est gardé par le contrat statique (`typst.test.js`) et par le test de PDF réel.

## Arbitrage de Sylvain

(À compléter.)
