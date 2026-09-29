// Les liens (30/09/2026).
//
// Un lien dans un document partagé est une attaque en puissance sur les
// autres lecteurs, donc on teste d'abord ce qu'il ne faut PAS qui passe :
// `javascript:`, un identifiant dans l'adresse, une adresse venue de Yjs
// sans avoir été saisie chez nous. Ensuite seulement, que les gestes
// marchent — poser, modifier, retirer, coller — et que les quatre exports
// écrivent bien le lien.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import JSZip from 'jszip'
import * as Y from 'yjs'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { DOMParser as PMDOMParser, DOMSerializer } from 'prosemirror-model'
import { ySyncPlugin, prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import { schema } from '../src/schema.js'
import { trackChangesPlugin, makeDispatchTransaction } from '../src/trackChanges.js'
import { liensPlugin, commandeLien, lienAutour, lienDeLaSelection, poserLienSur, retirerLien, insererTexteLie } from '../src/liens.js'
import { docToMarkdown } from '../src/mdExport.js'
import { docToTypst } from '../src/typstExport.js'
import { buildDocxBlob } from '../src/docxExport.js'
import { docPourPublication } from '../src/publicationExport.js'
import { rendre } from '../../server/publication.js'
import { adresseAutorisee, adresseDepuisSaisie, estUneAdresseSeule, libelleCourt } from '../../shared/liens.js'
import { styleParDefaut } from '../../shared/style.js'

const ALICE = { name: 'Alice', color: '#3d5a80' }
const lien = (href) => schema.marks.link.create({ href })

/** Un paragraphe fait de morceaux : une chaîne, ou [texte, [marques]]. */
function para(...morceaux) {
  return schema.node(
    'paragraph',
    null,
    morceaux.map((m) => (typeof m === 'string' ? schema.text(m) : schema.text(m[0], m[1])))
  )
}
const document_ = (...paras) => schema.node('doc', null, paras)

// ===================================================== la liste blanche

test('seuls http, https et mailto passent — et pas d’identifiant dans l’adresse', () => {
  for (const mauvaise of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'jav\tascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://exemple.org/',
    '//pirate.example/',
    'https://www.amend.ink@pirate.example/',
    'https://utilisateur:motdepasse@exemple.org/',
    'https://',
    'mailto:',
    '',
    null,
    42,
  ]) {
    assert.equal(adresseAutorisee(mauvaise), null, `${JSON.stringify(mauvaise)} doit être refusée`)
  }
  assert.equal(adresseAutorisee('https://exemple.org/a?b=1#c'), 'https://exemple.org/a?b=1#c')
  assert.equal(adresseAutorisee('HTTP://Exemple.ORG'), 'http://exemple.org/')
  assert.equal(adresseAutorisee('mailto:moi@exemple.org'), 'mailto:moi@exemple.org')
  assert.equal(adresseAutorisee('https://x.org/a b"c'), 'https://x.org/a%20b%22c', 'espaces et guillemets encodés')
  assert.equal(adresseAutorisee('https://x.org/' + 'a'.repeat(3000)), null, 'trop long')
})

test('la saisie est tolérante sur la forme, jamais sur le fond', () => {
  assert.equal(adresseDepuisSaisie('exemple.org/page'), 'https://exemple.org/page')
  assert.equal(adresseDepuisSaisie('  www.exemple.org  '), 'https://www.exemple.org/')
  assert.equal(adresseDepuisSaisie('moi@exemple.org'), 'mailto:moi@exemple.org')
  assert.equal(adresseDepuisSaisie('localhost:8787/x'), 'https://localhost:8787/x')
  assert.equal(adresseDepuisSaisie('exemple.org:8080'), 'https://exemple.org:8080/')
  for (const non of ['javascript:alert(1)', 'data:text/plain,a', 'exemple', 'deux mots.org', 'ftp://x.y', 'https://a@b.c', '']) {
    assert.equal(adresseDepuisSaisie(non), null, `${JSON.stringify(non)}`)
  }
  assert.equal(estUneAdresseSeule('https://exemple.org/x'), true)
  assert.equal(estUneAdresseSeule('voir https://exemple.org/x'), false)
  assert.equal(estUneAdresseSeule('exemple.org'), false, 'sans protocole, un collage reste un texte')
  assert.equal(libelleCourt('https://www.exemple.org/a/b?x=1'), 'exemple.org/a/b')
})

