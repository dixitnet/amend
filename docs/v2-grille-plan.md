# amend.ink v2 : modèles sur une grille stricte, comptés en lignes

Statut : **grille stricte en ligne le 27/11/2026, gabarit en points retiré (`1585c49`) ; police par style rétablie le même jour (§ 14), à fusionner sur accord ; la conversion des modèles enregistrés est gardée.**

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

## 9. Arbitrages

Sylvain, 27/11/2026 (« 1, 2, 3 ton avis, 5 ok. On réfléchit d'abord sur les interfaces avant de lancer le dev ») :

1. **La règle du § 2 est retenue telle quelle** : demi-ligne ajoutée avant le bloc ; variante mesurée pour les titres seulement (titre du document, sous-titre, titres 1 à 5), brique pour la citation, la bibliographie et la légende.
2. **Le coefficient 1,15 est retenu** (hauteur d'une ligne de titre par unité de taille) : à inscrire dans `v2/design/` et l'ADR 0008 au lot 2.
3. **Réglages retirés : l'avis de Claude est suivi.** Sont gardés : le texte libre en en-tête, le premier numéro de folio, le format libre en millimètres, le corps et l'interligne en nombres. Le reste du § 7 est retiré.
4. **Reprise des modèles enregistrés : conversion automatique** (Sylvain, 27/11/2026, voie 1 du § 5).
5. **Les deux décisions du 15/11/2026 sont renversées** : les blancs se comptent en lignes, et le nombre de lignes par page redevient le réglage (la marge de pied s'en déduit).

**Aucun lot n'est lancé.**

## 10. L'interface (Sylvain, 27/11/2026)

« On reprend tout le design, oublier l'existant. Propose le plus simple et le plus lisible », puis « 1-2 / 2 pas d'aperçu en S / 3 ok / 4 on essaie ». Maquette en composants Mantine faite dans la session de Claude, hors du dépôt. Docs n'a pas d'interface de modèle.

1. **Le modèle se lit comme une fiche.** La page de réglage n'est plus un formulaire de champs ni un tableau des styles : elle affiche le modèle en clair, une ligne par réglage (« Titre 3 : 11 pt, gras · 1 ½ avant, ½ après »), sous quatre rubriques : la page (format, marges, hauteur du texte), le texte (caractère, paragraphes, séparateur de scène), les titres et les styles (dix lignes), les en-têtes et numéros de page. Dix-huit lignes en tout.
2. **Une ligne s'ouvre pour être réglée, une seule à la fois** (accordéon de Mantine). Les dix styles ont la même fiche : taille, blanc avant, blanc après (pas de 0,5), puis gras, italique, capitales, petites capitales, centré. Sous les champs, une phrase dit ce que la grille calcule (« Sur une ligne, ce titre occupe 1 ligne de la grille ; sur deux lignes, 2 ») ; un encart annonce la demi-ligne ajoutée, seulement quand elle s'applique.
3. **Le début des titres 1 et 2** (à la suite, nouvelle page, belle page) est dans leur fiche ; la rubrique « Chapitre » disparaît.
4. **Hauteur du texte** : le nombre de lignes par page, avec dessous la marge de pied obtenue et les signes par ligne et par page.
5. **Un aperçu dessiné** à côté de la fiche, en formats L et M : une page (titre, ouverture, page courante) qui suit ce qu'on règle et encadre le style ouvert ; grille et blancs affichables. **Pas d'aperçu en format S.** C'est une approximation du PDF, dessinée en HTML ; le bouton « Essayer sur un document » reste la vérité.
6. **Les libellés** de la maquette sont validés (« Caractère », « Hauteur du texte », les phrases de résumé) : à porter en clés de traduction.
7. **Apparence** : accordéon de Mantine en variante « séparée », à l'essai ; à inscrire dans `v2/design/` et l'ADR 0008 si elle est gardée.

**Conséquences pour les lots (§ 6)**

- Le lot 3 devient deux lots : la fiche (application, technique : état, résumés, règles) et sa présentation (design : composants de la fiche et de l'aperçu).
- L'aperçu dessiné est une seconde mise en œuvre de la règle, à côté du gabarit Typst. Pour qu'elles ne divergent pas, les deux lisent les mêmes fonctions du domaine (`lignesOccupees`, `demiLigneAjoutee`) ; l'aperçu ne recalcule rien lui-même.
- L'aperçu a des valeurs de design à décider (couleur du papier, teinte des blancs et de la demi-ligne ajoutée, trait de la grille) : proposées au lot de design, décidées par Sylvain.
- À vérifier au lot de design : les polices du catalogue sont-elles déjà chargées par le navigateur pour l'affichage, ou seulement lues pour le PDF.

## 11. Lot 1, développé le 27/11/2026 (Sylvain : « Lancer le lot 1 »)

Domaine seulement ; rien ne change dans l'application tant qu'aucun modèle n'est écrit en lignes (lot 2).

- `v2/domaine/miseEnPageLignes.js` : la règle (`lignesOccupees`, `demiLigneAjoutee`, `blancsDuBloc`), la grille d'un modèle en lignes (`grilleEnLignes`) et son gabarit Typst (`gabaritEnLignes`). Un modèle en lignes se reconnaît à `regle: 'lignes'` ; `grille` et `gabaritTypst` l'aiguillent, l'ancien gabarit est intact (sa source de référence n'a pas changé).
- `v2/domaine/ecritureTypst.js` : les longueurs, chaînes et couleurs de Typst, séparées de `miseEnPage.js` pour servir aux deux gabarits.
- Forme d'un modèle en lignes : `grille.lignes` et `grille.hauteurTitre` (le coefficient 1,15, porté par le modèle : c'est une valeur de design, donnée par le design au lot 2) ; par style, `blancAvant` et `blancApres` en lignes ; `chapitre.debut`, `chapitre.premierSansAlinea`, `ouverture2.debut` ; plus de `marges.bas`, de `folio.bas`, de lignes d'ouverture.
- Tests : `tests/unitaires/miseEnPageLignes.test.js` ; contrat `contrats/statiques/grille-en-lignes.test.js`. **La mesure est faite par Typst lui-même** : le livre d'essai porte un repère en tête de chaque paragraphe, et sa dernière ligne refuse la compilation si l'un d'eux est hors grille. Aucun outil externe. Le même livre avec le modèle en points « TàT 140 × 220 » est refusé : le contrôle mord.

**Trouvé par le contrat** : une ligne vide (paragraphe vide, séparateur « blanc ») que Typst coupait entre deux pages laissait un tiers de ligne en haut de la suivante. Elle est maintenant d'un seul tenant.

**Choix faits dans ce lot, à valider**

1. **Les notes de bas de page sont en briques**, comme la citation : chaque ligne de note occupe un pas. Rien à régler, et les notes sont sur la grille ; mais une note de deux lignes est aérée. L'autre voie (un interligne propre aux notes, hors grille) demande une valeur de design.
2. **Une image ou un tableau** occupe un nombre entier de lignes, **dont une ligne de blanc**, répartie au-dessus et au-dessous avec le complément (entre une demi-ligne et une ligne de chaque côté).
3. **En-têtes** : au corps du texte, centrés ; le numéro de page en haut reste à l'extérieur.
4. **Un style en briques plus haut que le pas** (une citation de 15 pt sur un pas de 14) rend le modèle impossible, raison `interligne`.

**Non couvert par ce lot** : `completerModele` et `appliquerReglages` ne connaissent pas encore la forme en lignes (lots 2 et 4) ; un tableau qui se coupe entre deux pages ; les lignes à l'intérieur d'un tableau.

## 12. Lots 2 à 4, développés le 27/11/2026 (Sylvain : « lance tous les lots »)

Sylvain a validé les quatre choix du lot 1 (« 1 à 4 ok ») : notes de bas de page en briques, une ligne de blanc autour d'une image ou d'un tableau, en-têtes au corps du texte et centrés, style en briques plus haut que le pas refusé. Le lot 1 est fusionné (`e8f8dde`) et en ligne.

Les trois lots suivants dépendent l'un de l'autre (un modèle en lignes ne se règle qu'avec la nouvelle fiche) : ils sont commités couche par couche et se fusionnent ensemble.

**Lot 2, design.** `v2/design/reglagesLivre.js` : les cinq modèles livrés (« A4 simple », « TàT - Poche », « A5 », « Livre de poche », « TàT 140 × 220 ») sont comptés en lignes ; 106 réglages au lieu de 155, la même fiche pour les dix styles ; le coefficient 1,15 (`livre.hauteurTitre`, ADR 0008). Leurs valeurs sont la conversion au plus proche des modèles en points (un test le garantit) : même première ligne de base, même nombre de lignes par page, mêmes nombres de pages pour les cinq livres de référence. **À valider sur le PDF, modèle par modèle.**

**Lot 4, reprise (domaine et serveur).** `versModeleEnLignes` (`v2/domaine/migrationModeles.js`) convertit un modèle en points : la marge de tête est décalée pour garder la première ligne de base ; le nombre de lignes est celui que la marge basse laissait ; un blanc en points devient des demi-lignes ; un titre à lignes d'ouverture garde sa ligne et celle où le texte reprend. Le serveur envoie tout modèle en lignes, et convertit une fois pour toutes les modèles enregistrés à son démarrage (`convertirEnLignes`). **Effet à la mise en ligne : tous les PDF passent au gabarit en lignes.**

**Lot 3, la fiche (application, design, traductions).**

- `v2/application/client/ficheModele.js` : les lignes de la fiche, leurs champs, leur résumé, ce que la grille calcule, le plan de la page d'aperçu. Il lit la règle dans le domaine.
- `v2/design/composants/FicheModele.jsx` et `v2/design/feuilles/apercu-modele.css` : la fiche (accordéon de Mantine, une ligne ouverte à la fois) et la page d'aperçu, en formats L et M. L'ancienne page de réglage et son tableau des styles sont retirés.
- Textes en français et en anglais (`modeles.fiche.*`, `modeles.apercu.*`).
- Test de pile (`contrats/pile/exports.test.js`) : la fiche se lit et se règle, l'aperçu suit le style ouvert et garde ses paragraphes sur la grille, pas d'aperçu au format S, le modèle réglé s'enregistre et l'export PDF l'applique.

**Écarts avec la maquette validée**

1. **Format** : deux nombres (largeur, hauteur), sans liste de formats courants.
2. **Signes par ligne et par page** : non affichés (il faudrait mesurer la police dans le navigateur).
3. **« Essayer »** reste dans la liste des modèles, comme avant ; il n'est pas repris sur la fiche.
4. **Allure des en-têtes** : deux pastilles (italique, petites capitales), non un choix entre les deux.

**Reste à faire**

- Retirer le gabarit en points, sa reprise et ses tests (`miseEnPage.js`, `migrationModeles.js`, `tests/donnees/modeles-en-points.js`), une fois vérifié en production qu'aucun modèle n'est resté en points.
- Valider les cinq modèles sur le PDF.
- Les points non vérifiés du § 8 (tableau coupé entre deux pages, lignes d'un tableau).

## 13. Mise en ligne des lots 2 à 4 et retrait du gabarit en points (27/11/2026)

Sylvain : « fusionne dès que c'est vert » ; puis « retire l'ancien gabarit en points une fois en ligne » et « garde la conversion ».

**Mise en ligne.** Lots 2 à 4 fusionnés (`b5dfdf7`) et en ligne. Vérifié avec un compte d'essai : les huit modèles offerts à un document sur `app.amend.ink` (« A4 simple », « A4 note », « A5 », « A5 Etat », « Livre de poche », « Thèse », « TàT - Poche », « TàT 140 × 220 ») sont servis comptés en lignes, sans marge basse. Ce que le serveur a enregistré en base n'est pas vérifiable de l'extérieur.

**Audits de l'IA de Scaleway**, par couche (le lot entier dépassait la taille acceptée) : domaine et application répondus dans `docs/v2-revues/` ; **la couche design n'a pas pu être auditée** (dossier trop gros avec les cinq modèles écrits en clair).

**Retrait du gabarit en points.**

- `v2/domaine/miseEnPage.js` : le gabarit Typst en points et sa grille sont retirés (le module passe de 628 à 285 lignes). `gabaritTypst` et `grille` ne servent plus que des modèles en lignes ; un modèle en points y est refusé (`modele-impossible`, raison `valeur`).
- **Gardé, à la demande de Sylvain** : la conversion des points vers les lignes (`versModeleEnLignes`, `valeursEnLignes`, la conversion au démarrage du serveur) et ce qu'elle lit de l'ancienne façon (`lignesQuiTiennent`, `completerModele`, `stylesEnPoints`, « A4 simple » en points). Un modèle qui aurait échappé à la conversion au démarrage est encore servi en lignes.
- Tests : les 25 tests qui ne décrivaient que le gabarit en points sont retirés, ainsi que celui du « jeu en bas de page » (la brique ne connaît plus ce cas). Ceux de l'export (`typst.test.js`, `export-ajouts.test.js`) passent sur les modèles en lignes. Les règles générales (régler, vérifier, compléter) sont retestées sur un modèle en lignes. Le contrôle de la grille prouve qu'il mord par un bloc de cinq points glissé dans le livre.

**Reste**

- Retirer la conversion, quand le journal du serveur aura confirmé que tous les modèles enregistrés sont convertis.
- Valider les modèles sur le PDF.

## 14. Écarts abandonnés, police par style rétablie (27/11/2026)

Sylvain : « on abandonne les 3, ajouter le choix de police pour les différents formats ».

**Abandonnés** (les trois écarts avec la maquette, § 12) : la liste de formats courants, les signes par ligne et par page, le bouton « Essayer » sur la fiche.

**La police d'un style.** « Formats » est compris comme les styles : chacun des dix styles (titre du document, sous-titre, titres 1 à 5, citation, bibliographie, légende) a sa police, ou garde celle du texte (« Même police que le texte », le défaut). Les en-têtes restent dans la police du texte.

- Domaine : le gabarit écrit la police d'un style quand elle n'est pas celle du texte ; la conversion des points vers les lignes la garde désormais.
- Design : dix réglages de plus (116 en tout) ; les cinq modèles livrés ont leurs styles dans la police du texte, comme avant.
- Application : un champ « Police » en tête de la fiche de chaque style ; le résumé la dit (« Inter, 13 pt, italique · … ») ; l'aperçu compose le style dans sa police, chargée à la demande.
- Le renoncement n° 30 est corrigé d'autant.

**Conséquence de la conversion déjà faite en production.** Les modèles enregistrés ont été convertis au démarrage du serveur le 27/11/2026 avec la première version de la conversion, qui ne gardait pas la police des styles. **Un modèle qui avait une police propre à un style l'a perdue** : ses styles sont revenus à la police du texte. Les cinq modèles livrés n'étaient pas concernés (tous leurs styles sont dans la police du texte) ; les modèles réglés à la main (« A4 note », « A5 Etat », « Thèse ») ont pu l'être. Deux voies : régler de nouveau la police dans la fiche, ou relire les anciennes valeurs dans la sauvegarde de la nuit précédente (`data/v2/amendv2.dump`, table `amend.modeles`).
