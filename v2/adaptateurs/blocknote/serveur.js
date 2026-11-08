// Adaptateur BlockNote, côté serveur (couche 2) : lire et écrire un document
// Yjs 14 en blocs BlockNote, sans navigateur (exports, IA, imports, tests).
import { BlockNoteEditor } from '@blocknote/core'
import { yDocToBlocks, blocksToYDoc } from '@blocknote/core/y'
import * as Y from '@y/y'
import { schemaLivre } from './schema.js'

let editeur = null
const editeurSansVue = () => (editeur ??= BlockNoteEditor.create({ schema: schemaLivre }))

/** Les blocs d'un document, depuis son état Yjs encodé. Un état illisible
 * lève une erreur de code `document-illisible`, jamais une erreur interne. */
export function lireBlocs(etat, racine = 'doc') {
  const doc = new Y.Doc()
  try {
    Y.applyUpdate(doc, etat)
    return yDocToBlocks(editeurSansVue(), doc, racine)
  } catch (cause) {
    throw Object.assign(new Error('document illisible', { cause }), { code: 'document-illisible' })
  } finally {
    doc.destroy()
  }
}

/** L'état Yjs encodé d'un document fait de ces blocs. Des blocs hors du
 * schéma du livre lèvent une erreur de code `blocs-invalides`. */
export function ecrireBlocs(blocs, racine = 'doc') {
  let doc
  try {
    doc = blocksToYDoc(editeurSansVue(), blocs, racine)
  } catch (cause) {
    throw Object.assign(new Error('blocs invalides', { cause }), { code: 'blocs-invalides' })
  }
  try {
    return Y.encodeStateAsUpdate(doc)
  } finally {
    doc.destroy()
  }
}

/** Le texte brut d'une liste de blocs (pour comparer, compter, indexer) : un
 * bloc par ligne, une ligne de tableau par ligne (cellules séparées par une
 * tabulation). */
export function texteDesBlocs(blocs) {
  const lignes = []
  const enLigne = (contenu) =>
    (contenu || []).map((c) => c.text ?? (Array.isArray(c.content) ? enLigne(c.content) : '')).join('')
  const parcourir = (liste) => {
    for (const b of liste) {
      if (Array.isArray(b.content)) lignes.push(enLigne(b.content))
      else if (b.content?.type === 'tableContent')
        for (const rangee of b.content.rows) lignes.push(rangee.cells.map((c) => enLigne(c.content ?? c)).join('\t'))
      if (b.children?.length) parcourir(b.children)
    }
  }
  parcourir(blocs)
  return lignes.join('\n')
}
