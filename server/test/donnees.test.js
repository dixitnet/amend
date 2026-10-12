// Version des données et verrou d'instance (server/donnees.js, point 41).

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { migrerDonnees, lireVersion, verrouillerDonnees, DonneesIncompatibles } from '../donnees.js'

function dossier() {
  const d = mkdtempSync(join(tmpdir(), 'amend-donnees-'))
  process.on('exit', () => rmSync(d, { recursive: true, force: true }))
  return d
}

test('des données neuves reçoivent leur version, sans copie du registre', () => {
  const d = dossier()
  writeFileSync(join(d, 'docs.json'), '{}')
  const r = migrerDonnees(d, [], { cible: 3 })
  assert.deepEqual(r, { de: 0, vers: 3, appliquees: [] })
  assert.equal(lireVersion(d), 3)
  assert.equal(existsSync(join(d, 'docs.json.avant-v1')), false)
})

test('les étapes manquantes passent dans l’ordre, une seule fois, après copie du registre', () => {
  const d = dossier()
  writeFileSync(join(d, 'docs.json'), '{"a":1}')
  const vues = []
  const etapes = [
    { version: 1, nom: 'un', appliquer: () => vues.push(1) },
    { version: 2, nom: 'deux', appliquer: () => vues.push(2) },
  ]
  assert.deepEqual(migrerDonnees(d, etapes, { cible: 2 }).appliquees, ['un', 'deux'])
  assert.deepEqual(vues, [1, 2])
  assert.equal(readFileSync(join(d, 'docs.json.avant-v1'), 'utf8'), '{"a":1}')
  // Au démarrage suivant, plus rien à faire.
  assert.deepEqual(migrerDonnees(d, etapes, { cible: 2 }).appliquees, [])
  assert.deepEqual(vues, [1, 2])
})

test('une étape qui échoue laisse la version où elle était (elle sera retentée)', () => {
  const d = dossier()
  writeFileSync(join(d, 'docs.json'), '{}')
  let essai = 0
  const etapes = [
    {
      version: 1,
      nom: 'fragile',
      appliquer: () => {
        if (++essai === 1) throw new Error('boum')
      },
    },
  ]
  assert.throws(() => migrerDonnees(d, etapes, { cible: 1 }), /boum/)
  assert.equal(lireVersion(d), 0)
  migrerDonnees(d, etapes, { cible: 1 })
  assert.equal(lireVersion(d), 1)
  assert.equal(essai, 2)
})

test('des données plus récentes que le code sont refusées', () => {
  const d = dossier()
  writeFileSync(join(d, 'version.json'), '{"version":9}')
  assert.throws(() => migrerDonnees(d, [], { cible: 2 }), DonneesIncompatibles)
  assert.equal(lireVersion(d), 9, 'et rien n’est réécrit')
})

test('un version.json illisible vaut « avant le versionnage »', () => {
  const d = dossier()
  writeFileSync(join(d, 'version.json'), 'pas du json')
  assert.equal(lireVersion(d), 0)
})

test('le verrou : refusé si une autre instance vivante le tient, repris si elle est morte', async () => {
  const d = dossier()
  const autre = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  try {
    writeFileSync(join(d, '.pid'), `${autre.pid}\n`)
    assert.throws(() => verrouillerDonnees(d), /déjà/)
    assert.equal(
      readFileSync(join(d, '.pid'), 'utf8').trim(),
      String(autre.pid),
      'le verrou de l’autre n’est pas touché'
    )
  } finally {
    await new Promise((resolve) => {
      autre.once('exit', resolve)
      autre.kill()
    })
  }
  // Maintenant morte : le verrou est repris.
  const liberer = verrouillerDonnees(d)
  assert.equal(readFileSync(join(d, '.pid'), 'utf8').trim(), String(process.pid))
  liberer()
  assert.equal(existsSync(join(d, '.pid')), false)
  liberer() // sans effet
})

test('le verrou ne retire pas celui d’un autre', () => {
  const d = dossier()
  const liberer = verrouillerDonnees(d)
  writeFileSync(join(d, '.pid'), '999999\n')
  liberer()
  assert.equal(readFileSync(join(d, '.pid'), 'utf8').trim(), '999999')
})
