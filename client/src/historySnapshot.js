// Historique léger (voir server/storage.js : getHistoryMeta/getHistoryRaw) :
// reconstruire le Markdown d'une version passée à partir des opérations
// Yjs brutes (pour la page de consultation, voir versions.js). Sur un Y.Doc
// jetable, jamais sur celui de l'éditeur en cours (ydoc dans editor.js).
//
// Le compactage, qui vivait aussi ici, est fait par le serveur depuis le
// 29/09/2026 (server/replique.js) : il tient une réplique du document, et
// l'instantané n'a plus à être calculé par un navigateur.

import * as Y from 'yjs'
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import { schema } from './schema.js'
import { docToMarkdown } from './mdExport.js'

// Doit correspondre au nom utilisé dans editor.js (ydoc.getXmlFragment(...))
// — sinon la reconstruction retomberait sur un fragment vide.
const XML_FRAGMENT_NAME = 'prosemirror-content'

function base64ToBytes(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Reconstruit le Markdown du document tel qu'il était juste après les
 * `count` premières opérations de `entries` (voir getHistoryRaw côté
 * serveur — entries[i].data est une mise à jour Yjs encodée en base64).
 * `count === entries.length` reconstruit l'état actuel. Construit un Y.Doc
 * jetable, ne touche jamais au document Yjs de l'éditeur en cours. */
export function reconstructMarkdown(entries, count) {
  const scratch = new Y.Doc()
  try {
    for (let i = 0; i < count; i++) {
      Y.applyUpdate(scratch, base64ToBytes(entries[i].data))
    }
    const xml = scratch.getXmlFragment(XML_FRAGMENT_NAME)
    const rootNode = yXmlFragmentToProseMirrorRootNode(xml, schema)
    return docToMarkdown(rootNode)
  } finally {
    scratch.destroy()
  }
}

/** Regroupe les opérations brutes en "versions" : une par horodatage
 * distinct plutôt qu'une par opération individuelle, parce qu'une rafale de
 * frappes tombées dans la même fenêtre de flush (voir FLUSH_DELAY_MS,
 * server/storage.js) partage déjà le même horodatage enregistré — les
 * afficher une par une n'apporterait rien pour une page qui montre "les
 * dernières versions selon leur horaire". Garde l'index de la dernière
 * opération de chaque horodatage (l'état le plus complet à cet instant),
 * trié du plus récent au plus ancien. */
export function groupIntoVersions(entries) {
  const versions = []
  for (let i = 0; i < entries.length; i++) {
    const ts = entries[i].ts
    if (versions.length && versions[versions.length - 1].ts === ts) {
      versions[versions.length - 1].count = i + 1
    } else {
      versions.push({ ts, count: i + 1 })
    }
  }
  return versions.reverse()
}
