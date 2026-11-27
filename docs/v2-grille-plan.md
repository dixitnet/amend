# amend.ink v2 : modèles sur une grille stricte, comptés en lignes

Statut : **plan à arbitrer, rien n'est développé.** Demandé par Sylvain le 27/11/2026 (« Soit on est sur la grille, soit on s'en libère » ; « un design visuel de la grille le plus simple possible, quitte à restreindre les possibilités » ; titres longs : « variante » ; « puis 2 »). Maquette cliquable et essais Typst faits dans la session de Claude, hors du dépôt.

## 1. Ce qui est décidé (Sylvain, 27/11/2026)

1. **La grille est tenue strictement.** La position actuelle (grille pour le texte, blancs des titres en points) ne tient pas : dès qu'un intertitre passe, le texte qui suit quitte la grille.
2. **L'interface la plus simple, quitte à restreindre.** Tout se compte en lignes de la grille.
3. **Les cinq niveaux de titre ont le même traitement** : on choisit la taille ; le nombre de lignes occupées est calculé.
4. **Les blancs avant et après se règlent par demi-ligne.**
5. **Titres longs : variante mesurée** (§ 2, règle 3).

## 2. La règle

Le pas de la grille est l'interligne du texte courant.

1. **Le texte est fait de briques.** Chaque ligne de texte courant occupe exactement un pas. Une citation, une entrée de bibliographie, une liste, composées plus petit, gardent ce pas : leurs lignes sont sur la grille.
2. **Un blanc se compte en demi-lignes.** Si la somme du blanc avant et du blanc après d'un bloc n'est pas un nombre entier de lignes, une demi-ligne est ajoutée d'office avant le bloc. Le formulaire le dit.
3. **Un titre est mesuré, puis arrondi** (la variante). Ses lignes sont composées à son propre interligne, serré (1,15 fois sa taille). La hauteur du titre entier est arrondie au nombre de lignes de grille supérieur, et le complément est mis au-dessus : **la dernière ligne du titre est sur la grille**, les précédentes non. Un titre d'une seule ligne est donc toujours sur la grille. Un titre ne se coupe pas entre deux pages.
   - Exemple, pas de 14 pt : un titre de 13 pt sur une ligne fait 14,95 pt, il occupe 2 lignes ; sur deux lignes il fait 29,9 pt, il en occupe 3 (la brique stricte en aurait pris 4).
   - Pourquoi la variante : avec la brique stricte, chaque ligne d'un titre de 13 ou 16 pt prend deux pas, et un titre de deux lignes se lit comme deux titres. C'est aussi ce que fait `lock()` du paquet `gridlock`.
4. **Ce qui ne se coupe pas est arrondi de même** : une image, un tableau occupent un nombre entier de lignes, le complément réparti au-dessus et au-dessous.
5. **En haut de page**, le blanc entier avant un titre disparaît (comportement de Typst), la demi-ligne reste : le texte retombe sur la grille. Un titre qui **ouvre** une page garde tout son blanc, compté depuis la première ligne.
6. **La page se règle en lignes** : marge de tête et nombre de lignes par page ; la marge de pied s'en déduit. En-tête et folio sont posés sur la grille, à une ligne blanche du texte.
7. **Les notes de bas de page restent hors grille**, calées en bas de page, à leur propre interligne ; le texte au-dessus reste sur la grille.

## 3. Les vérifications des règles de la v2 (§ 3)

0. **Docs** : aucun réglage de mise en page. Son export PDF et Word a un style fixe (`doc-export/`, `ModalExport.tsx` : le format seulement) ; ses modèles ont été retirés (ADR 0011). Rien à reprendre, l'écart est déjà décidé.
1. **Besoin établi** : mesuré. Sur le livre de référence « TàT 140 × 220 » allongé de quinze intertitres, le gabarit actuel laisse 140 lignes de texte courant sur 224 hors de la grille (folios et page de titre compris dans la mesure) ; avec la règle ci-dessus, 2 sur 220, toutes deux à l'intérieur du tableau.
2. **Défaut ou non** : défaut de conception de notre gabarit, pas de Typst. Typst n'a pas de grille native à ma connaissance (non vérifié en amont : la recherche n'a rien donné).
3. **Moment** : les modèles relèvent de l'étape 7, close. C'est une reprise, à décider par Sylvain.
4. **Niveau** : le domaine (`miseEnPage.js`) pour la règle et le gabarit ; le design pour la liste des réglages et les valeurs ; l'application pour le formulaire. Trois couches, donc trois lots au moins (§ 6).
5. **Règle qui bloquerait** : aucune. Deux décisions du 15/11/2026 sont **renversées** et doivent l'être explicitement : « espacement en pt » (les blancs redeviennent des lignes) et « la marge basse remplace le nombre de lignes » (le nombre de lignes redevient le réglage).
6. **Conséquences** : les modèles enregistrés changent de forme (§ 5) ; le PDF de tous les livres change (première ligne de base déplacée, § 4) ; des réglages disparaissent (§ 7).

