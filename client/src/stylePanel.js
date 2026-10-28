// Formulaire de mise en page — **engendré à partir du schéma**
// (`shared/style.js`), jamais écrit à la main. C'est ce qui fait qu'ajouter
// un réglage ou un bloc ne demande plus de toucher à l'interface : le jour
// où « retrait de première ligne » est apparu dans `PROPRIETES`, le champ
// s'est affiché tout seul.
//
// Le même formulaire sert deux fois :
//  - panneau ouvert depuis un document (« Personnaliser ce document… » du
//    menu Exporter) — les **réglages propres à ce document**, par-dessus son
//    modèle, réservés aux éditeurs (16/09/2026, repris le 01/10/2026 avec
//    les modèles) ;
//  - éditeur d'un modèle, dans « Gérer mes modèles » (voir modeles.js).

import {
  BLOCS,
  PROPRIETES,
  FORMATS_PAGE,
  FORMATS_ANCIENS,
  ORIENTATIONS,
  BORNES_FORMAT,
  UTILE_MIN,
  CONTENUS_ENTETE,
  LANGUES,
  langue,
  idPolice,
  styleParDefaut,
} from './styleConfig.js'
import { libelleModele } from '../../shared/modeles.js'
import { ecrireProfil } from '../../shared/profilCss.js'

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
    // Un document ou un modèle qui porte une police retirée de la liste
    // (« Libre Caslon Text ») affiche son remplaçant, pas une case vide.
    sel.value = String(prop.id === 'font' ? idPolice(valeur) : valeur)
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

/** Les réglages de la page, répartis dans les volets du formulaire (28/10/2026) :
 * `format` (format, orientation, langue, marges), `pages` (numéros, en-têtes),
 * `titres` (comportement des titres), `elements` (images). Rien n'est ajouté
 * ni retiré : ce sont les mêmes réglages qu'avant, rangés par sujet. */
