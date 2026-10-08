// La typographie française (08/10/2026) — les règles, puis leur branchement
// sur l'éditeur : frappe (avec et sans suivi des modifications), Retour
// arrière qui défait la correction, collage.
//
// Les règles sont dans shared/typographie.js ; le serveur les applique aux
// sorties de l'IA et de Claude (voir server/test/typographie.test.js).

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from '../src/schema.js'
import { trackChangesPlugin, makeDispatchTransaction, isTrackChangesEnabled } from '../src/trackChanges.js'
import { typographiePlugin, typographierFragment } from '../src/typographie.js'
import { typographier, corrigerSaisie, NBSP, FINE } from '../../shared/typographie.js'

{
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', pretendToBeVisual: true })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Node', 'Element', 'getComputedStyle', 'DocumentFragment', 'Range', 'MutationObserver', 'Event', 'KeyboardEvent']) {
    globalThis[k] = w[k]
  }
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
}

// =============================================================================
// 1. Les règles
// =============================================================================

const CAS = [
  // apostrophe
  ["l'été", 'l’été'],
  ["aujourd'hui, c'est l'heure", 'aujourd’hui, c’est l’heure'],
  // guillemets
  ['il dit "bonjour" ensuite', `il dit «${NBSP}bonjour${NBSP}» ensuite`],
  ['"Début" de phrase', `«${NBSP}Début${NBSP}» de phrase`],
  ['("entre parenthèses")', `(«${NBSP}entre parenthèses${NBSP}»)`],
  ['Il a dit : "Non !".', `Il a dit${NBSP}: «${NBSP}Non${FINE}!${NBSP}».`],
  ['« avec espaces ordinaires »', `«${NBSP}avec espaces ordinaires${NBSP}»`],
  ['"un" et "deux"', `«${NBSP}un${NBSP}» et «${NBSP}deux${NBSP}»`],
  // points de suspension
  ['Alors...', 'Alors…'],
  ['Et puis... rien', 'Et puis… rien'],
  // signes doubles
  ['Vraiment ?', `Vraiment${FINE}?`],
  ['Non ! Oui ; peut-être', `Non${FINE}! Oui${FINE}; peut-être`],
  ['Voici : la suite', `Voici${NBSP}: la suite`],
  ['Quoi ?!', `Quoi${FINE}?!`],
  // à laisser tel quel
  ['Vraiment?', 'Vraiment?'],
  ['mot;', 'mot;'],
  ['Il est 12:30', 'Il est 12:30'],
  ['Voir https://exemple.fr/a?b=1&c="x" pour la suite', 'Voir https://exemple.fr/a?b=1&c="x" pour la suite'],
  ["Écrire à nom.prenom@exemple.fr l'après-midi", 'Écrire à nom.prenom@exemple.fr l’après-midi'],
  ['x != y', 'x != y'],
  ['une page ?param', 'une page ?param'],
  ['sourire :)', 'sourire :)'],
  ['clin d’œil ;)', 'clin d’œil ;)'],
  ['(Vraiment ?)', `(Vraiment${FINE}?)`],
  [`déjà${NBSP}?`, `déjà${NBSP}?`],
  [`déjà${FINE}?`, `déjà${FINE}?`],
  ['', ''],
  ['Rien à corriger ici.', 'Rien à corriger ici.'],
]

for (const [entree, attendu] of CAS) {
  test(`règle : ${JSON.stringify(entree)}`, () => {
    assert.equal(typographier(entree), attendu)
  })
}

test('idempotence : typographier deux fois, c’est typographier une fois', () => {
  const corpus = [
    ...CAS.map(([e]) => e),
    ...CAS.map(([, a]) => a),
    'Il a dit "oui" ; puis : "peut-être..." !',
    "L'aménagement du territoire : un outil ? Non ! Une méthode...",
    '"""trois"""',
    '«"mêlé"»',
    ' ; seul',
    '? en tête',
  ]
  for (const t of corpus) {
    const une = typographier(t)
    assert.equal(typographier(une), une, `non idempotent pour ${JSON.stringify(t)}`)
  }
})

