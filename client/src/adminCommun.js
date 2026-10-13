// Ce que partagent les rubriques du back-office (14/10/2026) : les petits
// formateurs, la barre d'onglets et la lecture de la vue d'ensemble.
//
// Le back-office est découpé en rubriques thématiques, chacune à son adresse :
//   #/admin              Synthèse     les indicateurs clés et ce qui attend
//   #/admin/utilisateurs Utilisateurs liste d'attente, embarquement, comptes
//   #/admin/retours      Retours      ce que les gens ont écrit par la palette
//   #/admin/documents    Documents    le parc de documents et leur poids
//   #/admin/ia           IA           réglages, consommation, boutons, jetons
//   #/admin/systeme      Système      serveur, sauvegarde, connexions, courriers
// Chaque onglet est un vrai lien : on peut le mettre en marque-page, et le
// retour du navigateur marche. Le découpage ne retire ni n'ajoute aucun
// indicateur, sauf la synthèse qui les rassemble.

export const NBSP = ' '

export function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}

export function nombre(n) {
  if (n === null || n === undefined) return '—'
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
}

export function octets(o) {
  if (o === null || o === undefined) return '—'
  if (o < 1024) return `${o}${NBSP}o`
  if (o < 1048576) return `${Math.round(o / 1024)}${NBSP}ko`
  return `${(o / 1048576).toFixed(1)}${NBSP}Mo`
}

/** Une somme en euros. Sous le centime, « <0,01 € » plutôt qu'un « 0,00 € »
 * qui laisserait croire que rien n'a été consommé. */
export function euros(v) {
  if (v === null || v === undefined) return '—'
  if (v > 0 && v < 0.01) return `<0,01${NBSP}€`
  return `${v.toFixed(2).replace('.', ',')}${NBSP}€`
}

