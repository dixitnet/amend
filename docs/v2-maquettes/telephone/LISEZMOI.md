# Maquette du format S (téléphone, vertical)

Maquette **visuelle** de l'interface téléphone de la v2 : aucune fonction réelle, seuls les volets, le menu « … » et le passage lecture / modification réagissent. Le texte est un extrait d'exemple.

Les choix qu'elle montre sont décrits dans `docs/v2-format-S.md` ; les décisions dans `docs/journal-decisions.md`, § 35.

## Ce qu'elle reprend de la v2

- Mantine et BlockNote aux versions de la v2, avec les réglages de `v2/design/reglages.js` (thème vide, clair ou sombre selon le système).
- Le schéma du livre, importé tel quel depuis `v2/adaptateurs/blocknote/schema.js`.
- La feuille de l'éditeur, importée telle quelle depuis `v2/design/feuilles/editeur.css` (poignées masquées, marges de 10 px).
- La palette flottante sans alignement, importée depuis `v2/adaptateurs/blocknote/palette.js`.

Elle ajoute les icônes Tabler (`@tabler/icons-react`), qui ne sont pas encore une dépendance de la v2.

## Construire

```
cd docs/v2-maquettes/telephone
npm install
npm run build
```

Le résultat est une seule page, `dist/maquette-telephone.html`, sans dépendance externe, publiée par Claude comme page claude.ai privée : https://claude.ai/artifact/1Up7ViVTDpskEYqe58mHy5 . Le fichier commence sans `<html>` ni `<head>` : la publication les ajoute.

Ce dossier n'est ni testé ni vérifié par le lint de la v2 : c'est un support de discussion, pas du code de l'application.
