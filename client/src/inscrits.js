// La liste d'attente, en détail — page `#/inscrits`, administrateurs seuls.
//
// Le compteur de la page d'accueil est public ; cette page ne l'est
// jamais. Ce sont des adresses de personnes qui ont laissé leur
// coordonnée, pas un annuaire : la route serveur vérifie `ADMIN_EMAILS` et
// répond 403 à tout le reste, et cette page n'affiche donc rien qu'elle
// n'ait obtenu de là.
//
// Le fichier empile les envois sans dédupliquer (décision du 14/09) : une
// personne qui s'inscrit trois fois est une information, pas un bug à
// cacher. Depuis le 01/10/2026 la page montre **une ligne par adresse**,
// avec le nombre d'inscriptions (×3), parce qu'on y vient pour embarquer
// des gens et qu'on n'embarque pas une personne trois fois ; le serveur
// fait le regroupement (`fileAttente()`), la page ne recompte rien.

import { brancherEmbarquement } from './embarquement.js'

function date(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const STATUTS = {
  attente: 'en attente',
  embarque: 'embarquée',
  acces: 'a déjà accès',
}

export async function mountInscrits(root, info) {
  root.innerHTML = ''
  const wrap = document.createElement('div')
  wrap.className = 'home backoffice'

  const retour = document.createElement('a')
  retour.href = '#/admin'
  retour.className = 'back-link'
  retour.textContent = '← Back-office'
  wrap.appendChild(retour)

  const h1 = document.createElement('h1')
  h1.textContent = "Liste d'attente"
  wrap.appendChild(h1)

  const sous = document.createElement('p')
  sous.className = 'subtitle'
  wrap.appendChild(sous)

  root.appendChild(wrap)

  let donnees
  try {
    const res = await fetch('/api/admin/waitlist')
    if (res.status === 403) {
      sous.textContent = 'Réservé aux administrateurs.'
      return
    }
    if (!res.ok) throw new Error(String(res.status))
    donnees = await res.json()
  } catch {
    sous.textContent = 'La liste n’a pas pu être chargée.'
    return
  }

  const file = Array.isArray(donnees.file) ? donnees.file : []
  if (!file.length) {
    sous.textContent = 'Personne pour l’instant.'
    return
  }

  brancherEmbarquement(root, ({ email }) =>
    mountInscrits(root, `Document créé, invitation envoyée à ${email}.`)
  )

  const inscriptions = file.reduce((n, l) => n + (l.inscriptions || 1), 0)
  const enAttente = file.filter((l) => l.statut === 'attente').length
  sous.textContent =
    `${file.length} adresse${file.length > 1 ? 's' : ''}` +
    (inscriptions > file.length ? ` pour ${inscriptions} inscriptions (doublons compris)` : '') +
    ` — ${enAttente} en attente.`

  if (info) {
    const ok = document.createElement('p')
    ok.className = 'bo-note bo-ok'
    ok.setAttribute('role', 'status')
    ok.textContent = info
    wrap.appendChild(ok)
  }

  // Ceux qui attendent d'abord, dans l'ordre d'arrivée : c'est la file
  // qu'on vient vider. Les autres suivent, déjà servis.
  const lignes = [...file].sort(
    (a, b) => (a.statut === 'attente' ? 0 : 1) - (b.statut === 'attente' ? 0 : 1) || (a.rang || 0) - (b.rang || 0)
  )

  const table = document.createElement('table')
  table.className = 'inscrits-table'
  const thead = document.createElement('thead')
  thead.innerHTML = '<tr><th>Adresse</th><th>Inscription</th><th>Rang</th><th>Statut</th></tr>'
  table.appendChild(thead)

  const tbody = document.createElement('tbody')
  for (const l of lignes) {
    const tr = document.createElement('tr')
    const tdMail = document.createElement('td')
    tdMail.textContent = l.email || '—'
    if (l.inscriptions > 1) {
      const fois = document.createElement('span')
      fois.className = 'doublon'
      fois.title = 'Inscrite plusieurs fois'
      fois.textContent = ` ×${l.inscriptions}`
      tdMail.appendChild(fois)
    }
    const tdDate = document.createElement('td')
    tdDate.textContent = date(l.ts)
    const tdRang = document.createElement('td')
    tdRang.textContent = `n° ${l.rang}`
    const tdStatut = document.createElement('td')
    tdStatut.dataset.embarquerZone = ''
    if (l.statut === 'attente') {
      const bouton = document.createElement('button')
      bouton.type = 'button'
      bouton.className = 'bo-action'
      bouton.dataset.embarquer = l.email
      bouton.textContent = 'Embarquer'
      const msg = document.createElement('span')
      msg.className = 'bo-embarquer-msg bo-note'
      msg.setAttribute('role', 'status')
      tdStatut.append(bouton, msg)
    } else {
      tdStatut.textContent =
        l.statut === 'embarque' && l.embarque && l.embarque.ts
          ? `embarquée le ${date(l.embarque.ts)}`
          : STATUTS[l.statut] || l.statut || '—'
    }
    tr.append(tdMail, tdDate, tdRang, tdStatut)
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)
  wrap.appendChild(table)
}
