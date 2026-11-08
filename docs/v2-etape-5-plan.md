# amend.ink v2 : plan de l'étape 5, « Relecture »

Statut : **arbitré** par Sylvain le 08/11/2026 (voir « Arbitrage » en fin de plan) ; développement lancé. Revue d'ouverture par Claude (grille des règles, § 6) ; scénarios de test par Claude (`docs/v2-tests/etape-5-scenarios.md`).

Références : `docs/v2-regles-developpement.md`, `docs/v2-etape-2-plan.md` (rôles), `v2/adr/0003-blocknote.md`, `v2/adr/0004-yhub.md`.

## But

La relecture d'un livre à plusieurs : le correcteur propose (suggestions), tout le monde commente selon son rôle, l'éditeur accepte ou refuse, et l'historique permet de revenir en arrière. Avec ce que BlockNote et y/hub savent déjà faire, le moins possible de code à nous.

## Ce que les briques font déjà (vérifié dans BlockNote 0.57 et y/hub 0.10.1)

| Besoin | Brique | Ce qu'elle fournit |
|---|---|---|
| Suggestions | BlockNote (`SuggestionsExtension`) | mode suggestion sur un **document de suggestions** distinct (`suggestionDoc`) : écrire en suggestion, voir, accepter ou refuser une suggestion ou toutes ; auteur et couleur par personne ; info-bulle d'attribution |
| Lieu des suggestions | y/hub | des **branches** d'un même document (`?branch=…` sur la WebSocket et l'API), chacune avec ses permissions : la branche principale et une branche de suggestions (le montage de Docs) |
| Commentaires | BlockNote | fils, réponses, réactions, résolution ; deux façons de les stocker : dans le document Yjs (`YjsThreadStore`, droits vérifiés par le navigateur seulement), ou lus dans le document et **écrits par notre serveur** (`RESTYjsThreadStore`, droits vérifiés côté serveur) ; interface fournie (bulle de saisie, fil, panneau des fils) |
| Historique | BlockNote + y/hub (`YHubVersioningExtension`) | liste des modifications par auteur et par date, comparaison, versions nommées, retour à une version ; panneau fourni (`@blocknote/react/versioning`) ; y/hub donne l'historique **à partir d'une date** par personne |
| Droits | y/hub | par branche : lire, écrire, historique, retour arrière ; décidés par notre serveur à chaque connexion |

## Ce qui est établi

