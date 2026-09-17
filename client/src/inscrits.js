// La liste d'attente, en détail — page `#/inscrits`, administrateurs seuls.
//
// Le compteur de la page d'accueil est public ; cette page ne l'est
// jamais. Ce sont des adresses de personnes qui ont laissé leur
// coordonnée, pas un annuaire : la route serveur vérifie `ADMIN_EMAILS` et
// répond 403 à tout le reste, et cette page n'affiche donc rien qu'elle
// n'ait obtenu de là.
//
// Le fichier empile les envois sans dédupliquer (décision du 14/09) : on
// voit donc les doublons, marqués comme tels plutôt que masqués — une
// personne qui s'inscrit trois fois est une information, pas un bug à
// cacher.

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

export async function mountInscrits(root) {
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

  const inscrits = Array.isArray(donnees.inscrits) ? donnees.inscrits : []
  if (!inscrits.length) {
    sous.textContent = 'Personne pour l’instant.'
    return
  }

  const uniques = new Set(inscrits.map((i) => i.email))
  sous.textContent =
    uniques.size === inscrits.length
      ? `${uniques.size} adresse${uniques.size > 1 ? 's' : ''}.`
      : `${uniques.size} adresse${uniques.size > 1 ? 's' : ''} pour ${inscrits.length} inscriptions (doublons compris).`

  // La plus récente en haut : c'est ce qu'on vient voir.
  const lignes = [...inscrits].sort((a, b) => (b.ts || 0) - (a.ts || 0))
  const vues = new Set()

  const table = document.createElement('table')
  table.className = 'inscrits-table'
  const thead = document.createElement('thead')
  thead.innerHTML = '<tr><th>Adresse</th><th>Inscription</th><th>Rang</th></tr>'
  table.appendChild(thead)

  const tbody = document.createElement('tbody')
  // On numérote depuis la plus ancienne, pour que le rang veuille dire
  // « place dans la file » et pas « position dans ce tableau ».
  const rangs = new Map()
  ;[...inscrits].sort((a, b) => (a.ts || 0) - (b.ts || 0)).forEach((i, n) => {
    if (!rangs.has(i.email)) rangs.set(i.email, n + 1)
  })

  for (const i of lignes) {
    const tr = document.createElement('tr')
    const tdMail = document.createElement('td')
    tdMail.textContent = i.email || '—'
    const tdDate = document.createElement('td')
    tdDate.textContent = date(i.ts)
    const tdRang = document.createElement('td')
    if (vues.has(i.email)) {
      tdRang.textContent = 'doublon'
      tdRang.className = 'doublon'
    } else {
      tdRang.textContent = `n° ${rangs.get(i.email)}`
      vues.add(i.email)
    }
    tr.append(tdMail, tdDate, tdRang)
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)
  wrap.appendChild(table)
}
