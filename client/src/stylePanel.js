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
  INTERLIGNES_NOTES,
  COLONNES,
  DEBUTS_CHAPITRE,
  POSITIONS_NUMERO,
  SEPARATEURS,
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

/** Le groupe de réglages d'un bloc. Replié par défaut sauf le premier de son
 * onglet (corps, titre 1, citation, légende) : plusieurs blocs × dix réglages
 * déroulés d'un coup, c'est un mur. */
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

/** Un contrôle `<select>` à partir d'une liste `{ id, label }`. */
function selecteur(liste, valeur) {
  const sel = document.createElement('select')
  for (const o of liste) {
    const opt = document.createElement('option')
    opt.value = String(o.id)
    opt.textContent = o.label
    sel.appendChild(opt)
  }
  sel.value = String(valeur)
  return sel
}

/** Les réglages de la page, répartis dans les onglets du formulaire
 * (28/10/2026) : `format` (format, langue, marges, marges miroir), `texte`
 * (césure, veuves et orphelines, premier paragraphe), `titres` (début de
 * chapitre, descente, titres solidaires), `pages` (numéros, en-têtes),
 * `autres` (notes de bas de page, séparateur de scène), `images`. */
function groupePage(page) {
  const nouvelleGrille = () => {
    const g = document.createElement('div')
    g.className = 'style-grille'
    return g
  }
  const grilles = {
    format: nouvelleGrille(),
    texte: nouvelleGrille(),
    titres: nouvelleGrille(),
    pages: nouvelleGrille(),
    autres: nouvelleGrille(),
    images: nouvelleGrille(),
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
  const libellesMarges = {}
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
    libellesMarges[cle] = c.firstChild
    grille.appendChild(c)
  }

  // Marges miroir (28/10/2026), pour un livre relié : « gauche » devient la
  // marge intérieure (côté reliure) et « droite » l'extérieure, sur toutes
  // les pages.
  const miroir = document.createElement('input')
  miroir.type = 'checkbox'
  miroir.checked = !!page.margesMiroir
  const champMiroir = champ('Marges miroir', miroir)
  champMiroir.title =
    'Pour un livre imprimé : la marge gauche devient la marge intérieure (côté reliure) et la marge droite la marge extérieure, page paire comme page impaire. Export PDF et Word.'
  grille.appendChild(champMiroir)
  const majMiroir = () => {
    libellesMarges.marginLeft.textContent = miroir.checked ? 'Marge intérieure' : 'Marge gauche'
    libellesMarges.marginRight.textContent = miroir.checked ? 'Marge extérieure' : 'Marge droite'
  }
  majMiroir()
  miroir.addEventListener('change', majMiroir)

  // Colonnes (28/10/2026) : une, deux ou trois pour tout le texte ; la
  // gouttière n'a de sens qu'à partir de deux.
  const colonnes = selecteur(COLONNES, page.colonnes || 1)
  const champColonnes = champ('Colonnes', colonnes)
  champColonnes.title =
    'Le texte est composé sur une, deux ou trois colonnes. Les en-têtes et le numéro de page restent sur toute la largeur. Export PDF et Word.'
  grille.appendChild(champColonnes)
  const gouttiere = document.createElement('input')
  gouttiere.type = 'number'
  gouttiere.min = 2
  gouttiere.max = 30
  gouttiere.step = 0.5
  gouttiere.value = page.gouttiere ?? 6
  const champGouttiere = champ('Gouttière', gouttiere, 'mm')
  champGouttiere.title = 'L’espace entre deux colonnes.'
  grille.appendChild(champGouttiere)
  const majColonnes = () => {
    champGouttiere.hidden = Number(colonnes.value) < 2
  }
  majColonnes()
  colonnes.addEventListener('change', majColonnes)

  grille = grilles.texte
  const coche = (libelle, valeur, titre) => {
    const c = document.createElement('input')
    c.type = 'checkbox'
    c.checked = !!valeur
    const f = champ(libelle, c)
    if (titre) f.title = titre
    grille.appendChild(f)
    return c
  }
  const cesure = coche(
    'Césure (coupure des mots)',
    page.cesure !== false,
    'Les mots se coupent en fin de ligne, selon la langue du document. Dans le PDF, seulement dans le texte justifié ; Word coupe aussi les textes non justifiés.'
  )
  const veuves = coche(
    'Veuves et orphelines',
    page.veuvesOrphelines !== false,
    'Évite une seule ligne d’un paragraphe isolée en haut ou en bas d’une page.'
  )
  const premierSansRetrait = coche(
    'Premier paragraphe sans retrait',
    page.premierSansRetrait,
    'Le paragraphe qui suit un titre ou un séparateur de scène n’a pas de retrait de première ligne, comme dans un livre.'
  )

  grille = grilles.pages

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

  const position = selecteur(POSITIONS_NUMERO, (page.pageNumbers && page.pageNumbers.position) || 'bas-centre')
  const champPosition = champ('Position du numéro', position)
  champPosition.title =
    '« Côté extérieur » : à gauche sur les pages paires, à droite sur les pages impaires. En Word, la première page d’un chapitre prend toujours le côté droit.'
  grille.appendChild(champPosition)

  const sautNumero = document.createElement('input')
  sautNumero.type = 'checkbox'
  sautNumero.checked = !!(page.pageNumbers && page.pageNumbers.sautOuverture)
  const champSautNumero = champ('Pas de numéro sur les pages d’ouverture', sautNumero)
  champSautNumero.title =
    'Une page qui porte un titre de niveau 1 n’a pas de numéro. Dans Word, seulement quand les chapitres commencent sur une nouvelle page.'
  grille.appendChild(champSautNumero)

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

  const debut = selecteur(DEBUTS_CHAPITRE, page.debutChapitre || 'continuer')
  const champDebut = champ('Début de chapitre', debut)
  champDebut.title =
    'Où commence un titre de niveau 1. « Nouvelle page à droite » : une page blanche est insérée au besoin, comme dans un livre. Dans Word, ce sont des sauts de section.'
  grille.appendChild(champDebut)

  const descente = document.createElement('input')
  descente.type = 'number'
  descente.min = 0
  descente.max = 120
  descente.step = 1
  descente.value = page.descente || 0
  const champDescente = champ('Descente en haut de page', descente, 'mm')
  champDescente.title =
    'Espace laissé au-dessus d’un titre de niveau 1 qui ouvre une page. Sans effet quand le chapitre continue sur la page en cours.'
  grille.appendChild(champDescente)
  const majDescente = () => {
    champDescente.hidden = debut.value === 'continuer'
  }
  majDescente()
  debut.addEventListener('change', majDescente)

  grille = grilles.autres
  const reductionNotes = document.createElement('input')
  reductionNotes.type = 'number'
  reductionNotes.min = 0
  reductionNotes.max = 6
  reductionNotes.step = 0.5
  reductionNotes.value = page.notesReduction ?? 2
  const champReduction = champ('Notes : taille en moins', reductionNotes, 'pt')
  champReduction.title =
    'Les notes de bas de page sont composées plus petit que le texte (plancher 7 pt). Dans Word, ce sont des notes de fin.'
  grille.appendChild(champReduction)
  const interligneNotes = selecteur(INTERLIGNES_NOTES, page.notesInterligne || 0)
  grille.appendChild(champ('Notes : interligne', interligneNotes))
  const separateur = selecteur(SEPARATEURS, page.separateur || 'trait')
  const champSeparateur = champ('Séparateur de scène', separateur)
  champSeparateur.title = 'Ce que montre la ligne de séparation insérée dans le texte, dans les exports.'
  grille.appendChild(champSeparateur)

  grille = grilles.images
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
      margesMiroir: miroir.checked,
      colonnes: Number(colonnes.value),
      gouttiere: Number(gouttiere.value),
      cesure: cesure.checked,
      veuvesOrphelines: veuves.checked,
      premierSansRetrait: premierSansRetrait.checked,
      debutChapitre: debut.value,
      descente: Number(descente.value) || 0,
      notesReduction: Number(reductionNotes.value),
      notesInterligne: Number(interligneNotes.value),
      separateur: separateur.value,
      pageNumbers: {
        enabled: numeros.checked,
        startAt: Number(depart.value) || 1,
        position: position.value,
        sautOuverture: sautNumero.checked,
      },
      langue: lang.value,
      entete: {
        gauche: { type: cotes.gauche.choix.value, texte: cotes.gauche.texte.value },
        droite: { type: cotes.droite.choix.value, texte: cotes.droite.texte.value },
        sautOuverture: sautOuverture.checked,
      },
      titresSolidaires: solidaires.checked,
      imagesPleinePage: pleinePage.checked,
    }),
  }
}

