// L'essai de restauration (tools/essai-restauration.mjs, 30/09/2026).
//
// Un outil qui juge des sauvegardes doit lui-même être jugé : on lui donne
// une vraie archive (documents écrits par le vrai Storage, archivés par le
// vrai tar) et il doit la relire ; puis une archive qui n'en est pas une, et
// il doit échouer avec un code de sortie non nul.

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as Y from 'yjs'
import { Storage } from '../storage.js'

const ICI = dirname(fileURLToPath(import.meta.url))
const OUTIL = resolve(ICI, '..', '..', 'tools', 'essai-restauration.mjs')

const racine = mkdtempSync(join(tmpdir(), 'amend-restauration-'))
const data = join(racine, 'data')
const storage = new Storage(data)

function ecrireDocument(titre, texte) {
  const { id } = storage.createDoc(titre, 'chef@example.com')
  const y = new Y.Doc()
  const frag = y.getXmlFragment('prosemirror-content')
  const p = new Y.XmlElement('paragraph')
  p.insert(0, [new Y.XmlText(texte)])
  frag.insert(0, [p])
  storage.appendUpdate(id, Buffer.from(Y.encodeStateAsUpdate(y)))
  return id
}

test('une vraie sauvegarde se relit, texte compris', async () => {
  ecrireDocument('Premier', 'Un texte assez long pour être compté par l’outil.')
  ecrireDocument('Second', 'Autre document.')
  await storage.flushAll()
  const archive = join(racine, 'a.tar.gz')
  assert.equal(spawnSync('tar', ['czf', archive, '-C', racine, 'data']).status, 0)

  const r = spawnSync('node', [OUTIL, archive], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.match(r.stdout, /2 document\(s\) au registre/)
  assert.match(r.stdout, /✓ .*« Premier » — 1 opération\(s\), ~\d+ signes/)
  assert.match(r.stdout, /OK — l’archive se déplie/)
  assert.match(r.stdout, /ne contient pas le \.env/, 'l’outil rappelle toujours ce qu’une restauration ne rend pas')
})

test('ce qui n’est pas une sauvegarde échoue', () => {
  const faux = join(racine, 'faux.tar.gz')
  writeFileSync(faux, 'ce n’est pas une archive')
  const r = spawnSync('node', [OUTIL, faux], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /ÉCHEC/)
})

test('une archive sans registre n’est pas une sauvegarde d’amend.ink', () => {
  const autre = join(racine, 'autre')
  spawnSync('mkdir', ['-p', join(autre, 'data')])
  writeFileSync(join(autre, 'data', 'notes.txt'), 'rien à voir')
  const archive = join(racine, 'autre.tar.gz')
  spawnSync('tar', ['czf', archive, '-C', autre, 'data'])
  const r = spawnSync('node', [OUTIL, archive], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /docs\.json manque/)
})

test('sans argument, l’outil dit comment s’en servir', () => {
  const r = spawnSync('node', [OUTIL], { encoding: 'utf8' })
  assert.equal(r.status, 2)
  assert.match(r.stderr, /usage/)
})

test.after(() => rmSync(racine, { recursive: true, force: true }))
