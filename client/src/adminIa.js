// La page des réglages de l'IA et de la consommation (#/admin/ia, 13/10/2026),
// réservée aux administrateurs.
//
// Deux fonctions — Corrections IA (la barre latérale) et Margo (le dialogue
// flottant) — se règlent chacune de leur côté : modèle (Haiku ou Sonnet),
// signes au plus par demande, demandes au plus par heure, signes au plus par
// mois et par personne, niveau d'accès minimal. Les administrateurs sont
// soumis aux mêmes limites que les autres. Tout est en **signes, espaces
// compris** — jamais en pages.
//
// En dessous : la consommation du mois de chaque personne (signes des demandes
// réussies, jetons facturés, coût estimé) et les jetons par modèle. Ce sont ces
// chiffres qui permettront de fixer les quotas des offres FREE et PRO.

import { nombre } from '../../shared/signes.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const NIVEAUX = {
  admin: 'Administrateurs de l’instance seulement',
  editeur: 'Éditeurs du document (et administrateurs)',
  correcteur: 'Correcteurs, éditeurs et administrateurs',
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
export const libelleMois = (m) => {
  const [a, n] = String(m).split('-')
  return MOIS[Number(n) - 1] ? `${MOIS[Number(n) - 1]} ${a}` : String(m)
}

const usd = (v) => (v ? `${v < 0.01 ? v.toFixed(4) : v.toFixed(2)} $`.replace('.', ',') : '—')
const jetons = (c) => (c.entree || c.sortie || c.cacheLu || c.cacheEcrit ? `${nombre(c.entree)} entrée · ${nombre(c.sortie)} sortie${c.cacheLu || c.cacheEcrit ? ` · ${nombre(c.cacheLu)} cache lu · ${nombre(c.cacheEcrit)} cache écrit` : ''}` : '—')

function carte(id, nom, r, d) {
  const b = d.bornes
  const champ = (cle, libelle, unite) => `
    <label class="bo-ia-champ">
      <span>${libelle}</span>
      <input type="number" name="${id}.${cle}" value="${r[cle]}" min="${b[cle].min}" max="${b[cle].max}" step="1" inputmode="numeric" required>
      <small>${unite}</small>
    </label>`
  return `
    <fieldset class="bo-ia-carte" data-fonction="${id}">
      <legend>${esc(nom)}</legend>
      <label class="bo-ia-champ">
        <span>Modèle</span>
        <select name="${id}.modele">${d.modeles.map((m) => `<option value="${esc(m.id)}"${m.id === r.modele ? ' selected' : ''}>${esc(m.nom)}</option>`).join('')}</select>
      </label>
      <label class="bo-ia-champ">
        <span>Accès minimal</span>
        <select name="${id}.acces">${d.niveaux.map((n) => `<option value="${n}"${n === r.acces ? ' selected' : ''}>${esc(NIVEAUX[n] || n)}</option>`).join('')}</select>
      </label>
      ${champ('signesParDemande', 'Par demande, au plus', 'signes envoyés (espaces compris)')}
      ${champ('demandesParHeure', 'Par heure, au plus', 'demandes')}
      ${champ('signesParMois', 'Par mois et par personne, au plus', 'signes envoyés (espaces compris)')}
    </fieldset>`
}