/** Les onglets du formulaire : une rangée de boutons (`role="tablist"`) et un
 * panneau par onglet, un seul visible à la fois. Flèches gauche et droite
 * pour passer de l'un à l'autre. `onglets` : `[{ titre, contenus }]`. */
function onglets(liste, { actif = 0, surOuverture } = {}) {
  const racine = document.createElement('div')
  racine.className = 'style-onglets'
  const barre = document.createElement('div')
  barre.className = 'style-onglets-barre'
  barre.setAttribute('role', 'tablist')
  racine.appendChild(barre)
  const entrees = liste.map((o, i) => {
    const bouton = document.createElement('button')
    bouton.type = 'button'
    bouton.className = 'style-onglet'
    bouton.setAttribute('role', 'tab')
    bouton.textContent = o.titre
    const panneau = document.createElement('div')
    panneau.className = 'style-panneau'
    panneau.setAttribute('role', 'tabpanel')
    for (const c of o.contenus) panneau.appendChild(c)
    barre.appendChild(bouton)
    racine.appendChild(panneau)
    bouton.onclick = () => choisir(i)
    return { bouton, panneau, o }
  })
  function choisir(n, { focus = false } = {}) {
    entrees.forEach((e, i) => {
      const on = i === n
      e.bouton.setAttribute('aria-selected', String(on))
      e.bouton.tabIndex = on ? 0 : -1
      e.panneau.hidden = !on
      if (on && focus) e.bouton.focus()
    })
    if (surOuverture) surOuverture(entrees[n].o.titre, entrees[n].panneau)
  }
  barre.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const courant = entrees.findIndex((x) => x.bouton.getAttribute('aria-selected') === 'true')
    const suivant = (courant + (e.key === 'ArrowRight' ? 1 : -1) + entrees.length) % entrees.length
    choisir(suivant, { focus: true })
    e.preventDefault()
  })
  choisir(actif)
  return racine
}

