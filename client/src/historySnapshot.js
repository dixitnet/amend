// Historique léger (voir server/storage.js : getHistoryMeta/getHistoryRaw/
// compactDoc, et README.md pour la conception complète). Deux
// responsabilités bien séparées :
//   - reconstruire le Markdown d'une version passée à partir des opérations
//     Yjs brutes (pour la page de consultation, voir versions.js) ;
//   - déclencher la compaction quand le serveur signale qu'il y a trop
//     d'opérations stockées (needsCompaction).
// Les deux se font ici plutôt que côté serveur parce que fusionner des
// mises à jour Yjs est une opération Yjs — voir l'invariant "zéro
// dépendance yjs côté serveur" documenté en tête de server/storage.js.
// L'un et l'autre travaillent sur un Y.Doc jetable, jamais sur celui de
// l'éditeur en cours (ydoc dans editor.js) : aucun risque d'interférer
// avec une session d'édition en cours.

import * as Y from 'yjs'
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import { schema } from './schema.js'
import { docToMarkdown } from './mdExport.js'

// Doit correspondre au nom utilisé dans editor.js (ydoc.getXmlFragment(...))
// — sinon la reconstruction retomberait sur un fragment vide.
const XML_FRAGMENT_NAME = 'prosemirror-content'

function bytesToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x8000 // évite un dépassement de pile avec un très gros tableau
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

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

/** À appeler ponctuellement (ex. juste après la connexion, voir editor.js)
 * pour compacter le journal d'un document si le serveur estime qu'il y a
 * trop d'opérations stockées. Ne fait rien si ce n'est pas nécessaire.
 * Best-effort et silencieux : un échec (réseau, ou une autre compaction/de
 * nouvelles frappes survenues entre-temps — le serveur répond alors 409)
 * n'affecte ni l'édition en cours ni la consultation de l'historique, juste
 * la taille du journal sur disque ; un prochain appel (une prochaine
 * connexion, la sienne ou celle de quelqu'un d'autre) retentera. */
export async function runCompactionIfNeeded(docId) {
  try {
    const metaRes = await fetch(`/api/docs/${docId}/history`)
    if (!metaRes.ok) return
    const meta = await metaRes.json()
    if (!meta.needsCompaction) return

    const rawRes = await fetch(`/api/docs/${docId}/history/raw`)
    if (!rawRes.ok) return
    const { entries } = await rawRes.json()
    if (entries.length !== meta.count) return // a changé entre-temps, on laisse la prochaine tentative s'en charger

    // -1 : l'instantané fusionné occupe lui-même une "opération" dans le
    // journal résultant (voir getHistoryMeta/compactDoc côté serveur). Sans
    // ce -1, chaque compaction ramènerait le compte à maxUncompactedOps + 1
    // (les entrées gardées, plus le snapshot) — toujours strictement
    // au-dessus du seuil, donc needsCompaction resterait vrai pour toujours
    // et chaque nouvelle connexion redéclencherait une compaction inutile.
    const keepFromIndex = entries.length - (meta.maxUncompactedOps - 1)
    if (keepFromIndex <= 0) return

    const scratch = new Y.Doc()
    let baseSnapshot
    try {
      for (let i = 0; i < keepFromIndex; i++) {
        Y.applyUpdate(scratch, base64ToBytes(entries[i].data))
      }
      baseSnapshot = Y.encodeStateAsUpdate(scratch)
    } finally {
      scratch.destroy()
    }

    await fetch(`/api/docs/${docId}/compact`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseSnapshot: bytesToBase64(baseSnapshot),
        baseTs: entries[keepFromIndex - 1].ts,
        keepFromIndex,
        expectedTotalBeforeCompaction: entries.length,
      }),
    })
  } catch {
    // Best-effort — voir le commentaire de la fonction.
  }
}
