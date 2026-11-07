# ADR 0006 — Licence AGPL-3.0

- Statut : acceptée (Sylvain, 07/11/2026)

## Contexte

y/hub est sous AGPL-3.0 (ou commercial) ; les paquets `xl-` de BlockNote sous GPL-3.0 (ou commercial). amend.ink n'a pas de perspective commerciale arrêtée.

## Décision

Toute la v2 (`v2/`) est sous AGPL-3.0 (`v2/LICENSE`). Les paquets `xl-` de BlockNote sont utilisables.

## Conséquences

Le code de la v2 doit pouvoir être fourni à quiconque utilise le service. Chaque dépendance nouvelle a une licence compatible (vérifiée en revue). La v1 n'est pas concernée.

## Ce qui ferait revenir dessus

Un projet commercial qui exigerait du code fermé : licences commerciales de y/hub et de BlockNote, ou retrait des parties concernées.
