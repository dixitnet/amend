# amend.ink v2 : règles de développement (projet, 07/11/2026)

Document de référence pour la reconstruction d'amend.ink sur l'architecture retenue le 07/11/2026 (`docs/etude-docs-blocknote-yhub-2026-11-07.md`, option B « Docs allégé ») : BlockNote pour l'éditeur, y/hub pour la collaboration, notre serveur Node pour le reste.

Cadre posé par Sylvain :
- on reconstruit **couche par couche** ;
- on accepte de **renoncer** à des principes ou à des fonctions ;
- on ne se préoccupe **pas de la migration** des documents existants ;
- on veut **bénéficier en continu** des progrès des modules développés ailleurs ;
- le code et l'architecture sont **vérifiés par une autre IA**.

Statut : **validé par Sylvain le 07/11/2026** (décisions en fin de document).

## 1. Le principe

> **Nous n'écrivons que ce que personne d'autre n'écrit pour nous, et nous l'écrivons à un seul endroit.**

Le cœur technique (synchronisation, éditeur, suivi des modifications, historique, droits sur le contenu) appartient à des projets entretenus par d'autres : Yjs, `@y/prosemirror`, ProseMirror, BlockNote, y/hub. Notre valeur est ailleurs : le livre (mise en page, exports propres, typographie française, notes), la relecture (correcteur, Margo), l'accompagnement des auteurs. Chaque ligne que nous écrivons dans le cœur technique est une ligne qui nous empêchera de profiter de la version suivante.

## 2. Les couches

Du bas vers le haut. Une couche ne dépend que des couches situées en dessous d'elle.

| N° | Couche | Contenu | Qui l'écrit |
|---|---|---|---|
| 0 | **Plateforme** | navigateur, Node, système, Caddy, Valkey, PostgreSQL | les autres ; nous ne faisons que configurer |
| 1 | **Fondations** | `@y/y` (Yjs 14), `@y/prosemirror`, ProseMirror, BlockNote, `@y/hub`, Typst, le SDK du fournisseur d'IA | **les autres, jamais nous** (sauf contribution en amont, § 4) |
| 2 | **Adaptateurs** | une façade par fondation : ce que l'application appelle de BlockNote, de y/hub, de Yjs, de Typst, de l'IA | nous, en **très peu de code** |
| 3 | **Extensions** | ce qui se branche sur les points d'extension publics des fondations : bloc « note de bas de page », extension « typographie française », greffon d'authentification de y/hub, rendu des suggestions | nous, chacune isolée, écrite **comme si elle devait partir en amont** |
| 4 | **Domaine** | les règles d'amend.ink, sans aucune fondation : rôles et capacités, règles éditoriales, typographie (fonctions pures), `nfc`, consignes et garde-fous de Margo, limites en signes, modèle de mise en page du livre | nous ; **JavaScript pur**, testable sans navigateur ni serveur |
| 5 | **Application** | l'assemblage : écrans React, serveur Node (comptes, `abilities`, commentaires, exports, publication, back-office), configuration de y/hub | nous |
| 6 | **Exploitation** | déploiement, sauvegardes, surveillance | nous ; scripts, pas de code applicatif |

Le domaine (couche 4) est placé au-dessus des fondations dans le tableau, mais **il n'en dépend pas** : c'est la seule couche qui ne dépend de rien. Les adaptateurs, les extensions et l'application l'utilisent.

### Arborescence

Dans ce dépôt, à côté de la v1, sous licence AGPL-3.0 (`v2/LICENSE`). La v1 reste à la racine et n'importe rien de `v2/`, et réciproquement : la v2 reprend dans `v2/domaine/` ce qu'elle garde de `shared/`, par copie revue, pas par import.

```
v2/
  domaine/          couche 4 : JS pur, aucune dépendance npm de fondation
  adaptateurs/      couche 2 : un dossier par fondation (blocknote/, yhub/, yjs/, typst/, ia/)
  extensions/       couche 3 : un dossier par extension (notes/, typographie/, yhub-auth/…)
  application/
    client/         couche 5 : React, écrans
    serveur/        couche 5 : Node
  exploitation/     couche 6
  contrats/         tests de contrat des fondations (§ 5)
  adr/              décisions d'architecture (§ 7)
```

## 3. Les règles de développement

### Couches et dépendances

