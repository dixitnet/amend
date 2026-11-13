// Les modèles du design (12 et 13/11/2026, docs/v2-modeles-pdf-plan.md) :
// l'A4 simple tient sur sa grille, chaque modèle du code se valide avec les
// règles, et chaque réglage ouvert a un groupe pour le formulaire.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { grille, verifierModele, gabaritTypst, NOMS_STYLES } from '../../domaine/index.js'
import { MODELES_LIVRE, REGLES_MODELES, REPRISE_MODELES } from '../../design/livre.js'

const a4 = MODELES_LIVRE[0]

test('un seul modèle dans le code, l’A4 simple, et sa grille tient', () => {
  assert.deepEqual(
    MODELES_LIVRE.map((m) => m.id),
    ['a4'],
  )
  assert.doesNotThrow(() => grille(a4))
  assert.match(gabaritTypst(a4), /width: 210mm, height: 297mm/)
})

test('les réglages ouverts : sans doublon, chacun dans un groupe, un par propriété de chaque style', () => {
  const cles = REGLES_MODELES.reglables.map((r) => r.cle)
  assert.equal(new Set(cles).size, cles.length, 'pas de doublon')
  for (const r of REGLES_MODELES.reglables) assert.ok(r.groupe, `groupe de ${r.cle}`)
  for (const style of NOMS_STYLES)
    assert.ok(
      cles.some((c) => c.startsWith(`styles.${style}.`)),
      style,
    )
})

test('les modèles du code et la reprise de « TàT - Poche » respectent les règles', () => {
  const tat = REPRISE_MODELES.find((r) => r.id === 'tat-poche')
  for (const modele of [a4, tat.valeurs]) {
    const r = verifierModele(modele, REGLES_MODELES)
    assert.equal(r.ok, true, JSON.stringify(r))
    assert.doesNotThrow(() => grille(modele))
  }
})
