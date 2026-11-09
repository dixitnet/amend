# Maquette des formats M (iPad) et L (Mac)

Maquette **visuelle** de l'interface iPad et Mac de la v2 : aucune fonction réelle. Seuls les volets, le menu « … », le passage lecture / modification et le panneau « Variantes » réagissent. Le texte est un extrait d'exemple.

Publiée comme page claude.ai privée : https://claude.ai/artifact/9yb3tcEUBhhcz1dUiJNUCF . Décisions : `docs/journal-decisions.md`, § 37.

## Ce qu'elle montre

- Disposition par l'`AppShell` de Mantine (proposition 1) : bandeau, volet gauche « Plan / Documents » (redimensionnable de 300 à 450 px, `useAppShellResize` de Mantine, comme Docs), volet droit « Modifications / Margo (IA) » (300 px, comme Docs).
- Volet droit ouvert d'office quand des suggestions attendent (5b) ; nombre de suggestions sur son bouton.
- Sous le point de rupture `md` de Mantine (992 px, iPad en portrait), un seul volet à la fois, le volet fermé d'office se rouvrant ensuite (montage de Docs, `usePanelCoordination.tsx`).
- Sur écran tactile (`pointer: coarse`, l'iPad), lecture d'abord comme le format S ; modification directe sur le Mac (9).
- Écran « Mes documents » avec « Mes documents / Partagé avec moi » dans le volet gauche (10).

Le panneau « Variantes » (en bas à gauche, hors interface) compare les points encore ouverts : barre du haut (bandeau fixe ou barre flottante de Docs), titre du document (dans la barre ou au-dessus du texte), largeur du texte (720, 868, 960 px), lecture ou modification, bleu des boutons (Mantine, nuance 8, texte noir), état hors ligne.

## Ce qu'elle reprend de la v2

Mantine et BlockNote aux versions de la v2, avec les réglages de `v2/design/reglages.js` ; le schéma du livre, la palette sans alignement, les feuilles de l'éditeur et du picto, et le picto, importés tels quels depuis `v2/`. Elle ajoute les icônes Tabler (`@tabler/icons-react`).

## Construire

```
cd docs/v2-maquettes/grand-ecran
npm install
npm run build
```

Le résultat est une seule page, `dist/maquette-grand-ecran.html`, sans dépendance externe. Le fichier commence sans `<html>` ni `<head>` : la publication les ajoute.

Ce dossier n'est ni testé ni vérifié par le lint de la v2 : c'est un support de discussion, pas du code de l'application.