- Les rôles et leurs capacités (étape 2) : lecteur (`lire`), correcteur (`commenter`, `suggerer`), éditeur (`ecrire`, `arbitrer`, `restaurer`, `inviter`), propriétaire.
- Le mode suggestion est imposé au correcteur ; y/hub en est la garantie (le correcteur ne peut pas écrire dans la branche principale).
- L'historique visible à partir de la date d'accès (idée reprise de Docs, notée à l'étape 2).
- Le design reste Mantine et BlockNote tels quels ; toute apparence nouvelle est ta décision.

## Questions pour Sylvain

### 1. Où écrire les commentaires

| Option | Pour | Contre |
|---|---|---|
| **a. Écrits par notre serveur** (`RESTYjsThreadStore`, le montage de Docs) | les droits (qui commente, qui supprime le commentaire d'un autre) sont vérifiés **par le serveur** ; le correcteur commente sans écrire dans le texte | un peu de code serveur : quatre ou cinq routes qui vérifient le rôle et écrivent dans le document par l'API de y/hub |
| b. Dans le document de suggestions (`YjsThreadStore`) | aucun code serveur | les droits des commentaires ne sont vérifiés que par le navigateur : un correcteur qui force son navigateur pourrait modifier ou supprimer les commentaires des autres ; contraire à la règle « pas de contrôle côté client seulement » |

Proposition : **a**.

### 2. Le lecteur peut-il commenter ?

À l'étape 2, la question était renvoyée ici. Deux réponses possibles :
1. **Non** : le lecteur lit seulement ; c'est le correcteur qui relit et commente.
2. **Oui**, comme le « commentateur » de Docs : il commente sans proposer de suggestion.

### 3. Qui voit l'historique, et depuis quand ?

Proposition, reprise de Docs : chaque rôle voit l'historique **à partir de sa date d'accès** au document ; l'éditeur et le propriétaire peuvent nommer une version et **revenir** à une version (`restaurer`). Il faut pour cela enregistrer la date d'accès dans la table des accès (provisoire jusqu'à l'étape 6).

### 4. Accepter et refuser : quelle interface

BlockNote fournit les fonctions (accepter ou refuser une suggestion, toutes les suggestions) et l'info-bulle qui montre l'auteur, mais **pas de boutons** pour accepter ou refuser. Il faudra donc une petite interface. Proposition : un essai en captures de deux ou trois dispositions (boutons dans l'info-bulle ou la barre de mise en forme quand le curseur est dans une suggestion ; « tout accepter, tout refuser » dans l'en-tête), avec les composants Mantine sans réglage ; tu choisis.

### 5. Présence du correcteur et du lecteur

Aujourd'hui, un correcteur ou un lecteur ne publie pas sa présence (curseur, « personnes sur ce document ») : les autres ne le voient pas (constat de l'étape 2). Proposition : leur permettre de **publier leur présence** (y/hub, droit de présence), sans droit d'écrire.

### 6. Les renoncements prévus au § 8 pour cette étape

1. **Règle D2 de la v1** (une correctrice ne fait pas disparaître la proposition d'une autre personne) : dans BlockNote, effacer la suggestion d'un autre la supprime. Proposition : **renoncer**, et adopter la règle de l'outil ; la faire respecter demanderait d'analyser chaque modification côté serveur, du code à nous.
2. **Couleurs stockées** (v1) : BlockNote donne une couleur par personne, calculée ; proposition : renoncer.
3. **Cartes appariées** (affichage des modifications de la v1) : proposition : renoncer, au profit de l'affichage de BlockNote.

## Risques connus, à vérifier en premier

1. **Typographie en mode suggestion** : un remplacement à la frappe doit rester une seule suggestion propre (risque noté à l'étape 4).
2. **Notes de bas de page en mode suggestion** : insérer, modifier, supprimer une note en suggestion, puis accepter ou refuser.
3. **Mémoire** : un second document (la branche de suggestions) par document ouvert ; à mesurer.

## Contenu, en lots (après arbitrage)

0. **Essais** dans le brouillon : suggestions sur une branche y/hub avec la typographie et les notes (risques 1 et 2) ; dispositions pour accepter et refuser (captures).
1. **Adaptateur y/hub et serveur** : branche de suggestions et permissions par rôle (lecture de la principale et écriture des suggestions pour le correcteur ; les deux pour l'éditeur ; présence pour tous) ; date d'accès et historique depuis cette date ; routes des commentaires (si option a).
2. **Adaptateurs Yjs et BlockNote** : second document (suggestions), mode suggestion imposé au correcteur, commentaires, historique.
3. **Interface** : composants de BlockNote tels quels ; accepter et refuser selon ton choix ; textes traduits.
4. **Tests** par couche, et la **campagne de saisie** de la v1 rejouée (critère de sortie du § 8).

## Critères de sortie

1. Un correcteur ne peut que proposer : rien de ce qu'il tape n'atteint la branche principale, quelle que soit la façon de s'y prendre.
2. L'éditeur accepte ou refuse chaque suggestion, ou toutes ; le résultat survit au rechargement et converge à plusieurs.
3. Les commentaires respectent les rôles, vérifiés côté serveur (si option a).
4. L'historique montre les modifications à partir de la date d'accès ; l'éditeur revient à une version.
5. La campagne de saisie de la v1 est rejouée ; tests T0 à T5 verts ; audit partiel avant la fusion.

## Hors périmètre

Invitations, comptes, stockage définitif des accès (étape 6) ; exports des suggestions et des commentaires (étape 7) ; Margo comme auteur de suggestions (étape 8) ; sauvegarde de la base v2 (mise en ligne avec de vrais textes).

## Arbitrage de Sylvain (08/11/2026)

1. Commentaires **écrits par notre serveur** (`RESTYjsThreadStore`, droits vérifiés côté serveur).
2. Le lecteur **ne commente pas** : il lit seulement.
3. **Plus simple : tout le monde a accès à tout l'historique** (pas de date d'accès à enregistrer) ; nommer une version et y revenir restent à l'éditeur et au propriétaire (`restaurer`).
4. Accepter et refuser : essai de deux ou trois dispositions en captures, Sylvain choisit.
5. Correcteur et lecteur publient leur présence, sans droit d'écrire.
6. Renoncements : règle D2, couleurs stockées, cartes appariées (registre, n° 9 à 11).


## Essais du lot 0 (08/11/2026)

Page d'essai locale (deux postes, chacun avec son document principal et son document de suggestions, reliés comme par y/hub), BlockNote 0.57 tel quel, avec le schéma du livre, la typographie et les notes.

Ce qui marche :
1. Le mode suggestion : ce que tape le correcteur reste dans le document de suggestions ; le principal ne change pas avant l'acceptation ; « tout accepter » et « tout refuser » donnent le bon résultat chez les deux postes.
2. Les notes en mode suggestion (risque 2) : insérer une note et écrire dedans fait une suggestion ; l'accepter la porte dans le principal, la refuser la retire.

Ce qui ne marche pas :
3. **Typographie en mode suggestion (risque 1)** : nos règles ne s'appliquent pas (guillemets droits, pas d'espace fine), avec l'erreur « Applying a mismatched transaction ». C'est un **défaut amont** : les remplacements de BlockNote lui-même (« # » → titre, « - » → liste) échouent de la même façon. Cause : le module de règles de saisie envoie deux transactions de suite, la seconde préparée sur un état que la synchronisation du mode suggestion a déjà changé. Une variante de notre extension qui fait le remplacement **en une seule transaction** fonctionne en mode suggestion (« monde !» donne une seule suggestion propre, avec l'espace fine, dans le texte comme dans une note). Noté dans la veille.
4. **Ancre des commentaires du correcteur** : quand le correcteur (mode suggestion) commente un passage, le fil est créé mais **aucune marque n'est posée dans le texte** (le commentaire n'est rattaché à rien) ; pour l'éditeur, la marque est posée. La marque d'un commentaire vit dans le texte du document principal, où le correcteur n'écrit pas.
5. **Correction du plan** : Docs n'utilise pas `RESTYjsThreadStore`. Son magasin de fils est le sien (routes de son serveur pour les fils et les commentaires), et **la marque est posée par le navigateur**, dans le texte ; une personne qui ne peut pas modifier le document n'a pas d'interface de commentaire. Docs ne résout donc pas le cas de notre correcteur.

Questions posées à Sylvain : voir le journal (08/11/2026).
