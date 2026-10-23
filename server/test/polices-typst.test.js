// Le dossier de polices du catalogue dans l'appel à Typst (24/10/2026), avec un
// faux binaire : on vérifie les arguments et la lecture de `typst fonts`, pas
// la composition (celle-ci est dans typstReel.test.js, ignoré sans binaire).

import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Typst } from '../typst.js'

function fauxBinaire(sortieFonts) {
  const dossier = mkdtempSync(join(tmpdir(), 'amend-faux-typst-'))
  const chemin = join(dossier, 'typst')
  const journal = join(dossier, 'appels.txt')
  writeFileSync(
    chemin,
    `#!/bin/sh\necho "$@" >> "${journal}"\nif [ "$1" = "fonts" ]; then printf '%s\\n' ${sortieFonts.map((f) => `'${f}'`).join(' ')}; fi\n`
  )
  chmodSync(chemin, 0o755)
  return { chemin, appels: () => readFileSync(journal, 'utf8').trim().split('\n') }
}

test('le dossier du catalogue n’est transmis que s’il contient quelque chose', () => {
  let vide = true
  const t = new Typst({ cataloguePolices: { dossier: '/data/polices', nonVide: () => !vide } })
  assert.deepEqual(t._optionsPolices(), [])
  vide = false
  assert.deepEqual(t._optionsPolices(), ['--font-path', '/data/polices'])
})

test('avec TYPST_FONT_PATH, le catalogue s’ajoute sans lever --ignore-system-fonts', () => {
  const t = new Typst({ polices: '/opt/polices', cataloguePolices: { dossier: '/data/polices', nonVide: () => true } })
  assert.deepEqual(t._optionsPolices(), [
    '--font-path',
    '/opt/polices',
    '--ignore-system-fonts',
    '--font-path',
    '/data/polices',
  ])
})

test('famillesVues lit « typst fonts » avec le dossier du catalogue ; policesManquantes en tient compte', async () => {
  const faux = fauxBinaire(['DejaVu Sans', 'Garamond Test'])
  const t = new Typst({ binaire: faux.chemin, cataloguePolices: { dossier: '/data/polices', nonVide: () => true } })
  const vues = await t.famillesVues()
  assert.ok(vues.has('garamond test'))
  assert.deepEqual(faux.appels()[0].split(' '), ['fonts', '--font-path', '/data/polices'])
  const manquantes = await t.policesManquantes()
  assert.ok(!manquantes.includes('DejaVu Sans'))
  assert.ok(manquantes.includes('Roboto'))
})

test('famillesVues : pas de binaire, pas de réponse (et pas d’exception)', async () => {
  const t = new Typst({ binaire: '/nulle/part/typst' })
  assert.equal(await t.famillesVues(), null)
  assert.equal(await t.policesManquantes(), null)
})
