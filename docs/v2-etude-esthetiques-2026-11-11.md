# Étude : évolutions du design et couche d'esthétiques (11/11/2026)

- Demande de Sylvain (11/11/2026) : explorer des évolutions du design en s'appuyant sur les modèles de style des outils, sans contrainte de couleur ; auditer des applications de rédaction et professionnelles (hors développement de code) ; proposer plusieurs scénarios, discrets et minimalistes ; le design sera développé sur une couche dédiée, qui permettrait éventuellement de changer d'esthétique.
- Statut : **proposition, rien n'est décidé.** Aucune valeur de cette étude n'entre dans `v2/design/reglages.js` sans décision (ADR 0008).
- Maquette comparative (Mantine et BlockNote réels, aux versions de la v2) : https://claude.ai/artifact/JSAPMsHDUNiSmcfLtcHN8t ; source : `docs/v2-maquettes/esthetiques/`.

## 1. Comment Docs le fait (règle 11)

Lu dans le code de `suitenumerique/docs` (`src/frontend/apps/impress/`) :

1. **Des jeux de jetons nommés.** `cunningham.ts` déclare deux thèmes, `default` (marque blanche, Inter) et `dsfr` (Marianne). Chacun est produit par `getUIKitThemesFromGlobals` (bibliothèque `@gouvfr-lasuite/ui-components`) à partir de « globals » communs, avec des surcharges limitées (polices, quelques espacements). Les composants ne lisent que les jetons (`useCunninghamTheme` : `colorsTokens`, `spacingsTokens`…).
2. **Un thème par instance, pas par personne.** Le serveur renvoie `FRONTEND_THEME` dans sa configuration ; `ConfigProvider` appelle `setTheme` au démarrage. Aucun choix dans l'interface.
3. **Deux échappatoires pour l'hébergeur** : une feuille de style externe facultative (`FRONTEND_CSS_URL`, chargée après les autres) et `theme_customization` (favicon, logo, traductions, pied de page).
4. **Clair seulement** : les thèmes ne déclarent que la variante `light`, et l'éditeur BlockNote est forcé en `theme="light"`.

Ce qu'on en retient : une esthétique est un **jeu de jetons nommé, dérivé d'une base commune par surcharges**, choisi **par configuration** ; les composants n'en savent rien. C'est exactement ce que permet Mantine (un thème `createTheme` et un `cssVariablesResolver`), sans bibliothèque de plus. Écart déjà en place chez nous : le sombre (`defaultColorScheme: 'auto'`).

## 2. Panorama : applications de rédaction et applications professionnelles

Observations d'usage, sans valeur mesurée. Les applications de développement sont écartées, comme demandé.

| Application        | Modèle de surface                               | Texte / interface                                                     | Couleur                                            | Ce que la personne peut changer                                   |
| ------------------ | ----------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| iA Writer          | page infinie, rien autour                       | police maison quasi fixe (Mono, Duo, Quattro), grande, très aérée     | un seul bleu (curseur, sélection)                  | trois polices, taille, clair / sombre ; mode concentration        |
| Ulysses            | page infinie, colonnes latérales sobres         | texte réglable, interface système                                     | un accent discret                                  | thèmes d'éditeur complets, échangés entre utilisateurs            |
| Bear               | page infinie                                    | texte réglable, interface système                                     | rouge de marque, parcimonieux                      | nombreux thèmes (fond, texte, accent), police, interligne         |
| Craft              | page infinie, cartes                            | style de page : système, empattements, arrondi, mono                  | accent de marque, couvertures colorées             | style par document                                                |
| Notion             | page infinie, colonne d'environ 700 px          | linéale par défaut, gris chauds                                       | quasi monochrome ; couleur réservée au contenu     | police par page (défaut, empattements, mono), petit texte, largeur |
| Google Docs        | page posée sur fond gris (ou « sans pages »)    | police du document, interface Material                                | bleu de l'interface                                | mise en page (avec ou sans pages)                                 |
| Word (Microsoft 365) | page posée sur fond gris                      | police du document, interface Fluent                                  | bleu de marque                                     | thèmes Office (coloré, gris foncé, noir, blanc), mode concentration |
| Pages              | page posée, inspecteur à droite                 | police du document, interface système                                 | accent du système                                  | presque rien côté interface                                       |
| Scrivener          | page infinie ou page, mode composition          | tout est réglable                                                     | réglable                                           | énormément de préférences d'apparence                             |
| Medium (éditeur)   | page infinie, aucune barre visible              | texte à empattements, grand ; interface linéale                       | quasi monochrome                                   | rien                                                              |
| Reedsy Book Editor | page infinie, aperçu du livre à part            | texte à empattements                                                  | sobre                                              | modèle de livre à l'export                                        |
| Vellum             | texte à gauche, aperçu du livre à droite        | interface système ; le livre a ses « styles »                         | sobre                                              | style du livre (l'esthétique est celle du livre, pas de l'outil)  |
| Things 3           | listes sur fond blanc, ombres légères           | linéale soignée                                                       | un seul bleu                                       | clair / sombre                                                    |

