// Adaptateur BlockNote, côté serveur (couche 2) : lire un document Yjs 14 en
// blocs BlockNote, sans navigateur (exports, IA, contrats).
import { BlockNoteEditor } from '@blocknote/core'
import { yDocToBlocks } from '@blocknote/core/y'
import * as Y from '@y/y'

/** Les blocs d'un document, depuis son état Yjs encodé. */
export function lireBlocs(etat, racine = 'doc') {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, etat)
  const editeur = BlockNoteEditor.create()
  try {
    return yDocToBlocks(editeur, doc, racine)
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