function tableConso(d) {
  if (!d.utilisateurs.length) return '<p class="bo-note">Aucune demande réussie ni échouée ce mois-là.</p>'
  const lignePersonne = (u) => {
    const cellule = (f) => {
      const c = u[f.id]
      const max = d.reglages[f.id].signesParMois
      const part = max ? Math.round((c.signes / max) * 100) : 0
      return `<td>${nombre(c.demandes)} demande(s)${c.echecs ? ` · ${nombre(c.echecs)} échec(s)` : ''}<br><strong>${nombre(c.signes)}</strong> / ${nombre(max)} signes (${part} %)<br><span class="bo-ia-jetons">${jetons(c)}</span><br>${usd(c.usd)}</td>`
    }
    return `<tr><th scope="row">${u.nom ? `${esc(u.nom)}<br>` : ''}<span class="bo-ia-mail">${esc(u.email)}</span></th>${d.fonctions.map(cellule).join('')}</tr>`
  }
  const total = (f) => {
    const t = d.utilisateurs.reduce(
      (a, u) => {
        const c = u[f.id]
        a.demandes += c.demandes
        a.signes += c.signes
        a.jetons += c.entree + c.sortie + c.cacheLu + c.cacheEcrit
        a.usd += c.usd
        return a
      },
      { demandes: 0, signes: 0, jetons: 0, usd: 0 }
    )
    // Le rapport jetons / signes : la donnée qui traduit un budget en euros en un quota en signes.
    const rapport = t.signes ? `${(t.jetons / t.signes).toFixed(2).replace('.', ',')} jeton(s) par signe` : '—'
    return `<td>${nombre(t.demandes)} demande(s)<br><strong>${nombre(t.signes)}</strong> signes<br>${rapport}<br>${usd(t.usd)}</td>`
  }
  return `<table class="bo-table bo-ia-table">
    <thead><tr><th></th>${d.fonctions.map((f) => `<th>${esc(f.nom)}</th>`).join('')}</tr></thead>
    <tbody>${d.utilisateurs.map(lignePersonne).join('')}</tbody>
    <tfoot><tr><th scope="row">Total</th>${d.fonctions.map(total).join('')}</tr></tfoot>
  </table>`
}

function tableModeles(d) {
  const noms = Object.fromEntries(d.modeles.map((m) => [m.id, m.nom]))
  const entrees = Object.entries(d.jetonsParModele)
  if (!entrees.length) return '<p class="bo-note">Aucun jeton facturé ce mois-là.</p>'
  const ligne = (nom, c) => `<tr><th scope="row">${nom}</th><td>${nombre(c.appels)}</td><td>${nombre(c.entree)}</td><td>${nombre(c.sortie)}</td><td>${nombre(c.cacheLu)}</td><td>${nombre(c.cacheEcrit)}</td><td>${usd(c.usd)}</td></tr>`
  const corps = entrees
    .map(([id, m]) => {
      const tarif = d.tarifsUsd && d.tarifsUsd[id]
      const entete = `${esc(noms[id] || id)}${tarif ? `<br><small>${String(tarif.entree).replace('.', ',')} / ${String(tarif.sortie).replace('.', ',')} $ par million de jetons (entrée / sortie)</small>` : ''}`
      const parFonction = d.fonctions
        .filter((f) => m.parFonction && m.parFonction[f.id])
        .map((f) => ligne(`&nbsp;&nbsp;↳ ${esc(f.nom)}`, m.parFonction[f.id]))
        .join('')
      return ligne(entete, m) + parFonction
    })
    .join('')
  return `<table class="bo-table"><thead><tr><th>Modèle</th><th>Appels</th><th>Entrée</th><th>Sortie</th><th>Cache lu</th><th>Cache écrit</th><th>Coût estimé</th></tr></thead><tbody>${corps}</tbody></table>
  <p class="bo-note">L'entrée est hors cache ; le cache lu et le cache écrit se facturent à part (un dixième du prix d'entrée, et 1,25 fois). Les jetons sont comptés même quand la demande échoue : l'API les a facturés. Le coût est une estimation aux tarifs ci-dessus, en dollars.</p>`
}