function groupePage(page) {
  const nouvelleGrille = () => {
    const g = document.createElement('div')
    g.className = 'style-grille'
    return g
  }
  const grilles = {
    format: nouvelleGrille(),
    pages: nouvelleGrille(),
    titres: nouvelleGrille(),
    elements: nouvelleGrille(),
  }
  let grille = grilles.format

  // Format de page (01/10/2026) : A4, A5 ou libre. L'orientation ne se
  // demande que pour un format nommé ; un format libre porte directement
  // ses deux côtés, et c'est leur ordre qui dit portrait ou paysage.
  const taille = document.createElement('select')
  // Un format retiré de la liste (Letter) reste affiché tant que le
  // document l'utilise : sinon le select afficherait A4 et l'enregistrement
  // changerait le format sans qu'on l'ait demandé.
  const formats = [...FORMATS_PAGE, ...FORMATS_ANCIENS.filter((f) => f.id === page.size)]
  for (const f of formats) {
    const o = document.createElement('option')
    o.value = f.id
    o.textContent = f.label
    taille.appendChild(o)
  }
  taille.value = page.size
  grille.appendChild(champ('Format', taille))

  const orientation = document.createElement('select')
  for (const o of ORIENTATIONS) {
    const opt = document.createElement('option')
    opt.value = o.id
    opt.textContent = o.label
    orientation.appendChild(opt)
  }
  orientation.value = page.orientation || 'portrait'
  const champOrientation = champ('Orientation', orientation)
  grille.appendChild(champOrientation)

  const largeur = document.createElement('input')
  largeur.type = 'number'
  largeur.min = BORNES_FORMAT.min
  largeur.max = BORNES_FORMAT.max
  largeur.step = 0.5
  largeur.value = page.largeur
  const champLargeur = champ('Largeur', largeur, 'mm')
  const hauteur = document.createElement('input')
  hauteur.type = 'number'
  hauteur.min = BORNES_FORMAT.min
  hauteur.max = BORNES_FORMAT.max
  hauteur.step = 0.5
  hauteur.value = page.hauteur
  const champHauteur = champ('Hauteur', hauteur, 'mm')
  champLargeur.title = champHauteur.title = `De ${BORNES_FORMAT.min} à ${BORNES_FORMAT.max} mm.`
  grille.append(champLargeur, champHauteur)

  const majFormat = () => {
    const libre = taille.value === 'personnalise'
    champOrientation.hidden = libre
    champLargeur.hidden = !libre
    champHauteur.hidden = !libre
  }
  majFormat()
  taille.onchange = majFormat

  // La langue du document (19/09/2026) : elle ne change rien à l'interface,
  // elle décide des césures et des guillemets à la composition.
  const lang = document.createElement('select')
  for (const l of LANGUES) {
    const o = document.createElement('option')
    o.value = l.id
    o.textContent = l.label
    lang.appendChild(o)
  }
  lang.value = langue(page.langue).id
  const champLangue = champ('Langue', lang)
  champLangue.title =
    "Décide des coupures de mots et de la forme des guillemets dans les exports. Sans rapport avec la langue de l'interface."
  grille.appendChild(champLangue)

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
    const c = champ(libelle, n, 'mm')
    c.title = `Si les marges ne laissent pas ${UTILE_MIN} mm de texte, elles sont réduites à l'enregistrement.`
    grille.appendChild(c)
  }

  grille = grilles.pages
  const numeros = document.createElement('input')
  numeros.type = 'checkbox'
  numeros.checked = !!(page.pageNumbers && page.pageNumbers.enabled)
  grille.appendChild(champ('Numéros de page', numeros))

  const depart = document.createElement('input')
  depart.type = 'number'
  depart.min = 1
  depart.value = (page.pageNumbers && page.pageNumbers.startAt) || 1
  grille.appendChild(champ('Première page', depart))

  // En-têtes (20/09/2026) : un côté gauche et un côté droit, toujours
  // centrés. Le champ de texte libre n'apparaît que quand il sert.
  const cotes = {}
  for (const [cle, libelle] of [
    ['gauche', 'En-tête pages de gauche'],
    ['droite', 'En-tête pages de droite'],
  ]) {
    const courant = (page.entete && page.entete[cle]) || { type: 'rien', texte: '' }
    const choix = document.createElement('select')
    for (const c of CONTENUS_ENTETE) {
      const o = document.createElement('option')
      o.value = c.id
      o.textContent = c.label
      choix.appendChild(o)
    }
    choix.value = courant.type || 'rien'
    const texte = document.createElement('input')
    texte.type = 'text'
    texte.value = courant.texte || ''
    texte.placeholder = 'Texte de l’en-tête'
    const champTexte = champ(`${libelle} — texte`, texte)
    const majVisible = () => {
      champTexte.hidden = choix.value !== 'texte'
    }
    majVisible()
    choix.onchange = majVisible
    const champChoix = champ(libelle, choix)
    champChoix.title =
      '« Titre du document » reprend le titre du fichier, le même sur toutes les pages. « Titre 1 courant » reprend le dernier titre de niveau 1 rencontré ; dans l’export Word, faute d’équivalent fiable, c’est le titre du document qui est écrit.'
    grille.append(champChoix, champTexte)
    cotes[cle] = { choix, texte }
  }

  const sautOuverture = document.createElement('input')
  sautOuverture.type = 'checkbox'
  sautOuverture.checked = !(page.entete && page.entete.sautOuverture === false)
  const champSaut = champ('Pas d’en-tête sur les pages de titre 1', sautOuverture)
  champSaut.title = 'Une page qui porte un titre de niveau 1 reste nue : c’est une ouverture.'
  grille.appendChild(champSaut)

  grille = grilles.titres
  // Deux réglages qui ne concernent que la sortie paginée (19/09/2026) :
  // l'éditeur défile, il n'a pas de bas de page.
  const solidaires = document.createElement('input')
  solidaires.type = 'checkbox'
  solidaires.checked = page.titresSolidaires !== false
  const champSolidaires = champ('Jamais de titre en bas de page', solidaires)
  champSolidaires.title = "Un titre seul en bas d'une page part à la page suivante avec le texte qu'il annonce."
  grille.appendChild(champSolidaires)

  const bellePage = document.createElement('input')
  bellePage.type = 'checkbox'
  bellePage.checked = !!page.titre1PageImpaire
  const champBellePage = champ('Titres 1 en page impaire', bellePage)
  champBellePage.title =
    'Chaque titre de niveau 1 ouvre une page de droite, comme dans un livre — une page blanche est insérée si besoin. Export PDF seulement.'
  grille.appendChild(champBellePage)

  grille = grilles.elements
  const pleinePage = document.createElement('input')
  pleinePage.type = 'checkbox'
  pleinePage.checked = !!page.imagesPleinePage
  const champPleinePage = champ('Images pleine page', pleinePage)
  champPleinePage.title =
    'Chaque image est centrée et prend la plus grande taille qui tient entre les marges (largeur et hauteur), proportions gardées — y compris une petite image, qui est alors agrandie. Export PDF et Word seulement.'
  grille.appendChild(champPleinePage)

  return {
    grilles,
    lire: () => ({
      size: taille.value,
      orientation: orientation.value,
      largeur: Number(largeur.value),
      hauteur: Number(hauteur.value),
      ...Object.fromEntries(Object.entries(marges).map(([k, el]) => [k, Number(el.value)])),
      pageNumbers: { enabled: numeros.checked, startAt: Number(depart.value) || 1 },
      langue: lang.value,
      entete: {
        gauche: { type: cotes.gauche.choix.value, texte: cotes.gauche.texte.value },
        droite: { type: cotes.droite.choix.value, texte: cotes.droite.texte.value },
        sautOuverture: sautOuverture.checked,
      },
      titresSolidaires: solidaires.checked,
      titre1PageImpaire: bellePage.checked,
      imagesPleinePage: pleinePage.checked,
    }),
  }
}

