# Audit partiel avant fusion (2026-11-14)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 243851 signes envoyés, 3148 reçus (et 11742 de réflexion) ; réflexion `low` ; 26 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `512b2fe` (10 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le lot suit correctement les couches : les règles de réduction vivent dans le domaine, le dessin et l'encodage dans l'application, et le serveur garde ses contrôles par signature. Les traductions sont mises à jour dans les deux langues avec les nouvelles clés. Je relève surtout un cas limite de logique dans `preparerImage` (rejet alors que l'original était gardable), une valeur de retour jamais consommée, et deux points mineurs de simplicité et de traduction.

## Constats
1. **[important]** Grille 6 (correction, cas limite), `v2/application/client/images.js:64-66` : si le meilleur ré-encodage dépasse 5 Mo, on lève `image-trop-lourde` à la ligne 64 **avant** le `garderOriginal(original, meilleur.size)` de la ligne 66, qui aurait pu retourner l'original (par exemple un JPEG déjà compressé, ≤ 5 Mo, ≤ 2 000 px, que tout ré-encodage alourdit ou dégrade). Une image valide serait donc refusée avec « trop lourde, même réduite ». Proposition : tester `garderOriginal(original, meilleur.size)` (ou au moins « original non réduit et ≤ 5 Mo ») avant de lever l'erreur, et ajouter un test unitaire ou de pile pour ce cas.
2. **[mineur]** Grille 4 (simplicité, code mort), `v2/application/client/commentaires.js:58` et `v2/application/client/Edition.jsx:420` : `envoyerImage` calcule et retourne `hauteur`, mais l'unique appelant n'utilise que `{ url, largeur }` ; le renoncement n° 26 dit précisément que la hauteur n'est pas portée par le document. Proposition : ne retourner que `{ url, largeur }`, ou consommer la hauteur si un besoin existe.
3. **[mineur]** Grille 4 (option « au cas où »), `v2/domaine/images.js:76` : le paramètre `max = IMAGE_LARGEUR_MAX_PX` de `dimensionsReduites` n'est jamais passé par un appelant (le client appelle sans argument, les tests aussi). Proposition : retirer le paramètre et utiliser la constante directement.
4. **[mineur]** Grille 9 (traductions, paramètre nommé), `v2/i18n/fr.json:127` et `v2/i18n/en.json:127` : « Cette image dépasse 25 Mo » fige la limite en toutes lettres ; si `IMAGE_ENTREE_MAX_OCTETS` change, le texte ment (la règle 26 demande des paramètres nommés, comme le fait déjà `police-trop-lourde` avec `{max, number}`). Proposition : « Cette image dépasse {max, number} Mo » avec le paramètre branché sur la constante.
5. **[mineur]** Grille 6 (cas limite), `v2/domaine/images.js:77-82` : `dimensionsReduites(0, h)` donne `facteur = Infinity` puis `NaN` (Math.max(1, NaN) = NaN). Un bitmap de largeur nulle ne devrait pas sortir de `createImageBitmap`, mais la fonction du domaine est pure et testable : une garde `largeur < 1` rendrait le contrat explicite. À défaut, classer comme non-sujet.
6. **[question]** Grille 7 (tests), `v2/contrats/pile/editeur.test.js:249-269` : le chemin « PNG réduit gardé en PNG » (ré-encodage sous le seuil de 600 Ko, ligne 45 de `images.js` client) et le chemin « JPEG essayé puis rejeté parce que le PNG pèse moins » ne sont couverts que par le bruit (qui part en JPEG) ; le premier n'a aucun test. Faut-il ajouter un test de pile avec une petite capture à aplats (PNG attendu en sortie) ?

## Points de grille sans remarque
1, 2, 3, 5, 8, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides

## Réponse de Claude

1. *Juste* : le garde de l'original passe avant le refus « trop lourde » ; une image valide n'est plus refusée parce que son ré-encodage pèserait plus.
2. *Juste* : `envoyerImage` ne rend plus que `{ url, largeur }` (la hauteur n'est pas portée : renoncement n° 26).
3. *Juste* : paramètre retiré de `dimensionsReduites`.
4. *Juste* : les messages prennent `{max, number}`, branché sur les constantes du domaine.
5. *Juste* : `dimensionsReduites` garde `largeur >= 1` (pas de NaN).
6. *Juste* : test de pile ajouté (capture d'aplats : réduite à 2 000 px, gardée en PNG).

## Arbitrage de Sylvain

(À compléter.)