## 3. Constats

1. **Deux polices, deux rôles.** Presque partout, l'interface est en linéale et petite (13 à 14 px) ; le texte est la vedette : plus grand (16 à 20 px), plus aéré (interligne 1,5 à 1,8), souvent avec empattements ou dans une police dédiée.
2. **Une seule couleur, rare.** L'interface est neutre ; un accent unique marque l'action principale, l'élément actif, le curseur. La couleur sémantique (suivi des modifications, personnes, erreurs) est un autre système, à ne pas confondre avec l'accent.
3. **Trois modèles de surface** : la page infinie (Notion, iA Writer, Docs, notre v2), la page posée sur un plan de travail (Word, Google Docs, Pages), le papier teinté (thèmes d'Ulysses et de Bear).
4. **Les outils collaboratifs ont une esthétique, pas des thèmes.** Docs, Google Docs, Notion, Word : une seule esthétique, clair / sombre, et des réglages de texte (police par document, largeur). Les thèmes complets sont le fait d'outils d'écriture solitaire (Bear, Ulysses, Scrivener).
5. **Pour le livre, l'esthétique est celle du livre** (Vellum, Reedsy) : on choisit le style du livre, l'outil reste neutre. Chez nous, ce sont les modèles de mise en page (étape 7).

Conséquence pour amend.ink : distinguer trois niveaux, qui ne se décident pas au même endroit :

- l'**esthétique de l'interface** (cette étude) ;
- l'**apparence du texte à l'écran** (police, taille, interligne) ;
- la **mise en page de l'export** (modèles de livre, déjà en place).

## 4. Scénarios

Chacun est un thème Mantine plus quelques variables de BlockNote ; tous gardent l'ossature décidée (bandeau, volets, colonne de 720 px, Tabler). La couleur d'accent est un **axe séparé**, libre (§ 5). Captures et comparaison : la maquette.

### 0. Actuelle

Mantine et BlockNote tels quels, vert foncé. Référence.

### 1. Encre (Notion, iA Writer, Things)

- Principe : noir, blanc, gris neutres ; aucune couleur dans l'interface. La couleur ne sert qu'à ce qui a un sens : suivi des modifications, personnes, erreurs.
- Outils : accent `dark` de Mantine (boutons principaux noirs, gris clair en sombre), `defaultRadius: 'sm'`, badges en contour gris, texte de l'éditeur presque noir au lieu du gris de BlockNote (`--bn-colors-editor-text`), filets de l'AppShell plus clairs.
- Pour : le plus discret, le plus « outil de travail » ; le suivi des modifications ressort d'autant mieux ; meilleur contraste du texte.
- Contre : peut paraître austère ; le vert du picto devient la seule couleur de marque.

### 2. Papier (Ulysses, iA Writer Duo, Medium, Reedsy)

- Principe : le texte en caractères à empattements dessinés pour l'écran, plus grand (18 px) et plus aéré (1,65) ; interface en linéale ; fond très légèrement chaud, gris tirant vers le brun ; une couleur discrète (bleu encre).
- Outils : `headings.fontFamily` et police du texte (Literata, OFL), palette `gray` de Mantine remplacée par des gris chauds, `--mantine-color-body` et `--bn-colors-editor-background` teintés, volets d'un ton plus soutenu que la page.
- Pour : le plus proche du livre et du public d'amend.ink (auteurs, éditeurs) ; lecture longue confortable.
- Contre : c'est la direction de l'étape 1 (fond beige, police à empattements) retirée le 08/11/2026 parce que Claude l'avait choisie seul ; ici elle est soumise à décision. Le « crème et empattements » est aussi devenu un poncif des interfaces actuelles : à doser.

### 3. Atelier (Word, Google Docs, Pages, Vellum)

- Principe : une page blanche posée sur un plan de travail gris, ombre légère ; on voit la feuille, donc le livre.
- Outils : `--mantine-color-body` gris, la colonne du texte en surface blanche avec ombre et marges intérieures, texte en Source Serif 4 (OFL), volets et bandeau blancs.
- Pour : le modèle le plus familier aux auteurs venus de Word ; prépare un éventuel aperçu de la page du livre.
- Contre : avec deux volets ouverts sur un portable, la page se serre (à 1440 px de large, la page tombe à environ 780 px et le texte à 680 px) ; ne s'applique pas au format S ; un trompe-l'œil (la page affichée n'est pas la page imprimée, qui dépend du modèle).

### 4. Signature (Bear, Craft, Things)

- Principe : interface neutre et claire, une couleur vive assumée, utilisée avec parcimonie (bouton principal, onglet actif, curseur, sélection) ; la couleur devient la marque.
- Outils : `defaultRadius: 'lg'`, boutons arrondis, cartes à ombre légère sans bordure, `caret-color` et `::selection` à l'accent, volets en `gray.0`.
- Pour : identité forte avec un seul réglage (l'accent).
- Contre : la maquette l'essaie en vermillon (« encre de correction ») : il se confond avec le rouge des suppressions et des actions qui détruisent. À retenir, il faudrait un autre accent (violet, pétrole).

### 5. Silence (iA Writer en mode concentration, Ulysses, Typora)

- Principe : l'interface s'efface ; pas de filets ; bandeau et volets du fond de la page ; pictos du bandeau estompés tant qu'on ne les survole pas ; texte en chasse quasi fixe, comme une machine à écrire, très aéré.
- Outils : `--app-shell-border-color` transparent, opacité des boutons du bandeau, texte en IBM Plex Mono (OFL), interligne 1,8.
- Pour : concentration maximale, très minimal.
- Contre : la chasse fixe réduit le nombre de signes par ligne et éloigne du livre ; l'estompage au survol n'existe pas au doigt (iPad, téléphone) : il faudrait le limiter au pointeur fin ; peut être un **mode** plutôt qu'une esthétique.

## 5. La couleur d'accent, axe libre

Proposées dans la maquette, applicables à chaque esthétique : vert foncé (actuel), encre noire, bleu encre (`indigo`), bleu bureau (`blue`), vermillon, violet (`violet`), pétrole (`cyan`), sépia. Celles de Mantine sont prises telles quelles ; vermillon et sépia sont des palettes de 10 nuances écrites pour la maquette, à vérifier au contrôle de contraste avant toute décision. `autoContrast` de Mantine est activé dans la maquette pour que le texte des boutons reste lisible sur chaque accent.

## 6. La couche d'esthétiques (forme proposée)

Comme Docs, et avec les seuls outils de Mantine :

1. `v2/design/esthetiques/` : un fichier par esthétique, `{ theme, variables, feuille }` : surcharges de `createTheme`, `cssVariablesResolver` (clair et sombre), feuille limitée à `[data-esthetique='…']` (variables `--bn-*` de BlockNote et règles nommées comme aujourd'hui). Une base commune : les réglages actuels.
2. `reglages.js` garde ce qui est commun (coquille, zoom, arbre…) et nomme l'esthétique par défaut ; `CadreDesign` passe le thème et le résolveur au `MantineProvider` et pose `data-esthetique` sur la racine. **Aucun composant technique ne change** : la séparation design / technique est respectée, et c'est ce qui rend l'esthétique remplaçable.
3. Choix de l'esthétique, trois niveaux possibles :
   - a. **par instance**, comme Docs (configuration du serveur, renvoyée par `/api/config`) ;
   - b. **par personne** (préférence du compte, dans le menu du compte), comme Bear ou Word ;
   - c. **par équipe** (marque d'un éditeur).
4. Garde-fous : le contrat statique (`design-decide.test.js`) s'étend à chaque esthétique (chaque clé notée dans l'ADR 0008) ; le contrôle de contraste et les tests de rendu passent sur chaque esthétique, en clair et en sombre.
5. Polices : servies par nous, dans `v2/design/polices/` (Literata, Source Serif 4 et IBM Plex Mono sont sous licence OFL, comme EB Garamond déjà présente), jamais depuis Google Fonts en production.
6. Point technique connu : BlockNote 0.57 fixe la police du texte sur `.bn-default-styles` (le `fontFamily` de son thème est sans effet, voir `docs/v2-veille.md`) ; une esthétique qui change la police du texte le ferait par une règle de feuille sur ce sélecteur, le même mécanisme que le zoom (`css.editeur.zoom`), pas un contournement nouveau.
7. ADR 0008 à réviser : « Mantine est la source » reste vrai, chaque esthétique étant un thème Mantine ; ce qui change, c'est qu'il y aurait plusieurs jeux de réglages décidés au lieu d'un.

**Alerte (règle 4).** Chaque esthétique maintenue double les vérifications visuelles (contraste, captures, clair et sombre, trois formats) et chaque composant futur devra être regardé dans chacune. Offrir un choix aux personnes (b) ou aux équipes (c) est une fonction de confort que les outils collaboratifs de référence n'offrent pas (§ 3, constat 4). Je recommande de construire la couche (elle coûte peu et rend le design remplaçable), mais de n'**exposer qu'une esthétique**, choisie par instance (a), et de ne pas ouvrir de choix tant que le besoin n'est pas établi. Le niveau c relève clairement d'un usage marginal.

## 7. Propositions (à arbitrer par numéro)

1. **Scénario à approfondir** : un ou deux parmi 1 (Encre), 2 (Papier), 3 (Atelier), 4 (Signature), 5 (Silence), ou un mélange (par exemple l'interface d'Encre avec le texte de Papier). Ma préférence : **Encre pour l'interface, avec le texte de Papier** ; c'est la combinaison la plus discrète qui met le texte au premier plan.
2. **Couleur d'accent** : à choisir dans la maquette (axe libre).
3. **Mode de choix** : a (par instance, recommandé), b (par personne), c (par équipe, déconseillé).
4. **Apparence du texte à l'écran** : la garder dans l'esthétique, ou la laisser suivre la police du modèle de mise en page du document (le texte s'afficherait en EB Garamond si le livre l'est). Idée à discuter : elle relie l'écran et l'export sans réglage de plus, mais une police de livre n'est pas toujours faite pour l'écran.
5. **Silence comme mode** plutôt que comme esthétique (bouton « concentration » qui masque volets et bandeau) : à garder pour plus tard ou à écarter.
6. **Lots, si feu vert** : (i) un lot de design « couche d'esthétiques » qui ne change rien de visible (l'actuelle devient l'esthétique par défaut), contrat et tests compris, plus la révision de l'ADR 0008 ; (ii) un lot de design par esthétique retenue, avec ses valeurs décidées ; (iii) seulement si 3 b ou c est retenu, un lot technique pour le choix (configuration ou préférence).
