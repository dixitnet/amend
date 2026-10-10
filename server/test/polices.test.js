// La liste des polices ne propose que des polices installées sur le serveur
// (10/10/2026). Le choix n'a d'effet que sur les exports : Typst remplace en
// silence une famille absente, donc un menu qui promet « Arial » ou
// « Libre Caslon Text » sur un serveur Debian ment au PDF.
import test from 'node:test'
import assert from 'node:assert/strict'
import { POLICES, POLICES_RETIREES, police, famillesTypst, assainir, idPolice } from '../../shared/style.js'

// Ce qu'une machine installée comme le dit `deploy/README.md`
// (fonts-dejavu fonts-liberation fonts-roboto) a sous la main, plus ce que
// Typst embarque (Libertinus Serif, DejaVu Sans Mono). Ajouter une police à
// POLICES oblige à compléter cette liste — donc à y penser côté serveur.
const INSTALLEES = new Set(['DejaVu Sans', 'DejaVu Sans Mono', 'Liberation Sans', 'Liberation Serif', 'Liberation Mono', 'Libertinus Serif', 'Roboto'])

test('chaque police proposée n’a qu’une famille Typst, et elle est installée', () => {
  for (const p of POLICES) {
    assert.equal(p.typst.length, 1, `${p.id} : pas de liste de repli`)
    assert.ok(INSTALLEES.has(p.typst[0]), `${p.id} demande « ${p.typst[0]} », que le serveur n’a pas`)
  }
})

test('les familles à vérifier au démarrage sont exactement celles proposées', () => {
  assert.deepEqual(famillesTypst().sort(), [...new Set(POLICES.map((p) => p.typst[0]))].sort())
})

test('aucune police propriétaire ne reste dans les libellés ou les familles du PDF', () => {
  const texte = JSON.stringify(POLICES.map((p) => [p.label, p.typst]))
  for (const nom of ['Georgia', 'Libre Caslon']) assert.ok(!texte.includes(nom), `${nom} traîne dans la liste`)
  for (const p of POLICES) {
    for (const nom of ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Georgia']) {
      assert.ok(!p.typst.includes(nom), `${p.id} : ${nom} n’est pas installée sur le serveur`)
    }
  }
})

test('les identifiants sont uniques, et le libellé dit ce que le PDF utilise', () => {
  assert.equal(new Set(POLICES.map((p) => p.id)).size, POLICES.length)
  for (const p of POLICES) {
    assert.ok(p.label.includes(p.typst[0]) || p.label.startsWith('Système'), `${p.id} : « ${p.label} » ne nomme pas ${p.typst[0]}`)
  }
})

test('Word garde le nom qu’il connaît : un ordinateur a Arial, pas Liberation Sans', () => {
  assert.equal(police('arial').docx, 'Arial')
  assert.equal(police('times').docx, 'Times New Roman')
  assert.equal(police('mono').docx, 'Courier New')
  assert.equal(police('system').docx, undefined)
})

test('Libre Caslon Text, retirée, sort comme avant : en Libertinus Serif', () => {
  assert.equal(POLICES_RETIREES['libre-caslon-text'], 'serif')
  assert.equal(police('libre-caslon-text').typst[0], 'Libertinus Serif')
  assert.equal(idPolice('libre-caslon-text'), 'serif')
  assert.equal(idPolice('roboto'), 'roboto')
  // À l'enregistrement, le remplaçant est écrit — pas le défaut « système ».
  const f = assainir({ blocs: { body: { font: 'libre-caslon-text' }, h1: { font: 'serif' } } })
  assert.equal(f.blocs.body.font, 'serif')
  assert.equal(f.blocs.h1.font, 'serif')
})

test('un identifiant inconnu retombe toujours sur le défaut', () => {
  assert.equal(assainir({ blocs: { body: { font: 'wingdings' } } }).blocs.body.font, 'system')
  assert.equal(police('wingdings').id, 'system')
})
