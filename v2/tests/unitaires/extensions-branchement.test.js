// Les extensions de BlockNote, côté branchement (règle 14, couche 3) : ce
// qu'elles déclarent à l'éditeur (raccourcis, greffons, rendu, lecture du
// collage), appelé directement sans navigateur ; le vrai rendu reste vérifié
// par la pile complète. Le DOM est un faux minimal (faux-dom.js).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import { extensionLimitesDuSuivi } from '../../extensions/limites-du-suivi/index.js'
import { blocTableDesMatieres, texteEnLigne, titresDesBlocs } from '../../extensions/tableDesMatieres/index.js'
import { styleExposant } from '../../extensions/exposant/index.js'
import { installerFauxDom } from './faux-dom.js'

let retirerDom
before(() => (retirerDom = installerFauxDom()))
after(() => retirerDom())

// --- Limites du suivi --------------------------------------------------------

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    text: {},
  },
})
const p = (t) => schema.node('paragraph', null, [schema.text(t)])
// « Un » (positions 1 à 3), « Deux » (5 à 9)
const doc = schema.node('doc', null, [p('Un'), p('Deux')])
const selection = (a, b = a) => EditorState.create({ doc, selection: TextSelection.create(doc, a, b) }).selection

/** L'extension montée avec un faux éditeur dont la sélection est donnée. */
function monter(sel, { actif = true } = {}) {
  const refus = []
  const editor = { transact: (f) => f({ selection: sel }) }
  const ext = extensionLimitesDuSuivi({ actif: () => actif, refuser: (code) => refus.push(code) })({ editor })
  return { ext, refus, editor }
}

test('limites du suivi : Retour arrière en début de paragraphe et Suppr en fin sont refusés, avec leur code', () => {
  const debut = monter(selection(5))
  for (const touche of ['Backspace', 'Mod-Backspace'])
    assert.equal(debut.ext.keyboardShortcuts[touche]({ editor: debut.editor }), true, touche)
  assert.deepEqual(debut.refus, ['suggestion-a-cheval', 'suggestion-a-cheval'])
  const fin = monter(selection(3))
  for (const touche of ['Delete', 'Mod-Delete'])
    assert.equal(fin.ext.keyboardShortcuts[touche]({ editor: fin.editor }), true, touche)
  assert.equal(fin.refus.length, 2)
  // Au milieu d'un paragraphe, rien n'est refusé : BlockNote fait son travail.
  const milieu = monter(selection(2))
  assert.equal(milieu.ext.keyboardShortcuts.Backspace({ editor: milieu.editor }), false)
  assert.equal(milieu.ext.keyboardShortcuts.Delete({ editor: milieu.editor }), false)
  assert.deepEqual(milieu.refus, [])
})

test('limites du suivi : Entrée sur une sélection à cheval est refusée, dans un paragraphe elle passe', () => {
  const cheval = monter(selection(2, 6))
  assert.equal(cheval.ext.keyboardShortcuts.Enter({ editor: cheval.editor }), true)
  assert.deepEqual(cheval.refus, ['suggestion-a-cheval'])
  const dedans = monter(selection(1, 3))
  assert.equal(dedans.ext.keyboardShortcuts.Enter({ editor: dedans.editor }), false)
  assert.deepEqual(dedans.refus, [])
})

test('limites du suivi : la mise en forme est refusée en suggestion, sous les cinq raccourcis', () => {
  const { ext, refus } = monter(selection(2))
  for (const touche of ['Mod-b', 'Mod-i', 'Mod-u', 'Mod-Shift-s', 'Mod-Shift-x'])
    assert.equal(ext.keyboardShortcuts[touche](), true, touche)
  assert.deepEqual(refus, Array(5).fill('suggestion-mise-en-forme'))
})

test('limites du suivi : taper, coller ou couper sur une sélection à cheval est refusé', () => {
  const { ext, refus } = monter(null)
  const { handleTextInput, handlePaste, handleDOMEvents } = ext.prosemirrorPlugins[0].props
  const vue = (sel) => ({ state: { selection: sel } })
  assert.equal(handleTextInput(vue(selection(2, 6))), true)
  assert.equal(handlePaste(vue(selection(2, 6))), true)
  assert.equal(handleTextInput(vue(selection(1, 3))), false, 'dans un paragraphe')
  assert.equal(handlePaste(vue(selection(2))), false, 'sélection vide')
  let empeche = 0
  const evenement = { preventDefault: () => empeche++ }
  assert.equal(handleDOMEvents.cut(vue(selection(2, 6)), evenement), true)
  assert.equal(empeche, 1, 'la coupe est empêchée')
  assert.equal(handleDOMEvents.cut(vue(selection(1, 3)), evenement), false)
  assert.equal(empeche, 1)
  assert.deepEqual(refus, Array(3).fill('suggestion-a-cheval'))
})

test('limites du suivi : hors du mode Suggérer (ou sans options), rien n’est refusé', () => {
  const { ext, refus, editor } = monter(selection(2, 6), { actif: false })
  assert.equal(ext.keyboardShortcuts.Backspace({ editor }), false)
  assert.equal(ext.keyboardShortcuts.Enter({ editor }), false)
  assert.equal(ext.keyboardShortcuts['Mod-b'](), false)
  const { handleTextInput, handlePaste, handleDOMEvents } = ext.prosemirrorPlugins[0].props
  const vue = { state: { selection: selection(2, 6) } }
  assert.equal(handleTextInput(vue), false)
  assert.equal(handlePaste(vue), false)
  assert.equal(handleDOMEvents.cut(vue, { preventDefault: () => assert.fail('rien à empêcher') }), false)
  assert.deepEqual(refus, [])
  // Les options sont facultatives : inactive par défaut, et refuser est sans effet.
  const nu = extensionLimitesDuSuivi({})({ editor })
  assert.equal(nu.keyboardShortcuts['Mod-b'](), false)
})

