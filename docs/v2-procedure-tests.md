# amend.ink v2 : procédure de test

Statut : **projet** (08/11/2026), à valider par Sylvain.

## Qui fait quoi

- **Claude** écrit et lance les tests automatiques, et rédige le rapport.
- **Mistral** cherche ce qui peut casser, puis vérifie que c'est testé.
- **Sylvain** fait une courte recette à la main de ce qu'aucune machine ne vérifie ici : vrais appareils, collaboration en ligne, clavier français.

## À chaque étape, trois moments

1. **Ouverture** : Mistral lit le plan et propose des scénarios qui pourraient casser (droits, concurrence, données limites, saisie). Claude les classe : *testé automatiquement*, *à vérifier à la main*, ou *écarté* (avec la raison). Sylvain arbitre.
2. **Clôture** : Claude lance tous les tests (`npm test`, `npm run test:pile`, `npm run mesurer`) et écrit le rapport : ce qui passe, ce qui échoue, ce qui n'a pas pu tourner. Mistral vérifie que chaque scénario retenu a bien son test. Sylvain arbitre et fusionne.
3. **Mise en ligne** : Claude vérifie ce qui passe en HTTP (refus sans mot de passe, version servie). Sylvain fait la recette à la main (un quart d'heure) et lance `mesurer.sh`. Un défaut trouvé devient d'abord un test, puis il est corrigé.

## Recette à la main de l'étape 1

1. Mac, Safari : `https://v2.amend.ink/#recette`, mot de passe, un nom : « Synchronisé ».
2. iPhone, même document : la frappe de l'un apparaît chez l'autre.
3. Clavier français : « être » avec la touche morte ^, sans « ^ » resté.
4. Couper le Wi-Fi de l'iPhone, taper, le rétablir : le texte arrive.
5. Recharger : le texte est là.
6. Terminal du Mac : `nc -vz -w 5 92.243.27.71 4400` doit échouer.
7. VPS : `bash /opt/amend/app/v2/exploitation/prod/mesurer.sh`.

## Où sont les traces

Dans `docs/v2-tests/`, un fichier par étape : scénarios et classement, rapport, recette cochée.

## Limites

Mon environnement ne laisse passer ni les WebSocket ni les ports autres que 80 et 443, et seul Chromium y est installé. La collaboration se teste donc sur la pile locale (même code), et en ligne seulement à la main.