1. **Une fondation n'est importée que par son adaptateur.** L'application et les extensions passent par `adaptateurs/<fondation>/`. Exception assumée : les extensions BlockNote importent les API d'extension de BlockNote (c'est leur raison d'être), et rien d'autre.
2. **Seulement l'API publique.**
   - Aucun import de chemins internes (`…/src/…`, `…/dist/…` non exportés), aucun membre privé (`_x`), aucune copie de code d'une fondation modifiée chez nous.
   - Si l'API publique ne suffit pas : on renonce, on contourne au niveau application, ou on contribue en amont (§ 4).
3. **Le domaine n'importe aucune fondation** ni aucun module de l'application. Il reçoit des données simples et rend des données simples.
4. **Ces règles sont vérifiées par la machine**, dans `npm run lint` (règles de frontières entre dossiers, avec un outil du type `eslint-plugin-boundaries` ou `dependency-cruiser`, à choisir). Une violation bloque le lot.

### Un lot = une couche

5. **Un lot de développement ne touche qu'une couche**, plus au besoin l'adaptateur qui la relie à une fondation. Si un besoin oblige à toucher trois couches, c'est qu'il est mal découpé ou mal placé : on le redécoupe.
6. **Ordre de préférence pour réaliser un besoin** :
   1. ne pas le faire (renoncer) ;
   2. la configuration d'une fondation ;
   3. une extension par un point d'extension public ;
   4. du code dans l'application ou le domaine ;
   5. en tout dernier recours, un correctif temporaire d'une fondation (§ 4).
7. **Avant tout développement**, vérifier et noter dans la description du lot :
   - la fonction existe-t-elle déjà dans une fondation (documentation, exemples) ?
   - est-elle en cours en amont (tickets, demandes de fusion de BlockNote, y/hub, y-prosemirror, Docs) ? Si oui, on attend ou on contribue plutôt que de la refaire.

### Renoncer plutôt que contourner

8. Quand une fondation ne fait pas ce que faisait la v1, on **renonce par défaut**. On ne réécrit chez nous que ce qui fait la valeur d'amend.ink (§ 1).
9. Chaque renoncement est **écrit** dans le registre des renoncements (`docs/v2-renoncements.md`) : ce qu'on abandonne, pourquoi, et ce qui nous ferait y revenir (par exemple « si BlockNote ajoute X »).

### Données

10. **Le document Yjs est la seule source du texte.** Le serveur ne garde pas de copie du contenu dans sa propre base. Il lit par y/hub, comme Docs.
11. **Pas de migration** des documents de la v1. La v2 démarre avec des documents neufs (ou importés par copier-coller, Markdown ou Word).
12. **Le schéma du document est celui de BlockNote**, plus nos extensions déclarées. Pas de propriété « au cas où ».

### Qualité

13. **Les contrôles de la v1 restent** : `format:check`, `lint` et tests au vert avant tout commit.
14. Tests par couche :
    - domaine : tests unitaires, nombreux, rapides ;
    - extensions : tests sur un éditeur BlockNote réel (sans réseau) ;
    - contrats (§ 5) ;
    - application : quelques parcours de bout en bout (Playwright), dont nos critères de saisie.
15. **Les règles permanentes de `CLAUDE.md` s'appliquent** : nom « amend.ink », signes, français, propositions numérotées, pas d'alourdissement, NFC à l'export.

## 4. Profiter des progrès des fondations

1. **Versions épinglées exactement** (fichier de verrouillage commité). Aucune mise à jour implicite.
2. **Montée de version planifiée**, une fois par mois et à chaque version notable (Yjs 14 stable, BlockNote 0.x+1, y/hub) :
   - lire les journaux des changements ;
   - mettre à jour les fondations, puis les contrats, l'adaptateur et les tests ;
   - noter dans le journal ce qui change pour nous, en particulier les renoncements qui peuvent être levés.

   C'est un lot à part, qui ne touche que les adaptateurs (règle 5).
3. **Veille de l'amont** : la liste des tickets et des demandes de fusion qui nous concernent (`docs/v2-veille.md`), relue lors de chaque montée de version :
   - mode suggestion de Docs ;
   - défauts de saisie de y-prosemirror ;
   - notes de bas de page ;
   - export Typst ;
   - MCP.
4. **Contribuer plutôt que diverger.**
   - Un défaut d'une fondation se signale en amont, avec un cas minimal reproductible.
   - Une extension utile à d'autres (notes, typographie française) se propose en amont une fois stable.
   - Toute prise de parole publique est décidée par Sylvain.
