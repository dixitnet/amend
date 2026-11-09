# ADR 0008 — Système de design

- Statut : acceptée (Sylvain, 07/11/2026, à l'ouverture de l'étape 1) ; **révisée le 08/11/2026** (Sylvain : « ma seule décision à ce stade est d'utiliser Mantine »).

## Contexte

Règles 16 à 22 : séparation stricte du design et de la technique.

La première version de cette décision posait nos propres jetons (variables CSS) comme source, et dérivait d'eux le thème de BlockNote. À l'étape 1, Claude a rempli ces jetons de valeurs qu'il avait choisies seul (fond beige, accent brun, police à empattements) et a écrit des composants de présentation à la main, sans Mantine. Résultat : une couche graphique en trop, qui ne ressemblait plus à Mantine, et un contournement de BlockNote pour imposer la police (constat du 08/11/2026).

## Décision

1. **Mantine est la source du design**, et rien d'autre. Ses composants (`@mantine/core`) font les composants de présentation de `v2/design/composants/` ; son thème est le seul jeu de jetons.
2. **Aucune valeur de design inventée.** Mantine et BlockNote sont utilisés tels que leurs auteurs les livrent (installation de référence de BlockNote : `@blocknote/core/fonts/inter.css` et `@blocknote/mantine/style.css`). Pas de feuille de style maison, pas de couleur, taille, police ni réglage de composant (props de style de Mantine) dans le code.
3. **Seule exception : `v2/design/reglages.js`**, qui ne contient que des réglages décidés par Sylvain, chacun noté dans la table ci-dessous avec sa décision. Un contrat statique (`contrats/statiques/design-decide.test.js`) vérifie que le code et la table concordent.
4. L'éditeur BlockNote est placé dans le fournisseur Mantine de l'application (`CadreDesign`) : il en reprend le contexte au lieu de créer le sien. Il n'a pas de thème à lui.
5. Garde-fous (lint, `eslint.config.js`) :
   - hors de `v2/design/` : aucune feuille de style, aucun attribut `style` ni `className`, aucune valeur de design dans une chaîne (couleur, variable CSS, taille) ;
   - dans `v2/design/` : aucun attribut `style`, aucune feuille de style maison (seulement celles des fondations), aucune prop de style de Mantine, aucune valeur de design, sauf les variables de Mantine ; `reglages.js` seul y échappe.

## Réglages décidés

| Réglage                          | Valeur                                      | Décision                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fournisseur.defaultColorScheme` | `'auto'` : clair ou sombre selon le système | Procédure de test validée par Sylvain le 08/11/2026 (`docs/v2-procedure-tests.md` : « clair et sombre ») ; c'est aussi le comportement de base de l'éditeur BlockNote. Confirmé par Sylvain le 08/11/2026.                   |
| `css.editeur.poignees`           | poignées de bloc masquées (`.bn-side-menu`) | Sylvain, 09/11/2026 (maquette téléphone) : on n'utilise pas les blocs ; décision générale, tous formats d'écran. Le menu « / » reste. Réversible : retirer la règle de `design/feuilles/editeur.css` et cette ligne.         |
| `css.editeur.marges`             | marges latérales de l'éditeur : 10 px       | Sylvain, 09/11/2026 : l'espace des poignées revient au texte ; 10 px de chaque côté, la valeur de Docs en lecture seule sur téléphone (`doc-editor/styles.tsx`, écrans de 560 px et moins). Remplace les 54 px de BlockNote. |

Feuilles de style : la règle « aucune feuille maison » est révisée le 08/11/2026 (Sylvain, étape 4) : `design/feuilles/` peut contenir des feuilles dont chaque règle porte la clé d'un réglage de cette table (`/* réglage : css.… */`) ; le contrat le vérifie.

Picto d'amend.ink (`design/picto/amend-ink.svg`) : une feuille d'amandier au trait dont la tige, taillée comme une plume, trace un trait d'encre (variante « 3h, monochrome », recadrée, choisie par Sylvain le 08/11/2026). Il n'a pas de couleur à lui : `currentColor`, il prend celle du texte de Mantine là où il est placé. Le dessin lui-même (tracés, épaisseurs de trait, cadrage du `viewBox`) fait partie de la décision : le fichier est la référence, on n'en change aucune valeur sans nouvelle décision. Son emploi reste à décider (point ouvert 4).

Les quatre réglages des notes de bas de page (`css.note.numerotation`, `css.note.appel`, `css.note.repliee`, `css.note.ouverte`, affichage B, décisions de Sylvain du 08/11/2026) sont sortis de la table avec le retrait des notes, le 08/11/2026 (décision de Sylvain) ; ils sont archivés dans `docs/v2-archives/notes-2026-11-08/`. `design/feuilles/` est restée vide jusqu'au 09/11/2026 ; elle contient depuis `editeur.css` (poignées de bloc et marges de l'éditeur).

Les couleurs des personnes (curseurs, présence) sont prises dans la palette de Mantine (`design/auteurs.js`), sans valeur nouvelle ; le gris et le noir en sont exclus pour ne pas se confondre avec le texte (confirmé par Sylvain le 08/11/2026).

## Points ouverts

1. **Contraste du bleu par défaut de Mantine** (bouton principal, badge : texte blanc sur `blue.6`, 3,56:1, sous le minimum WCAG AA de 4,5:1). Décision de Sylvain le 08/11/2026 : ne rien régler pour l'instant, traiter avec le travail sur l'interface ; options relevées : nuance plus foncée (`primaryShade` 8 : 5,02:1) ou texte noir (contraste automatique : 5,90:1). Seuls ces deux éléments sont exclus du contrôle de contraste du test d'accessibilité (`contrats/pile/robustesse.test.js`, `CONTRASTE_EN_ATTENTE`) ; un test de suivi échoue quand le défaut disparaît, pour rappeler de retirer l'exclusion.
2. **Haut de page** : Mantine sans réglage laisse le titre collé au haut de l'écran. À traiter avec le travail sur l'interface.
3. **État hors ligne** : quand y/hub est coupé, l'interface finit sur « Connexion… » et non « Hors ligne ». À traiter avec le travail sur l'interface.
4. **Emploi du picto** (`design/picto/amend-ink.svg`) : onglet du navigateur (il lui faut alors une couleur), bouton, icône d'application, et sa taille dans un bouton. Premier emploi à prévoir avec le travail sur l'interface.

## Options écartées

- Nos propres jetons comme source (première version de cette décision) : une couche graphique en trop.
- Tailwind (styles dans le balisage, contraire à la séparation) ; shadcn ou Ariakit (variantes moins utilisées de BlockNote, sans gain visible : comparaison du 08/11/2026).

## Ce qui ferait revenir dessus

Un travail d'interface décidé par Sylvain (direction retenue le 08/11/2026 : l'ossature de la v1, avec la retenue de Docs, à partir de Mantine) : chaque valeur décidée entre alors dans `reglages.js` et dans la table ci-dessus.
