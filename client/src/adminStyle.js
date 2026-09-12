// "Mise en page" — the admin-only page for the shared feuille de style
// (see README2.md for the design). One config for the whole instance (not
// per document), read/written via /api/style. No role check yet (there's
// no authentication at all in this v0.1 — same caveat as the rest of the
// app: anyone with the URL can reach this page, same as anyone can open
// any document).

import { FONT_OPTIONS, ALIGN_OPTIONS, PAGE_SIZE_OPTIONS, DEFAULT_STYLE, loadStyle, saveStyle } from './styleConfig.js'

function field(labelText, inputEl) {
  const label = document.createElement('label')
  label.className = 'style-field'
  const span = document.createElement('span')
  span.textContent = labelText
  label.append(span, inputEl)
  return label
}

function selectEl(options, value) {
  const select = document.createElement('select')
  for (const opt of options) {
    const o = document.createElement('option')
    o.value = opt.id
    o.textContent = opt.label
    select.appendChild(o)
  }
  select.value = value
  return select
}

function numberEl(value, { min, max } = {}) {
  const input = document.createElement('input')
  input.type = 'number'
  if (min != null) input.min = min
  if (max != null) input.max = max
  input.value = value
  return input
}

function checkboxEl(checked) {
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = !!checked
  return input
}

/** Builds the shared set of controls (police, taille, gras, souligné,
 * majuscules, alignement, espace avant/après) for one style block (corps,
 * citation, titres), and returns { el, read() } — `read()` pulls the
 * current values back out into a plain object shaped like that block in
 * styleConfig.js. `extraSizeFields`, when given, renders one size input
 * per heading level instead of a single "taille" field (titres share
 * everything else, but not their size — see the design note in
 * README2.md). */
function blockFieldset(legendText, block, { headingSizes } = {}) {
  const fieldset = document.createElement('fieldset')
  fieldset.className = 'style-fieldset'
  const legend = document.createElement('legend')
  legend.textContent = legendText
  fieldset.appendChild(legend)

  const grid = document.createElement('div')
  grid.className = 'style-grid'
  fieldset.appendChild(grid)

  const fontSelect = selectEl(FONT_OPTIONS, block.font)
  grid.appendChild(field('Police', fontSelect))

  let sizeInput = null
  const sizeInputs = []
  if (headingSizes) {
    const sizesWrap = document.createElement('div')
    sizesWrap.className = 'style-field style-heading-sizes'
    const span = document.createElement('span')
    span.textContent = 'Taille (pt) — Titre 1 à 5'
    sizesWrap.appendChild(span)
    const row = document.createElement('div')
    row.className = 'style-heading-sizes-row'
    for (let i = 0; i < 5; i++) {
      const inp = numberEl(headingSizes[i], { min: 6, max: 96 })
      inp.title = `Titre ${i + 1}`
      sizeInputs.push(inp)
      row.appendChild(inp)
    }
    sizesWrap.appendChild(row)
    grid.appendChild(sizesWrap)
  } else {
    sizeInput = numberEl(block.size, { min: 6, max: 96 })
    grid.appendChild(field('Taille (pt)', sizeInput))
  }

  const boldInput = checkboxEl(block.bold)
  grid.appendChild(field('Gras', boldInput))

  const italicInput = checkboxEl(block.italic)
  grid.appendChild(field('Italique', italicInput))

  const uppercaseInput = checkboxEl(block.uppercase)
  grid.appendChild(field('Majuscules', uppercaseInput))

  const alignSelect = selectEl(ALIGN_OPTIONS, block.align)
  grid.appendChild(field('Alignement', alignSelect))

  const spaceBeforeInput = numberEl(block.spaceBefore, { min: 0, max: 200 })
  grid.appendChild(field('Espace avant (pt)', spaceBeforeInput))

  const spaceAfterInput = numberEl(block.spaceAfter, { min: 0, max: 200 })
  grid.appendChild(field('Espace après (pt)', spaceAfterInput))

  return {
    el: fieldset,
    read() {
      const out = {
        font: fontSelect.value,
        bold: boldInput.checked,
        italic: italicInput.checked,
        uppercase: uppercaseInput.checked,
        align: alignSelect.value,
        spaceBefore: Number(spaceBeforeInput.value) || 0,
        spaceAfter: Number(spaceAfterInput.value) || 0,
      }
      if (headingSizes) out.sizes = sizeInputs.map((inp) => Number(inp.value) || 12)
      else out.size = Number(sizeInput.value) || 11
      return out
    },
  }
}

