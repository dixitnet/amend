// Règle 1 révisée (08/11/2026) : les extensions importent ce qu'exigent les
// points d'extension de BlockNote, dans les versions que BlockNote embarque ;
// seconde révision (09/11/2026) : la partie serveur de l'adaptateur BlockNote
// importe aussi `prosemirror-transform` et `lib0`, l'adaptateur y/hub `lib0`.
// Deux copies de ProseMirror feraient deux mondes incompatibles (un greffon
// créé avec l'une ne serait pas reconnu par l'autre) : une seule copie de
// chacun, déclarée en version exacte, et celle que BlockNote demande.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const V2 = new URL('../..', import.meta.url).pathname
const lire = (f) => JSON.parse(readFileSync(V2 + f, 'utf8'))
const verrou = lire('package-lock.json').packages
const declares = lire('package.json').dependencies
const PAQUETS = [
  'prosemirror-state',
  'prosemirror-model',
  'prosemirror-transform',
  '@handlewithcare/prosemirror-inputrules',
]

for (const paquet of PAQUETS)
  test(`${paquet} : une seule copie, en version exacte, celle de BlockNote`, () => {
    const copies = Object.keys(verrou).filter(
      (c) => c === `node_modules/${paquet}` || c.endsWith(`/node_modules/${paquet}`),
    )
    assert.deepEqual(copies, [`node_modules/${paquet}`], 'une seule copie installée')
    const installee = verrou[`node_modules/${paquet}`].version
    assert.equal(declares[paquet], installee, 'déclarée en version exacte, celle installée')
    assert.ok(verrou['node_modules/@blocknote/core'].dependencies[paquet], `BlockNote (core) déclare ${paquet}`)
    // Tous les paquets @blocknote/* installés qui déclarent ce paquet (en
    // dépendance ou en pair) : la copie unique doit satisfaire chacun, pas
    // seulement @blocknote/core.
    const demandeurs = Object.entries(verrou).filter(
      ([chemin, m]) =>
        /^node_modules\/@blocknote\/[^/]+$/.test(chemin) && (m.dependencies?.[paquet] || m.peerDependencies?.[paquet]),
    )
    assert.ok(demandeurs.length >= 1)
    for (const [chemin, m] of demandeurs) {
      const demandee = m.dependencies?.[paquet] ?? m.peerDependencies[paquet]
      // Seule la forme « ^x.y.z » est lue : toute autre forme (~, plage,
      // préversion) doit faire relire ce contrat, pas passer en silence.
      assert.match(demandee, /^\^\d+\.\d+\.\d+$/, `${chemin} : forme de version non prise en charge : ${demandee}`)
      const [maj, min, cor] = installee.split('.').map(Number)
      const [dmaj, dmin, dcor] = demandee.replace(/^\^/, '').split('.').map(Number)
      assert.ok(
        maj === dmaj && (min > dmin || (min === dmin && cor >= dcor)),
        `${installee} satisfait la demande de ${chemin} (${demandee})`,
      )
    }
  })

test('lib0 : une seule copie, en version exacte, celle que demande BlockNote (y/hub, qui accepte une fourchette, a donc la même)', () => {
  const copies = Object.keys(verrou).filter((c) => c === 'node_modules/lib0' || c.endsWith('/node_modules/lib0'))
  assert.deepEqual(copies, ['node_modules/lib0'], 'une seule copie installée')
  const installee = verrou['node_modules/lib0'].version
  assert.equal(declares.lib0, installee, 'déclarée en version exacte, celle installée')
  assert.equal(verrou['node_modules/@blocknote/core'].dependencies.lib0, installee, 'celle de BlockNote')
})
