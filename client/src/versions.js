// Page "Historique" — consultation seule des dernières versions stockées
// d'un document (voir README.md : historique léger, conception confirmée
// avec l'utilisateur avant implémentation). Pas de restauration dans cette
// première version, juste la liste des instants connus et un aperçu du
// contenu tel qu'il était à cet instant-là. Comme le reste de l'app, pas de
// contrôle d'accès : ouvert à qui a l'URL.

import { reconstructMarkdown, groupIntoVersions } from './historySnapshot.js'

function formatTs(ts) {
  if (!ts) return 'date inconnue'
  return new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export async function mountVersions(root, docId) {
  root.innerHTML = ''
  const wrap = document.createElement('div')
  wrap.className = 'home versions-page'

  const backLink = document.createElement('a')
  backLink.href = `#/doc/${docId}`
  backLink.className = 'back-link'
  backLink.textContent = '← Document'
  wrap.appendChild(backLink)

  const h1 = document.createElement('h1')
  h1.textContent = 'Historique'
  const subtitle = document.createElement('p')
  subtitle.className = 'subtitle'
  subtitle.textContent =
    'Les dernières versions enregistrées de ce document, classées de la plus récente à la plus ancienne. Consultation seule — pas de restauration pour l’instant.'
  wrap.append(h1, subtitle)

  const status = document.createElement('p')
  status.className = 'style-status'
  wrap.appendChild(status)

  const layout = document.createElement('div')
  layout.className = 'versions-layout'
  wrap.appendChild(layout)

  const list = document.createElement('ul')
  list.className = 'versions-list'
  layout.appendChild(list)

  const preview = document.createElement('div')
  preview.className = 'versions-preview'
  const previewPlaceholder = document.createElement('p')
  previewPlaceholder.className = 'versions-preview-placeholder'
  previewPlaceholder.textContent = 'Choisis une version dans la liste pour l’afficher ici.'
  preview.appendChild(previewPlaceholder)
  layout.appendChild(preview)

  root.appendChild(wrap)

  const [docRes, rawRes] = await Promise.all([
    fetch(`/api/docs/${docId}`),
    fetch(`/api/docs/${docId}/history/raw`),
  ])
  if (!docRes.ok) {
    status.textContent = 'Document introuvable.'
    return
  }
  const docMeta = await docRes.json()
  h1.textContent = `Historique — ${docMeta.title || 'Sans titre'}`

  if (!rawRes.ok) {
    status.textContent = "Impossible de charger l'historique pour l'instant."
    return
  }
  const { entries } = await rawRes.json()

  if (entries.length === 0) {
    status.textContent = 'Aucune opération enregistrée pour ce document.'
    return
  }

  const versions = groupIntoVersions(entries)
  status.textContent = `${versions.length} version${versions.length > 1 ? 's' : ''} — ${entries.length} opération${entries.length > 1 ? 's' : ''} au total.`

  let activeItem = null
  function selectVersion(item, version, isLatest) {
    if (activeItem) activeItem.classList.remove('active')
    item.classList.add('active')
    activeItem = item
    preview.innerHTML = ''
    const label = document.createElement('p')
    label.className = 'versions-preview-label'
    label.textContent = isLatest
      ? `Version actuelle — ${formatTs(version.ts)}`
      : `Version du ${formatTs(version.ts)}`
    preview.appendChild(label)
    const pre = document.createElement('pre')
    pre.className = 'versions-preview-content'
    try {
      pre.textContent = reconstructMarkdown(entries, version.count)
    } catch (err) {
      pre.textContent = `Impossible de reconstruire cette version (${err.message}).`
    }
    preview.appendChild(pre)
  }

  versions.forEach((version, i) => {
    const item = document.createElement('li')
    item.className = 'versions-list-item'
    const isLatest = i === 0
    const link = document.createElement('button')
    link.type = 'button'
    link.className = 'versions-list-link'
    const time = document.createElement('span')
    time.className = 'versions-list-time'
    time.textContent = formatTs(version.ts)
    link.appendChild(time)
    if (isLatest) {
      const badge = document.createElement('span')
      badge.className = 'versions-list-badge'
      badge.textContent = 'actuelle'
      link.appendChild(badge)
    }
    link.addEventListener('click', () => selectVersion(item, version, isLatest))
    item.appendChild(link)
    list.appendChild(item)
    if (isLatest) selectVersion(item, version, true)
  })
}
