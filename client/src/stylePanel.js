// Formulaire de mise en page — **engendré à partir du schéma**
// (`shared/style.js`), jamais écrit à la main. C'est ce qui fait qu'ajouter
// un réglage ou un bloc ne demande plus de toucher à l'interface : le jour
// où « retrait de première ligne » est apparu dans `PROPRIETES`, le champ
// s'est affiché tout seul.
//
// Le même formulaire sert deux fois :
//  - page `#/style` — le **style par défaut** de l'instance, réservé aux
//    administrateurs, point de départ des nouveaux documents ;
//  - panneau ouvert depuis un document — sa **mise en page à lui**,
//    réservée aux éditeurs (16/09/2026).

import {
  BLOCS,
  PROPRIETES,
  FORMATS_PAGE,
  styleParDefaut,
  fusionner,
} from './styleConfig.js'

function champ(libelle, controle, suffixe) {
  const label = document.createElement('label')
  label.className = 'style-field'
  const span = document.createElement('span')
  span.textContent = libelle
  label.append(span, controle)
  if (suffixe) {
    const u = document.createElement('em')
    u.className = 'style-unite'
    u.textContent = suffixe
    label.appendChild(u)
  }
  return label
}

/** Un contrôle par type de propriété. Ajouter un type au modèle se traite
 * ici, à un seul endroit. */
function controlePour(prop, valeur) {
  if (prop.type === 'choix') {
    const sel = document.createElement('select')
    for (const opt of prop.options) {
      const o = document.createElement('option')
      o.value = String(opt.id)
      o.textContent = opt.label
      sel.appendChild(o)
    }
    sel.value = String(valeur)
    return { el: sel, lire: () => (typeof prop.options[0].id === 'number' ? Number(sel.value) : sel.value) }
  }
  if (prop.type === 'booleen') {
    const c = document.createElement('input')
    c.type = 'checkbox'
    c.checked = !!valeur
    return { el: c, lire: () => c.checked }
  }
  const n = document.createElement('input')
  n.type = 'number'
  if (prop.min != null) n.min = prop.min
  if (prop.max != null) n.max = prop.max
  if (prop.pas != null) n.step = prop.pas
  n.value = valeur
  return { el: n, lire: () => Number(n.value) }
}

/** Le groupe de réglages d'un bloc. Replié par défaut sauf le corps de
 * texte : sept blocs × dix réglages déroulés d'un coup, c'est un mur. */
function groupeBloc(bloc, valeurs, { ouvert = false } = {}) {
  const details = document.createElement('details')
  details.className = 'style-bloc'
  details.open = ouvert
  const resume = document.createElement('summary')
  resume.textContent = bloc.label
  details.appendChild(resume)

  const grille = document.createElement('div')
  grille.className = 'style-grille'
  const lecteurs = {}
  for (const prop of PROPRIETES) {
    const c = controlePour(prop, valeurs[prop.id] ?? bloc.defauts[prop.id])
    lecteurs[prop.id] = c.lire
    grille.appendChild(champ(prop.label, c.el, prop.unite))
  }
  details.appendChild(grille)

  return {
    el: details,
    lire: () => Object.fromEntries(PROPRIETES.map((p) => [p.id, lecteurs[p.id]()])),
  }
}

function groupePage(page) {
  const fieldset = document.createElement('fieldset')
  fieldset.className = 'style-fieldset'
  const legend = document.createElement('legend')
  legend.textContent = 'Page'
  fieldset.appendChild(legend)

  const grille = document.createElement('div')
  grille.className = 'style-grille'

  const taille = document.createElement('select')
  for (const f of FORMATS_PAGE) {
    const o = document.createElement('option')
    o.value = f.id
    o.textContent = f.label
    taille.appendChild(o)
  }
  taille.value = page.size
  grille.appendChild(champ('Format', taille))

  const marges = {}
  for (const [cle, libelle] of [
    ['marginTop', 'Marge haute'],
    ['marginBottom', 'Marge basse'],
    ['marginLeft', 'Marge gauche'],
    ['marginRight', 'Marge droite'],
  ]) {
    const n = document.createElement('input')
    n.type = 'number'
    n.min = 0
    n.max = 100
    n.value = page[cle]
    marges[cle] = n
    grille.appendChild(champ(libelle, n, 'mm'))
  }

  const numeros = document.createElement('input')
  numeros.type = 'checkbox'
  numeros.checked = !!(page.pageNumbers && page.pageNumbers.enabled)
  grille.appendChild(champ('Numéros de page', numeros))

  const depart = document.createElement('input')
  depart.type = 'number'
  depart.min = 1
  depart.value = (page.pageNumbers && page.pageNumbers.startAt) || 1
  grille.appendChild(champ('Première page', depart))

  fieldset.appendChild(grille)
  return {
    el: fieldset,
    lire: () => ({
      size: taille.value,
      ...Object.fromEntries(Object.entries(marges).map(([k, el]) => [k, Number(el.value)])),
      pageNumbers: { enabled: numeros.checked, startAt: Number(depart.value) || 1 },
    }),
  }
}

/** Construit le formulaire complet. Renvoie `{ el, lire() }` —
 * `lire()` rend une feuille de style entière, que l'appelant réduit à ses
 * écarts au moment d'enregistrer (c'est le serveur qui s'en charge). */
export function formulaireStyle(style) {
  const complet = style && style.blocs ? style : styleParDefaut()
  const form = document.createElement('div')
  form.className = 'style-form'

  const page = groupePage(complet.page)
  form.appendChild(page.el)

  const blocs = {}
  for (const b of BLOCS) {
    const g = groupeBloc(b, complet.blocs[b.id] || b.defauts, { ouvert: b.id === 'body' })
    blocs[b.id] = g
    form.appendChild(g.el)
  }

  return {
    el: form,
    lire: () => ({
      version: complet.version,
      page: page.lire(),
      blocs: Object.fromEntries(BLOCS.map((b) => [b.id, blocs[b.id].lire()])),
    }),
  }
}

