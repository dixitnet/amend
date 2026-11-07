# ADR 0008 — Système de design

- Statut : proposée (ouverture de l'étape 1)

## Contexte

Règles 16 à 22 : séparation stricte du design et de la technique, tout par jetons de design, thème de BlockNote dérivé de nos jetons.

## Décision proposée

- Jetons en variables CSS dans `v2/design/jetons.css` (couleurs, typographies, espacements, rayons, ombres, durées), avec un jeu clair et un jeu sombre.
- Thème de BlockNote construit à partir de ces jetons dans `v2/design/` (BlockNote expose ses couleurs et polices en variables CSS et par un objet de thème).
- Bibliothèque d'interface de BlockNote : **Mantine** (variante de référence de BlockNote et celle de Docs), cantonnée à `v2/design/` et à l'adaptateur.
- Composants de présentation dans `v2/design/composants/`, sans état distant ni règle.
- Lint : interdiction de l'attribut `style` et des imports de feuilles de style hors de `v2/design/`.

## Options écartées

Tailwind (styles dans le balisage, contraire à la séparation) ; shadcn ou Ariakit (variantes moins utilisées de BlockNote).

## Ce qui ferait revenir dessus

Un designer qui préférerait un autre outillage, tant que la séparation est respectée.