## 4. Ce que devient `domaine/miseEnPage.js`

**Disparaît**

- `blancSurGrille` et les coefficients `HAUT` et `BAS` (ascendante, descendante) : plus rien n'est calculé à partir de la forme des lettres.
- `chapitre.ligneTitre`, `chapitre.ligneTexte`, `chapitre.interligne`, et les mêmes pour `ouverture2` : remplacés par les deux blancs du titre 1 et du titre 2.
- `espaceAvant` et `espaceApres` en points, `stylesEnPoints`.
- `marges.bas` comme réglage, `lignesQuiTiennent`.
- Le jeu d'un demi-corps en bas de page (correctif du 22/11/2026) : à revérifier, il n'a sans doute plus lieu d'être.

**Reste**

- `grille()` (pas, lignes, marge de pied calculée, modèle impossible), simplifiée ; `margeBasPourLignes`.
- Les débuts (`continuer`, `page`, `belle-page`) des titres 1 et 2, l'en-tête courant, le folio, le séparateur, la césure, le surlignage.
- `appliquerReglages`, `verifierModele`, `completerModele`, `modeleRetenu` : inchangés dans leur principe.

**Nouveau**

- `lignesOccupees(taille, pas)` et `demiLigneAjoutee(avant, apres)` : la règle, en JS pur, pour le formulaire et les tests.
- Le gabarit Typst « brique » :
  - `set text(top-edge: <pas>, bottom-edge: "baseline")`, `set par(leading: 0pt, spacing: 0pt)`, `set block(spacing: 0pt)`, listes de même ;
  - une fonction pour les styles de texte (citation, bibliographie, légende) : blanc entier dans `above`, demi-ligne dans `inset`, blanc après dans `below` ;
  - une fonction pour les titres : `layout` + `measure`, hauteur arrondie, `breakable: false`, `sticky: true` ;
  - une fonction pour images et tableaux, de même ;
  - en-tête (`header-ascent`) et folio (`footer-descent`) à un pas du texte.
