# Maquette des esthétiques (11/11/2026)

Maquette **visuelle** de scénarios d'évolution du design de la v2, dérivée de la maquette des formats M et L (`../grand-ecran`). Aucune fonction réelle. Étude : `docs/v2-etude-esthetiques-2026-11-11.md`.

Publiée comme page claude.ai privée : https://claude.ai/artifact/JSAPMsHDUNiSmcfLtcHN8t

## Ce qu'elle montre

Le bouton « Esthétiques » (en bas à gauche, hors interface) change :

- l'**esthétique** : 0. Actuelle, 1. Encre, 2. Papier, 3. Atelier, 4. Signature, 5. Silence ;
- la **couleur d'accent**, axe libre, indépendant de l'esthétique ;
- **clair ou sombre** ;
- l'écran (document ou « Mes documents »).

Chaque esthétique est écrite avec les seuls outils de style des fondations (`src/esthetiques.js`) : un objet de thème de Mantine (`createTheme`), le `cssVariablesResolver` de Mantine (fond, texte, filets en clair et en sombre), et une feuille limitée à `html[data-esthetique='…']` (variables `--bn-*` de BlockNote, quelques règles). C'est la forme proposée pour la future couche d'esthétiques.

Toutes les valeurs sont des **propositions** de Claude, aucune n'est décidée (ADR 0008). Polices chargées depuis Google Fonts pour la maquette seulement (Literata, Source Serif 4, IBM Plex Mono, toutes sous licence OFL) ; dans l'application, elles seraient servies par nous.

Adresse directe d'un état : `?esthetique=papier&accent=sepia&schema=dark&ecran=liste` (`capture` masque le panneau).

## Construire

```
cd docs/v2-maquettes/esthetiques
npm install
npm run build
```

Résultat : `dist/maquette-esthetiques.html`, une seule page. Ce dossier n'est ni testé ni vérifié par le lint de la v2 : c'est un support de discussion.
