# Signalement à préparer pour l'amont (y-prosemirror) : `acceptChanges` d'une plage sans effet

État : **brouillon, non publié** (accord de Sylvain le 14/11/2026 pour préparer ; la publication reste à faire, depuis un compte ayant accès au dépôt amont).

## Titre proposé

`acceptChanges(start, end)` accepts nothing when the suggestion ends the paragraph and the preceding text was typed by the same user

## Description

With `@y/prosemirror` (the version bundled with BlockNote 0.57, Yjs 14) and a suggestion-mode editor:

1. User A types `Il faisait nuit sur la ville.` (direct editing, base document).
2. User A switches to suggestion mode and types ` Ajout.` at the end of the paragraph. The suggestion appears as an insertion (positions 32 to 39 in the ProseMirror document).
3. User B (another editor) calls `applySuggestion(32, 39)` (BlockNote) which runs `acceptChanges(32, 39)`.

Expected: the insertion is applied to the base document.
Actual: the command returns `true`, nothing changes. A reader who only sees the base document never receives ` Ajout.`.

## What we observed

- `acceptChanges(32, 39)`, `(33, 39)`, `(31, 39)`: no effect. `acceptChanges(32, 40)`: works (the end pushed by one, to the edge of the paragraph). `acceptAllChanges()` works.
- Same positions, other authors: no problem when the suggestion is made by a user who did not type the preceding text (a proofreader), or when the preceding text was typed by the accepting user.
- The failure only appears when the suggester is the author of the adjacent base text, and the accepter is a third user. Accepting by the suggester herself works.

## Where we looked

`commands.js` → `acceptChanges`: the range is mapped to relative positions (`mapResolvedPositionsToRelativePositions`), then `renderer.acceptChanges(relStart.item, relEnd.item)`. We suspect the end item for a range that ends at the end of the paragraph (merged Yjs items of the same client, contiguous clocks). Not verified.

## Reproduction

Test in the amend.ink repository: `v2/contrats/pile/relecture.test.js`, « une éditrice propose à la suite de son propre texte… » (marked `todo`), two browser contexts (A, B) and a reader context (C) that checks the base text. Notes: `docs/v2-veille.md`, entry of 14/11/2026.
