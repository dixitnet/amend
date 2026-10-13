// Le cumul des clics par bouton de Corrections IA (server/usageIa.js, 13/10/2026) :
// gardé d'un redémarrage à l'autre, sommé sur les mois, anonyme.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { UsageIa } from '../usageIa.js'

const dossier = () => mkdtempSync(join(tmpdir(), 'amend-usage-boutons-'))

test('les clics se cumulent par bouton et survivent à un redémarrage', () => {
  const d = dossier()
  const u = new UsageIa(d)
  u.compterBouton('corriger')
  u.compterBouton('corriger')
  u.compterBouton('direct')
  const b = new UsageIa(d).boutons()
  assert.deepEqual(b.cumul, { corriger: 2, direct: 1 })
  assert.match(b.depuis, /^\d{4}-\d{2}$/)
})

test('le cumul additionne les mois ; chaque mois reste lisible à part', () => {
  let maintenant = Date.parse('2026-10-20T12:00:00Z')
  const u = new UsageIa(dossier(), { maintenant: () => maintenant })
  u.compterBouton('corriger')
  u.compterBouton('raccourcir')
  maintenant = Date.parse('2026-11-05T12:00:00Z')
  u.compterBouton('corriger')
  const b = u.boutons()
  assert.deepEqual(b.parMois['2026-10'], { corriger: 1, raccourcir: 1 })
  assert.deepEqual(b.parMois['2026-11'], { corriger: 1 })
  assert.deepEqual(b.cumul, { corriger: 2, raccourcir: 1 })
  assert.equal(b.depuis, '2026-10')
})

test('rien n’est compté : cumul vide, pas de date de départ', () => {
  assert.deepEqual(new UsageIa(dossier()).boutons(), { parMois: {}, cumul: {}, depuis: null })
})

test('la suppression d’un compte n’efface pas le cumul (il ne désigne personne), et les paragraphes sont notés avec la demande', () => {
  const u = new UsageIa(dossier())
  u.compterBouton('clarifier')
  u.enregistrer({
    email: 'a@x.fr',
    fonction: 'corrections',
    modele: 'claude-haiku-5-5',
    succes: true,
    signes: 120,
    passages: 3,
  })
  u.enregistrer({
    email: 'a@x.fr',
    fonction: 'corrections',
    modele: 'claude-haiku-5-5',
    succes: false,
    signes: 50,
    passages: 2,
  })
  const c = u.detail().utilisateurs[0].corrections
  assert.equal(c.demandes, 1)
  assert.equal(c.passages, 3, 'seule une demande réussie compte ses paragraphes')
  assert.equal(c.signes, 120)
  u.oublier('a@x.fr')
  assert.deepEqual(u.boutons().cumul, { clarifier: 1 })
})
