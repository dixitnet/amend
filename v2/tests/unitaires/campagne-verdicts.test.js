// La campagne de test (exploitation/campagne/verdicts.mjs) : verdicts,
// comparaison avec l'état de référence, rapport.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verdict, comparer, rapport, statutPour, referenceDepuis, cle } from '../../exploitation/campagne/verdicts.mjs'

const joue = (nom, reussis, exceptions = 0, fois = 3) => ({ nom, fois, reussis, exceptions, notes: [] })
const releve = (navigateur, format, scenarios, famille = 'suivi') => ({ famille, navigateur, format, scenarios })

test('verdict : passé, échoué, instable, script en panne', () => {
  assert.equal(verdict({ fois: 3, reussis: 3, exceptions: 0 }), 'passe')
  assert.equal(verdict({ fois: 3, reussis: 0, exceptions: 0 }), 'echoue')
  assert.equal(
    verdict({ fois: 3, reussis: 0, exceptions: 2 }),
    'echoue',
    'allé au bout une fois : le produit est en cause',
  )
  assert.equal(verdict({ fois: 3, reussis: 0, exceptions: 3 }), 'panne', 'jamais allé au bout : le script est en cause')
  assert.equal(verdict({ fois: 3, reussis: 1, exceptions: 2 }), 'instable')
  assert.equal(verdict({ fois: 0, reussis: 0, exceptions: 0 }), 'panne', 'rien de joué')
})

const reference = {
  qualifiees: ['chromium/L', 'webkit/L'],
  scenarios: {
    [cle('suivi', 'A')]: { statut: 'attendu' },
    [cle('suivi', 'B')]: { statut: 'connu', note: 'défaut amont', lien: 'y-prosemirror#245' },
    [cle('suivi', 'C')]: { statut: 'diagnostic' },
    [cle('suivi', 'D')]: { statut: 'attendu', sauf: { webkit: { statut: 'connu', note: 'propre à WebKit' } } },
    [cle('suivi', 'Z')]: { statut: 'attendu' },
  },
}

test('statut : celui de la référence, sauf exception pour un navigateur ou un format', () => {
  assert.equal(statutPour(reference, cle('suivi', 'D'), 'chromium', 'L').statut, 'attendu')
  assert.deepEqual(statutPour(reference, cle('suivi', 'D'), 'webkit', 'L'), {
    statut: 'connu',
    note: 'propre à WebKit',
    lien: '',
  })
  assert.equal(statutPour(reference, cle('suivi', 'inconnu'), 'chromium', 'L'), null)
  const precise = {
    scenarios: {
      k: { statut: 'attendu', sauf: { firefox: { statut: 'connu' }, 'firefox/S': { statut: 'diagnostic' } } },
    },
  }
  assert.equal(statutPour(precise, 'k', 'firefox', 'S').statut, 'diagnostic', 'le plus précis l’emporte')
  assert.equal(statutPour(precise, 'k', 'firefox', 'L').statut, 'connu')
})

test('comparaison : régression, défaut connu, défaut corrigé, diagnostic, nouveau, non joué', () => {
  const b = comparer(
    [releve('chromium', 'L', [joue('A', 0), joue('B', 0), joue('C', 0), joue('D', 3), joue('N', 3)])],
    reference,
  )
  assert.deepEqual(
    b.regressions.map((l) => l.nom),
    ['A'],
  )
  assert.deepEqual(
    b.connus.map((l) => l.nom),
    ['B'],
  )
  assert.deepEqual(
    b.nouveaux.map((l) => l.nom),
    ['N'],
  )
  assert.deepEqual(b.nonJoues, [cle('suivi', 'Z')])
  assert.equal(b.lignes.find((l) => l.nom === 'C').classe, 'diagnostic')
  assert.equal(b.echec, true, 'une régression fait échouer la campagne')
  const mieux = comparer([releve('chromium', 'L', [joue('A', 3), joue('B', 3)])], reference)
  assert.deepEqual(
    mieux.corriges.map((l) => l.nom),
    ['B'],
    'un défaut connu qui passe est signalé',
  )
  assert.equal(mieux.echec, false)
})

test('comparaison : un script en panne ou un scénario instable, sur un attendu, fait échouer aussi', () => {
  assert.equal(comparer([releve('chromium', 'L', [joue('A', 0, 3)])], reference).pannes.length, 1)
  assert.equal(comparer([releve('chromium', 'L', [joue('A', 0, 3)])], reference).echec, true)
  assert.equal(comparer([releve('chromium', 'L', [joue('A', 2)])], reference).instables.length, 1)
  // Sur un défaut connu, ni l'un ni l'autre n'est une régression.
  assert.equal(comparer([releve('chromium', 'L', [joue('B', 0, 3)])], reference).echec, false)
})

test('comparaison : l’exception d’un navigateur vaut pour lui seul', () => {
  const b = comparer([releve('webkit', 'L', [joue('D', 0)]), releve('chromium', 'L', [joue('D', 0)])], reference)
  assert.deepEqual(
    b.connus.map((l) => l.ou),
    ['webkit/L'],
  )
  assert.deepEqual(
    b.regressions.map((l) => l.ou),
    ['chromium/L'],
  )
})

test('comparaison : une combinaison jamais passée au bilan n’a pas de régression, tout y est à qualifier', () => {
  const b = comparer([releve('firefox', 'S', [joue('A', 0), joue('B', 3), joue('D', 0, 3)])], reference)
  assert.deepEqual(
    b.aQualifier.map((l) => l.nom),
    ['A', 'D'],
  )
  assert.equal(b.regressions.length + b.pannes.length, 0)
  assert.equal(b.echec, false)
})

test('rapport : le tableau par famille et les sections qui ont un contenu', () => {
  const b = comparer([releve('chromium', 'L', [joue('A', 0), joue('B', 0), joue('C', 3), joue('D', 3)])], reference)
  const texte = rapport(b, { date: '2026-11-13', commit: 'abc1234' })
  assert.match(texte, /^# Campagne de test de la v2, 2026-11-13 \(abc1234\)/)
  assert.match(texte, /\| suivi \| 1\/3 \|/, 'les diagnostics ne comptent pas dans le tableau')
  assert.match(texte, /## Régressions \(1\)/)
  assert.match(texte, /## Défauts connus toujours là \(1\)/)
  assert.match(texte, /y-prosemirror#245/)
  assert.doesNotMatch(texte, /## Scripts en panne/)
  assert.match(
    rapport(comparer([releve('chromium', 'L', [joue('A', 3)])], reference), { date: 'x' }),
    /Aucune régression/,
  )
})

test('référence de départ : attendu si le scénario passe partout, connu sinon, diagnostic d’après son nom', () => {
  const r = referenceDepuis(
    [
      releve('chromium', 'L', [joue('A', 3), joue('B', 3), joue('H13 (diagnostic de 4) relevé', 0)]),
      releve('webkit', 'L', [joue('A', 3), joue('B', 0)]),
      releve('firefox', 'L', [joue('A', 0)]),
    ],
    ['chromium/L', 'webkit/L'],
    { qualifiees: [], scenarios: { [cle('suivi', 'A')]: { statut: 'connu', note: 'déjà classé' } } },
  )
  assert.deepEqual(r.qualifiees, ['chromium/L', 'webkit/L'])
  assert.equal(r.scenarios[cle('suivi', 'A')].note, 'déjà classé', 'un scénario déjà classé n’est pas touché')
  assert.equal(r.scenarios[cle('suivi', 'B')].statut, 'connu')
  assert.equal(r.scenarios[cle('suivi', 'H13 (diagnostic de 4) relevé')].statut, 'diagnostic')
})
