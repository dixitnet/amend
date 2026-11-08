// Règle 1 révisée (08/11/2026) : les extensions importent ce qu'exigent les
// points d'extension de BlockNote, dans les versions que BlockNote embarque.
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
const PAQUETS = ['prosemirror-state', 'prosemirror-model', '@handlewithcare/prosemirror-inputrules']

for (const paquet of PAQUETS)
  test(`${paquet} : une seule copie, en version exacte, celle de BlockNote`, () => {
    const copies = Object.keys(verrou).filter(
      (c) => c === `node_modules/${paquet}` || c.endsWith(`/node_modules/${paquet}`),
    )
    assert.deepEqual(copies, [`node_modules/${paquet}`], 'une seule copie installée')
    const installee = verrou[`node_modules/${paquet}`].version
    assert.equal(declares[paquet], installee, 'déclarée en version exacte, celle installée')
    const demandee = verrou['node_modules/@blocknote/core'].dependencies[paquet]
    assert.ok(demandee, `BlockNote déclare ${paquet}`)
    const [maj, min, cor] = installee.split('.').map(Number)
    const [dmaj, dmin, dcor] = demandee.replace(/^\^/, '').split('.').map(Number)
    assert.ok(
      maj === dmaj && (min > dmin || (min === dmin && cor >= dcor)),
      `${installee} satisfait la demande de BlockNote (${demandee})`,
    )
  })