test('le schéma : un href hostile venu du collage ou de Yjs ne fait jamais de lien', () => {
  // Au collage : `<a href="javascript:…">` perd sa marque, le texte reste.
  const dom = new JSDOM('<p>avant <a href="javascript:alert(1)">piège</a> <a href="https://exemple.org">bon</a></p>').window.document
  const analyse = PMDOMParser.fromSchema(schema).parse(dom.body)
  const morceaux = []
  analyse.descendants((n) => {
    if (n.isText) morceaux.push([n.text, n.marks.filter((m) => m.type.name === 'link').map((m) => m.attrs.href)])
  })
  // Le texte du piège reste (fondu au texte voisin, sans lien).
  assert.ok(morceaux.some((m) => m[0].includes('piège') && m[1].length === 0), 'javascript: écarté, texte conservé')
  assert.deepEqual(morceaux.find((m) => m[0] === 'bon')[1], ['https://exemple.org/'])

  // Depuis Yjs : un client malveillant peut écrire n'importe quel attribut.
  const hostile = schema.text('cliquez', [schema.marks.link.create({ href: 'javascript:alert(document.cookie)' })])
  const doc = new JSDOM('').window.document
  const out = DOMSerializer.fromSchema(schema).serializeNode(schema.node('paragraph', null, [hostile]), { document: doc })
  const html = doc.createElement('div')
  html.append(out)
  assert.equal(html.querySelector('a'), null, 'aucune ancre rendue')
  assert.equal(html.innerHTML.includes('javascript'), false, 'et l’adresse n’apparaît nulle part dans le DOM')
})

// ===================================================== les exports

test('Markdown : [texte](adresse), gras dedans, parenthèses encodées, adresse hostile ignorée', () => {
  const d = document_(
    para('voir ', ['la page', [lien('https://exemple.org/a_(b)')]], ' et ', ['gras', [lien('https://exemple.org/'), schema.marks.strong.create()]], ' ok'),
    para(['piège', [lien('javascript:alert(1)')]])
  )
  const md = docToMarkdown(d)
  assert.match(md, /\[la page\]\(https:\/\/exemple\.org\/a_%28b%29\)/)
  assert.match(md, /\[\*\*gras\*\*\]\(https:\/\/exemple\.org\/\)/)
  assert.ok(md.includes('piège'))
  assert.equal(md.includes('javascript'), false)
})

test('PDF (Typst) : #link("…")[…], guillemets échappés, adresse hostile ignorée', () => {
  const d = document_(
    para(['ici', [lien('https://exemple.org/x')]]),
    para(['mail', [lien('mailto:a"b@exemple.org')]]),
    para(['piège', [lien('javascript:alert(1)')]])
  )
  const src = docToTypst(d, styleParDefaut(), 'T')
  assert.ok(src.includes('#link("https://exemple.org/x")[ici]'))
  assert.match(src, /#link\("mailto:a\\"b@exemple\.org"\)\[mail\]/, 'le guillemet ne sort pas de la chaîne')
  assert.equal(src.includes('javascript'), false)
  assert.ok(src.includes('#show link: underline'))
})

test('Word : un vrai lien hypertexte, son adresse dans les relations du document', async () => {
  const d = document_(para('voir ', ['la page', [lien('https://exemple.org/x')]]), para(['piège', [lien('javascript:alert(1)')]]))
  const blob = await buildDocxBlob(d, styleParDefaut(), 'T')
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const xml = await zip.file('word/document.xml').async('string')
  const rels = await zip.file('word/_rels/document.xml.rels').async('string')
  assert.match(xml, /<w:hyperlink /)
  assert.match(rels, /Target="https:\/\/exemple\.org\/x"[^>]*TargetMode="External"|TargetMode="External"[^>]*Target="https:\/\/exemple\.org\/x"/)
  assert.equal(rels.includes('javascript'), false)
  assert.equal(xml.split('<w:hyperlink ').length - 1, 1, 'un seul lien : le piège n’en est pas un')
})

test('page publiée : le client envoie l’adresse, le serveur la revérifie de son côté', () => {
  const d = document_(para('voir ', ['la page', [lien('https://exemple.org/x?a=1&b=2')]]))
  const blocs = docPourPublication(d)
  const morceau = blocs[0].contenu.find((m) => m.texte === 'la page')
  assert.equal(morceau.lien, 'https://exemple.org/x?a=1&b=2')
  const html = rendre({ titre: 'T', blocs, publieLe: Date.now() })
  assert.ok(html.includes('<a href="https://exemple.org/x?a=1&amp;b=2" rel="noopener noreferrer nofollow">la page</a>'))

  // Un client qui triche : le serveur ne croit pas ce qu'on lui envoie.
  for (const lienHostile of ['javascript:alert(1)', 'data:text/html,x', 'https://a@b.c/', 42, { toString: () => 'https://x.org' }]) {
    const page = rendre({
      titre: 'T',
      blocs: [{ type: 'paragraphe', contenu: [{ type: 'texte', texte: 'piège', marques: [], lien: lienHostile }] }],
      publieLe: Date.now(),
    })
    assert.equal(page.includes('<a href'), false, `${JSON.stringify(lienHostile)} ne fait pas d’ancre`)
    assert.ok(page.includes('piège'))
  }
})

// ===================================================== l'éditeur

function installerDom() {
  const dom = new JSDOM('<!DOCTYPE html><body><div class="editor-container" style="position:relative"><div id="editeur"></div></div></body>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Node', 'Element', 'getComputedStyle', 'DocumentFragment', 'Range', 'MutationObserver', 'Event', 'KeyboardEvent', 'MouseEvent']) {
    globalThis[k] = w[k]
  }
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  // jsdom ne mesure rien : de quoi placer la fenêtre sans planter.
  w.Range.prototype.getClientRects = () => []
  w.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 })
  return dom
}

