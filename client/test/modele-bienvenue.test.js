// Le document de bienvenue qu'on remet à un testeur embarqué (01/10/2026,
// server/modeleBienvenue.js) : écrit côté serveur directement dans Yjs, relu
// ici avec le **vrai schéma du client**. Ce qu'on vérifie : que la forme que
// le serveur imagine est bien celle que y-prosemirror relit (un titre est un
// titre, la liste est une liste valide), que les marques sont celles du
// schéma et pas des marques de suivi — c'est un point de départ neutre, pas
// une proposition —, et que le gras ne déborde pas sur la suite.

import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import * as Y from 'yjs'
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import { schema } from '../src/schema.js'

// Le yjs du serveur, chargé depuis le même fichier que le module testé.
const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const YS = await import(pathToFileURL(join(racine, 'node_modules', 'yjs', 'dist', 'yjs.mjs')).href)
const { ecrireModele, BLOCS_BIENVENUE, TITRE_BIENVENUE } = await import(
  pathToFileURL(join(racine, 'server', 'modeleBienvenue.js')).href
)

function relire() {
  const serveur = new YS.Doc()
  ecrireModele(serveur)
  const client = new Y.Doc()
  Y.applyUpdate(client, YS.encodeStateAsUpdate(serveur))
  return yXmlFragmentToProseMirrorRootNode(client.getXmlFragment('prosemirror-content'), schema)
}

test('le document relu est valide pour le schéma du client', () => {
  const pm = relire()
  pm.check() // lève si un nœud n'est pas à sa place
  assert.ok(pm.childCount >= 5)
})

test('le premier bloc est le titre, de niveau 1, et reprend le titre du document', () => {
  const pm = relire()
  const titre = pm.firstChild
  assert.equal(titre.type.name, 'heading')
  assert.equal(titre.attrs.level, 1)
  assert.equal(titre.textContent, TITRE_BIENVENUE)
})

test('les niveaux de titre restent dans ceux que le schéma sait styler', () => {
  const pm = relire()
  const niveaux = []
  pm.forEach((n) => n.type.name === 'heading' && niveaux.push(n.attrs.level))
  assert.ok(niveaux.length >= 3)
  for (const n of niveaux) assert.ok(n >= 1 && n <= 3, `niveau ${n}`)
})

test('aucune marque de suivi, aucun saut tracé : un texte neutre', () => {
  const pm = relire()
  const vues = new Set()
  pm.descendants((n) => {
    if (n.attrs && 'trackedBreak' in n.attrs) assert.equal(n.attrs.trackedBreak, null)
    if (n.isText) for (const m of n.marks) vues.add(m.type.name)
  })
  assert.deepEqual([...vues].sort(), ['em', 'strong'])
})

test('la liste à puces est une vraie liste de quatre éléments, chacun en gras puis en texte', () => {
  const pm = relire()
  let liste = null
  pm.forEach((n) => n.type.name === 'bullet_list' && (liste = n))
  assert.ok(liste, 'une liste à puces')
  assert.equal(liste.childCount, 4)
  liste.forEach((item) => {
    assert.equal(item.type.name, 'list_item')
    const p = item.firstChild
    assert.equal(p.type.name, 'paragraph')
    assert.ok(p.firstChild.marks.some((m) => m.type.name === 'strong'), 'le début de l’élément est en gras')
    assert.ok(!p.lastChild.marks.some((m) => m.type.name === 'strong'), 'le gras ne déborde pas sur la suite')
  })
})

test('l’italique et le gras ne portent que sur leur morceau', () => {
  const pm = relire()
  const marques = new Map()
  pm.descendants((n) => {
    if (n.isText) marques.set(n.text, n.marks.map((m) => m.type.name))
  })
  assert.deepEqual(marques.get('propose'), ['em'])
  assert.deepEqual(marques.get('jamais le contenu de vos documents'), ['strong'])
  for (const [texte, ms] of marques) {
    if (texte !== 'propose') assert.ok(!ms.includes('em'), `« ${texte.slice(0, 30)}… » sans italique`)
  }
})

test('le texte relu contient tout ce que les données annoncent', () => {
  const pm = relire()
  const attendu = []
  for (const b of BLOCS_BIENVENUE) {
    if (b.type === 'bullet_list') for (const it of b.items) attendu.push(it.map(([t]) => t).join(''))
    else attendu.push(b.texte.map(([t]) => t).join(''))
  }
  const lu = []
  pm.descendants((n) => {
    if (n.isTextblock) lu.push(n.textContent)
  })
  assert.deepEqual(lu, attendu)
})

test('un paragraphe d’exercice avec de vraies fautes est présent', () => {
  const pm = relire()
  assert.ok(pm.textContent.includes('Ils mange des pomme'))
})
