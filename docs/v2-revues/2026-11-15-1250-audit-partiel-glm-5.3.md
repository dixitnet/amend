# Audit partiel avant fusion (2026-11-15)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 230349 signes envoyés, 1831 reçus (et 2440 de réflexion) ; réflexion `low` ; 9 s ; arrêt : stop
- Diff audité : `v2/` de `269a61d` à `c131ba5` (2 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Diff restreint à l'exploitation (couche 7) : correction du geste de clic sous WebKit tactile (`dispatchEvent('click')` avec une chaîne ne pouvait rien déclencher — c'était un vrai défaut, bien corrigé par la séquence `mousedown`/`mouseup`/`click`), ajout du survol par événements, et inscription de WebKit M/S dans la campagne. Pas de problème de couches, d'API publique, de sécurité ni de traductions. Restent une duplication de code entre les deux blocs `evaluate` et deux questions sur la cohérence du fichier de référence.

## Constats
1. **[mineur]** Grille 4 (simplicité), `v2/exploitation/campagne/gestes.mjs:348` et `v2/exploitation/campagne/gestes.mjs:374` : les deux blocs `evaluate` reconstruisent chacun le rectangle, l'objet d'options et la boucle de distribution `pointer`/`mouse` — même structure, seuls les types d'événements changent. Proposer une petite fonction commune (options + boucle) pour éviter la divergence future des deux listes.
2. **[question]** Grille 7 (tests), `v2/exploitation/campagne/reference.json:47` et `v2/exploitation/campagne/reference.json:58` : les verdicts `webkit/M` et `webkit/S` « echoue » sont ajoutés aux scénarios D1 et D2, mais la note (ligne 42 et 53) ne décrit que l'écart chromium pile locale / en ligne ; l'échec WebKit n'est ni expliqué ni daté, alors que le statut est « connu ». Faut-il compléter la note (cause, lien de bilan) pour que le « connu » soit traçable ?
3. **[question]** Grille 7 (tests), `v2/exploitation/campagne/reference.json:9` : `webkit/M` et `webkit/S` entrent dans les combinaisons qualifiées, mais pas `webkit/L`, alors que L (Mac) est précisément le format du navigateur WebKit. Est-ce un choix délibéré (WebKit piloté seulement sur iPad ?) ou un oubli à trancher avec Sylvain ?

## Points de grille sans remarque
1, 2, 3, 5, 6, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides

## Réponse de Claude

1. *Juste*, corrigé : une fonction commune (`evenementsDeSouris`, la liste des types en paramètre) sert au clic et au survol.
2. *Juste*, corrigé : la note des deux D2 dit l'écart sous WebKit (même écart que la pile locale Chromium L, runs 36 et 37).
3. *Hors sujet* : `webkit/L` n'a pas encore été joué dans la campagne (WebKit n'a été lancé qu'en M et S) ; elle sera qualifiée à son premier passage.

## Arbitrage de Sylvain

(À compléter.)
