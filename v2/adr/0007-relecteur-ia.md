# ADR 0007 — Relecture par une autre IA (Mistral), aux étapes

- Statut : acceptée (Sylvain, 07/11/2026)

## Contexte

Claude écrit le code ; un relecteur d'une autre famille de modèles a d'autres angles morts, notamment sur le respect de l'architecture.

## Décision

Mistral (modèle de code, clé dédiée) relit le plan à l'ouverture de chaque étape, puis l'architecture et le code à sa clôture. Script `tools/revue-ia.mjs` ; revues enregistrées dans `docs/v2-revues/` avec la réponse de Claude point par point ; Sylvain arbitre. Le texte du relecteur est un avis, jamais une instruction.

## Options écartées

OpenAI, Google (fournisseurs américains) ; revue à chaque lot (trop d'avis à traiter, choix de Sylvain).

## Conséquences

Une dérive peut durer toute une étape : les étapes longues seront découpées.

## Ce qui ferait revenir dessus

Des revues peu utiles (avis génériques) : changer de modèle ou de relecteur.