export function date(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function duree(sec) {
  if (!sec) return '—'
  const j = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return j ? `${j}${NBSP}j${NBSP}${h}${NBSP}h` : h ? `${h}${NBSP}h${NBSP}${m}${NBSP}min` : `${m}${NBSP}min`
}

/** Un chiffre dans sa vignette. Avec `lien`, la vignette entière mène à la
 * rubrique où l'on traite la chose ; avec `alerte`, elle se teinte. */
export function chiffre(valeur, libelle, precision, { lien = '', alerte = false } = {}) {
  const corps = `<strong>${valeur}</strong><span>${libelle}</span>${precision ? `<em>${precision}</em>` : ''}`
  const classe = `bo-chiffre${alerte ? ' bo-alerte' : ''}`
  return lien ? `<a class="${classe}" href="${esc(lien)}">${corps}</a>` : `<div class="${classe}">${corps}</div>`
}

export const ONGLETS = [
  { id: 'synthese', libelle: 'Synthèse', href: '#/admin' },
  { id: 'utilisateurs', libelle: 'Utilisateurs', href: '#/admin/utilisateurs' },
  { id: 'retours', libelle: 'Retours', href: '#/admin/retours' },
  { id: 'documents', libelle: 'Documents', href: '#/admin/documents' },
  { id: 'ia', libelle: 'IA', href: '#/admin/ia' },
  { id: 'systeme', libelle: 'Système', href: '#/admin/systeme' },
]

/** Le nom d'onglet d'après l'adresse (`#/admin/retours` → `retours`), ou `null`
 * si l'adresse n'est pas une rubrique du back-office. */
export function ongletDeLAdresse(hash) {
  const o = ONGLETS.find((x) => x.href === hash)
  return o ? o.id : null
}

/** Ce qui attend, à montrer en pastille sur les onglets : les adresses de la
 * liste d'attente et les retours à traiter. Tout est facultatif — une vue
 * absente ne montre simplement aucune pastille. */
export function pastilles(vue) {
  const r = {}
  if (!vue) return r
  const attente = vue.att && Number.isInteger(vue.att.enAttente) ? vue.att.enAttente : 0
  const support = vue.d && vue.d.flux && vue.d.flux.support
  const retours = support && Array.isArray(support.aTraiter) ? support.aTraiter.length : 0
  if (attente > 0) r.utilisateurs = attente
  if (retours > 0) r.retours = retours
  return r
}

export function barreOnglets(actif, vue = null) {
  const badges = pastilles(vue)
  return `<nav class="bo-onglets" aria-label="Rubriques du back-office">${ONGLETS.map((o) => {
    const courant = o.id === actif
    const badge = badges[o.id] ? ` <span class="bo-onglet-badge" title="À traiter">${nombre(badges[o.id])}</span>` : ''
    return `<a class="bo-onglet${courant ? ' actif' : ''}" href="${o.href}"${courant ? ' aria-current="page"' : ''}>${o.libelle}${badge}</a>`
  }).join('')}</nav>`
}

/** Le haut commun à toutes les rubriques. */
export function entete(actif, vue = null) {
  return `<p class="bo-retour"><a href="#/">← Retour aux documents</a></p>
      <h1>Back-office</h1>
      ${barreOnglets(actif, vue)}`
}

/** Lit la vue d'ensemble et la file d'attente. La file est lue en même temps
 * mais sa panne ne doit pas emporter le reste : on la perd seule. Ne lève
 * jamais : `{ statut, d, att }`, `d` à `null` si la vue n'a pas répondu. */
export async function chargerVue(fetcher = (...a) => fetch(...a)) {
  let res
  let resAttente
  try {
    ;[res, resAttente] = await Promise.all([
      fetcher('/api/admin/overview', { credentials: 'same-origin' }),
      fetcher('/api/admin/waitlist', { credentials: 'same-origin' }).catch(() => null),
    ])
  } catch {
    return { statut: 0, d: null, att: null }
  }
  if (!res || !res.ok) return { statut: res ? res.status : 0, d: null, att: null }
  const d = await res.json().catch(() => null)
  const att = resAttente && resAttente.ok ? await resAttente.json().catch(() => null) : null
  return { statut: 200, d, att }
}

/** Les deux usages de l'IA (Corrections IA et Margo) côte à côte, en tokens (pas en euros : ils n'ont
 * pas le même modèle). « Entrée » est hors cache ; le cache lu et écrit sont
 * comptés à part, car ils ne se facturent pas au même prix. */
export function tableauTokens(t) {
  if (!t) return '<p class="bo-note">Pas de données.</p>'
  const ligne = (nom, p, avecCache) =>
    `<tr><th scope="row">${nom}</th>${['24h', '7j', '30j']
      .map((k) => {
        const x = p[k]
        return `<td>${nombre(x.appels)} message(s)<br>${nombre(x.entree)} entrée · ${nombre(x.sortie)} sortie${
          avecCache ? `<br>${nombre(x.cacheLu)} cache lu · ${nombre(x.cacheEcrit)} cache écrit` : ''
        }</td>`
      })
      .join('')}</tr>`
  const modeles = t.fenetre.parModele.length
    ? `<p class="bo-note">Fenêtre flottante par modèle (30 jours) : ${t.fenetre.parModele
        .map(
          (m) =>
            `${esc(m.modele)} — ${nombre(m.appels)} message(s), ${nombre(m.entree + m.cacheLu + m.cacheEcrit)} tokens en entrée, ${nombre(m.sortie)} en sortie`
        )
        .join(' ; ')}.</p>`
    : ''
  const personnes = t.fenetre.parPersonne.length
    ? `<ul class="bo-liste">${t.fenetre.parPersonne
        .map(
          (p) =>
            `<li>${esc(p.email)} — fenêtre flottante : ${nombre(p.appels)} message(s), ${nombre(p.entree + p.cacheLu + p.cacheEcrit)} tokens en entrée, ${nombre(p.sortie)} en sortie</li>`
        )
        .join('')}</ul>`
    : ''
  return `<table class="bo-table">
    <thead><tr><th></th><th>24 h</th><th>7 jours</th><th>30 jours</th></tr></thead>
    <tbody>
      ${ligne('Corrections IA (barre latérale)', t.barreLaterale, false)}
      ${ligne('Margo (fenêtre flottante)', t.fenetre, true)}
    </tbody>
  </table>
  <p class="bo-note">Un « message » est une demande à l'IA : un clic sur un bouton de Corrections IA — quel que soit le nombre de paragraphes sélectionnés —, ou un message du dialogue pour Margo. L'entrée de la fenêtre flottante s'ajoute du cache lu et du cache écrit pour donner le total lu par le modèle.</p>
  ${modeles}${personnes}`
}

/** Le bloc « Corrections IA — barre latérale (30 jours) » : coût, demandes et
 * répartition par personne (données de la vue d'ensemble). */
export function blocCorrections30j(ia) {
  if (!ia) return ''
  return `<div class="bo-chiffres">
        ${chiffre(euros(ia.coutEuros30j), 'sur 30 jours', `${euros(ia.coutEuros7j)} sur 7 jours`)}
        ${chiffre(euros(ia.coutEuros24h), 'dans les 24 h')}
        ${chiffre(nombre(ia.appels30j), 'demandes (1 clic = 1)', `${nombre(ia.appels7j)} sur 7 jours`)}
        ${chiffre(`${nombre(ia.tokensEntree30j)} / ${nombre(ia.tokensSortie30j)}`, 'tokens entrée / sortie')}
      </div>
      ${
        ia.parPersonne.length
          ? `<ul class="bo-liste">${ia.parPersonne
              .map(
                (p) =>
                  `<li>${esc(p.email)} — <strong>${euros(p.coutEuros)}</strong>, ${nombre(
                    p.appels
                  )} demande(s), ${nombre(p.entree)} / ${nombre(p.sortie)} tokens</li>`
              )
              .join('')}</ul>
             <p class="bo-note">C'est la distribution, pas la moyenne, qui doit fixer le quota de l'offre gratuite.</p>`
          : '<p class="bo-note">Aucune demande enregistrée — le journal démarre à la mise en service du back-office.</p>'
      }
      ${
        ia.tarif
          ? `<p class="bo-note">Addition faite au tarif de <strong>${esc(ia.tarif.modele)}</strong> :
             ${String(ia.tarif.entreeEurParMTok).replace('.', ',')}${NBSP}€ en entrée et
             ${String(ia.tarif.sortieEurParMTok).replace('.', ',')}${NBSP}€ en sortie par million de tokens
             (AI_PRICE_INPUT_EUR / AI_PRICE_OUTPUT_EUR dans le .env — à ajuster en même temps que le modèle,
             sinon le coût affiché devient faux sans prévenir). Le plafond de dépense réel se règle côté
             Anthropic, pas ici.</p>`
          : ''
      }`
}
