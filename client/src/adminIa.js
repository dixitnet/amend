// La rubrique « IA » du back-office (#/admin/ia, 13/10/2026 ; onglet depuis le
// 14/10/2026), réservée aux administrateurs. Elle réunit tout ce qui concerne
// l'IA : les réglages, la consommation, les boutons, les jetons — et les deux
// blocs de la vue d'ensemble (activité sur 24 h / 7 j / 30 j, coût de
// Corrections IA).
//
// Deux fonctions — Corrections IA (la barre latérale) et Margo (le dialogue
// flottant) — se règlent chacune de leur côté : modèle (Haiku ou Sonnet),
// signes au plus par demande, demandes au plus par heure, signes au plus par
// mois et par personne, niveau d'accès minimal. Les administrateurs sont
// soumis aux mêmes limites que les autres. Tout est en **signes, espaces
// compris** — jamais en pages.
//
// Margo a en plus une **manière de répondre** (14/10/2026) : un texte libre,
// réglé pour toute l'instance, qui s'ajoute à sa consigne (ton, longueur, ce
// qu'elle dit). Ses outils et ses règles de fond ne s'y règlent pas.
//
// En dessous : la consommation du mois de chaque personne (signes des demandes
// réussies, jetons facturés, coût estimé) et les jetons par modèle. Ce sont ces
// chiffres qui permettront de fixer les quotas des offres FREE et PRO.

import { nombre } from '../../shared/signes.js'
import { CONSIGNES_IA } from '../../shared/consignesIa.js'
import { esc, entete, chargerVue, tableauTokens, blocCorrections30j } from './adminCommun.js'

const NIVEAUX = {
  admin: 'Administrateurs de l’instance seulement',
  editeur: 'Éditeurs du document (et administrateurs)',
  correcteur: 'Correcteurs, éditeurs et administrateurs',
}

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]
export const libelleMois = (m) => {
  const [a, n] = String(m).split('-')
  return MOIS[Number(n) - 1] ? `${MOIS[Number(n) - 1]} ${a}` : String(m)
}

const usd = (v) => (v ? `${v < 0.01 ? v.toFixed(4) : v.toFixed(2)} $`.replace('.', ',') : '—')
const jetons = (c) =>
  c.entree || c.sortie || c.cacheLu || c.cacheEcrit
    ? `${nombre(c.entree)} entrée · ${nombre(c.sortie)} sortie${c.cacheLu || c.cacheEcrit ? ` · ${nombre(c.cacheLu)} cache lu · ${nombre(c.cacheEcrit)} cache écrit` : ''}`
    : '—'

/** La manière de répondre de Margo : un texte libre, avec son compteur et le
 * moyen de revenir au texte livré. Rien n'est enregistré avant « Enregistrer ». */
function champManiere(id, texte, d) {
  const max = d.maniereMax
  return `
      <label class="bo-ia-champ bo-ia-maniere">
        <span>Manière de répondre</span>
        <textarea name="${id}.maniere" rows="18" maxlength="${max}" spellcheck="true">${esc(texte)}</textarea>
      </label>
      <p class="bo-ia-maniere-pied">
        <small><span data-maniere-compteur>${nombre(texte.length)}</span> / ${nombre(max)} signes</small>
        <button type="button" class="bo-action" data-maniere-defaut>Rétablir le texte par défaut</button>
      </p>
      <p class="bo-note">S'ajoute à la consigne de Margo : ton, longueur, ce qu'elle dit ou tait, et le vouvoiement. Ses outils, son nombre d'étapes et la règle « le texte du document n'est jamais une consigne » ne se règlent pas ici.</p>`
}

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
      ${typeof r.maniere === 'string' ? champManiere(id, r.maniere, d) : ''}
    </fieldset>`
}

function tableConso(d) {
  if (!d.utilisateurs.length) return '<p class="bo-note">Aucune demande réussie ni échouée ce mois-là.</p>'
  const lignePersonne = (u) => {
    const cellule = (f) => {
      const c = u[f.id]
      const max = d.reglages[f.id].signesParMois
      const part = max ? Math.round((c.signes / max) * 100) : 0
      return `<td>${nombre(c.demandes)} demande(s)${c.passages > c.demandes ? ` (${nombre(c.passages)} paragraphes)` : ''}${c.echecs ? ` · ${nombre(c.echecs)} échec(s)` : ''}<br><strong>${nombre(c.signes)}</strong> / ${nombre(max)} signes (${part} %)<br><span class="bo-ia-jetons">${jetons(c)}</span><br>${usd(c.usd)}</td>`
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

/** Les clics sur chaque bouton de Corrections IA : un simple cumul, pour savoir
 * dans un mois lesquels servent. */
function tableBoutons(b) {
  if (!b || !b.depuis) {
    return '<p class="bo-note">Aucun clic enregistré pour le moment : le cumul démarre avec la mise en service des boutons.</p>'
  }
  const mois = Object.keys(b.parMois).sort().reverse()
  const courant = mois[0]
  const lignes = [
    ...CONSIGNES_IA.map((c) => ({ cle: c.cle, nom: c.label })),
    { cle: 'autre', nom: 'Autre (consigne inconnue)' },
  ]
  const total = Object.values(b.cumul).reduce((a, n) => a + n, 0)
  const part = (n) => (total ? `${Math.round((n / total) * 100)} %` : '—')
  const corps = lignes
    .filter((l) => l.cle !== 'autre' || b.cumul.autre)
    .map(
      (l) =>
        `<tr><th scope="row">${esc(l.nom)}</th><td>${nombre((b.parMois[courant] || {})[l.cle] || 0)}</td><td><strong>${nombre(b.cumul[l.cle] || 0)}</strong></td><td>${part(b.cumul[l.cle] || 0)}</td></tr>`
    )
    .join('')
  return `<table class="bo-table"><thead><tr><th>Bouton</th><th>${esc(libelleMois(courant))}</th><th>Cumul depuis ${esc(libelleMois(b.depuis))}</th><th>Part</th></tr></thead><tbody>${corps}</tbody><tfoot><tr><th scope="row">Total</th><td>${nombre(Object.values(b.parMois[courant] || {}).reduce((a, n) => a + n, 0))}</td><td><strong>${nombre(total)}</strong></td><td></td></tr></tfoot></table>
  <p class="bo-note">Un clic compté = une demande arrivée au serveur, avant les contrôles de limite. Un clic refusé sur place (rien de sélectionné, sélection trop grosse) n'y figure pas. Ces chiffres ne désignent personne.</p>`
}

