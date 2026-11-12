// Les modèles du design (12/11/2026, docs/v2-modeles-pdf-plan.md) : l'A4
// simple tient sur sa grille, et la reprise de « TàT - Poche » en modèle de
// l'instance redonne exactement ses valeurs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { grille, appliquerEcarts, ecartsVers, gabaritTypst } from '../../domaine/index.js'
import { MODELES_LIVRE, REGLES_MODELES, REGLES_MODELES_INSTANCE, REPRISE_MODELES } from '../../design/livre.js'

const a4 = MODELES_LIVRE[0]

test('un seul modèle dans le code, l’A4 simple, et sa grille tient', () => {
  assert.deepEqual(
    MODELES_LIVRE.map((m) => m.id),
    ['a4'],
  )
  assert.doesNotThrow(() => grille(a4))
  assert.match(gabaritTypst(a4), /width: 210mm, height: 297mm/)
})

test('les réglages des équipes sont dans ceux de l’instance', () => {
  const instance = REGLES_MODELES_INSTANCE.reglables.map((r) => r.cle)
  for (const r of REGLES_MODELES.reglables) assert.ok(instance.includes(r.cle), r.cle)
  assert.equal(new Set(instance).size, instance.length, 'pas de doublon')
  for (const r of REGLES_MODELES_INSTANCE.reglables) assert.ok(r.groupe, `groupe de ${r.cle}`)
})

test('la reprise de « TàT - Poche » redonne ses valeurs à partir de l’A4', () => {
  const tat = REPRISE_MODELES.find((r) => r.id === 'tat-poche')
  const ecarts = ecartsVers(a4, tat.valeurs, REGLES_MODELES_INSTANCE.reglables)
  const r = appliquerEcarts(a4, ecarts, REGLES_MODELES_INSTANCE)
  assert.equal(r.ok, true, JSON.stringify(r))
  const { polices, id, ...obtenu } = r.modele
  assert.ok(polices.length && id)
  assert.deepEqual(obtenu, tat.valeurs)
})
