// Garde-fou : ProseMirror exige `white-space: pre-wrap` sur la zone d'édition.
// Sans cela, Chrome enregistre chaque espace tapée comme une espace insécable
// (constaté en prod le 09/10/2026) et la typographie ne peut plus poser les
// fines et insécables au bon endroit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('la règle .ProseMirror impose white-space: pre-wrap', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const m = css.match(/(^|\n)\.ProseMirror \{([^}]*)\}/);
  assert.ok(m, 'règle .ProseMirror introuvable');
  assert.match(m[2], /white-space:\s*pre-wrap/);
});