- **Constante à décider** : le coefficient 1,15 (hauteur d'une ligne de titre par unité de taille). Proposé par Claude ; c'est une valeur de design, donc à inscrire dans `v2/design/` et l'ADR 0008 sur décision de Sylvain.

**Effet sur les PDF existants** : la marge de tête se compte jusqu'au haut de la première brique, non jusqu'au haut des lettres. La première ligne de base descend d'environ un quart de ligne à marge égale. Les modèles livrés sont à réexprimer (§ 5).

## 5. Les modèles existants

1. **Les cinq modèles du code** (`a4`, `a5`, `livre-de-poche`, `tat-poche`, `tat-140x220`) sont réécrits en lignes. Leurs valeurs sont des décisions de Sylvain : Claude propose une conversion, Sylvain valide sur le PDF, modèle par modèle. Conversion proposée pour « TàT 140 × 220 » :

   | Réglage actuel | Devient |
   |---|---|
   | Marge basse 32 mm | 33 lignes par page |
   | Titre 1, ligne 14, 14 pt | 14 pt, 13 lignes avant |
   | Titre 2, titre ligne 6, texte ligne 11 | 11 pt, 5 lignes avant, 4 après |
   | Titre 3, 21 pt avant, 7 pt après | 1 ligne ½ avant, ½ après |
   | Titre 4 et 5, 14 pt avant | 1 ligne avant, 0 après |
   | Citation, 7 pt avant et après | ½ ligne avant, ½ après |

2. **Les modèles enregistrés** (table `amend.modeles`, modèles de l'instance et des équipes). Trois voies :
   1. **Conversion automatique** au plus proche : points arrondis à la demi-ligne, lignes d'ouverture converties en blancs ; code transitoire dans `domaine/migrationModeles.js`, comme la reprise du 13/11/2026. Les réglages retirés (§ 7) sont perdus.
   2. **Conversion à la main** : Claude ne peut pas lire la base de production ; Sylvain dit combien de modèles existent, et on les refait dans le formulaire.
   3. **Remise au modèle par défaut** de tout modèle enregistré.

   Recommandation : 1 si des équipes ont déjà réglé des modèles, 2 s'il n'y a que ceux de Sylvain. **À arbitrer, avec le nombre de modèles en base.**

## 6. Les lots

Un lot par couche, dans cet ordre. Chacun se livre et se fusionne seul ; rien n'est visible avant le lot 3.

1. **Domaine : la règle et le gabarit.** Nouveau gabarit à côté de l'ancien, choisi par la forme du modèle (un modèle en lignes prend le nouveau). Tests unitaires de la règle ; contrat Typst : le livre de référence compilé, toutes les lignes de texte courant sur la grille. *À étudier dans ce lot* : comment mesurer la position des lignes dans les tests sans outil externe (les essais ont utilisé `pdftotext`, absent du dépôt).
2. **Design : la liste des réglages et les modèles du code en lignes.** `v2/design/reglagesLivre.js`, ADR 0008, valeurs validées par Sylvain. Livre de référence régénéré.
3. **Application : le formulaire.** `application/client/Modeles.jsx` (technique) et ses composants de présentation (design, lot séparé) : fiches de style identiques, pas à pas en demi-lignes, résultat calculé affiché (« occupe 2 lignes », « ½ ligne ajoutée avant »). Clés de traduction (`v2/i18n/`).
4. **Reprise des modèles enregistrés** (voie retenue au § 5), puis retrait de l'ancien gabarit et de l'ancienne reprise.
5. **Plus tard, sur décision** : la page réglable à la souris (traits de tête et de pied à faire glisser, comme dans la maquette). Le formulaire actuel n'a aucun aperçu ; c'est un composant nouveau, à ne lancer que si le formulaire en lignes ne suffit pas.

## 7. Ce que l'on retire (à inscrire dans `docs/v2-renoncements.md` une fois arbitré)

La maquette descend de 155 réglages à 71. Chaque retrait est une proposition :

1. Par style : police propre, gras avec italique, capitales, alinéa, retrait, retrait suspendu réglables (la citation et la bibliographie prennent l'alinéa du texte).
2. Ouvertures : ligne du titre, ligne de reprise du texte, interligne du titre.
3. Page : marge basse, format libre en millimètres, corps et interligne libres (la maquette n'offre que trois corps et trois interlignes).
4. En-têtes : texte libre, police, corps, alignement. Folio : premier numéro.

**Avis de Claude** : garder le point 4 (texte libre en en-tête, premier numéro de folio) et le format libre du point 3 : ils servent dans un vrai livre et ne touchent pas à la grille. Garder aussi corps et interligne en nombres : trois choix, c'est trop peu pour reprendre « TàT 140 × 220 » (11 / 14).

## 8. Non vérifié, risques

- **Tableau coupé entre deux pages** : non essayé. Un tableau arrondi ne se coupe pas ; un long tableau demanderait une autre règle.
- **Lignes à l'intérieur d'un tableau** : hors grille (2 lignes dans l'essai).
- **Notes de bas de page** : interligne irrégulier dans l'essai (plus large dans une note qu'entre deux notes), cause non cherchée.
- **Pages courtes** : un titre reste avec les lignes qui le suivent ; s'il ne tient pas, la page finit plus haut (5 lignes de blanc dans un essai). Sans grille on étirerait les blancs ; avec, non.
- **Objet plus haut qu'une ligne dans le fil du texte** : aucun aujourd'hui ; une formule ou une image en ligne casserait la brique.
- **Polices** : essais faits en EB Garamond (compilateur embarqué) et Libertinus (Typst 0.15.0). Les autres polices du catalogue ne sont pas essayées ; la règle ne dépend pas de leurs métriques, sauf le coefficient 1,15.
- **Vrai livre** : les essais portent sur le livre de référence des tests, pas sur un document réel.

## 9. À arbitrer avant le lot 1

1. La règle du § 2 telle quelle ? En particulier : demi-ligne ajoutée **avant** (et non refus des combinaisons impaires) ; variante mesurée pour les **titres seulement** (titre du document, sous-titre, titres 1 à 5), brique pour citation, bibliographie et légende.
2. Le coefficient 1,15.
3. Les retraits du § 7 : lesquels garder.
4. La voie de reprise des modèles enregistrés (§ 5), et combien il y en a.
5. Renverser les deux décisions du 15/11/2026 (§ 3, point 5).