let formulaires = 0

/** Un volet du formulaire : un `<details>` dont le titre ouvre ses réglages.
 * Les volets d'un même formulaire partagent un `name`, donc un seul est
 * ouvert à la fois (comportement natif des navigateurs récents). */
function volet(titre, groupe, contenus, { ouvert = false } = {}) {
  const details = document.createElement('details')
  details.className = 'style-volet'
  details.setAttribute('name', groupe)
  details.open = ouvert
  const resume = document.createElement('summary')
  resume.textContent = titre
  details.appendChild(resume)
  for (const c of contenus) details.appendChild(c)
  return details
}

/** Construit le formulaire complet, rangé en volets (28/10/2026) : « Format
 * et reliure », « Texte », « Titres et chapitres », « Pages », « Éléments »
 * et « Avancé (CSS) ». Renvoie `{ el, lire() }` — `lire()` rend une feuille de
 * style entière, que l'appelant réduit à ses écarts au moment d'enregistrer
 * (c'est le serveur qui s'en charge).
 *
 * Le dernier volet montre le **profil CSS** tel qu'il serait enregistré, en
 * lecture seule (décision du 28/10/2026) : on peut le copier ou le comparer,
 * pas le modifier.
 *
 * `surChangement(style)` est appelé à chaque réglage touché : la page Modèles
 * s'en sert pour tenir le spécimen à jour. */
export function formulaireStyle(style, { surChangement } = {}) {
  const complet = style && style.blocs ? style : styleParDefaut()
  const form = document.createElement('div')
  form.className = 'style-form'
  const groupe = `style-volets-${++formulaires}`

  const page = groupePage(complet.page)
  const blocs = {}
  for (const b of BLOCS) {
    blocs[b.id] = groupeBloc(b, complet.blocs[b.id] || b.defauts, { ouvert: b.id === 'body' })
  }

  const lire = () => ({
    version: complet.version,
    page: page.lire(),
    blocs: Object.fromEntries(BLOCS.map((b) => [b.id, blocs[b.id].lire()])),
  })

  const css = document.createElement('pre')
  css.className = 'style-css'
  css.tabIndex = 0
  const afficherCss = () => {
    try {
      css.textContent = ecrireProfil(lire())
    } catch {
      css.textContent = ''
    }
  }
  const voletCss = volet('Avancé (CSS)', groupe, [
    Object.assign(document.createElement('p'), {
      className: 'bo-note',
      textContent:
        'Le fichier CSS de ce modèle, tel qu’il serait enregistré. En lecture seule : on règle le modèle dans les volets.',
    }),
    css,
  ])
  voletCss.addEventListener('toggle', () => {
    if (voletCss.open) afficherCss()
  })

  form.append(
    volet('Format et reliure', groupe, [page.grilles.format], { ouvert: true }),
    volet('Texte', groupe, [blocs.body.el]),
    volet('Titres et chapitres', groupe, [
      page.grilles.titres,
      ...['h1', 'h2', 'h3', 'title', 'subtitle'].map((id) => blocs[id].el),
    ]),
    volet('Pages', groupe, [page.grilles.pages]),
    volet('Éléments', groupe, [page.grilles.elements, blocs.quote.el]),
    voletCss
  )

  const prevenir = () => {
    if (voletCss.open) afficherCss()
    if (surChangement) surChangement(lire())
  }
  form.addEventListener('input', prevenir)
  form.addEventListener('change', prevenir)

  return { el: form, lire }
}

/** Le panneau de mise en page d'un document, en surimpression. Réservé aux
 * éditeurs : l'appelant ne l'ouvre pas pour un correcteur, et le serveur
 * refuse l'enregistrement de toute façon. */
export function ouvrirPanneauStyle(docId, { onEnregistre } = {}) {
  import('./styleConfig.js').then(async ({ loadDocStyle, saveDocStyle, resetDocStyle }) => {
    const { style, propre, ecarts, modele } = await loadDocStyle(docId)

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
    titre.textContent = 'Personnaliser ce document'
    const note = document.createElement('p')
    note.className = 'bo-note'
    // Toujours dire ce qu'on touche : ici le document seulement, jamais son
    // modèle (le piège de Word : « changer mon document » ou « changer le
    // modèle » ?).
    const nomModele = modele ? `« ${libelleModele(modele)} »` : 'son modèle'
    note.textContent =
      (ecarts > 0
        ? `Ce document est basé sur ${nomModele}, avec ${ecarts} réglage${ecarts > 1 ? 's' : ''} propre${ecarts > 1 ? 's' : ''}. `
        : `Ce document est basé sur ${nomModele}, sans réglage propre pour l'instant. `) +
      'Ce que vous changez ici ne vaut que pour ce document : le modèle, lui, ne bouge pas.'
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
    revenir.textContent = 'Revenir au modèle'
    revenir.hidden = !propre
    revenir.onclick = async () => {
      statut.textContent = 'Retour au modèle…'
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
