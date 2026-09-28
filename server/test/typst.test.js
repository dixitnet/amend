// Le message d'erreur d'un export PDF refusé (28/09/2026).
//
// « composition impossible — error: expected comma », sur un long texte
// collé, ne disait pas où chercher. Le serveur ajoute désormais le texte du
// document autour de l'endroit où Typst a buté. Pas de vrai Typst ici (il
// n'est installé ni sur le Mac ni en test) : un faux binaire rejoue une
// sortie d'erreur réelle, relevée en compilant.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Typst, TypstError, passageFautif } from '../typst.js'

const LIGNE = '#amend-corps[Le rapport de l’#emph[ANRU](Agence nationale pour la rénovation urbaine) et la suite du texte.]'
const SOURCE = ['// Engendré par amend.ink', '#set page(width: 210mm)', '', LIGNE, ''].join('\n')
// La parenthèse qui suit `#emph[ANRU]` : là où Typst bute réellement.
const COLONNE = Array.from(LIGNE).indexOf('(') + 1
const ERREUR = `error: expected comma
  ┌─ main.typ:4:${COLONNE}
  │
4 │ ${LIGNE}
  │ ^
`

test('le passage fautif se lit sans balisage Typst', () => {
  const p = passageFautif(ERREUR, SOURCE)
  assert.ok(p.includes('ANRU(Agence nationale'), p)
  assert.doesNotMatch(p, /#|\[|\]/)
})

test('les échappements et les retours à la ligne redeviennent du texte', () => {
  const ligne = '#amend-corps[#strong[Note]\\.Voir 50\\% du texte#linebreak()suite]'
  const p = passageFautif('error: x\n  ┌─ main.typ:1:20\n', ligne)
  assert.equal(p, 'Note.Voir 50% du texte suite')
})

test('rien si Typst ne désigne aucun endroit de la source', () => {
  assert.equal(passageFautif('error: file not found', SOURCE), '')
  assert.equal(passageFautif('error: x\n  ┌─ main.typ:99:1\n', SOURCE), '')
})

test('un long passage est coupé autour de l’endroit fautif', () => {
  const long = '#amend-corps[' + 'a'.repeat(300) + '(X)' + 'b'.repeat(300) + ']'
  const col = long.indexOf('(') + 1
  const p = passageFautif(`error: x\n  ┌─ main.typ:1:${col}\n`, long)
  assert.ok(p.startsWith('…') && p.endsWith('…'), p)
  assert.ok(p.includes('(X)'))
  assert.ok(p.length < 130, String(p.length))
})

test('une coupe au milieu d’un appel ne laisse pas de balisage', () => {
  const ligne = '#amend-corps[' + 'x'.repeat(25) + ' Un texte, puis #emph[ANRU](Agence) et la suite.]'
  const col = Array.from(ligne).indexOf('(') + 1
  // Fenêtre de 60 caractères avant : elle commence dans `#amend-corps[`.
  assert.ok(col - 1 > 60 && col - 1 - 60 < '#amend-corps['.length)
  const p = passageFautif(`error: x\n  ┌─ main.typ:1:${col}\n`, ligne)
  assert.doesNotMatch(p, /[#[\]]|corps/, p)
  assert.ok(p.includes('ANRU(Agence)'), p)
})

test('le refus de Typst renvoie le passage à la personne', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'amend-faux-typst-'))
  try {
    const sortie = join(dossier, 'erreur.txt')
    writeFileSync(sortie, ERREUR, 'utf8')
    const binaire = join(dossier, 'typst')
    writeFileSync(binaire, `#!/bin/sh\ncat '${sortie}' >&2\nexit 1\n`, 'utf8')
    chmodSync(binaire, 0o755)
    const typst = new Typst({ binaire, delaiMs: 5000 })
    await assert.rejects(typst.rendre(SOURCE), (e) => {
      assert.ok(e instanceof TypstError)
      assert.equal(e.status, 422)
      assert.match(e.message, /^composition impossible — error: expected comma, près de « .*ANRU\(Agence nationale.* »$/)
      return true
    })
  } finally {
    rmSync(dossier, { recursive: true, force: true })
  }
})
