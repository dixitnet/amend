// Les images orphelines (23/10/2026).
//
// Une image collée est déposée dans `data/uploads/<document>/<nom>.png|jpg`, et
// le document ne garde que son adresse (voir uploads.js). Supprimer l'image du
// texte n'efface donc pas le fichier : sans ce nettoyage, il resterait sur le
// disque — et dans le quota du propriétaire — jusqu'à la suppression du
// document entier.
//
// **Qu'est-ce qu'une image « encore utilisée » ?** Pas seulement celle qui est
// dans le texte aujourd'hui. Il faut aussi garder :
//
//   - celles que contient une **version enregistrée** : restaurer une version
//     fait revenir ses images ;
//   - celles de la **page publiée**, qui les sert depuis le dossier du
//     document ;
//   - celles dont le journal garde encore la trace (une suppression en suivi
//     de modifications laisse l'image dans le texte, barrée) ;
//   - celles qu'un **autre** document référence : coller une image d'un
//     document dans un autre garde son adresse d'origine.
//
// **Comment on les trouve.** Le serveur ne décode pas les opérations Yjs (voir
// l'invariant en tête de storage.js), et il n'en a pas besoin : l'adresse d'une
// image est une chaîne de caractères ASCII, écrite telle quelle dans le journal
// et dans les instantanés. On cherche donc `/api/docs/<id>/images/<nom>` dans
// les octets. Le test est **prudent par construction** : il peut garder à tort
// un fichier (une trace oubliée dans un journal), jamais en supprimer un qui
// est encore référencé.
//
// **Trois garde-fous de plus.**
//   - Un délai de grâce (7 jours par défaut) : un fichier récent n'est jamais
//     supprimé, même sans référence. Il couvre l'image qu'on vient de déposer
//     et dont le journal n'est pas encore écrit (200 ms de tampon), et le
//     retour en arrière (Ctrl+Z) d'une personne qui a supprimé une image.
//   - Une source illisible interrompt tout : si un journal ou une version n'a
//     pu être lu, on ne sait pas ce qu'il référence, donc on ne supprime rien.
//   - Les noms sont revalidés avant toute suppression, comme à la lecture
//     (uploads.js) : rien d'autre qu'une image de `uploads/` n'est effleuré.
//
// Ce module ne touche qu'au disque : il se lance aussi bien depuis le
// back-office que depuis la ligne de commande (tools/nettoyer-images.mjs),
// serveur arrêté ou non.

import { existsSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

export const DELAI_GRACE_JOURS = 7

const JOUR_MS = 24 * 3600 * 1000
const NOM_IMAGE = /^[A-Za-z0-9_-]{8,40}\.(png|jpg)$/
const NOM_DOC = /^[A-Za-z0-9_-]+$/
const REF_ABSOLUE = /^\/api\/docs\/([A-Za-z0-9_-]+)\/images\/([A-Za-z0-9_-]{8,40}\.(?:png|jpg))/
const REF_RELATIVE = /^images\/([A-Za-z0-9_-]{8,40}\.(?:png|jpg))/
const MARQUE_ABSOLUE = Buffer.from('/api/docs/')
const MARQUE_RELATIVE = Buffer.from('images/')

/** Les références d'un contenu : l'identifiant du document et le nom. Pour une
 * page publiée (`docParDefaut`), les adresses sont relatives au document. */
function extraire(octets, { relatif = false, docParDefaut = null } = {}) {
  const trouvees = []
  const marque = relatif ? MARQUE_RELATIVE : MARQUE_ABSOLUE
  let i = octets.indexOf(marque)
  while (i !== -1) {
    // Une adresse tient largement dans 120 octets (identifiant de document +
    // nom de 40 caractères au plus).
    const morceau = octets.toString('latin1', i, i + 120)
    if (relatif) {
      const m = REF_RELATIVE.exec(morceau)
      if (m && docParDefaut) trouvees.push(`${docParDefaut}/${m[1]}`)
    } else {
      const m = REF_ABSOLUE.exec(morceau)
      if (m) trouvees.push(`${m[1]}/${m[2]}`)
    }
    i = octets.indexOf(marque, i + marque.length)
  }
  return trouvees
}

function fichiersDe(dossier, filtre) {
  try {
    return readdirSync(dossier).filter(filtre)
  } catch {
    return []
  }
}

/** Tout ce que le disque référence : un ensemble de `<document>/<nom>`.
 * `illisibles` liste les sources qu'on n'a pas pu lire — dans ce cas, le
 * résultat est incomplet et ne doit servir à rien supprimer. */
export function references(dataDir) {
  const refs = new Set()
  const illisibles = []
  const lire = (chemin, options) => {
    try {
      for (const r of extraire(readFileSync(chemin), options)) refs.add(r)
    } catch (err) {
      illisibles.push({ chemin, erreur: err.message })
    }
  }

  // Les journaux : un fichier `<id>.log` par document.
  for (const nom of fichiersDe(dataDir, (n) => /^[A-Za-z0-9_-]+\.log$/.test(n))) lire(join(dataDir, nom))

  // Les versions enregistrées : `versions/<id>/<horodatage>.bin`.
  const versions = join(dataDir, 'versions')
  for (const id of fichiersDe(versions, (n) => NOM_DOC.test(n))) {
    for (const nom of fichiersDe(join(versions, id), (n) => n.endsWith('.bin'))) lire(join(versions, id, nom))
  }

  // Les pages publiées : leur HTML nomme les images sans le document, qu'il
  // faut aller chercher dans le registre des publications.
  let publications = {}
  try {
    publications = JSON.parse(readFileSync(join(dataDir, 'publications.json'), 'utf8'))
  } catch (err) {
    if (existsSync(join(dataDir, 'publications.json'))) {
      illisibles.push({ chemin: join(dataDir, 'publications.json'), erreur: err.message })
    }
  }
  for (const [pubId, meta] of Object.entries(publications)) {
    if (!meta || !NOM_DOC.test(String(meta.docId || ''))) continue
    const page = join(dataDir, `pub-${pubId}.html`)
    if (existsSync(page)) lire(page, { relatif: true, docParDefaut: meta.docId })
  }
  return { refs, illisibles }
}

/**
 * Le tour des images stockées. Ne supprime rien.
 *
 *   { delaiJours, illisibles, fichiers, octets,
 *     documents: [{ docId, orphelines: [{ nom, octets, ageJours }], recentes, gardees }],
 *     orphelines: <nombre>, octetsOrphelines: <octets> }
 *
 * `recentes` : sans référence mais dans le délai de grâce. `gardees` :
 * référencées.
 */
export function analyserImages(dataDir, { delaiJours = DELAI_GRACE_JOURS, maintenant = Date.now() } = {}) {
  const { refs, illisibles } = references(dataDir)
  const racine = join(dataDir, 'uploads')
  const documents = []
  let fichiers = 0
  let octets = 0
  let orphelinesTotal = 0
  let octetsOrphelines = 0
  const grace = Math.max(0, Number(delaiJours) || 0) * JOUR_MS

  for (const docId of fichiersDe(racine, (n) => NOM_DOC.test(n))) {
    const dossier = join(racine, docId)
    let orphelines = []
    let recentes = 0
    let gardees = 0
    for (const nom of fichiersDe(dossier, (n) => NOM_IMAGE.test(n))) {
      let st
      try {
        st = statSync(join(dossier, nom))
      } catch {
        continue
      }
      fichiers++
      octets += st.size
      if (refs.has(`${docId}/${nom}`)) {
        gardees++
      } else if (maintenant - st.mtimeMs < grace) {
        recentes++
      } else {
        orphelines.push({ nom, octets: st.size, ageJours: Math.floor((maintenant - st.mtimeMs) / JOUR_MS) })
      }
    }
    orphelines = orphelines.sort((a, b) => b.octets - a.octets)
    if (orphelines.length || recentes || gardees) {
      documents.push({ docId, orphelines, recentes, gardees })
      orphelinesTotal += orphelines.length
      octetsOrphelines += orphelines.reduce((s, o) => s + o.octets, 0)
    }
  }
  documents.sort((a, b) => b.orphelines.length - a.orphelines.length || a.docId.localeCompare(b.docId))
  return {
    delaiJours: grace / JOUR_MS,
    illisibles,
    fichiers,
    octets,
    documents,
    orphelines: orphelinesTotal,
    octetsOrphelines,
  }
}

/** Supprime les images orphelines. Refuse (et ne supprime rien) si une source
 * n'a pu être lue. Rend ce qui a été fait. */
export function purgerImages(dataDir, options = {}) {
  const analyse = analyserImages(dataDir, options)
  if (analyse.illisibles.length) {
    return { ok: false, raison: 'source-illisible', illisibles: analyse.illisibles, supprimees: 0, octets: 0 }
  }
  const racine = join(dataDir, 'uploads')
  let supprimees = 0
  let octets = 0
  let echecs = 0
  for (const doc of analyse.documents) {
    if (!doc.orphelines.length) continue
    for (const { nom, octets: taille } of doc.orphelines) {
      // Revalidation : on ne supprime que ce que `Uploads.enregistrer` a pu
      // fabriquer.
      if (!NOM_DOC.test(doc.docId) || !NOM_IMAGE.test(nom)) continue
      try {
        unlinkSync(join(racine, doc.docId, nom))
        supprimees++
        octets += taille
      } catch {
        echecs++
      }
    }
    // Un dossier vidé disparaît avec ses fichiers ; sinon `rmdir` refuse.
    try {
      rmdirSync(join(racine, doc.docId))
    } catch {
      /* il reste des images : normal */
    }
  }
  return { ok: true, supprimees, octets, echecs }
}