// --- Table des matières ------------------------------------------------------

const t = (text) => ({ type: 'text', text })
const titre = (level, content, children) => ({ type: 'heading', props: { level }, content, children })

test('table des matières : le texte en ligne lit les liens, les titres sont pris enfants compris, dans l’ordre', () => {
  assert.equal(texteEnLigne([t('Un '), { type: 'link', content: [t('lien')] }, t(' fin')]), 'Un lien fin')
  assert.equal(texteEnLigne(undefined), '')
  assert.deepEqual(
    titresDesBlocs([
      titre(1, [t('A')], [titre(2, [{ type: 'link', content: [t('B')] }]), { type: 'paragraph', content: [t('x')] }]),
      { type: 'paragraph', content: [t('y')] },
      { type: 'heading', content: [t('Sans niveau')] },
    ]),
    [
      { niveau: 1, texte: 'A' },
      { niveau: 2, texte: 'B' },
      { niveau: 1, texte: 'Sans niveau' },
    ],
  )
  assert.deepEqual(titresDesBlocs(undefined), [])
})

/** Le bloc rendu dans un faux éditeur ; rend les éléments utiles. */
function rendreTable({ editable = true, profondeur = 2, dictionary = {} } = {}) {
  const abonnes = []
  let arretes = 0
  const mises = []
  const editeur = {
    dictionary,
    isEditable: editable,
    document: [titre(1, [t('Un')], [titre(2, [t('Deux')])]), titre(3, [t('Trois')])],
    onChange: (f) => (abonnes.push(f), () => arretes++),
    updateBlock: (id, mise) => mises.push([id, mise]),
  }
  const rendu = blocTableDesMatieres().implementation.render({ id: 'b1', props: { profondeur } }, editeur)
  const nav = rendu.dom.trouver((e) => e.attributs['data-amend-bloc'] === 'tableDesMatieres')
  const [titreDom, choix, liste] = nav.enfants
  return { rendu, nav, titreDom, choix, liste, editeur, abonnes, mises, arretes: () => arretes }
}

test('table des matières : titre, choix de profondeur et liste jusqu’à cette profondeur', () => {
  const { nav, titreDom, choix, liste } = rendreTable({
    dictionary: { amend: { table: { titre: 'Sommaire', profondeur: 'Profondeur' } } },
  })
  assert.equal(nav.tagName, 'NAV')
  assert.equal(nav.getAttribute('aria-label'), 'Sommaire')
  assert.equal(titreDom.textContent, 'Sommaire')
  assert.equal(choix.getAttribute('aria-label'), 'Profondeur')
  assert.deepEqual(
    choix.enfants.map((o) => [o.value, o.selected]),
    [
      ['1', false],
      ['2', true],
      ['3', false],
      ['4', false],
      ['5', false],
    ],
  )
  assert.deepEqual(
    liste.enfants.map((li) => [li.getAttribute('data-niveau'), li.textContent]),
    [
      ['1', 'Un'],
      ['2', 'Deux'],
    ],
    'le titre de niveau 3 dépasse la profondeur 2',
  )
})

test('table des matières : sans dictionnaire, aucun libellé inventé', () => {
  const { nav, titreDom, choix } = rendreTable()
  assert.equal(nav.getAttribute('aria-label'), null)
  assert.equal(choix.getAttribute('aria-label'), null)
  assert.equal(titreDom.textContent, '')
})

test('table des matières : changer la profondeur met à jour le bloc, seulement pour qui peut écrire', () => {
  const ecrivain = rendreTable()
  ecrivain.choix.value = '3'
  ecrivain.choix.declencher('change')
  assert.deepEqual(ecrivain.mises, [['b1', { props: { profondeur: 3 } }]])
  const lecteur = rendreTable({ editable: false })
  assert.equal(lecteur.choix.disabled, true, 'le choix est grisé pour qui ne peut pas écrire')
  lecteur.choix.value = '3'
  lecteur.choix.declencher('change')
  assert.deepEqual(lecteur.mises, [])
})

test('table des matières : la liste suit les changements du document, et le bloc se détache proprement', () => {
  const { rendu, liste, editeur, abonnes, choix, arretes } = rendreTable({ profondeur: 3 })
  assert.equal(liste.enfants.length, 3)
  editeur.document.push(titre(2, [t('Quatre')]))
  abonnes[0]()
  assert.equal(liste.enfants.length, 4)
  editeur.document.pop()
  choix.declencher('focus')
  assert.equal(liste.enfants.length, 3, 'le focus du choix rafraîchit aussi')
  assert.equal(rendu.ignoreMutation(), true)
  rendu.destroy()
  assert.equal(arretes(), 1)
})

// --- Exposant -----------------------------------------------------------------

test('exposant : rendu en <sup>, à l’écran comme à l’export ; lu depuis un <sup> collé, pas depuis autre chose', () => {
  const { render, toExternalHTML, parse } = styleExposant.implementation
  const ecran = render(true)
  assert.equal(ecran.dom.tagName, 'SUP')
  assert.equal(ecran.contentDOM, ecran.dom, 'le texte est dans l’élément lui-même')
  assert.equal(toExternalHTML(true).dom.tagName, 'SUP')
  assert.equal(parse({ tagName: 'SUP' }), true)
  assert.equal(parse({ tagName: 'SPAN' }), undefined)
  assert.equal(styleExposant.config.type, 'exposant')
  assert.equal(styleExposant.config.propSchema, 'boolean')
})
