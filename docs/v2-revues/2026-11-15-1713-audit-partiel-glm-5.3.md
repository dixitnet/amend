# Audit partiel avant fusion (2026-11-15)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 337135 signes envoyés, 3870 reçus (et 14613 de réflexion) ; réflexion `low` ; 24 s ; arrêt : stop
- Diff audité : `v2/` de `5f58e5d` à `a197b65` (26 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff ajoute la gestion des familles de polices de l'instance (activer/désactiver/supprimer), le tableau des styles des modèles, le réglage « premier paragraphe sans alinéa », la police Courier Prime et un correctif Typst pour les blancs en haut de page. L'ensemble respecte les couches, les droits sont vérifiés côté serveur et les nouveaux parcours sont testés. Les principaux points à regarder : un libellé assemblé par morceaux dans le code (règle 26), une fenêtre de course sur la suppression d'une famille, et la documentation du catalogue de polices qui n'a pas suivi.

## Constats
1. **[important]** Traductions (grille 9), `v2/application/client/Modeles.jsx:159` — Le libellé d'un réglage de style hors tableau est assemblé par concaténation (`${LIGNES_STYLES[...]()}\u00A0: ${...}`), avec une mise en minuscule française codée en dur (`replace(/^./, c => c.toLowerCase())`) : contraire à la règle 26 (pas de phrase assemblée par morceaux) et fragile en anglais (les noms propres de styles y perdraient leur majuscule). Proposer une clé de catalogue paramétrée par style et propriété, ou des libellés complets par réglage.
2. **[mineur]** Correction / condition de course (grille 6), `v2/application/serveur/polices.js:112-114` — La suppression d'une famille vérifie `modelesUtilisant` puis supprime : un modèle créé ou réglé avec cette famille entre les deux requêtes passerait, et ses exports perdraient la police. La même fenêtre existait sans doute pour le fichier seul, mais la famille l'élargit. Proposer une vérification dans la même transaction SQL, ou l'assumer comme le fichier unique.
3. **[question]** Sécurité et droits (grille 5), `v2/application/serveur/comptes-modeles.js:50-55` — `regles.polices` contient aussi les familles désactivées (commentaire : « pour valider et composer ») : par l'API, un nouveau modèle peut donc prendre une police désactivée, que l'interface ne propose plus. Est-ce voulu (seul l'affichage est restreint) ou faut-il refuser les familles inactives pour de nouveaux réglages ?
4. **[mineur]** Tests (grille 7), `v2/contrats/statiques/typst.test.js:186-191` — `position()` rend `undefined` si aucun « Marqueur » n'est trouvé dans le PDF : le test échouerait alors par `TypeError` sur `sans.page` au lieu d'un diagnostic clair ; il dépend aussi de `pdftotext` sans que cela soit signalé. Rendre `position` explicite (échec avec message) et noter la dépendance externe.
5. **[mineur]** Simplicité (grille 4), `v2/design/composants/Modeles.jsx:229-231` — Le JSDoc de `PageReglageModele` déclare deux fois la clé `groupes` (la seconde écrase la première dans la documentation). Fusionner en une seule entrée.
6. **[mineur]** Documentation (hors grille, signalé), `v2/design/reglagesLivre.js:35-36` — Courier Prime entre au catalogue (`livre.polices`) avec l'accord de Sylvain du 15/11/2026, mais la table « Réglages décidés » de l'ADR 0008, qui énumère les familles du catalogue, n'est pas mise à jour (le diff ne touche que les réglages `modeles.*` et `polices.*`). Compléter la ligne `livre.polices` de l'ADR.
7. **[question]** Exports propres (grille 8), `v2/domaine/miseEnPage.js:308` — Le blanc devient un paragraphe contenant une espace sans chasse (`\u{200B}`) : rien n'apparaît à la composition, mais ce caractère peut se retrouver dans la couche texte du PDF (copier-coller, extraction). Si c'est le prix du bon comportement en haut de page, l'assumer ; sinon chercher une variante sans caractère parasite.
8. **[question]** Traductions / correction (grille 9), `v2/application/client/Modeles.jsx:151` — Le repli `regles.polices.map((p) => p.famille)` propose toutes les familles, y compris désactivées, quand `familles` n'est pas fourni. Vérifier les appelants : si un écran passe par ce repli, des polices désactivées réapparaîtraient dans les listes.

## Points de grille sans remarque
1, 2, 3, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides
- 8 : citations valides

## Réponse de Claude

1. *Juste*, corrigé : le libellé d'un réglage de style hors tableau est une clé paramétrée (`modeles.reglageDeStyle`, style et propriété), sans mise en minuscule codée en dur.
2. *Assumé* : comme pour un fichier seul, la fenêtre est étroite (administrateurs uniquement, deux requêtes à quelques millisecondes) ; une transaction serait disproportionnée. Un modèle qui garderait une famille supprimée composerait avec une police de repli ; la page des polices l'affiche à la prochaine ouverture.
3. *Voulu* : seule l'interface restreint le choix aux familles actives ; le serveur valide contre toutes les familles, pour que les modèles qui ont gardé une police désactivée restent réglables et exportables. Aucun droit n'est contourné : l'API reste réservée aux gestionnaires et aux administrateurs.
4. *Juste*, corrigé : `position` échoue avec un message clair si le marqueur est introuvable, et nomme la dépendance (`poppler-utils`, déjà dans `v2/LISEZMOI.md`).
5. *Juste*, corrigé : une seule entrée `groupes` dans le JSDoc.
6. *Juste*, corrigé : la ligne `livre.polices` de l'ADR 0008 cite Courier Prime.
7. *Juste*, corrigé : le blanc n'est plus un caractère mais une boîte d'un em (`#box(height: 1em)`), mesures identiques (une ligne de la grille, en haut de page comme ailleurs), aucun caractère dans la couche texte du PDF.
8. *Faux*, avec la preuve : le repli n'est employé par aucun écran (le serveur envoie toujours `polices`) ; les deux appelants passent les familles actives.

## Arbitrage de Sylvain

(À compléter.)