test('seuls les espaces et les signes visés changent : lettres et chiffres intacts', () => {
  const corpus = [
    "L'Atelier parisien d'urbanisme (APUR) a publié, le 12/03/2024, un rapport de 120 pages...",
    'Que dit la loi ? "Zéro artificialisation nette" ; mais pas "partout" !',
    'Le ratio est de 3 : 1 ; voir https://www.legifrance.gouv.fr/loda/id/JORFTEXT000043956924 et écrire à a.b@c.fr.',
  ]
  const nu = (s) => s.replace(/[\s  '’"«».…]/g, '')
  for (const t of corpus) assert.equal(nu(typographier(t)), nu(t))
})

test('un contexte avant le texte décide si un guillemet ouvre ou ferme', () => {
  assert.equal(typographier('"', { avant: 'mot' }), `${NBSP}»`)
  assert.equal(typographier('"', { avant: ' ' }), `«${NBSP}`)
  assert.equal(typographier('"', { avant: '' }), `«${NBSP}`)
})

test('corrigerSaisie : ce que la frappe d’un caractère change', () => {
  assert.deepEqual(corrigerSaisie('l', "'"), { retirer: 0, ecrire: '’', brut: "l'" })
  assert.deepEqual(corrigerSaisie('..', '.'), { retirer: 2, ecrire: '…', brut: '...' })
  assert.deepEqual(corrigerSaisie('t ', ';', 'o'), { retirer: 1, ecrire: `${FINE};`, brut: 't ;' })
  assert.deepEqual(corrigerSaisie('t ', ':', 'o'), { retirer: 1, ecrire: `${NBSP}:`, brut: 't :' })
  assert.equal(corrigerSaisie('mo', '?'), null, 'pas d’espace ajoutée devant le signe')
  assert.equal(corrigerSaisie('ab', 'c'), null, 'une lettre n’est jamais touchée')
  assert.equal(corrigerSaisie('a.', '.'), null, 'deux points ne sont pas une ellipse')
})

// =============================================================================
// 2. La frappe dans l'éditeur
// =============================================================================

const ALICE = { name: 'Alice', color: '#3d5a80' }

function banc({ suivi = false, texte = '' } = {}) {
  const doc = schema.node('doc', null, [schema.node('paragraph', null, texte ? [schema.text(texte)] : [])])
  const state = EditorState.create({
    doc,
    schema,
    plugins: [typographiePlugin({ suiviActif: isTrackChangesEnabled }), trackChangesPlugin({ enabled: suivi })],
  })
  const view = new EditorView(document.createElement('div'), { state })
  view.setProps({ dispatchTransaction: makeDispatchTransaction(view, () => ALICE) })
  const b = {
    view,
    /** Comme le navigateur : handleTextInput d'abord, l'insertion normale sinon. */
    taper(chaine) {
      for (const c of chaine) {
        const { from, to } = view.state.selection
        const pris = view.someProp('handleTextInput', (f) => f(view, from, to, c))
        if (!pris) view.dispatch(view.state.tr.insertText(c, from, to))
      }
      return b
    },
    retourArriere() {
      const evenement = { key: 'Backspace', metaKey: false, ctrlKey: false, altKey: false }
      const pris = view.someProp('handleKeyDown', (f) => f(view, evenement))
      if (!pris) {
        const { from } = view.state.selection
        view.dispatch(view.state.tr.delete(from - 1, from))
      }
      return b
    },
    /** Le texte tel qu'il se lit une fois les propositions acceptées. */
    texte() {
      let s = ''
      view.state.doc.descendants((n) => {
        if (n.isText && !n.marks.some((m) => m.type.name === 'deletion')) s += n.text
      })
      return s
    },
    barre() {
      let s = ''
      view.state.doc.descendants((n) => {
        if (n.isText && n.marks.some((m) => m.type.name === 'deletion')) s += n.text
      })
      return s
    },
  }
  view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)))
  return b
}

for (const suivi of [false, true]) {
  const m = suivi ? ' (suivi activé)' : ''

  test(`frappe${m} : l’apostrophe droite devient courbe`, () => {
    const e = banc({ suivi }).taper("l'été d'hier")
    assert.equal(e.texte(), 'l’été d’hier')
    assert.equal(e.barre(), '', 'rien de barré')
  })

  test(`frappe${m} : les guillemets s’ouvrent puis se ferment, avec insécables`, () => {
    const e = banc({ suivi }).taper('il dit "oui" ici')
    assert.equal(e.texte(), `il dit «${NBSP}oui${NBSP}» ici`)
    assert.equal(e.barre(), '')
  })

  test(`frappe${m} : trois points deviennent un seul caractère`, () => {
    const e = banc({ suivi }).taper('Alors...')
    assert.equal(e.texte(), 'Alors…')
    assert.equal(e.barre(), '', 'les deux points tapés d’abord ne restent pas barrés')
  })

  test(`frappe${m} : l’espace avant ; : ! ? devient insécable`, () => {
    const e = banc({ suivi }).taper('Quoi ? Oui ! Voici : peut-être ; non')
    assert.equal(e.texte(), `Quoi${FINE}? Oui${FINE}! Voici${NBSP}: peut-être${FINE}; non`)
    assert.equal(e.barre(), '', 'l’espace remplacée ne reste pas barrée')
  })

  test(`frappe${m} : un signe collé au mot n’ajoute rien, une lettre n’est jamais touchée`, () => {
    const e = banc({ suivi }).taper('mot? mot; abc')
    assert.equal(e.texte(), 'mot? mot; abc')
  })

  test(`frappe${m} : Retour arrière juste après rend ce qu’on avait tapé`, () => {
    const e = banc({ suivi }).taper("l'").retourArriere()
    assert.equal(e.texte(), "l'")
    const f = banc({ suivi }).taper('Quoi ?').retourArriere()
    assert.equal(f.texte(), 'Quoi ?', 'l’espace ordinaire et le signe, tels qu’ils ont été tapés')
  })

  test(`frappe${m} : le Retour arrière ordinaire reprend la main dès qu’autre chose a été tapé`, () => {
    const e = banc({ suivi }).taper("l'a").retourArriere()
    assert.equal(e.texte(), 'l’', 'efface la lettre, ne défait pas l’apostrophe')
  })
}

