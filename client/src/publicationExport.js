// « Publier sur le web », côté client : le document ProseMirror traduit
// dans le **modèle fermé** que le serveur sait rendre (server/publication.js).
//
// Pourquoi ce format plutôt que du HTML : le serveur n'accepte pas de HTML,
// délibérément. Une page publiée est lue sans session, sur le domaine où
// vivent les sessions ; faire reposer sa sûreté sur un filtre anti-`<script>`
// écrit à la main, ce serait parier sur l'exhaustivité de ce filtre. Ici,
// rien d'arbitraire ne peut traverser : ce qui n'a pas de type prévu ne
// franchit pas cette fonction, et ce qui n'est pas rendu côté serveur
// n'apparaît pas dans la page.
//
// Comme les trois autres exports, la page montre **l'état présent** du
// texte : les marques de suivi ressortent en texte normal, rien n'est
// accepté ni rejeté au passage — mais personne n'a à lire les ratures de
// l'auteur sur une page publique.

const MARQUES_GARDEES = new Set(['strong', 'em', 'underline', 'strike'])

function inline(node) {
  const out = []
  node.forEach((child) => {
    if (child.type.name === 'hard_break') {
      out.push({ type: 'saut' })
      return
    }
    if (child.type.name === 'image') {
      const img = imageDe(child)
      if (img) out.push(img)
      return
    }
    if (!child.isText) return
    const marques = child.marks.map((m) => m.type.name).filter((n) => MARQUES_GARDEES.has(n))
    out.push({ type: 'texte', texte: child.text, marques })
  })
  return out
}

function imageDe(node) {
  const src = String(node.attrs.src || '')
  const nom = src.split('/').pop()
  if (!/^[A-Za-z0-9_-]{8,40}\.(png|jpg)$/.test(nom)) return null
  return { type: 'image', nom, alt: node.attrs.alt || '' }
}

function items(node) {
  const out = []
  node.forEach((item) => {
    const blocs = []
    item.forEach((enfant) => {
      const b = bloc(enfant)
      if (b) blocs.push(b)
    })
    out.push({ blocs, fait: !!item.attrs.checked })
  })
  return out
}

function bloc(node) {
  switch (node.type.name) {
    case 'paragraph':
      return { type: 'paragraphe', contenu: inline(node) }
    case 'heading':
      return { type: 'titre', niveau: Math.min(5, Math.max(1, node.attrs.level)), contenu: inline(node) }
    case 'blockquote': {
      const blocs = []
      node.forEach((enfant) => {
        const b = bloc(enfant)
        if (b) blocs.push(b)
      })
      return { type: 'citation', blocs }
    }
    case 'bullet_list':
      return { type: 'liste', items: items(node) }
    case 'ordered_list':
      return { type: 'liste-ordonnee', items: items(node) }
    case 'task_list':
      return { type: 'taches', items: items(node) }
    case 'table': {
      const lignes = []
      node.forEach((row) => {
        const cellules = []
        row.forEach((cell) => {
          let contenu = []
          cell.forEach((b) => {
            contenu = contenu.concat(inline(b))
          })
          cellules.push(contenu)
        })
        lignes.push(cellules)
      })
      return { type: 'tableau', lignes }
    }
    case 'image': {
      const img = imageDe(node)
      return img ? { type: 'image', nom: img.nom, alt: img.alt } : null
    }
    case 'horizontal_rule':
      // Dans l'éditeur, la ligne horizontale est un saut de page (schema.js).
      // Sur une page web, il n'y a pas de page : c'est une séparation.
      return { type: 'separation' }
    default:
      return null
  }
}

/** Le document, dans le modèle que le serveur sait rendre. */
export function docPourPublication(doc) {
  const blocs = []
  doc.forEach((node) => {
    const b = bloc(node)
    if (b) blocs.push(b)
  })
  return blocs
}

export async function etatPublication(docId) {
  const res = await fetch(`/api/docs/${docId}/publication`)
  if (!res.ok) throw new Error(`état indisponible (${res.status})`)
  return res.json()
}

export async function publier(docId, doc, titre) {
  const res = await fetch(`/api/docs/${docId}/publication`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ titre, blocs: docPourPublication(doc) }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `la publication a échoué (${res.status})`)
  return data
}

export async function depublier(docId) {
  const res = await fetch(`/api/docs/${docId}/publication`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`le retrait a échoué (${res.status})`)
  return res.json()
}
