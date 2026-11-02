// Version déployée affichée dans le back-office (server/versionDeployee.js) :
// lue dans `.git` sans lancer git, à chaque demande.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { versionDeployee } from '../versionDeployee.js'

const A = '031ebd753811200a62365c5c852b1aa7372704c1'
const B = '7ee348392c401c85c1fbc9fe66e6fbca23049a74'

function depot() {
  const racine = mkdtempSync(join(tmpdir(), 'amend-version-'))
  mkdirSync(join(racine, '.git', 'refs', 'heads'), { recursive: true })
  return racine
}

test('branche avec sa référence en fichier', () => {
  const r = depot()
  writeFileSync(join(r, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  writeFileSync(join(r, '.git', 'refs', 'heads', 'main'), `${A}\n`)
  const v = versionDeployee(r)
  assert.equal(v.commit, '031ebd7')
  assert.equal(v.branche, 'main')
  assert.equal(typeof v.depuis, 'number')
  rmSync(r, { recursive: true, force: true })
})

test('référence seulement dans packed-refs', () => {
  const r = depot()
  writeFileSync(join(r, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  writeFileSync(
    join(r, '.git', 'packed-refs'),
    `# pack-refs with: peeled fully-peeled sorted\n${B} refs/heads/autre\n${A} refs/heads/main\n`
  )
  assert.equal(versionDeployee(r).commit, '031ebd7')
  rmSync(r, { recursive: true, force: true })
})

test('HEAD détachée', () => {
  const r = depot()
  writeFileSync(join(r, '.git', 'HEAD'), `${B}\n`)
  const v = versionDeployee(r)
  assert.equal(v.commit, '7ee3483')
  assert.equal(v.branche, null)
  rmSync(r, { recursive: true, force: true })
})

test('hors dépôt, ou contenu illisible : null', () => {
  const r = mkdtempSync(join(tmpdir(), 'amend-version-'))
  assert.equal(versionDeployee(r), null)
  mkdirSync(join(r, '.git'))
  writeFileSync(join(r, '.git', 'HEAD'), 'n’importe quoi\n')
  assert.equal(versionDeployee(r), null)
  rmSync(r, { recursive: true, force: true })
})

test('le dépôt réel donne un commit de 7 caractères', () => {
  const v = versionDeployee(new URL('../..', import.meta.url).pathname)
  assert.match(v?.commit ?? '', /^[0-9a-f]{7}$/)
})