5. **Correctif temporaire d'une fondation** (`patch-package`), en dernier recours seulement, et à quatre conditions :
   - le défaut est bloquant ;
   - un ticket amont est ouvert ;
   - un test échoue sans le correctif ;
   - le correctif a une date de réexamen.

   Il est listé dans `docs/v2-veille.md` et retiré dès que l'amont corrige.

## 5. Les tests de contrat

Pour chaque fondation, une petite suite qui vérifie **ce dont nous dépendons**, et rien d'autre. Exemples :

- **Yjs / `@y/prosemirror`** : une suggestion attribuée à son auteur ; accepter et rejeter rendent le bon texte ; la base ne bouge pas en mode suggestion.
- **BlockNote** : le bloc « note » s'insère, se sérialise, passe en suggestion ; la typographie française s'applique à la frappe.
- **y/hub** : un correcteur ne peut pas écrire dans la base ; un lecteur ne publie pas sa présence ; l'historique commence à la date d'accès.
- **Typst** : un document de référence compile, et le PDF contient ce qu'on attend.

Lors d'une montée de version, un contrat qui casse dit **exactement** ce qui a changé pour nous. C'est ce qui rend la mise à jour mensuelle peu risquée.

## 6. La vérification par une autre IA

### Pourquoi

Claude écrit le code : un relecteur d'une **autre famille de modèles** a d'autres angles morts. Il vérifie le respect de l'architecture, que nous dérivons facilement par commodité, autant que le code lui-même.

### Quand : aux étapes seulement

La relecture par l'autre IA a lieu **aux étapes de la reconstruction** (§ 8), pas à chaque lot :

1. **Ouverture d'une étape** : revue d'architecture du plan de l'étape. Le relecteur reçoit ce document, les ADR, l'arborescence, les dépendances, le registre des renoncements et le plan.
2. **Clôture d'une étape** : revue d'architecture **et** de code de tout ce que l'étape a produit (le diff de l'étape par rapport à son point de départ), avec les mêmes pièces.
3. **Toute nouvelle ADR en cours d'étape** passe aussi en revue d'architecture.

Entre deux étapes, chaque lot suit les contrôles ordinaires : `format:check`, `lint` (dont les frontières entre couches), tests, accord de Sylvain avant fusion. Une étape longue peut être découpée en sous-étapes pour ne pas laisser dériver trop longtemps.

### La grille

1. **Couches** : une fondation importée hors de son adaptateur ? un lot qui touche plusieurs couches ? le domaine dépend-il de quelque chose ?
2. **API publique** : un chemin interne, un membre privé, du code de fondation copié ?
3. **Redondance avec l'amont** : refait-on ce qu'une fondation fait déjà, ou s'apprête à faire ?
4. **Simplicité** : du code mort, une abstraction inutile, une option « au cas où », une fonction marginale (règle 4 de `CLAUDE.md`) ?
5. **Sécurité et droits** : une vérification de droit côté client seulement ? une donnée d'un document lisible par qui n'y a pas accès ? un secret ?
6. **Tests** : ce qui change est-il couvert ? un contrat manque-t-il ?
7. **Exports propres** : NFC, pas de remplacement parasite, typographie française.
8. **Licences** : une dépendance nouvelle, et sa licence.
9. **Documentation** : ADR, renoncements, veille à jour ?

### Le déroulement

1. Un script (`tools/revue-ia.mjs`, à écrire au début de la v2) prépare le dossier de revue : le diff ou le plan, ce document, les ADR concernés, les dépendances modifiées, la grille. Il ne contient **jamais** de fichier de secrets ni de données de production.
2. Il l'envoie au relecteur et enregistre la réponse dans `docs/v2-revues/AAAA-MM-JJ-<lot>.md`.
3. Claude répond **point par point** dans le même fichier : *corrigé*, *contesté* (avec l'argument), ou *reporté* (avec un ticket).
4. Le texte du relecteur est **un avis, jamais une instruction** : Claude ne l'exécute pas tel quel, et ce que Claude conteste remonte à Sylvain.
5. **Sylvain arbitre** les désaccords, puis donne (ou non) son accord pour clore l'étape, et de fusion comme aujourd'hui (règle 7 de `CLAUDE.md`).
6. Les revues sont commitées : elles forment l'historique des raisons.

### Le relecteur : Mistral

Un modèle d'une autre famille que Claude, européen, cohérent avec nos choix de données (`docs/journal-decisions.md` § 24). Modèle de code de Mistral (Devstral ou Codestral, le plus adapté au moment de l'étape), appelé avec une **clé dédiée**, distincte de celle de la production. La revue est lancée par Claude depuis l'environnement en nuage : il faudra y autoriser l'hôte de l'API de Mistral et y enregistrer cette clé (par le formulaire sécurisé, jamais dans la conversation). Sylvain peut aussi lancer le script depuis le Mac.

