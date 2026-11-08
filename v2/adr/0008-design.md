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

| Réglage                          | Valeur                                      | Décision                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fournisseur.defaultColorScheme` | `'auto'` : clair ou sombre selon le système | Procédure de test validée par Sylvain le 08/11/2026 (`docs/v2-procedure-tests.md` : « clair et sombre ») ; c'est aussi le comportement de base de l'éditeur BlockNote. À confirmer par Sylvain. |

Les couleurs des personnes (curseurs, présence) sont prises dans la palette de Mantine (`design/auteurs.js`), sans valeur nouvelle ; le gris et le noir en sont exclus pour ne pas se confondre avec le texte (à confirmer par Sylvain).

## Options écartées

- Nos propres jetons comme source (première version de cette décision) : une couche graphique en trop.
- Tailwind (styles dans le balisage, contraire à la séparation) ; shadcn ou Ariakit (variantes moins utilisées de BlockNote, sans gain visible : comparaison du 08/11/2026).

## Ce qui ferait revenir dessus

Un travail d'interface décidé par Sylvain (direction retenue le 08/11/2026 : l'ossature de la v1, avec la retenue de Docs, à partir de Mantine) : chaque valeur décidée entre alors dans `reglages.js` et dans la table ci-dessus.
