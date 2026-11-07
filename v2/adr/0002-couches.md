# ADR 0002 — Découpage en couches

- Statut : acceptée (Sylvain, 07/11/2026)
- Référence : `docs/v2-regles-developpement.md`

## Contexte

Profiter en continu des progrès des fondations suppose de ne jamais développer dans leur code ni d'en dépendre de façon diffuse.

## Décision

Couches : plateforme (0), fondations (1), adaptateurs (2), extensions (3), domaine (4, sans dépendance), application technique (5), design (6), exploitation (7) ; textes de l'interface dans des catalogues (`v2/i18n/`). Une fondation n'est importée que par son adaptateur, par son API publique. Un lot ne touche qu'une couche ; design et technique toujours séparés. Frontières vérifiées par le lint.

## Options écartées

Organisation par fonctionnalité (dossier par écran mêlant logique, style et accès aux fondations) : plus naturelle, mais chaque montée de version toucherait partout.

## Conséquences

Un peu plus de fichiers et d'indirections ; montées de version circonscrites aux adaptateurs ; refonte du design possible sans toucher la logique.

## Ce qui ferait revenir dessus

Des adaptateurs qui deviendraient de simples relais sans valeur, au point de gêner : on les fusionnerait, couche par couche, par une nouvelle ADR.
