# amend.ink v2 : procédure de test

Statut : **validée** par Sylvain le 08/11/2026, revue le même jour : tests légers et automatiques, couche par couche, de plus en plus intégrés ; on repart de zéro, sans s'appuyer sur les défauts de la v1.

## Le principe

**Attraper un défaut le plus tôt et le plus bas possible.** Chaque couche a ses tests, rapides et sans dépendance aux couches du dessus ; on ne monte d'un cran (navigateur, puis en ligne) que pour ce que rien de plus bas ne peut attraper.

| Couche | Ce qu'on teste | Comment | Durée visée |
|---|---|---|---|
| **T0** statique | frontières entre couches, styles et textes en dur, licences, une seule copie de Yjs | lint et contrats statiques | secondes |
| **T1** domaine, traductions | fonctions pures ; cas nominaux puis cas limites, dont un corpus de **données piégées** | `node:test`, sans réseau ni navigateur | < 1 s |
| **T2** adaptateurs, isolés | Yjs : deux documents en mémoire ; BlockNote : éditeur sans navigateur ; y/hub : contre Redis et PostgreSQL locaux, client sans navigateur | `node:test` | secondes |
| **T3** serveur | routes, codes, cookies, en processus | `node:test`, requêtes HTTP | < 1 s |
| **T4** design | rendu des composants, français, anglais, pseudo-langue ; en navigateur, contrôles d'affichage programmés (texte en dur, débordement, hors écran), clair et sombre, téléphone et ordinateur ; captures relues par Claude | rendu React sans navigateur ; contrôles et captures dans Chromium | secondes |
| **T5** pile complète | parcours dans un vrai navigateur | Playwright : Chromium ; Chromium, WebKit (Safari) et Firefox dans GitHub | dizaines de secondes |
| **T6** en ligne | `v2.amend.ink` derrière le mot de passe | HTTP depuis la session de Claude ; parcours complets, WebSocket comprise, depuis GitHub | minute |

T0 à T4 tournent dans `npm test` à chaque commit. T5 à chaque clôture d'étape et à chaque envoi (GitHub). T6 après chaque déploiement et chaque nuit.

## Qui fait quoi

- **Claude** écrit les tests, les lance dans sa session, ajoute ses propres scénarios à ceux de Mistral, rédige le rapport.
- **Mistral** :
  1. à l'ouverture d'une étape, propose des **scénarios par couche**, du simple au difficile, et un **corpus de données piégées** (Unicode, très long, injections…) que les tests T1 à T3 rejouent ;
  2. à la clôture, vérifie la **couverture** : chaque scénario retenu a-t-il son test ?

  Son jugement des captures d'écran s'est révélé peu fiable (`docs/v2-tests/etape-1-captures.md`) : l'affichage est vérifié par des contrôles programmés (pseudo-langue, débordements, éléments hors de l'écran), et Claude relit lui-même les captures.
- **GitHub Actions** fait tourner sans personne : T0 à T5 à chaque envoi, sur trois moteurs ; T6 chaque nuit et à la demande (le mot de passe est un secret du dépôt).
- **Sylvain** arbitre ; la recette à la main se réduit à ce qu'aucune machine ne fait : un vrai clavier français, un vrai iPhone.

## Le Mac et Chrome de Sylvain

Cette session tourne dans le nuage et n'atteint ni le Mac ni son Chrome. Deux façons de les mettre à contribution, au choix de Sylvain :

1. une **session Claude lancée sur le Mac** (application de bureau, ou `claude remote-control` dans le dossier du projet) : elle peut lancer les tests T5 et T6 avec le vrai Safari et le vrai Chrome, et piloter Chrome (extension Claude in Chrome) pour une exploration guidée par les scénarios ;
2. sinon, la courte recette à la main.

## À chaque étape

1. **Ouverture** : plan ; revue de Mistral ; scénarios par couche et données piégées de Mistral, complétés par Claude ; classement (couche, automatique ou à la main, ou écarté avec la raison) ; arbitrage de Sylvain.
2. **Pendant** : T0 à T4 à chaque commit ; T5 à chaque envoi (GitHub).
3. **Clôture** : rapport de tests ; captures et couverture jugées par Mistral ; arbitrage, fusion.
4. **Mise en ligne** : T6 ; recette courte.

Traces : `docs/v2-tests/` (scénarios et classement, données piégées, rapports). Consommation de Mistral en signes.

## Limites

La session de Claude ne laisse passer ni les WebSocket ni les ports autres que 80 et 443, et n'a que Chromium : T5 y tourne sur la pile locale (même code) en Chromium seulement ; WebKit, Firefox et T6 complet tournent dans GitHub.
