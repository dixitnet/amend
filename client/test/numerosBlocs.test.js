// Les numéros de bloc affichés à gauche du texte (02/10/2026).
//
// Le but du réglage : que le numéro vu à l'écran soit **celui que Claude voit**
// (`plan`, `lire` — server/agentTexte.js, `blocsDuDocument`). Le comptage est
// fait par un compteur CSS ; ce fichier vérifie que la liste d'éléments qu'il
// compte, appliquée au vrai rendu du schéma, donne le même nombre de blocs,
// dans le même ordre, que le moteur du serveur. Ce que le banc ne voit pas :
// l'alignement à l'écran, à regarder dans un navigateur.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { JSDOM } from 'jsdom'
import * as Y from 'yjs'
import { DOMSerializer } from 'prosemirror-model'
import { prosemirrorToYXmlFragment } from 'y-prosemirror'
import { schema } from '../src/schema.js'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const YS = await import(pathToFileURL(join(racine, 'node_modules', 'yjs', 'dist', 'yjs.mjs')).href)
const { blocsDuDocument } = await import(pathToFileURL(join(racine, 'server', 'agentTexte.js')).href)
const CSS = readFileSync(join(racine, 'client', 'src', 'style.css'), 'utf8')

const n = schema.nodes
const para = (t) => n.paragraph.create(null, t ? [schema.text(t)] : [])
const titre = (niveau, t) => n.heading.create({ level: niveau }, [schema.text(t)])
const item = (t) => n.list_item.create(null, [para(t)])
const cellule = (t) => n.table_cell.create(null, [para(t)])
const entete = (t) => n.table_header.create(null, [para(t)])

/** Un document qui a de tout : ce qui compte pour le serveur (paragraphes,
 * titres, éléments de liste, citations, cellules, vides compris) et ce qui
 * n'en est pas (image, table des matières, ligne, note). */
function documentComplet() {
  return n.doc.create(null, [
    titre(1, 'Titre'),
    para('Premier paragraphe.'),
    para(''),
    n.paragraph.create(null, [schema.text('Avant la note'), n.footnote.create(), schema.text(' après.')]),
    n.table_of_contents.create({ profondeur: 2 }),
    n.bullet_list.create(null, [item('Un'), item('Deux')]),
    n.ordered_list.create(null, [item('Premier'), item('Second')]),
    n.task_list.create(null, [n.task_item.create({ checked: false }, [para('À faire')])]),
    n.blockquote.create(null, [para('Une citation.'), para('Sa suite.')]),
    n.horizontal_rule.create(),
    titre(2, 'Sous-titre'),
    n.table.create(null, [
      n.table_row.create(null, [entete('A'), entete('B')]),
      n.table_row.create(null, [cellule('a1'), cellule('')]),
    ]),
    n.image.create({ src: '/api/docs/abcdefgh1234/images/x.png' }),
    titre(3, 'Dernier'),
    para('Fin.'),
  ])
}

const NOEUDS_ECARTES = /^(table_of_contents|image|horizontal_rule)$/

function blocsServeur(pmDoc) {
  const client = new Y.Doc()
  prosemirrorToYXmlFragment(pmDoc, client.getXmlFragment('prosemirror-content'))
  const serveur = new YS.Doc()
  YS.applyUpdate(serveur, Y.encodeStateAsUpdate(client))
  return blocsDuDocument(serveur)
}

/** Les balises que le compteur CSS numérote, lues dans la feuille de style
 * elle-même — pas recopiées ici. */
function balisesNumerotees() {
  const m = CSS.match(/:is\(((?:p|h1)[^)]*)\):not\(\[data-table-of-contents\] \*\) \{\s*counter-increment: bloc;/)
  assert.ok(m, 'la règle du compteur est dans la feuille de style')
  return m[1].split(',').map((s) => s.trim())
}

test('le compteur CSS numérote exactement les blocs que le serveur numérote', () => {
  const pm = documentComplet()
  const serveur = blocsServeur(pm)

  const dom = new JSDOM('<!DOCTYPE html><body></body>')
  const document = dom.window.document
  const racineDom = document.createElement('div')
  racineDom.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(pm.content, { document }))
  // La table des matières est une vue : l'éditeur y met ses propres <p>.
  const toc = racineDom.querySelector('[data-table-of-contents]')
  assert.ok(toc, 'la table des matières est rendue')
  toc.appendChild(document.createElement('p'))

  const balises = balisesNumerotees()
  const comptes = [...racineDom.querySelectorAll('*')].filter(
    (el) => balises.includes(el.tagName.toLowerCase()) && !el.closest('[data-table-of-contents]')
  )

  assert.equal(comptes.length, serveur.length, 'même nombre de blocs que le moteur du serveur')
  // Même ordre : le texte de chaque bloc est le même (les notes vides n'ajoutent rien).
  assert.deepEqual(
    comptes.map((el) => el.textContent),
    serveur.map((b) => b.texte.replace(/⟦\d+⟧/g, ''))
  )
  // Et le document est bien celui qu'on croit : vides et cellules comprises.
  assert.ok(serveur.length >= 17, `un document complet (${serveur.length} blocs)`)
  assert.ok(serveur.some((b) => b.texte === ''), 'les blocs vides sont comptés')
})

test('la liste des balises couvre tous les blocs de texte du schéma', () => {
  const balises = new Set(balisesNumerotees())
  const vus = new Set()
  for (const [nom, type] of Object.entries(n)) {
    if (!type.isTextblock) continue
    // Un titre se rend en h1, h2 ou h3 selon son niveau.
    const niveaux = nom === 'heading' ? [1, 2, 3] : [null]
    for (const niveau of niveaux) {
      const noeud = type.createAndFill(niveau ? { level: niveau } : null)
      const sortie = type.spec.toDOM(noeud)
      const balise = Array.isArray(sortie) ? sortie[0] : sortie.tagName.toLowerCase()
      vus.add(balise)
      assert.ok(balises.has(balise), `« ${nom} » se rend en <${balise}>, que le compteur ne numérote pas`)
    }
  }
  assert.ok(vus.has('p') && vus.has('h1'), 'le test a bien parcouru paragraphes et titres')
  assert.ok(![...Object.keys(n)].some((k) => NOEUDS_ECARTES.test(k) && n[k].isTextblock), 'image, table des matières et ligne ne sont pas des blocs de texte')
})

test('la feuille de style limite les numéros à l’éditeur principal, hors téléphone', () => {
  const bloc = CSS.slice(CSS.indexOf('/* --- Numéros de bloc'))
  const regles = [...bloc.matchAll(/^([^\n{}/*][^{}]*)\{/gm)].map((m) => m[1])
  assert.ok(regles.length >= 4)
  for (const r of regles) {
    assert.match(r, /\.editor-container\.numeros-blocs > \.ProseMirror/, `limité à l’éditeur principal : ${r.slice(0, 60)}`)
    assert.match(r, /:not\(\.tel-lecture\):not\(\.tel-edition\)/, `jamais sur téléphone : ${r.slice(0, 60)}`)
  }
  // Rien à la sélection : le numéro n'est ni copié ni cliquable.
  assert.match(bloc, /user-select: none/)
  assert.match(bloc, /pointer-events: none/)
})
