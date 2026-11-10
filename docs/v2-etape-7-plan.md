# amend.ink v2 : plan de l'étape 7, « Exports » (lot 1 : Markdown et PDF)

Statut : **lot 1 développé** le 09/11/2026 sur la branche `claude/gallant-tesla-ng3xqy`, à la demande de Sylvain (« lance le dev pour l'export md et pdf, on verra la suite plus tard »). Pas encore fusionné.

Références :

- étude « Export PDF de livres pour amend.ink v2 » (session Claude du 09/11/2026, dépôt dixit-net, `reports/Export PDF de livres amend v2.md`) : garder Typst, penser le modèle en grille, « Typst seul » pour l'imprimeur ;
- modèle « TàT - Poche » (même session, dépôt dixit-net, `modeles-amend/tat-poche/`), relevé sur deux pages d'un livre de poche de référence.

## Ce que fait Docs (vérification n° 0)

Lu dans `suitenumerique/docs` (`src/frontend/apps/impress/src/features/docs/doc-export/`, commit du 05/11/2026) :

- **tout se fait dans le navigateur**, dans une fenêtre « Exporter » (`components/ModalExport.tsx`), sans appel au serveur pour composer ;
- **Markdown** : `editor.blocksToMarkdownLossy(blocs)` de BlockNote ; une archive `.zip` quand le document a des images ;
- **PDF** : `@blocknote/xl-pdf-exporter` (`exporterPDF.ts`, `mappingPDF.ts`), qui **compose avec Typst** : `@blocknote/xl-typst-exporter` écrit la source Typst, `@blocknote/xl-typst-compiler` (Typst 0.15.1 en WebAssembly) la compile ; PDF/UA-1 déclaré quand le document s'y prête ;
- DOCX et ODT par les autres paquets `xl-` de BlockNote, HTML par `blocksToFullHTML`.

## Ce que fait ce lot

1. **Même montage que Docs** : export dans le navigateur, Markdown par `blocksToMarkdownLossy`, PDF par les paquets Typst de BlockNote (`xl-typst-exporter`, `xl-typst-compiler`, épinglés en 0.57.0, licence GPL-3.0 ; ADR 0006, décision 2).
2. **Écart assumé avec Docs** : pas `xl-pdf-exporter`, dont le préambule (A4, Inter, blocs entourés d'un blanc de 6,9 pt) n'est pas réglable et casserait la grille du livre. On garde de BlockNote l'exportateur du texte en ligne (styles, liens, échappement) et le compilateur ; on écrit le parcours des blocs (`adaptateurs/blocknote/export.js`, une soixantaine de lignes) et le préambule.
3. **Le modèle en grille** (`domaine/miseEnPage.js`, JavaScript pur) : format, marge de tête, corps, interligne en points, nombre de lignes ; marge de pied, place du folio, blancs des titres en découlent. Boîte de ligne de 1 em (`top-edge: 0.8em`, `bottom-edge: -0.2em`) : le pas vaut exactement l'interligne.
4. **Le modèle « TàT - Poche »** (`design/reglages.js`, `livre.modeles`, ADR 0008) : 120 × 180 mm, marges 18 / 13 / 13 mm, EB Garamond 10,5 / 12,4 pt, 31 lignes, folio à 18 mm du bas, chapitre en belle page (titre à la 7e ligne, texte à la 12e), intertitres en italique avec une ligne blanche avant, alinéa 4,5 mm. Polices EB Garamond (licence OFL) dans `design/polices/`.
5. **On exporte le texte de base**, lu dans le fragment Yjs, jamais les suggestions en cours (le correcteur exporte le texte accepté).
6. **« Typst seul » pour l'imprimeur** : texte en noir pur (CMJN 0/0/0/100), polices incorporées, PDF/UA-1 quand le document s'y prête. Pas de PDF/X ni de Ghostscript tant qu'un imprimeur ne l'exige pas.
7. Interface : deux entrées, « Exporter en Markdown » et « Exporter en PDF », dans le menu « Autres actions » de la coquille (formats M et L, picto « exporter » déjà décidé). Textes dans `i18n/`.

## Vérifications avant développement

1. **Besoin établi** : demande explicite de Sylvain (09/11/2026), modèle de référence mesuré sur deux pages.
2. **Défaut ou fonction** : fonction nouvelle ; la v2 n'avait aucun export.
3. **Moment** : étape 7 du plan, avancée sur demande de Sylvain ; le reste de l'étape (Word, choix du modèle, autres modèles) attend.
4. **Niveau** : règles de mise en page dans le domaine, appel des fondations dans l'adaptateur BlockNote, déclenchement et téléchargement dans l'application, valeurs du modèle dans le design.
5. **Règle qui gêne** : la règle 17 (aucune longueur en dur hors du design) s'applique au code qui traduit le modèle en Typst ; les longueurs de mécanique (zéro, 1 em, 100 %) passent par des fonctions. À rediscuter si cela paraît artificiel.
6. **Conséquences** : 26 Mo de WebAssembly téléchargés au premier export PDF seulement (chargement différé, mis en cache ensuite ; Caddy le compresse) ; +7 Ko compressés dans le paquet principal. La compilation reste dans le navigateur : rien sur le serveur de 1 Go.

## Mesures (PDF compilé par le compilateur WebAssembly, lu avec PyMuPDF)

- toutes les lignes de texte tombent sur la grille de 12,4 pt, y compris après un intertitre, une citation et un blanc ;
- chapitre : première ligne du titre sur la 7e ligne, texte sur la 12e, en page de droite ;
- folio : ligne de base à 18,0 mm du bas ; aucun folio sur la page blanche laissée avant un chapitre ;
- EB Garamond incorporée (romain, italique, demi-gras) ; petites capitales et exposant réels de la police ;
- PDF/UA-1 déclaré ; titre du document dans les métadonnées.

## Limites connues (lot 1)

1. Tableaux et images : correspondance de BlockNote, hors grille ; une image introuvable est omise.
2. Pas de petites capitales ni d'exposant dans l'éditeur : le schéma n'a pas ces styles (à décider, étape 7 suite).
3. Les espaces fines viennent de la typographie à la frappe (extension de la v2) ; rien n'est ajouté à l'export.
4. Un seul modèle, sans choix dans l'interface. Pas de fenêtre « Exporter » comme Docs.
5. Format S (téléphone) : pas encore d'entrée dans le menu « … » (il faut choisir un picto : décision de design).
6. Pas d'indicateur pendant la compilation (1 à 2 s au premier export).
7. Markdown : sans les images (Docs en fait une archive `.zip`).

## Suite proposée (à arbitrer)

1. Fenêtre « Exporter » comme Docs (choix du format et du modèle).
2. Petites capitales et exposant dans l'éditeur (styles du schéma, saisie des siècles).
3. Entrée « Exporter » dans le menu du format S.
4. Export Word (paquet `xl-docx-exporter` de BlockNote, comme Docs).
5. Images dans l'export Markdown (archive `.zip`, comme Docs).
