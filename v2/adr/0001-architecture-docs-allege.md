# ADR 0001 — Architecture « Docs allégé »

- Statut : acceptée (Sylvain, 07/11/2026)
- Études : `docs/etude-refondation-coeur-2026-11-07.md`, `docs/etude-blocknote-tiptap-yhub-2026-11-07.md`, `docs/etude-docs-blocknote-yhub-2026-11-07.md`

## Contexte

Le cœur de la v1 (suivi des modifications par réécriture des transactions, synchronisation y-prosemirror 1.x corrigée localement, contrôle du correcteur par analyse du texte) concentre les défauts et le coût de maintenance. Yjs 14, `@y/prosemirror` 2, BlockNote et y/hub forment une chaîne entretenue par d'autres, utilisée en production par Docs (DINUM).

## Décision

Reconstruire amend.ink en reprenant l'architecture de Docs, allégée :

- **éditeur** : BlockNote, avec son mode suggestion, ses commentaires et son historique ;
- **collaboration** : y/hub, qui tient le contenu des documents ;
- **notre serveur Node** : comptes, droits (il répond à y/hub « qui a le droit de quoi »), IA, exports, publication, back-office.

Principe repris de Docs : notre serveur décide qui a le droit, y/hub tient ce que dit le document.

## Options écartées

- Refonte maison sur ProseMirror nu (A) : trop de code à nous au cœur.
- Fork de Docs (C) : rythme de l'amont intenable, exploitation lourde, OIDC.
- Instance de Docs avec services satellites (D) : maîtrise du produit insuffisante aujourd'hui ; reste possible plus tard.

## Conséquences

React pour l'interface ; Valkey et PostgreSQL à exploiter ; pas de migration des documents de la v1 ; dépendance au rythme de BlockNote et de y/hub.

## Ce qui ferait revenir dessus

Un abandon de BlockNote ou de y/hub par leurs mainteneurs ; une exploitation impossible à la taille d'amend.ink ; Docs qui intégrerait nos besoins (option D).
