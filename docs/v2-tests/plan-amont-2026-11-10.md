# amend.ink v2 : ce que l'amont dit de nos problèmes, et un plan qui anticipe ses évolutions (10/11/2026)

Suite de `docs/v2-tests/synthese-2026-11-10.md` (P1 à P17). Recherche du 10/11/2026 dans les dépôts de BlockNote, Yjs, `@y/prosemirror`, y/hub, lib0 et Docs (tickets, PR, journaux des changements, code de `main`). **Rien n'est corrigé ici** ; les choix sont à faire par Sylvain.

## 1. Ce qu'on a appris de l'amont

### Nos versions sont les dernières publiées

BlockNote 0.57.0 (30/10), `@y/prosemirror` 2.0.0-15 (11/10, préversion), `@y/y` 14.0.0-rc.29 (15/10, préversion), lib0 1.0.0-rc.36, y/hub 0.10.1 (16/10). Aucune montée de version ne corrige aujourd'hui un de nos problèmes.

### Le mode suggestion est expérimental en amont

- BlockNote ne le documente pas ; une PR ouverte (TypeCellOS/BlockNote#2989) le dit « experimental », avec des identifiants « slated for rework ».
- `@y/prosemirror` 2.0 est en préversion ; ses jalons M1 à M3 n'ont pas de date ; Yjs 14 n'a pas de date de version stable.
- **Docs n'a pas de mode suggestion** : le ticket suitenumerique/docs#2491 (« EPIC Suggestion mode ») est au backlog ; le travail est annoncé « côté BlockNote et Yjs », sur un modèle différent du nôtre : **chaque suggestion dans une copie (fork) du document**, affichée sur l'original jusqu'à décision ; première phase sans mise en forme ni changement de type de bloc.
- Conséquence : nous sommes en avance sur Docs et sur l'amont, sur une fonction qui peut changer de modèle. C'est le risque principal de ce plan.

### Classement des problèmes

**A. Défauts amont connus, ouverts, sans correctif annoncé**

| | Problème | Référence | État |
|---|---|---|---|
| P1 | Écran blanc « diffing deletes unsupported » | yjs/y-prosemirror#288 | ouvert le 04/11/2026, même erreur (autre déclencheur : coupure de bloc en suggestion), sans réponse |
| P3 | La frappe au contact d'une suggestion la prolonge | yjs/y-prosemirror#245, et `CAVEATS.md` | ouvert depuis le 18/05/2026, jalon M2, au backlog ; le mainteneur : « Content adjacent to suggestions is always a suggestion », reporté pour complexité le 08/09/2026 |
| P5 | Suppression de paragraphe en suggestion | yjs/y-prosemirror#263 (refuser une suppression suggérée) | ouvert depuis le 08/06/2026 |
| P7 | Mise en forme en suggestion | yjs/y-prosemirror#289, #241 (marques mal synchronisées) | ouverts ; voisins, pas notre cas exact |
| P4, P11 | Coupure, fusion, paragraphe nouveau ; description sur plusieurs blocs | galerie d'exemples de BlockNote (« Broken merge… a flat document model would be needed ») ; `CAVEATS.md` (« optimal rendering will need schema-level collaboration ») | limites documentées, rien de prévu |
| P9 | Lettres entremêlées à la frappe simultanée au même endroit | rien en amont ; l'algorithme Fugue (Weidner, Kleppmann, 2025) traite ce cas, mais aucun projet de l'adopter dans Yjs | propriété de l'algorithme, rien de prévu |

**B. Défauts amont non signalés (à signaler, sur décision)**

| | Problème | Ce qu'on sait |
|---|---|---|
| — | `getSuggestionAtSelection` cherche des marques qui n'existent pas | sûr, lu dans le code de `main` ; aucun ticket |
| P8 | Typographie et règles de saisie inactives en suggestion ; « mismatched transaction » | diagnostic posé dans une PR fermée (TypeCellOS/BlockNote#2843), jamais intégrée ; la refonte des règles de saisie en cours (#3310) n'en parle pas |
| P4 | Accepter un paragraphe proposé ne fait rien | aucun ticket ; à réduire à un cas minimal |
| P6 | Suggestion affichée, absente du panneau | voisin : identifiants périmés des blocs en suppression suggérée (#2989) |
| P1 | notre déclencheur (fil résolu, puis éditeur recréé en suggestion) | à ajouter à y-prosemirror#288 |

**C. Ce qui relève de notre code (l'outil existe déjà)**

| | Problème | Ce que l'amont et Docs fournissent |
|---|---|---|
| P2 | Droits changés, page ouverte | y/hub 0.10.1 a `recheckAuth(document, { users })` : chaque connexion revérifie ses droits et se ferme (code 4401) s'ils ont changé ; **nous ne l'appelons pas**. Docs l'appelle à chaque changement d'accès (`reset-connections`), ne se reconnecte pas sur 4401, relit les droits et reconstruit l'éditeur. |
| P12 | Fils résolus introuvables | BlockNote fournit la liste latérale des fils (`ThreadsSidebar`) ; Docs l'affiche avec un filtre « Ouverts / Résolus » et sait rouvrir. |
| P14 | Revenir à une version | Docs passe par la fonction de retour arrière de y/hub (`rollback`), puis recharge les fils ; il ne restaure pas les fils, seulement leurs marques. |
| P13 | Fils orphelins | état prévu par BlockNote (`orphan`) ; Docs ne fait pas mieux (supprime seulement les fils vides). |
| P10 | « Quelqu'un » avant le nom | `resolveUsers` : chargement des noms, chez nous. |
| P15 | Collage de texte brut | BlockNote, depuis mai 2026 : une fin de ligne donne un saut de ligne, deux donnent un paragraphe (choix voulu). Nous obtenons des lignes **sans aucun saut** : écart chez nous (collage ou typographie), à confirmer à la main. |
| P16 | Retard d'une lectrice | y/hub a corrigé en 0.10.0 des reconnexions en boucle des lecteurs (signalées par Docs) ; à remesurer avant de conclure. |

## 2. Évolutions attendues, et ce qu'elles changeront

| Évolution | Quand | Ce qu'elle peut changer | À anticiper |
|---|---|---|---|
| `@y/prosemirror` 2.0, jalon M2 | sans date | P3 (frappe qui prolonge) | ne rien construire qui dépende du comportement actuel |
| Yjs 14 stable | sans date | API stabilisée | montée de version à prévoir |
| y/hub, version suivante | non publiée, déjà au journal | **rupture** : synchronisation initiale lancée par le client ; plus d'envoi initial du serveur aux connexions en lecture | adapter notre client et nos contrats à cette version ; vérifier les lecteurs (P16) |
| BlockNote : refonte des règles de saisie (#3310) | PR ouverte du 06/11 | P8 (typographie en suggestion), notre extension typographie | relire la PR ; réessayer P8 à sa sortie |
| BlockNote : suggestions « à retravailler » (#2989) | PR ouverte | identifiants de suggestions, P6, notre panneau | garder le panneau mince, dans l'adaptateur |
| Docs : Yjs 14 dans l'interface (#2895), puis mode suggestion (#2491) | PR en brouillon ; épopée au backlog | le modèle de référence (copie du document par suggestion) | aligner nos choix de produit sur le leur quand il paraîtra |

## 3. Plan proposé (numéroté, à arbitrer)

### Tout de suite (sans développement)

1. **Inscrire ces références dans la veille** (`docs/v2-veille.md`) : P1 → y-prosemirror#288, P3 → #245, P5 → #263, P7 → #289/#241, P8 → BlockNote#2843/#3310, P2 → `recheckAuth`, y/hub (rupture annoncée), Docs#2491 et #2895.
2. **Faire de la campagne le test de chaque montée de version** : à chaque nouvelle version de BlockNote, `@y/prosemirror`, Yjs ou y/hub, rejouer les familles A à G dans GitHub (Chromium, WebKit) et comparer à la synthèse du 10/11 ; un problème qui disparaît sort du registre, un nouveau y entre. Coût : nul (le flux existe).
3. **Signaler en amont**, avec un cas minimal hors d'amend.ink (décision de Sylvain, comme les signalements déjà en attente dans la veille) : `getSuggestionAtSelection` (sûr) ; notre déclencheur de P1 sur y-prosemirror#288 ; P4 et P8 après réduction.

### Ce qui relève de nous et ne dépend pas de l'amont (lots, sur décision)

4. **P2, droits à chaud** (bloquant) : reprendre le montage de Docs (appel de `recheckAuth` à chaque changement d'accès, arrêt sur 4401, relecture des droits). Outil déjà dans notre version ; c'est une question d'accès, à traiter avant tout invité réel.
5. **P12, fils résolus** : afficher la liste latérale des fils de BlockNote avec le filtre « Ouverts / Résolus », comme Docs (lot de design pour l'apparence, technique pour le branchement).
6. **P10, P15, P16** : petits écarts chez nous, à établir (P15 à confirmer à la main, P16 à remesurer).
7. **P14, P13** : aligner la restauration de version sur Docs (retour arrière de y/hub, puis rechargement des fils) ; les fils orphelins restent, comme chez Docs.

### Le mode suggestion : une décision de produit, vu l'état de l'amont

P1, P3 à P8 et P11 viennent d'une fonction expérimentale en amont, que Docs n'a pas encore. Trois voies :

8. **Garder le suivi tel quel et attendre l'amont** : on documente les limites pour les utilisateurs, on signale, on rejoue la campagne à chaque version. Aucun code de contournement.
9. **Garder le suivi, avec les seuls contournements sûrs et réversibles, dans l'adaptateur** : celui de P1 est prêt (`correctif-suivi-en-attente.patch`) ; pour P3, un geste simple (par exemple quitter la suggestion avant d'écrire en direct) plutôt qu'une réécriture ; chaque contournement inscrit dans la veille avec sa condition de retrait.
10. **Réduire le suivi à ce qui marche** en attendant l'amont : insertions, suppressions et remplacements dans un paragraphe (C1, B1 à B5 passent) ; pas de mise en forme ni de coupure de paragraphe en suggestion (P4, P5, P7) ; c'est aussi la première phase prévue par Docs. Au registre des renoncements, avec sa condition de levée.

Les voies 8 à 10 se combinent avec 1 à 7. Ce qu'il ne faut pas faire : corriger les fondations nous-mêmes (règle 3 de la v2), ou construire un mode suggestion à nous à côté de celui de BlockNote : l'amont et Docs vont vers un autre modèle (une copie par suggestion), et tout ce code serait à jeter.

## Sources

y-prosemirror : https://github.com/yjs/y-prosemirror/issues/288, /245, /263, /289, /241, /235, `CAVEATS.md` ; y/hub : https://github.com/yjs/yhub/blob/master/API.md (`recheckAuth`), https://github.com/yjs/yhub/pull/72, https://github.com/yjs/yhub/issues/73, `CHANGELOG.md` ; BlockNote : https://github.com/TypeCellOS/BlockNote/pull/2989, /2843, /3310, /2712, /2737, `CHANGELOG.md`, `examples/07-collaboration/14-suggestion-gallery` ; Docs : https://github.com/suitenumerique/docs/issues/2491, /2156, https://github.com/suitenumerique/docs/pull/2895, /2725, /2556, `src/yhub-server/src/api.ts`, `useProviderStore.tsx`, `useRestoreDocVersion.tsx`, `CommentSideBar.tsx` ; Fugue : https://arxiv.org/abs/2305.00583.
