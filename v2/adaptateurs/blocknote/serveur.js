// Adaptateur BlockNote, côté serveur (couche 2) : lire et écrire un document
// Yjs 14 en blocs BlockNote, sans navigateur (exports, IA, imports, tests).
import { BlockNoteEditor } from '@blocknote/core'
import { yDocToBlocks, blocksToYDoc } from '@blocknote/core/y'
import * as Y from '@y/y'

let editeur = null
const editeurSansVue = () => (editeur ??= BlockNoteEditor.create())

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

/** L'état Yjs encodé d'un document fait de ces blocs. */
export function ecrireBlocs(blocs, racine = 'doc') {
  const doc = blocksToYDoc(editeurSansVue(), blocs, racine)
  try {
    return Y.encodeStateAsUpdate(doc)
  } finally {
    doc.destroy()
  }
}

/** Le texte brut d'une liste de blocs (pour comparer, compter, indexer). */
export function texteDesBlocs(blocs) {
  const lignes = []
  const parcourir = (liste) => {
    for (const b of liste) {
      if (Array.isArray(b.content)) lignes.push(b.content.map((c) => c.text ?? '').join(''))
      if (b.children?.length) parcourir(b.children)
    }
  }
  parcourir(blocs)
  return lignes.join('\n')
}
