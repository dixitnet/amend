// Correctif temporaire de y-prosemirror#245 (`adaptateurs/blocknote/correctif-245.js`) :
// écrire directement contre une correction affichée. À retirer avec lui.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Y from '@y/y'
import { brancherCorrectif245 } from '../../adaptateurs/blocknote/correctif-245.js'

/** Un texte, ses suggestions, une correctrice qui ajoute « Ajout » à la fin. */
function monter(idEditrice, idCorrectrice, { correctif = true } = {}) {
  const texte = new Y.Doc()
  const cote = new Y.Doc()
  const correctrice = new Y.Doc()
  texte.clientID = idEditrice
  cote.clientID = idEditrice + 1
  correctrice.clientID = idCorrectrice
  const de = (d) => d.get('doc')
  de(texte).insert(0, 'Il faisait nuit.')
  const afficheur = Y.createDiffRenderer(texte, cote)
  let curseur = null
  if (correctif)
    brancherCorrectif245(afficheur, texte, cote, (apres) => {
      curseur = Y.createAbsolutePositionFromRelativePosition(apres, cote)?.index ?? null
    })
  Y.applyUpdate(cote, Y.encodeStateAsUpdate(texte))
  Y.applyUpdate(correctrice, Y.encodeStateAsUpdate(cote))
  de(correctrice).insert(16, ' Ajout')
  Y.applyUpdate(cote, Y.encodeStateAsUpdate(correctrice), 'distant')
  // Comme en « Éditer » : on écrit directement, en voyant les corrections.
  afficheur.suggestionMode = false
  const rendu = () =>
    de(cote)
      .toDelta({ renderer: afficheur })
      .toJSON()
      .children.map((o) => (o.attribution ? `[${o.insert}]` : o.insert))
      .join('')
  /** Tape un mot, lettre à lettre, le curseur suivant la frappe comme dans l'éditeur. */
  const taper = async (indice, mot) => {
    let i = indice
    for (const lettre of mot) {
      curseur = null
      cote.transact(() => de(cote).insert(i, lettre))
      await null
      i = curseur ?? i + 1
    }
  }
  return { texte, cote, correctrice, de, rendu, taper, afficheur }
}

test('le défaut amont, sans le correctif : la frappe contre une correction reste en attente', async () => {
  const { texte, cote, de, taper } = monter(10, 500, { correctif: false })
  await taper(de(cote).toString().length, ' Paule')
  assert.equal(
    de(texte).toString(),
    'Il faisait nuit.',
    'la frappe n’atteint pas le texte : le jour où ce test échoue, l’amont est corrigé et le correctif peut partir',
  )
})

for (const [nom, idEditrice, idCorrectrice] of [
  ['identifiant de l’éditrice avant celui de la correctrice', 10, 500],
  ['identifiant de l’éditrice après celui de la correctrice', 500, 10],
])
  test(`écrire après, avant et dans une correction affichée : du texte, la correction intacte (${nom})`, async () => {
    const { texte, cote, correctrice, de, rendu, taper } = monter(idEditrice, idCorrectrice)
    await taper(de(cote).toString().indexOf(' Ajout') + 6, ' Paule')
    await taper(de(cote).toString().indexOf(' Ajout'), ' Devant')
    await taper(de(cote).toString().indexOf(' Ajout') + 3, ' Dedans')
    // Tout ce qu'a tapé l'éditrice est dans le texte, dans l'ordre de la frappe.
    for (const mot of [' Paule', ' Devant', ' Dedans']) assert.ok(de(texte).toString().includes(mot), mot)
    assert.ok(!de(texte).toString().includes('Ajout'), 'la correction n’est pas entrée dans le texte')
    // La correction reste une correction, d'un seul tenant.
    assert.ok(rendu().includes('[ Ajout]'), rendu())
    assert.equal(rendu().replace('[ Ajout]', ''), de(texte).toString(), 'hors la correction, le rendu est le texte')
    // Rien n'attend dans le texte : une fois la correction acceptée, chaque mot n'y est qu'une fois.
    Y.applyUpdate(texte, Y.encodeStateAsUpdate(correctrice))
    for (const mot of [' Paule', ' Devant', ' Dedans', ' Ajout'])
      assert.equal(de(texte).toString().split(mot).length - 1, 1, `${mot} : une seule fois après acceptation`)
  })

test('écrire loin d’une correction : rien ne change, la frappe va au texte comme avant', async () => {
  const { texte, cote, de, rendu, taper } = monter(10, 500)
  await taper(0, 'Ici. ')
  assert.equal(de(texte).toString(), 'Ici. Il faisait nuit.')
  assert.equal(rendu(), 'Ici. Il faisait nuit.[ Ajout]')
  assert.equal(de(cote).toString(), 'Ici. Il faisait nuit. Ajout')
})

test('en mode correction (suggestionMode), le correctif ne touche à rien : la frappe reste une correction', async () => {
  const { texte, cote, de, rendu, taper, afficheur } = monter(10, 500)
  // Comme en « Corriger ».
  afficheur.suggestionMode = true
  await taper(de(cote).toString().length, ' Paule')
  assert.equal(de(texte).toString(), 'Il faisait nuit.')
  assert.equal(rendu(), 'Il faisait nuit.[ Ajout Paule]')
})

test('corrections en attente : une frappe replacée ne laisse rien à arbitrer ; la correction acceptée, plus rien', async () => {
  const { resteDesCorrections } = await import('../../adaptateurs/blocknote/correctif-245.js')
  const { texte, cote, correctrice, de, taper, afficheur } = monter(500, 10)
  assert.equal(resteDesCorrections(afficheur, cote), true, 'la correction attend')
  await taper(de(cote).toString().length, ' Paule')
  assert.equal(resteDesCorrections(afficheur, cote), true, 'elle attend toujours')
  // La correction est acceptée : elle entre dans le texte.
  Y.applyUpdate(texte, Y.encodeStateAsUpdate(correctrice))
  assert.equal(resteDesCorrections(afficheur, cote), false, 'plus rien à arbitrer, malgré la trace de la frappe')
})

test('corrections en attente : une suppression suggérée d’un passage du texte reste à arbitrer', async () => {
  const { resteDesCorrections } = await import('../../adaptateurs/blocknote/correctif-245.js')
  const { texte, cote, correctrice, de, afficheur } = monter(500, 10)
  Y.applyUpdate(texte, Y.encodeStateAsUpdate(correctrice))
  assert.equal(resteDesCorrections(afficheur, cote), false)
  // La correctrice propose de supprimer « nuit ».
  de(correctrice).delete(11, 4)
  Y.applyUpdate(cote, Y.encodeStateAsUpdate(correctrice), 'distant')
  assert.equal(de(texte).toString().includes('nuit'), true, 'le texte garde le passage')
  assert.equal(resteDesCorrections(afficheur, cote), true, 'la suppression suggérée attend')
})