function monter({ contenu = document_(para('Bonjour tout le monde.')), peutPoser = true, suivi = false, editable = true } = {}) {
  installerDom()
  const ydoc = new Y.Doc()
  const frag = ydoc.getXmlFragment('prosemirror')
  prosemirrorToYXmlFragment(contenu, frag)
  const refus = []
  const ouvertures = []
  window.open = (...args) => ouvertures.push(args)
  const state = EditorState.create({
    schema,
    plugins: [
      ySyncPlugin(frag),
      trackChangesPlugin({ enabled: suivi }),
      liensPlugin({ peutPoser: () => peutPoser, surRefus: () => refus.push(true) }),
    ],
  })
  const view = new EditorView(document.getElementById('editeur'), { state, editable: () => editable })
  view.setProps({ dispatchTransaction: makeDispatchTransaction(view, () => ALICE) })
  view.coordsAtPos = () => ({ left: 10, right: 10, top: 10, bottom: 20 })
  const selectionner = (from, to = from) =>
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
  const liensDe = (d) => {
    const out = []
    d.descendants((n) => {
      if (n.isText) n.marks.forEach((m) => m.type.name === 'link' && out.push([n.text, m.attrs.href]))
    })
    return out
  }
  return {
    view,
    ydoc,
    refus,
    ouvertures,
    selectionner,
    liens: () => liensDe(view.state.doc),
    liensChezUnAutre: () => liensDe(yXmlFragmentToProseMirrorRootNode(frag, schema)),
    fenetre: () => document.querySelector('.lien-fenetre'),
    bulle: () => document.querySelector('.lien-bulle'),
    ecrire: (champ, valeur) => {
      champ.value = valeur
    },
    envoyer: () => document.querySelector('.lien-fenetre').dispatchEvent(new window.Event('submit', { cancelable: true, bubbles: true })),
  }
}

test('Ctrl+K sur une sélection : la fenêtre s’ouvre, l’adresse saisie devient un lien, Yjs le porte', () => {
  const e = monter()
  e.selectionner(1, 8) // « Bonjour »
  assert.ok(commandeLien({ peutPoser: () => true, surRefus() {} })(e.view.state, e.view.dispatch, e.view))
  assert.ok(e.fenetre(), 'fenêtre ouverte')
  assert.equal(e.fenetre().querySelectorAll('input').length, 1, 'sélection : seul le champ adresse')
  e.ecrire(e.fenetre().querySelector('input'), 'exemple.org/page')
  e.envoyer()
  assert.equal(e.fenetre(), null, 'fenêtre fermée')
  assert.deepEqual(e.liens(), [['Bonjour', 'https://exemple.org/page']])
  assert.deepEqual(e.liensChezUnAutre(), [['Bonjour', 'https://exemple.org/page']], 'un autre client voit le lien')
  assert.equal(e.view.state.doc.textContent, 'Bonjour tout le monde.', 'le texte n’a pas bougé')
})

test('une adresse refusée : message dans la fenêtre, aucun lien posé', () => {
  const e = monter()
  e.selectionner(1, 8)
  commandeLien({ peutPoser: () => true, surRefus() {} })(e.view.state, e.view.dispatch, e.view)
  e.ecrire(e.fenetre().querySelector('input'), 'javascript:alert(1)')
  e.envoyer()
  assert.ok(e.fenetre(), 'la fenêtre reste ouverte')
  assert.equal(e.fenetre().querySelector('.lien-fenetre-erreur').hidden, false)
  assert.deepEqual(e.liens(), [])
})

