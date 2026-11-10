# Audit partiel avant fusion (2026-11-10)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 223633 signes envoyés, 4332 reçus (et 17205 de réflexion) ; réflexion `low` ; 66 s ; arrêt : stop
- Diff audité : `v2/` de `0158b86` à `9a9e5a5` (21 fichiers)
- Statut : avis reçu ; répondu par Claude ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot cohérent : la page « Mes documents » est remplacée par le volet « Documents » (arbre, recherche, favoris), avec l'étoile et le titre modifiable au bandeau. La séparation design/technique et les catalogues i18n sont respectés, les réglages de l'arbre sont bien inscrits dans l'ADR 0008, et les composants morts sont supprimés. Les points à éclaircir portent surtout sur le contrôle d'accès de la route des favoris, l'état de l'étoile en format S, et le rechargement systématique des vues d'équipes.

## Constats
1. **[question]**, grille 5, `v2/application/serveur/comptes.js:487` — La route `PUT/DELETE /api/documents/:doc/favori` n'effectue aucun contrôle d'accès dans le code montré ; le commentaire (« quiconque lit le document ») suppose une porte en amont dans le même gestionnaire. Le test (`v2/tests/services/partage.test.js:379`) attend bien 404 pour une personne sans accès, mais je ne peux pas vérifier d'où vient ce 404. Confirmer que la porte d'accès couvre cette route ; sinon, n'importe qui pourrait créer des favoris sur des documents qu'il ne lit pas.
2. **[important]**, grille 6, `v2/application/client/App.jsx:1102` et `v2/application/client/App.jsx:1180` — En format S, le volet est inactif à l'ouverture (`actif: !formatS || volet === 'gauche'`), donc `tous` est vide et `estFavori(docId)` renvoie toujours `false` : l'étoile du bandeau affiche « non favori » même si le document l'est, tant que le volet n'a pas été ouvert. La bascule reste inoffensive (PUT idempotent), mais l'état affiché est faux. Proposer de charger l'état favori du document courant indépendamment du volet, ou de masquer l'étoile tant qu'il n'est pas connu.
3. **[mineur]**, grille 6, `v2/adaptateurs/postgres/comptes.js:239` — `favori(document, personne, actif)` insère sans vérifier l'existence du document : un identifiant inconnu lève une erreur de clé étrangère (réponse 500) plutôt que 404. Sans conséquence si la porte d'accès du constat 1 existe (elle refusera avant), mais à confirmer avec elle.
4. **[mineur]**, grille 4, `v2/application/client/App.jsx:566` — `recharger` de `useVoletDocuments` charge toutes les vues d'équipes (`Promise.all` sur `d.equipes`) à chaque changement de document, alors que l'ancien code ne chargeait la vue d'une équipe qu'à l'ouverture de son onglet. C'est d'autant plus chargé que l'accueil en dépend aussi. Vérifier le besoin (l'arbre affiche toutes les équipes, donc c'est peut-être voulu) et, le cas échéant, ne recharger les équipes qu'à l'ouverture du volet.
5. **[mineur]**, grille 6, `v2/design/composants/Coquille.jsx:104` — Dans `TitreModifiable`, la validation peut partir deux fois (soumission puis perte de focus) et la comparaison `v !== renommer.valeur` se fait sur une valeur qui peut être périmée (le titre a changé depuis le rendu). Un garde simple (référence « déjà validé ») suffirait ; à défaut, constater que l'effet est limité à un double appel d'API.
6. **[mineur]**, grille 6, `v2/application/client/App.jsx:590` — Un document accessible à la fois personnellement et par une équipe figure deux fois dans `tous` : il apparaîtra deux fois dans la recherche, et le « plus récent » de l'accueil peut désigner l'un ou l'autre. Dédupliquer par identifiant dans `tous`.
7. **[question]**, grille 6, `v2/application/client/App.jsx:680` — Un document « Partagé avec moi » ne peut plus jamais être déplacé (`d.section === 'partage' ? false : …`), alors que l'ancien code suivait la capacité `ranger` du rôle. Est-ce une décision (déplacer le document d'un autre n'a pas de sens) ou un oubli ? Si c'est voulu, une ligne dans le commentaire suffirait.
8. **[mineur]**, grille 7, `v2/tests/design/composants.test.js:288` — L'étoile et le titre modifiable sont testés en rendu, l'API des favoris en test de service, mais aucun parcours de bout en bout ne bascule un favori depuis le bandeau (le test de pile ne la touche pas). Un petit scénario dans `contrats/pile` couvrirait le geste complet, y compris le constat 2.
9. **[question]**, grille 9, `v2/i18n/exceptions.json:9` — `documents.destination` est ajouté aux exceptions alors que la clé est bien une phrase traduite (présente dans `fr.json` et `en.json`). Si « exceptions » liste les clés dispensées d'un contrôle, la raison m'échappe ; à documenter ou retirer.

## Points de grille sans remarque
1, 2, 3, 8, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides
- 8 : citations valides
- 9 : citations valides

## Réponse de Claude

- **1 : faux.** La porte d'accès est en amont, dans le même gestionnaire : sans rôle sur le document, 404 avant toute sous-route (`comptes.js`, `roleSur` puis `document-introuvable`) ; le test le vérifie.
- **2 : juste, important.** Au téléphone, l'étoile restait « non favori » tant que le volet n'était pas ouvert : le volet est désormais chargé à l'ouverture dans tous les formats.
- **3 : faux.** Même porte que le constat 1 : un document inconnu rend 404 avant l'insertion.
- **4 : voulu.** L'arbre montre toutes les équipes et leurs documents, donc chaque vue d'équipe est lue ; c'est ce que faisait l'ancienne page pour l'équipe ouverte. À mesurer si le nombre d'équipes grandit.
- **5 : juste, mineur.** Une seule validation par édition (`TitreModifiable`).
- **6 : faux.** Un document d'une de mes équipes est écarté de `/api/documents` (section « équipe ») : il n'est lu qu'une fois, par la vue de l'équipe.
- **7 : voulu.** Un document partagé avec moi appartient à un autre : on ne le range pas chez soi ; l'ancienne page n'offrait déjà que « Me retirer » dans Partagé avec moi.
- **8 : juste, mineur.** Parcours ajouté : l'étoile met le document dans « Favoris » et l'en retire.
- **9 : faux.** `exceptions.json` liste les clés dont le texte est le même en français et en anglais, ce qu'un test interdit sinon : « Destination » s'écrit pareil.

## Arbitrage de Sylvain

(À compléter.)
