// Les polices de l'instance côté navigateur (24/10/2026, voir server/polices.js).
//
// Le catalogue (`GET /api/polices`) est appliqué à la liste partagée
// (`appliquerCatalogue`, shared/style.js) : le menu de polices, la feuille de
// style CSS et les exports PDF et Word le voient alors comme les polices de
// base. Les fichiers eux-mêmes sont déclarés au navigateur par des
// `@font-face` pointant vers l'instance — jamais vers un tiers.
//
// **À charger avant d'afficher une mise en page.** Une police du catalogue
// inconnue du navigateur s'afficherait comme la police de base dans le menu, et
// un export la demanderait sous un autre nom. `assurerPolices()` est donc appelé
// par les chargeurs de styles et de modèles (styleConfig.js). Un échec ne bloque
// rien : le catalogue reste celui qu'on avait (vide au départ).

import { POLICES, appliquerCatalogue } from '../../shared/style.js'

let enCours = null
const ID_STYLE = 'amend-polices-instance'

function declarations(catalogue) {
  const css = []
  // Seulement ce que `appliquerCatalogue` a retenu : c'est lui qui écarte un nom de famille
  // qui s'échapperait d'une chaîne CSS.
  const retenues = new Set(POLICES.filter((p) => p.instance).map((p) => p.id))
  for (const p of catalogue) {
    if (!p || typeof p.famille !== 'string' || !retenues.has(p.id)) continue
    for (const f of p.fichiers || []) {
      if (!/^i-[a-z0-9-]+-[0-9a-f]{12}\.(ttf|otf)$/.test(String(f.nom))) continue
      const format = f.nom.endsWith('.otf') ? 'opentype' : 'truetype'
      css.push(
        `@font-face{font-family:"${p.famille}";src:url("/api/polices/${p.id}/${f.nom}") format("${format}");` +
          `font-weight:${Number(f.poids) || 400};font-style:${f.italique ? 'italic' : 'normal'};font-display:swap}`
      )
    }
  }
  return css.join('\n')
}

function poserStyle(catalogue) {
  if (typeof document === 'undefined') return
  let el = document.getElementById(ID_STYLE)
  if (!el) {
    el = document.createElement('style')
    el.id = ID_STYLE
    document.head.appendChild(el)
  }
  el.textContent = declarations(catalogue)
}

/** Recharge le catalogue. Ne lève jamais : rend le nombre de polices d'instance, ou `null` si le serveur n'a pas répondu. */
export async function chargerPolices() {
  try {
    const res = await fetch('/api/polices')
    if (!res.ok) return null
    const donnees = await res.json()
    if (!donnees || !Array.isArray(donnees.polices)) return null
    const n = appliquerCatalogue(donnees.polices)
    poserStyle(donnees.polices)
    return n
  } catch {
    return null
  }
}

/** Le catalogue, chargé une seule fois par page (les changements se font au back-office : `rechargerPolices`). */
export function assurerPolices() {
  if (!enCours) enCours = chargerPolices()
  return enCours
}

export function rechargerPolices() {
  enCours = chargerPolices()
  return enCours
}