test('sans sélection : un texte et une adresse, le texte est inséré puis lié — et proposé si le suivi est actif', () => {
  const e = monter({ suivi: true })
  e.selectionner(1)
  commandeLien({ peutPoser: () => true, surRefus() {} })(e.view.state, e.view.dispatch, e.view)
  const [texte, adresse] = e.fenetre().querySelectorAll('input')
  e.ecrire(texte, 'notre site')
  e.ecrire(adresse, 'exemple.org')
  e.envoyer()
  assert.deepEqual(e.liens(), [['notre site', 'https://exemple.org/']])
  // Sous suivi, l'insertion du texte est une proposition attribuée.
  let ins = false
  e.view.state.doc.descendants((n) => {
    if (n.isText && n.text === 'notre site' && n.marks.some((m) => m.type.name === 'insertion' && m.attrs.user === 'Alice')) ins = true
  })
  assert.ok(ins, 'le texte du lien est proposé par Alice')
  // Le curseur est sorti du lien : la suite se tape hors lien.
  assert.equal(e.view.state.selection.from, 1 + 'notre site'.length)
})

test('sans texte, le lien s’affiche par son adresse courte', () => {
  const e = monter()
  e.selectionner(1)
  commandeLien({ peutPoser: () => true, surRefus() {} })(e.view.state, e.view.dispatch, e.view)
  e.ecrire(e.fenetre().querySelectorAll('input')[1], 'https://www.exemple.org/a/b')
  e.envoyer()
  assert.deepEqual(e.liens(), [['exemple.org/a/b', 'https://www.exemple.org/a/b']])
})

test('modifier puis retirer : le lien du curseur est celui de toute sa suite, gras compris', () => {
  const e = monter({
    contenu: document_(para('Voir ', ['la ', [lien('https://a.org/')]], ['page', [lien('https://a.org/'), schema.marks.strong.create()]], ' ici.')),
  })
  // Le curseur est au milieu de « la page » (deux nœuds, même lien).
  e.selectionner(8)
  const l = lienDeLaSelection(e.view.state)
  assert.deepEqual([l.from, l.to], [6, 13], 'toute la suite : « la page »')
  commandeLien({ peutPoser: () => true, surRefus() {} })(e.view.state, e.view.dispatch, e.view)
  const champ = e.fenetre().querySelector('input')
  assert.equal(champ.value, 'https://a.org/', 'l’adresse actuelle est préremplie')
  e.ecrire(champ, 'b.org')
  e.envoyer()
  assert.deepEqual(e.liens().map((x) => x[1]), ['https://b.org/', 'https://b.org/'])
  // Retirer.
  e.selectionner(8)
  commandeLien({ peutPoser: () => true, surRefus() {} })(e.view.state, e.view.dispatch, e.view)
  ;[...e.fenetre().querySelectorAll('button')].find((b) => /Retirer/.test(b.textContent)).click()
  assert.deepEqual(e.liens(), [])
  // Le gras, lui, est resté.
  let gras = false
  e.view.state.doc.descendants((n) => {
    if (n.isText && n.text === 'page' && n.marks.some((m) => m.type.name === 'strong')) gras = true
  })
  assert.ok(gras)
})

test('un correcteur ne pose pas de lien : la commande refuse et le dit, rien ne change', () => {
  const e = monter({ peutPoser: false })
  e.selectionner(1, 8)
  const pris = commandeLien({ peutPoser: () => false, surRefus: () => e.refus.push('x') })(e.view.state, e.view.dispatch, e.view)
  assert.ok(pris, 'la touche est consommée')
  assert.equal(e.refus.length, 1)
  assert.equal(e.fenetre(), null)
  assert.deepEqual(e.liens(), [])
})