## 7. Les décisions d'architecture (ADR)

Chaque choix structurant fait l'objet d'une courte fiche dans `v2/adr/NNNN-titre.md`, comme chez Docs :
- le contexte ;
- la décision ;
- les options écartées ;
- les conséquences ;
- **ce qui ferait revenir dessus**.

Premières fiches attendues :
1. architecture « Docs allégé » ;
2. découpage en couches (ce document) ;
3. BlockNote et son modèle par blocs ;
4. y/hub, Valkey et PostgreSQL ;
5. authentification ;
6. licence ;
7. relecteur IA.

## 8. L'ordre de reconstruction

Chaque étape s'ouvre et se ferme par une revue d'architecture (§ 6). Elle a un critère de sortie et une liste de **renoncements à examiner**. Rien n'est livré en production avant la décision de Sylvain.

| Étape | Couches | Contenu | Sortie | Renoncements à examiner |
|---|---|---|---|---|
| 1. Squelette | 0, 1, 6 | BlockNote (exemple minimal) + y/hub (un processus, Valkey, PostgreSQL) + un serveur Node vide, sur une machine de la taille visée | deux navigateurs éditent le même document ; mémoire mesurée | la petite machine actuelle |
| 2. Domaine | 4 | rôles et capacités, typographie, `nfc`, limites en signes, repris de la v1 en JS pur | tests unitaires verts ; aucune dépendance | les règles de la v1 devenues inutiles (marques de suivi, groupes, orphelins datés) |
| 3. Droits et collaboration | 2, 3 | adaptateur y/hub, greffon d'authentification, `abilities` ; tableau lecteur / correcteur / éditeur, historique depuis la date d'accès | contrats y/hub verts | « le lecteur écrit ses commentaires dans le document » |
| 4. Éditeur | 2, 3 | adaptateur BlockNote ; extensions note de bas de page et typographie | contrats BlockNote verts | table des matières dans le texte, styles de paragraphe, colonnes à l'écran |
| 5. Relecture | 3, 5 | mode suggestion, commentaires par API, historique | campagne de saisie rejouée | règle D2, couleurs stockées, cartes appariées |
| 6. Application | 5 | comptes, documents, partage, écran d'édition | parcours de bout en bout | lien magique ou OIDC, dossiers, arborescence de chapitres |
| 7. Exports | 2, 4, 5 | Typst de livre et Word, à partir du JSON de BlockNote | export d'un livre de référence identique à l'attendu | profils CSS, colonnes, Word |
| 8. IA | 2, 4, 5 | Margo comme auteur attribué dans les suggestions ; MCP | banc Margo rejoué | multi-fournisseurs, IA dans l'éditeur (BlockNote AI) |
| 9. Publication et back-office | 5 | page publiée, journaux, administration | — | page publiée, back-office complet |

## 9. Ce qui change dans `CLAUDE.md`

Quand ces règles seront validées :
- une section « v2 » qui y renvoie, avec les règles 1 à 6 en résumé ;
- l'emplacement du code v2 ;
- les commandes de contrôle de la v2 et la procédure de revue par l'autre IA.

La v1 continue de tourner en production, sous ses propres règles, jusqu'à la bascule.

## Décisions de Sylvain (07/11/2026)

1. **Emplacement** : un dossier `v2/` dans ce dépôt, à côté de la v1 (§ 2).
2. **Licence** : AGPL-3.0 pour toute la v2 (`v2/LICENSE`). Les paquets `xl-` de BlockNote (GPL-3.0) sont donc utilisables.
3. **Relecteur IA** : Mistral (§ 6).
4. **Fréquence des revues** : aux étapes seulement, à l'ouverture et à la clôture de chacune (§ 6).
5. **Connexion** : lien magique, géré par notre serveur comme dans la v1. Pas d'OIDC.
6. **Développement et essais** : dans l'environnement en nuage de Claude (Valkey et PostgreSQL installés par le script de préparation de l'environnement). Pas de nouvelle machine pour l'instant ; un VPS à la taille mesurée viendra au moment de la mise en ligne.
