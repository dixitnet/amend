# amend.ink v2 : modèles de mise en page du PDF (suite de l'étape 7)

12/11/2026. Demande de Sylvain : « compléter la gestion des modèles de documents », export PDF seulement ; « on aura à la fin : 1 modèle par défaut (A4 simple), des modèles de l'instance (pour l'admin) et des modèles d'équipe ; développer l'interface du back de l'instance avec cette idée en tête ; chaque document choisit son modèle mais pourra en dériver sur certaines caractéristiques à fixer plus tard ». « Lances tout. »

## 1. Comment fait Docs

Rien de neuf depuis l'ADR 0011 : Docs a retiré ses modèles d'export (`Template`, v3.0.0) ; son export ne propose que le format. Tout ce chantier est l'écart déjà décidé (ADR 0011), étendu aux modèles de l'instance.

## 2. Architecture (décisions du 12/11/2026)

1. **Un seul modèle en code** : « A4 simple » (`a4`), le modèle par défaut (design, valeurs proposées par Claude, à valider sur capture du PDF).
2. **Modèles de l'instance** : en base (`amend.modeles`, équipe vide), créés et réglés par les administrateurs au back-office, toujours sur la base `a4` ; **tous les réglages** du modèle leur sont ouverts (liste `livre.reglablesInstance`, bornée). L'administrateur choisit le **modèle par défaut de l'instance**.
3. **« TàT - Poche »** quitte le code : il est recréé une fois, au démarrage du serveur, en modèle de l'instance (base `a4`, écarts reproduisant ses valeurs) ; les documents, défauts d'équipe et modèles d'équipe qui le citaient sont repris ; il devient le défaut de l'instance (les documents existants gardent leur mise en page).
4. **Modèles d'équipe** : base `a4` ou un modèle de l'instance ; écarts dans la liste fermée des équipes (`livre.reglables`). Une correction du modèle de l'instance atteint les modèles d'équipe qui en dérivent, sauf sur leurs écarts. Un modèle de l'instance supprimé rend ses modèles d'équipe à la base `a4`.
5. **Modèle d'un document** : choisi pour lui, sinon le défaut de son équipe, sinon le défaut de l'instance, sinon `a4`. Les écarts propres à un document viendront plus tard (caractéristiques à fixer).
6. Le serveur calcule le modèle complet (domaine, `appliquerEcarts`, deux étages) et l'envoie ; le client y joint les fichiers de police du catalogue.

## 3. Ce que le gabarit apprend (lot 1)

- Titre courant en haut de page, à gauche et à droite : rien, titre du document, chapitre en cours ; absent des pages d'ouverture de chapitre (v1, `entete`).
- Folio : position (bas centre, bas extérieur, haut extérieur, aucun), numéro de départ, présent ou non sur les pages d'ouverture.
- Début de chapitre : continuer, page suivante, belle page (au lieu d'un booléen).
- Séparateur de scène : ligne blanche, astérisme (⁂), trois astérisques, petit trait.
- Césure désactivable.
- Table des matières : niveau 1 en gras.
- Liens en noir, auteur dans les propriétés du PDF.

Reportés (lot suivant, sur un livre réel) : tableaux et listes calés sur la grille, images pleine page, polices du catalogue, notes de bas de page (chantier à part).

## 4. Lots

| Lot | Couche | Contenu |
|---|---|---|
| M1 | domaine | gabarit (§ 3), type de réglage « choix », contrôle des lignes du chapitre, modèle retenu à quatre étages, résolution à deux étages ; tests |
| M2 | design | modèle `a4`, valeurs de TàT pour la reprise, listes `reglables` (équipes) et `reglablesInstance` (administrateurs), groupes du formulaire, virgule décimale ; ADR 0008 |
| M3 | PostgreSQL + serveur | modèles de l'instance (équipe vide), défaut de l'instance, routes `/api/admin/modeles…`, reprise de TàT, modèles complets envoyés au client ; tests des services |
| M4 | client | export sur le modèle complet ; bases des modèles d'équipe (A4 et instance) ; rubrique « Modèles » du back-office ; aperçu « Exporter le document ouvert avec ce modèle » ; textes ; tests de la pile |

## 5. Plus tard

Écarts propres à un document (à fixer par Sylvain) ; Word ; polices ; tableaux, listes et images sur la grille.

## 6. Ce qui est fait (12/11/2026)

Lots M1 à M4 : domaine (gabarit, réglage « choix », contrôle des lignes du chapitre, `resoudreModele`, `ecartsVers`, modèle retenu à quatre étages), design (A4, reprise de TàT, deux listes de réglages groupés, virgule), PostgreSQL et serveur (modèles de l'instance, défaut, reprise, routes `/api/admin/modeles` et `/api/admin/modele-defaut`, modèles complets envoyés), client (export sur le modèle complet, modèles d'équipe sur l'A4 ou l'instance, « Essayer », rubrique « Modèles de mise en page » du back-office). Correction au passage : le folio manquait sur la page de la table des matières (prise pour une page blanche). Tests : domaine, design, services (instance, chaîne instance → équipe, reprise), PDF compilés avec toutes les options, pile.