function pageFieldset(page) {
  const fieldset = document.createElement('fieldset')
  fieldset.className = 'style-fieldset'
  const legend = document.createElement('legend')
  legend.textContent = 'Page'
  fieldset.appendChild(legend)

  const grid = document.createElement('div')
  grid.className = 'style-grid'
  fieldset.appendChild(grid)

  const sizeSelect = selectEl(PAGE_SIZE_OPTIONS, page.size)
  grid.appendChild(field('Taille de page', sizeSelect))

  const marginTop = numberEl(page.marginTop, { min: 0, max: 100 })
  grid.appendChild(field('Marge haut (mm)', marginTop))
  const marginRight = numberEl(page.marginRight, { min: 0, max: 100 })
  grid.appendChild(field('Marge droite (mm)', marginRight))
  const marginBottom = numberEl(page.marginBottom, { min: 0, max: 100 })
  grid.appendChild(field('Marge bas (mm)', marginBottom))
  const marginLeft = numberEl(page.marginLeft, { min: 0, max: 100 })
  grid.appendChild(field('Marge gauche (mm)', marginLeft))

  return {
    el: fieldset,
    read() {
      return {
        size: sizeSelect.value,
        marginTop: Number(marginTop.value) || 0,
        marginRight: Number(marginRight.value) || 0,
        marginBottom: Number(marginBottom.value) || 0,
        marginLeft: Number(marginLeft.value) || 0,
      }
    },
  }
}

export async function mountAdminStyle(root) {
  root.innerHTML = ''
  const wrap = document.createElement('div')
  wrap.className = 'home style-admin'

  const backLink = document.createElement('a')
  backLink.href = '#/'
  backLink.className = 'back-link'
  backLink.textContent = '← Documents'
  wrap.appendChild(backLink)

  const h1 = document.createElement('h1')
  h1.textContent = 'Mise en page'
  const subtitle = document.createElement('p')
  subtitle.className = 'subtitle'
  subtitle.textContent =
    'Feuille de style unique pour tous les documents : police, taille, gras, italique, majuscules, alignement, espacement — appliquée dans l’éditeur, et reprise à l’identique à l’export PDF.'
  wrap.append(h1, subtitle)

  const status = document.createElement('p')
  status.className = 'style-status'
  wrap.appendChild(status)

  const style = (await loadStyle()) || DEFAULT_STYLE
  const form = document.createElement('form')
  form.className = 'style-form'

  const pageF = pageFieldset(style.page)
  const bodyF = blockFieldset('Corps de texte', style.body)
  const quoteF = blockFieldset('Citation', style.quote)
  const headingF = blockFieldset('Titres', style.heading, { headingSizes: style.heading.sizes })

  form.append(pageF.el, bodyF.el, quoteF.el, headingF.el)

  const saveBtn = document.createElement('button')
  saveBtn.type = 'submit'
  saveBtn.className = 'btn-primary'
  saveBtn.textContent = 'Enregistrer'
  form.appendChild(saveBtn)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    status.textContent = 'Enregistrement…'
    const next = {
      page: pageF.read(),
      body: bodyF.read(),
      quote: quoteF.read(),
      heading: headingF.read(),
    }
    try {
      await saveStyle(next)
      // Retour à la liste des documents une fois l'enregistrement confirmé,
      // plutôt que de rester sur le formulaire — déclenche 'hashchange',
      // donc le routeur (main.js) affiche l'accueil normalement.
      location.hash = '#/'
    } catch {
      status.textContent = "Échec de l'enregistrement — réessaie."
    }
  })

  wrap.appendChild(form)
  root.appendChild(wrap)
}