/** Dessine la page. `fetcher` n'est injecté que par les tests. */
export async function mountAdminIa(root, { fetcher = (...a) => fetch(...a), mois = null } = {}) {
  root.innerHTML = '<div class="home"><p>Chargement…</p></div>'
  const url = `/api/admin/ia${mois ? `?mois=${encodeURIComponent(mois)}` : ''}`
  let res
  try {
    res = await fetcher(url, { credentials: 'same-origin' })
  } catch {
    res = null
  }
  if (res && res.status === 403) {
    root.innerHTML = '<div class="home"><p>Réservé aux administrateurs.</p><a href="#/">← Retour</a></div>'
    return
  }
  if (!res || !res.ok) {
    root.innerHTML = '<div class="home"><p>Les réglages de l’IA ne répondent pas.</p><a href="#/admin">← Retour au back-office</a></div>'
    return
  }
  const d = await res.json()
  const r = d.reglages

  root.innerHTML = `
    <div class="home backoffice bo-ia">
      <p class="bo-retour"><a href="#/admin">← Retour au back-office</a></p>
      <h1>Réglages de l’IA</h1>
      <p class="bo-note">Deux fonctions, réglées chacune de leur côté, pour toute l'instance. Tout se compte en <strong>signes, espaces compris</strong>. Les administrateurs sont soumis aux mêmes limites que les autres. Une demande ne compte dans les signes du mois que si elle a abouti : une erreur, une réponse coupée ou un refus de limite ne coûtent rien à la personne.</p>

      <form class="bo-ia-form" novalidate>
        <div class="bo-ia-cartes">
          ${d.fonctions.map((f) => carte(f.id, f.nom, r[f.id], d)).join('')}
        </div>
        <p class="bo-ia-actions"><button type="submit" class="btn-primary">Enregistrer les réglages</button> <span class="bo-ia-message" role="status"></span></p>
        <p class="bo-note">${r.modifieLe ? `Dernière modification le ${new Date(r.modifieLe).toLocaleString('fr-FR')} par ${esc(r.modifiePar || '—')}.` : 'Réglages par défaut : rien n’a encore été modifié.'} Le niveau d'accès est un minimum : « éditeurs » ouvre aux éditeurs du document et aux administrateurs, « correcteurs » y ajoute les correcteurs ; un lecteur n'y a jamais accès. Les propositions de l'IA arrivent toujours en suivi de modifications.</p>
      </form>

      <h2>Consommation de ${esc(libelleMois(d.mois))}</h2>
      <p class="bo-ia-mois"><label>Mois <select name="mois">${d.moisDisponibles.map((m) => `<option value="${esc(m)}"${m === d.mois ? ' selected' : ''}>${esc(libelleMois(m))}</option>`).join('')}</select></label></p>
      ${tableConso(d)}

      <h2>Jetons par modèle</h2>
      ${tableModeles(d)}
    </div>`

  const form = root.querySelector('.bo-ia-form')
  const message = root.querySelector('.bo-ia-message')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const patch = {}
    for (const f of d.fonctions) {
      const lire = (cle) => form.elements[`${f.id}.${cle}`].value
      patch[f.id] = {
        modele: lire('modele'),
        acces: lire('acces'),
        signesParDemande: Number(lire('signesParDemande')),
        demandesParHeure: Number(lire('demandesParHeure')),
        signesParMois: Number(lire('signesParMois')),
      }
    }
    message.className = 'bo-ia-message'
    message.textContent = 'Enregistrement…'
    try {
      const rep = await fetcher('/api/admin/ia', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!rep.ok) {
        const err = await rep.json().catch(() => ({}))
        message.className = 'bo-ia-message bo-erreur'
        message.textContent = err.error || 'Enregistrement refusé.'
        return
      }
      await mountAdminIa(root, { fetcher, mois: d.mois })
      const apres = root.querySelector('.bo-ia-message')
      apres.className = 'bo-ia-message bo-ok'
      apres.textContent = 'Réglages enregistrés. Ils s’appliquent à la prochaine demande.'
    } catch {
      message.className = 'bo-ia-message bo-erreur'
      message.textContent = 'Le serveur ne répond pas.'
    }
  })
  root.querySelector('select[name="mois"]').addEventListener('change', (e) => mountAdminIa(root, { fetcher, mois: e.target.value }))
}