test('coller une adresse sur une sélection en fait un lien ; sans sélection, elle est insérée et liée', () => {
  const e = monter()
  const coller = (texte) => {
    const evt = new window.Event('paste', { bubbles: true, cancelable: true })
    evt.clipboardData = { getData: (t) => (t === 'text/plain' ? texte : ''), types: ['text/plain'] }
    // On appelle la prop du greffon comme le fait ProseMirror.
    const plugin = e.view.state.plugins.find((p) => p.props.handlePaste && p.spec.key)
    return plugin.props.handlePaste(e.view, evt)
  }
  e.selectionner(1, 8)
  assert.equal(coller('https://exemple.org/coll'), true)
  assert.deepEqual(e.liens(), [['Bonjour', 'https://exemple.org/coll']])
  assert.equal(e.view.state.doc.textContent, 'Bonjour tout le monde.', 'le texte sélectionné n’a pas été remplacé')

  e.selectionner(e.view.state.doc.content.size - 1)
  assert.equal(coller('https://autre.org/'), true)
  assert.ok(e.liens().some((x) => x[0] === 'https://autre.org/'))

  // Du texte ordinaire, ou une adresse hostile, ou plusieurs mots : le collage normal reprend la main.
  assert.equal(coller('un simple texte'), false)
  assert.equal(coller('javascript:alert(1)'), false)
  assert.equal(coller('voir https://exemple.org'), false)
})

test('un correcteur qui colle une adresse : collage ordinaire, pas de lien', () => {
  const e = monter({ peutPoser: false })
  const evt = new window.Event('paste', { bubbles: true, cancelable: true })
  evt.clipboardData = { getData: () => 'https://exemple.org/', types: ['text/plain'] }
  e.selectionner(1, 8)
  const plugin = e.view.state.plugins.find((p) => p.props.handlePaste && p.spec.key)
  assert.equal(plugin.props.handlePaste(e.view, evt), false)
  assert.deepEqual(e.liens(), [])
})

test('Ctrl/⌘+clic ouvre le lien ; un clic simple place le curseur ; en lecture seule un clic suffit', () => {
  const contenu = document_(para('Voir ', ['la page', [lien('https://exemple.org/')]], '.'))
  const e = monter({ contenu })
  const plugin = e.view.state.plugins.find((p) => p.props.handleClick)
  assert.equal(plugin.props.handleClick(e.view, 8, { ctrlKey: false, metaKey: false }), false)
  assert.equal(e.ouvertures.length, 0)
  assert.equal(plugin.props.handleClick(e.view, 8, { ctrlKey: true, metaKey: false }), true)
  assert.deepEqual(e.ouvertures[0], ['https://exemple.org/', '_blank', 'noopener,noreferrer'])
  assert.equal(plugin.props.handleClick(e.view, 2, { ctrlKey: true }), false, 'hors lien : rien')

  const lecteur = monter({ contenu, editable: false })
  const p2 = lecteur.view.state.plugins.find((p) => p.props.handleClick)
  assert.equal(p2.props.handleClick(lecteur.view, 8, {}), true, 'lecteur : un clic ouvre')
  assert.equal(lecteur.ouvertures.length, 1)
})

test('un href hostile déjà dans le document (arrivé par Yjs) n’est jamais ouvert', () => {
  const e = monter({ contenu: document_(para(['piège', [lien('javascript:alert(1)')]])) })
  const plugin = e.view.state.plugins.find((p) => p.props.handleClick)
  plugin.props.handleClick(e.view, 3, { ctrlKey: true })
  assert.equal(e.ouvertures.length, 0)
})

test('lienAutour : la frontière, la suite contiguë, deux liens voisins restent distincts', () => {
  const d = document_(para(['un', [lien('https://a.org/')]], ['deux', [lien('https://b.org/')]], ' fin'))
  const type = schema.marks.link
  assert.deepEqual(lienAutour(d, 2, type, { strict: true }) && [lienAutour(d, 2, type).from, lienAutour(d, 2, type).to], [1, 3])
  // À la frontière stricte entre « un » et « deux » : ni l'un ni l'autre.
  assert.equal(lienAutour(d, 3, type, { strict: true }), null)
  assert.equal(lienAutour(d, 8, type), null, 'hors lien')
  assert.equal(lienAutour(d, 5, type).mark.attrs.href, 'https://b.org/')
})

test('poserLienSur / retirerLien / insererTexteLie : ne touchent pas au texte, ne posent aucune marque de suivi', () => {
  const e = monter({ suivi: true })
  poserLienSur(e.view, 1, 8, 'https://exemple.org/')
  assert.equal(e.view.state.doc.textContent, 'Bonjour tout le monde.')
  let suivi = false
  e.view.state.doc.descendants((n) => {
    if (n.isText && n.marks.some((m) => m.type.name === 'insertion' || m.type.name === 'deletion')) suivi = true
  })
  assert.equal(suivi, false, 'poser un lien n’est pas une proposition (comme le gras)')
  retirerLien(e.view, 1, 8)
  assert.deepEqual(e.liens(), [])
  assert.ok(insererTexteLie)
})