test('Retour arrière : la correction d’un guillemet est défaite en un geste', () => {
  const e = banc().taper('il dit "')
  assert.equal(e.texte(), `il dit «${NBSP}`)
  e.retourArriere()
  assert.equal(e.texte(), 'il dit "')
})

test('Retour arrière : une ellipse redevient trois points, puis rien ne bouge', () => {
  const e = banc().taper('Alors...')
  e.retourArriere()
  assert.equal(e.texte(), 'Alors...')
  e.retourArriere()
  assert.equal(e.texte(), 'Alors..', 'le geste suivant est un Retour arrière ordinaire')
})

test('la frappe par-dessus une sélection est corrigée aussi', () => {
  const e = banc({ texte: 'abc def' })
  e.view.dispatch(e.view.state.tr.setSelection(TextSelection.create(e.view.state.doc, 2, 4)))
  e.taper("'")
  assert.equal(e.texte(), 'a’ def')
})

test('le texte barré par le suivi n’est jamais remplacé', () => {
  // « Quoi », puis une espace qu'on va barrer, puis « ? » : l'espace barrée
  // n'est pas une espace à transformer.
  const e = banc({ suivi: true, texte: 'Quoi' })
  e.taper(' ')
  const fin = e.view.state.selection.from
  // On barre l'espace à la main (suppression suivie).
  e.view.dispatch(e.view.state.tr.delete(fin - 1, fin))
  e.view.dispatch(e.view.state.tr.setSelection(TextSelection.atEnd(e.view.state.doc)))
  e.taper('?')
  assert.ok(!e.texte().includes(FINE), 'aucune espace fine ne remplace l’espace barrée')
})

// =============================================================================
// 3. Le collage
// =============================================================================

test('collage : le texte collé est typographié, bloc par bloc', () => {
  const para = (t) => schema.node('paragraph', null, [schema.text(t)])
  const fragment = schema.node('doc', null, [para('Il dit "oui"...'), para("l'été ?")]).content
  const corrige = typographierFragment(fragment)
  assert.equal(corrige.child(0).textContent, `Il dit «${NBSP}oui${NBSP}»…`)
  assert.equal(corrige.child(1).textContent, `l’été${FINE}?`)
})

test('collage : le texte d’un lien n’est pas touché', () => {
  const lien = schema.marks.link.create({ href: 'https://exemple.fr/a?b=1' })
  const fragment = schema.node('paragraph', null, [
    schema.text("l'été "),
    schema.text("https://exemple.fr/it's", [lien]),
  ]).content
  const corrige = typographierFragment(fragment)
  assert.equal(corrige.child(0).text, 'l’été ')
  assert.equal(corrige.child(1).text, "https://exemple.fr/it's")
})

test('collage : un guillemet au début d’un nœud suit le caractère qui le précède', () => {
  const gras = schema.marks.strong.create()
  const fragment = schema.node('paragraph', null, [schema.text('un mot', [gras]), schema.text('"', [])]).content
  const corrige = typographierFragment(fragment)
  assert.equal(corrige.child(1).text, `${NBSP}»`, 'il ferme : il suit « mot »')
})

test('sous suivi, une espace qui était déjà là n’est pas remplacée (elle resterait barrée)', () => {
  const e = banc({ suivi: true, texte: 'Quoi ' })
  e.taper('?')
  assert.equal(e.texte(), 'Quoi ?', 'frappe ordinaire, rien de barré')
  assert.equal(e.barre(), '')
})

test('hors suivi, la même espace est remplacée', () => {
  const e = banc({ suivi: false, texte: 'Quoi ' })
  e.taper('?')
  assert.equal(e.texte(), `Quoi${FINE}?`)
})
