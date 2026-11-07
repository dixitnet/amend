# ADR 0009 — Traductions

- Statut : acceptée (Sylvain, 07/11/2026, à l'ouverture de l'étape 1)

## Contexte

Règles 23 à 31 : aucun texte en dur, catalogues dans `v2/i18n/`, français source, anglais préparé, pluriels et paramètres nommés, langue de l'interface distincte de celle du document.

## Décision

- Format ICU, par `intl-messageformat` (FormatJS) : standard, sans dépendance à React, utilisable au client comme au serveur.
- Catalogues JSON par langue (`v2/i18n/fr.json`, `en.json`), clés hiérarchiques ; un module `v2/i18n/` minimal (choix de la langue, formatage, repli sur le français).
- Les dictionnaires de BlockNote (le français existe) branchés dans l'adaptateur et complétés, jamais modifiés.
- Lint : interdiction des chaînes littérales dans le rendu ; test de complétude des catalogues ; pseudo-langue de contrôle.
- Outil de traduction : simples fichiers pour commencer ; une plateforme (Crowdin, comme Docs) seulement si des traducteurs extérieurs arrivent.

## Options écartées

i18next (plus large qu'utile ici, ICU par extension) ; textes dans le code avec traduction ultérieure (contraire à la règle 23).

## Ce qui ferait revenir dessus

Un besoin de traduction collaborative à grande échelle.