/** Construit le formulaire complet, rangé en onglets (28/10/2026) : Format,
 * Texte courant, Titres, Pages, Autres styles, Images et CSS. Renvoie `{ el, lire() }` — `lire()` rend une feuille de
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

  const page = groupePage(complet.page)
  const blocs = {}
  for (const b of BLOCS) {
    blocs[b.id] = groupeBloc(b, complet.blocs[b.id] || b.defauts, {
      ouvert: ['body', 'h1', 'quote', 'caption'].includes(b.id),
    })
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
  const contenuCss = [
    Object.assign(document.createElement('p'), {
      className: 'bo-note',
      textContent:
        'Le fichier CSS de ce modèle, tel qu’il serait enregistré. En lecture seule : on règle le modèle dans les onglets.',
    }),
    css,
  ]

  const choix = onglets(
    [
      { titre: 'Format', contenus: [page.grilles.format] },
      { titre: 'Texte courant', contenus: [blocs.body.el, page.grilles.texte] },
      {
        titre: 'Titres',
        contenus: [page.grilles.titres, ...['h1', 'h2', 'h3', 'title', 'subtitle'].map((id) => blocs[id].el)],
      },
      { titre: 'Pages', contenus: [page.grilles.pages] },
      { titre: 'Autres styles', contenus: [blocs.quote.el, page.grilles.autres] },
      { titre: 'Images', contenus: [page.grilles.images, blocs.caption.el] },
      { titre: 'CSS', contenus: contenuCss },
    ],
    {
      // Le CSS se calcule à l'ouverture de l'onglet, pas à chaque réglage.
      surOuverture: (titre) => {
        if (titre === 'CSS') afficherCss()
      },
    }
  )
  form.appendChild(choix)

  const prevenir = () => {
    if (!css.closest('[hidden]')) afficherCss()
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