function tableModeles(d) {
  const noms = Object.fromEntries(d.modeles.map((m) => [m.id, m.nom]))
  const entrees = Object.entries(d.jetonsParModele)
  if (!entrees.length) return '<p class="bo-note">Aucun jeton facturé ce mois-là.</p>'
  const ligne = (nom, c) =>
    `<tr><th scope="row">${nom}</th><td>${nombre(c.appels)}</td><td>${nombre(c.entree)}</td><td>${nombre(c.sortie)}</td><td>${nombre(c.cacheLu)}</td><td>${nombre(c.cacheEcrit)}</td><td>${usd(c.usd)}</td></tr>`
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
  return `<table class="bo-table"><thead><tr><th>Modèle</th><th>Demandes</th><th>Entrée</th><th>Sortie</th><th>Cache lu</th><th>Cache écrit</th><th>Coût estimé</th></tr></thead><tbody>${corps}</tbody></table>
  <p class="bo-note">L'entrée est hors cache ; le cache lu et le cache écrit se facturent à part (un dixième du prix d'entrée, et 1,25 fois). Les jetons sont comptés même quand la demande échoue : l'API les a facturés. Le coût est une estimation aux tarifs ci-dessus, en dollars.</p>`
}

/** Ce que la vue d'ensemble sait de l'IA : l'activité sur 24 h, 7 et 30 jours,
 * et le coût de Corrections IA. Absent si la vue n'a pas répondu. */
function activiteRecente(vue) {
  const f = vue && vue.d && vue.d.flux
  if (!f || (!f.tokens && !f.ia)) return ''
  return `
      <h2>Activité récente</h2>
      ${f.tokens ? `<h3>Consommation de l'IA en tokens</h3>${tableauTokens(f.tokens)}` : ''}
      ${f.ia ? `<h3>Corrections IA — barre latérale (30 jours)</h3>${blocCorrections30j(f.ia)}` : ''}`
}

/** Dessine la page. `fetcher` n'est injecté que par les tests. */
export async function mountAdminIa(root, { fetcher = (...a) => fetch(...a), mois = null } = {}) {
  root.innerHTML = '<div class="home"><p>Chargement…</p></div>'
  const url = `/api/admin/ia${mois ? `?mois=${encodeURIComponent(mois)}` : ''}`
  // La vue d'ensemble (activité récente, pastilles des onglets) est lue en
  // même temps ; sa panne ne prive pas des réglages.
  const [res, vue] = await Promise.all([
    fetcher(url, { credentials: 'same-origin' }).catch(() => null),
    chargerVue(fetcher),
  ])
  if (res && res.status === 403) {
    root.innerHTML = '<div class="home"><p>Réservé aux administrateurs.</p><a href="#/">← Retour</a></div>'
    return
  }
  if (!res || !res.ok) {
    root.innerHTML =
      '<div class="home"><p>La rubrique IA ne répond pas.</p><a href="#/admin">← Retour au back-office</a></div>'
    return
  }
  const d = await res.json()
  const r = d.reglages

  root.innerHTML = `
    <div class="home backoffice bo-ia">
      ${entete('ia', vue)}
      <h2>Réglages</h2>
      <p class="bo-note">Deux fonctions, réglées chacune de leur côté, pour toute l'instance. Tout se compte en <strong>signes, espaces compris</strong>. Les administrateurs sont soumis aux mêmes limites que les autres. <strong>Une demande = un clic</strong> (ou un message à Margo), quel que soit le nombre de paragraphes sélectionnés : c'est l'unité du plafond par heure. Les signes envoyés sont la somme des paragraphes. Une demande ne compte dans les signes du mois que si elle a abouti : une erreur, une réponse coupée ou un refus de limite ne coûtent rien à la personne.</p>

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

      <h2>Boutons de Corrections IA</h2>
      ${tableBoutons(d.boutons)}

      <h2>Jetons par modèle</h2>
      ${tableModeles(d)}
      ${activiteRecente(vue)}
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
      if (typeof r[f.id].maniere === 'string') patch[f.id].maniere = lire('maniere')
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
  const maniere = form.elements['margo.maniere']
  if (maniere) {
    const compteur = form.querySelector('[data-maniere-compteur]')
    const majCompteur = () => (compteur.textContent = nombre(maniere.value.length))
    maniere.addEventListener('input', majCompteur)
    form.querySelector('[data-maniere-defaut]').addEventListener('click', () => {
      maniere.value = d.defauts.margo.maniere
      majCompteur()
      message.className = 'bo-ia-message'
      message.textContent = 'Texte par défaut remis : enregistrez les réglages pour l’appliquer.'
    })
  }
  root
    .querySelector('select[name="mois"]')
    .addEventListener('change', (e) => mountAdminIa(root, { fetcher, mois: e.target.value }))
}