/** Le panneau de mise en page d'un document, en surimpression. Réservé aux
 * éditeurs : l'appelant ne l'ouvre pas pour un correcteur, et le serveur
 * refuse l'enregistrement de toute façon. */
export function ouvrirPanneauStyle(docId, { onEnregistre } = {}) {
  import('./styleConfig.js').then(async ({ loadDocStyle, saveDocStyle, resetDocStyle }) => {
    const { style, propre } = await loadDocStyle(docId)

    // Mêmes classes que le panneau de partage (accessPanel.js) : c'est
    // `name-modal-overlay` qui porte le fond sombre et le centrage, et
    // `name-modal` la boîte. Écrire une classe qui n'existe pas ne lève
    // aucune erreur — le panneau s'ajoute au bas de la page, sans style et
    // hors de vue, et le bouton a l'air de ne rien faire.
    const overlay = document.createElement('div')
    overlay.className = 'name-modal-overlay'
    const modal = document.createElement('div')
    // Volontairement PAS `name-modal` : cette modale-là est taillée pour un
    // champ unique — elle met tout `input` en 100 % de large avec 12 px de
    // marge basse, et tout `button` en pleine largeur sur fond accentué.
    // Appliqué à une grille de soixante-dix réglages, c'est illisible.
    modal.className = 'style-modal'

    const titre = document.createElement('h2')
    titre.textContent = 'Mise en page du document'
    const note = document.createElement('p')
    note.className = 'bo-note'
    note.textContent = propre
      ? "Ce document a sa propre mise en page : elle ne suit plus le style par défaut de l'instance."
      : "Ce document suit le style par défaut. Dès que vous enregistrez, il aura le sien et n'en bougera plus."
    modal.append(titre, note)

    const formulaire = formulaireStyle(style)
    modal.appendChild(formulaire.el)

    const statut = document.createElement('p')
    statut.className = 'style-status'
    modal.appendChild(statut)

    const barre = document.createElement('div')
    barre.className = 'style-actions'

    const enregistrer = document.createElement('button')
    enregistrer.type = 'button'
    enregistrer.className = 'btn-primary'
    enregistrer.textContent = 'Enregistrer'
    enregistrer.onclick = async () => {
      statut.textContent = 'Enregistrement…'
      try {
        const r = await saveDocStyle(docId, formulaire.lire())
        if (onEnregistre) onEnregistre(r.style)
        fermer()
      } catch {
        statut.textContent = "Échec de l'enregistrement — réessayez."
      }
    }

    const revenir = document.createElement('button')
    revenir.type = 'button'
    revenir.className = 'btn-texte'
    revenir.textContent = 'Revenir au style par défaut'
    revenir.hidden = !propre
    revenir.onclick = async () => {
      statut.textContent = 'Retour au style par défaut…'
      try {
        const r = await resetDocStyle(docId)
        if (onEnregistre) onEnregistre(r.style)
        fermer()
      } catch {
        statut.textContent = 'Échec — réessayez.'
      }
    }

    const annuler = document.createElement('button')
    annuler.type = 'button'
    annuler.className = 'btn-texte'
    annuler.textContent = 'Annuler'
    annuler.onclick = () => fermer()

    barre.append(enregistrer, revenir, annuler)
    modal.appendChild(barre)

    function fermer() {
      overlay.remove()
      document.removeEventListener('keydown', surEchap)
    }
    function surEchap(e) {
      if (e.key === 'Escape') fermer()
    }
    document.addEventListener('keydown', surEchap)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) fermer()
    })

    overlay.appendChild(modal)
    document.body.appendChild(overlay)
  })
}

/** La page `#/style` — le style **par défaut** de l'instance, réservée aux
 * administrateurs. Même formulaire, autre portée. */
export async function mountAdminStyle(root) {
  const { loadStyle, saveStyle } = await import('./styleConfig.js')
  root.innerHTML = ''
  const wrap = document.createElement('div')
  wrap.className = 'home'

  const retour = document.createElement('a')
  retour.href = '#/'
  retour.className = 'back-link'
  retour.textContent = '← Mes documents'
  wrap.appendChild(retour)

  const h1 = document.createElement('h1')
  h1.textContent = 'Style par défaut'
  const sous = document.createElement('p')
  sous.className = 'subtitle'
  sous.textContent =
    "Le point de départ des documents qui n'ont pas leur propre mise en page. Chaque document peut ensuite avoir la sienne, réglée par ses éditeurs — et à partir de là il ne suit plus cette page. Ces réglages s'appliquent aux exports, pas à l'éditeur, qui garde volontairement sa typographie fixe pour rester lisible quels que soient les choix faits ici."
  wrap.append(h1, sous)

  const statut = document.createElement('p')
  statut.className = 'style-status'
  wrap.appendChild(statut)

  const formulaire = formulaireStyle(fusionner(await loadStyle()))
  wrap.appendChild(formulaire.el)

  const barre = document.createElement('div')
  barre.className = 'style-actions'
  const enregistrer = document.createElement('button')
  enregistrer.type = 'button'
  enregistrer.className = 'btn-primary'
  enregistrer.textContent = 'Enregistrer'
  enregistrer.onclick = async () => {
    statut.textContent = 'Enregistrement…'
    try {
      await saveStyle(formulaire.lire())
      location.hash = '#/'
    } catch {
      statut.textContent = "Échec de l'enregistrement — réessaie."
    }
  }
  barre.appendChild(enregistrer)
  wrap.appendChild(barre)

  root.appendChild(wrap)
}
