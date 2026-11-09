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
| **T4** design | rendu des composants, français, anglais, pseudo-langue ; en navigateur, contrôles d'affichage programmés (texte en dur, débordement, hors écran), clair et sombre, formats L (Mac) et M (iPad) ; captures relues par Claude | rendu React sans navigateur ; contrôles et captures dans Chromium | secondes |
| **T5** pile complète | parcours dans un vrai navigateur | Playwright : Chromium ; Chromium, WebKit (Safari) et Firefox dans GitHub | dizaines de secondes |
| **T6** en ligne | `v2.amend.ink` derrière le mot de passe | HTTP depuis la session de Claude ; parcours complets, WebSocket comprise, depuis GitHub | minute |

T0 à T4 tournent dans `npm test` à chaque commit. T5 à chaque clôture d'étape et à chaque envoi (GitHub). T6 après chaque déploiement et chaque nuit.

## Qui fait quoi

**Mistral suspendu depuis le 08/11/2026** (Sylvain) : jusqu'à nouvel ordre, Claude propose seul les scénarios par couche et les données piégées, et vérifie lui-même la couverture à la clôture. Ce qui suit décrit le fonctionnement prévu à la reprise.

- **Claude** écrit les tests, les lance dans sa session, ajoute ses propres scénarios à ceux de Mistral, rédige le rapport.
- **Mistral** :
  1. à l'ouverture d'une étape, propose des **scénarios par couche**, du simple au difficile, et un **corpus de données piégées** (Unicode, très long, injections…) que les tests T1 à T3 rejouent ;
  2. à la clôture, vérifie la **couverture** : chaque scénario retenu a-t-il son test ?

  Son jugement des captures d'écran s'est révélé peu fiable (`docs/v2-tests/etape-1-captures.md`) : l'affichage est vérifié par des contrôles programmés (pseudo-langue, débordements, éléments hors de l'écran), et Claude relit lui-même les captures.
- **GitHub Actions** fait tourner sans personne : T0 à T5 à chaque envoi, sur trois moteurs ; T6 chaque nuit, à la demande et après chaque fusion dans `main`, une fois que `v2.amend.ink` sert le commit fusionné (`version` de `/api/config`, attente de 15 minutes au plus ; le mot de passe est un secret du dépôt).
- **Sylvain** arbitre ; la recette à la main se réduit à ce qu'aucune machine ne fait : un vrai clavier français, un vrai iPad.

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

## Ce qu'on fait d'un constat

Un test qui échoue, une capture qui surprend, un avis de Mistral : avant toute proposition de correctif, le constat est **qualifié** selon les six vérifications des règles (`docs/v2-regles-developpement.md`, « Avant de proposer un développement ou un correctif ») : besoin établi, vrai défaut ou comportement voulu d’une fondation, bon moment, bon niveau, règle qui bloque la bonne solution, conséquences à terme. Il en sort une seule de ces suites :

1. **défaut de notre code, de l'étape en cours** : un test qui échoue d'abord, puis le correctif au niveau le plus bas ;
2. **défaut d'une fondation** : veille et signalement en amont ; contournement seulement s'il bloque, dans la couche prévue pour cela ;
3. **comportement voulu**, ou **question de produit** : noté, et posé à Sylvain si la réponse change quelque chose ;
4. **sujet d'une étape à venir** : noté dans le plan de cette étape, rien de plus.

## Limites

La session de Claude ne laisse passer ni les WebSocket ni les ports autres que 80 et 443, et n'a que Chromium : T5 y tourne sur la pile locale (même code) en Chromium seulement ; WebKit, Firefox et T6 complet tournent dans GitHub.
