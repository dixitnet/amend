// Les images collées (client/src/images.js) — 13/10/2026.
//
// Ce module n'avait aucun test direct : il n'était couvert que par le schéma
// et l'export Word. Ce qu'il fait est pourtant le plus fragile de l'éditeur
// (un collage, un dépôt réseau, une insertion qui doit retomber au bon
// endroit), alors on le joue ici avec de faux ingrédients du navigateur :
// `createImageBitmap`, un canevas qui ne dessine rien mais qui « pèse » ce
// qu'on lui dit, et un `fetch` qui joue le serveur.
//
// Ce que ce banc ne dit pas : que les vrais navigateurs ré-encodent bien.
// Il vérifie les décisions (réduire, choisir JPEG ou PNG, garder l'original)
// et le cheminement (repère, dépôt, insertion, échec), pas les pixels.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from '../src/schema.js'
import { trackChangesPlugin } from '../src/trackChanges.js'
import {
  imagesPlugin,
  LARGEUR_MAX,
  FICHIERS_MAX,
  messageFugace,
  imagesDuTransfert,
  deposerImages,
  ouvrirSelecteurImages,
} from '../src/images.js'

const ALICE = { name: 'Alice', color: '#3d5a80' }

// Les messages s'effacent après 2,5 ou 5 s : ils ne doivent pas retenir le
// processus de test.
const setTimeoutOrigine = globalThis.setTimeout
globalThis.setTimeout = (fn, ms, ...args) => {
  const t = setTimeoutOrigine(fn, ms, ...args)
  if (ms >= 400 && t && t.unref) t.unref()
  return t
}

function installerDom() {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="editeur"></div></body>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of [
    'HTMLElement',
    'Node',
    'Element',
    'getComputedStyle',
    'DocumentFragment',
    'Range',
    'MutationObserver',
    'Event',
  ]) {
    globalThis[k] = w[k]
  }
  globalThis.requestAnimationFrame = (fn) => setTimeoutOrigine(() => fn(Date.now()), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  w.Range.prototype.getClientRects = () => []
  w.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 })
  return dom
}

const para = (t) => schema.node('paragraph', null, t ? [schema.text(t)] : [])

/**
 * Un éditeur dans jsdom, avec le faux navigateur.
 *  - `bitmap` : { width, height } de l'image décodée ;
 *  - `poids` : { png, jpeg } octets rendus par le faux canevas (`null` : le
 *    canevas ne sait pas encoder ce format) ;
 *  - `serveur` : la réponse de `fetch` (`{ ok, status, json }`), ou une
 *    fonction asynchrone qui la rend.
 */
function monter({
  contenu = [para('Premier'), para('Second')],
  bitmap = { width: 800, height: 400 },
  poids = { png: 50_000, jpeg: 20_000 },
  serveur = { ok: true, json: { src: '/api/docs/abc/images/xyz.png' } },
  peutInserer = true,
  suivi = false,
  getUser = () => ALICE,
} = {}) {
  installerDom()
  const trace = { bitmaps: 0, canevas: [], envois: [], fermetures: 0 }

  globalThis.createImageBitmap = async () => {
    trace.bitmaps += 1
    if (bitmap instanceof Error) throw bitmap
    return { ...bitmap, close: () => (trace.fermetures += 1) }
  }
  const creer = document.createElement.bind(document)
  document.createElement = (nom) => {
    if (nom !== 'canvas') return creer(nom)
    const c = {
      width: 0,
      height: 0,
      dessins: [],
      getContext: () => ({ drawImage: (...a) => c.dessins.push(a) }),
      toBlob: (cb, type, qualite) => {
        c.encodages = (c.encodages || []).concat([[type, qualite]])
        const o = type === 'image/jpeg' ? poids.jpeg : poids.png
        cb(o == null ? null : new Blob([new Uint8Array(o)], { type }))
      },
    }
    trace.canevas.push(c)
    return c
  }
  globalThis.fetch = async (url, init) => {
    trace.envois.push({ url, init })
    const r = typeof serveur === 'function' ? await serveur() : serveur
    return {
      ok: r.ok,
      status: r.status || (r.ok ? 200 : 400),
      // `json: undefined` : un corps qui n'est pas du JSON (page d'erreur d'un proxy).
      json: async () => {
        if (r.json === undefined) throw new SyntaxError('Unexpected token <')
        return r.json
      },
    }
  }

  const state = EditorState.create({
    schema,
    doc: schema.node('doc', null, contenu),
    plugins: [trackChangesPlugin({ enabled: suivi }), imagesPlugin({ docId: 'abc', peutInserer, getUser })],
  })
  const view = new EditorView(document.getElementById('editeur'), { state })
  view.coordsAtPos = () => ({ left: 10, right: 10, top: 10, bottom: 20 })
  const plugin = view.state.plugins.find(
    (p) => p.props.handlePaste && p.spec.key && String(p.spec.key.key).includes('images')
  )

  const coller = (fichiers, texte = '') => {
    let empeche = 0
    const evt = {
      preventDefault: () => (empeche += 1),
      clipboardData: { getData: (t) => (t === 'text/plain' ? texte : ''), files: fichiers },
    }
    const pris = plugin.props.handlePaste(view, evt)
    return { pris, empeche }
  }
  const deposer = (fichiers, { x = 10, y = 10, avecFichiers = true } = {}) => {
    let empeche = 0
    const evt = {
      preventDefault: () => (empeche += 1),
      clientX: x,
      clientY: y,
      dataTransfer: { files: avecFichiers ? fichiers : [] },
    }
    const pris = plugin.props.handleDrop(view, evt)
    return { pris, empeche }
  }
  const curseurDans = (pos) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
  const images = () => {
    const out = []
    view.state.doc.forEach((n, off) => n.type.name === 'image' && out.push({ attrs: n.attrs, pos: off }))
    return out
  }
  const reperes = () => Array.from(document.querySelectorAll('.image-en-attente'))
  const messages = () => Array.from(document.querySelectorAll('.message-fugace'))
  const types = () => {
    const t = []
    view.state.doc.forEach((n) => t.push(n.type.name))
    return t
  }
  /** Attend que la condition soit vraie (le dépôt est asynchrone). */
  const attendre = async (cond, quoi = 'la condition') => {
    for (let i = 0; i < 200; i++) {
      if (cond()) return
      await new Promise((r) => setTimeoutOrigine(r, 5))
    }
    assert.fail(`jamais atteint : ${quoi}`)
  }
  return { view, trace, coller, deposer, curseurDans, images, reperes, messages, types, attendre }
}

const fichier = (octets = 30_000, type = 'image/png') => new File([new Uint8Array(octets)], 'capture', { type })

// ===================================================== ce qui est un collage d'image

test('un collage sans image, ou avec du texte, reste au chemin normal', () => {
  const e = monter()
  assert.equal(e.coller([]).pris, false, 'rien de collé')
  assert.equal(
    e.coller([new File(['x'], 'a.txt', { type: 'text/plain' })]).pris,
    false,
    'un fichier qui n’est pas une image'
  )
  const mixte = e.coller([fichier()], 'du texte copié avec l’image')
  assert.equal(mixte.pris, false, 'une image + du texte = un collage de texte')
  assert.equal(mixte.empeche, 0)
  assert.equal(e.trace.envois.length, 0)

  const evt = { preventDefault() {}, clipboardData: null }
  const plugin = e.view.state.plugins.find(
    (p) => p.props.handlePaste && p.spec.key && String(p.spec.key.key).includes('images')
  )
  assert.equal(plugin.props.handlePaste(e.view, evt), false, 'pas de presse-papiers')
})

test('sans le droit d’insérer : le collage est pris, refusé, et rien ne part', () => {
  const e = monter({ peutInserer: false })
  const { pris, empeche } = e.coller([fichier()])
  assert.equal(pris, true)
  assert.equal(empeche, 1)
  assert.equal(e.trace.envois.length, 0)
  assert.equal(e.trace.bitmaps, 0)
  assert.equal(e.images().length, 0)
  const [m] = e.messages()
  assert.ok(m.classList.contains('erreur'))
  assert.match(m.textContent, /Seul un éditeur/)
})

// ===================================================== réduction et choix du format

test('une grande image est ramenée à 2000 px de large, proportions gardées', async () => {
  const e = monter({ bitmap: { width: 3200, height: 1800 } })
  e.curseurDans(3)
  e.coller([fichier(900_000)])
  await e.attendre(() => e.images().length === 1, 'l’image insérée')
  const [c] = e.trace.canevas
  assert.equal(LARGEUR_MAX, 2000)
  assert.equal(c.width, 2000)
  assert.equal(c.height, 1125)
  assert.deepEqual(c.dessins[0].slice(1), [0, 0, 2000, 1125])
  const { attrs } = e.images()[0]
  assert.equal(attrs.largeur, 2000)
  assert.equal(attrs.hauteur, 1125)
  assert.equal(e.trace.fermetures, 1, 'le bitmap est libéré')
})

test('une image étroite n’est jamais agrandie', async () => {
  const e = monter({ bitmap: { width: 400, height: 300 } })
  e.coller([fichier(10_000)])
  await e.attendre(() => e.images().length === 1)
  assert.equal(e.trace.canevas[0].width, 400)
  assert.equal(e.trace.canevas[0].height, 300)
})

test('PNG léger : pas d’essai JPEG ; PNG lourd : le JPEG gagne s’il pèse moins', async () => {
  const leger = monter({ poids: { png: 100_000, jpeg: 10 } })
  leger.coller([fichier(50_000)])
  await leger.attendre(() => leger.images().length === 1)
  assert.deepEqual(
    leger.trace.canevas[0].encodages.map((x) => x[0]),
    ['image/png']
  )

  const photo = monter({ bitmap: { width: 3000, height: 2000 }, poids: { png: 2_000_000, jpeg: 300_000 } })
  photo.coller([fichier(3_000_000, 'image/png')])
  await photo.attendre(() => photo.trace.envois.length === 1)
  const envoi = photo.trace.envois[0]
  assert.equal(envoi.init.headers['content-type'], 'image/jpeg')
  assert.equal(envoi.init.body.size, 300_000)
  assert.deepEqual(photo.trace.canevas[0].encodages, [
    ['image/png', undefined],
    ['image/jpeg', 0.85],
  ])

  // Une capture d'écran aux aplats : le JPEG ressortirait plus lourd.
  const capture = monter({ bitmap: { width: 3000, height: 2000 }, poids: { png: 700_000, jpeg: 900_000 } })
  capture.coller([fichier(3_000_000, 'image/png')])
  await capture.attendre(() => capture.trace.envois.length === 1)
  assert.equal(capture.trace.envois[0].init.headers['content-type'], 'image/png')
  assert.equal(capture.trace.envois[0].init.body.size, 700_000)
})

test('un canevas qui ne sait pas faire de JPEG : on garde le PNG', async () => {
  const e = monter({ bitmap: { width: 3000, height: 2000 }, poids: { png: 800_000, jpeg: null } })
  e.coller([fichier(4_000_000)])
  await e.attendre(() => e.trace.envois.length === 1)
  assert.equal(e.trace.envois[0].init.headers['content-type'], 'image/png')
})

test('une petite image déjà PNG ou JPEG, pas réduite, plus légère que le ré-encodage : on envoie l’original', async () => {
  const e = monter({ bitmap: { width: 500, height: 500 }, poids: { png: 40_000, jpeg: 1 } })
  const original = fichier(12_000, 'image/png')
  e.coller([original])
  await e.attendre(() => e.trace.envois.length === 1)
  assert.equal(e.trace.envois[0].init.body, original)
  assert.equal(e.trace.envois[0].init.headers['content-type'], 'image/png')

  // Un format que nous ne servons pas (WebP, GIF) est toujours ré-encodé.
  const webp = monter({ bitmap: { width: 500, height: 500 }, poids: { png: 40_000, jpeg: 1 } })
  const w = fichier(12_000, 'image/webp')
  webp.coller([w])
  await webp.attendre(() => webp.trace.envois.length === 1)
  assert.notEqual(webp.trace.envois[0].init.body, w)
  assert.equal(webp.trace.envois[0].init.body.type, 'image/png')

  // Une image réduite n'est jamais renvoyée telle quelle, même plus légère.
  const reduite = monter({ bitmap: { width: 2400, height: 1200 }, poids: { png: 90_000, jpeg: 1 } })
  const grosse = fichier(10_000, 'image/png')
  reduite.coller([grosse])
  await reduite.attendre(() => reduite.trace.envois.length === 1)
  assert.notEqual(reduite.trace.envois[0].init.body, grosse)
})

// ===================================================== le cheminement : repère, dépôt, insertion

test('le repère « Dépôt de l’image… » tient la place pendant l’envoi, puis l’image arrive après le bloc du curseur', async () => {
  let rendre
  const attenteServeur = new Promise((r) => (rendre = r))
  const e = monter({
    serveur: async () => {
      await attenteServeur
      return { ok: true, json: { src: '/api/docs/abc/images/xyz.png' } }
    },
  })
  e.curseurDans(3) // au milieu de « Premier »
  e.coller([fichier()])
  assert.equal(e.reperes().length, 1, 'le repère est posé tout de suite')
  assert.equal(e.reperes()[0].textContent, "Dépôt de l'image…")
  assert.deepEqual(e.types(), ['paragraph', 'paragraph'], 'aucun nœud avant la fin du dépôt')

  await e.attendre(() => e.trace.envois.length === 1, 'l’envoi')
  assert.deepEqual(e.types(), ['paragraph', 'paragraph'], 'toujours rien dans le document pendant l’envoi')
  rendre()
  await e.attendre(() => e.images().length === 1, 'l’insertion')

  assert.equal(e.reperes().length, 0, 'le repère disparaît')
  assert.deepEqual(
    e.types(),
    ['paragraph', 'image', 'paragraph'],
    'après le bloc où était le curseur, pas au milieu d’une phrase'
  )
  const { attrs } = e.images()[0]
  assert.equal(attrs.src, '/api/docs/abc/images/xyz.png')
  assert.deepEqual([attrs.largeur, attrs.hauteur], [800, 400])
  assert.equal(attrs.suivi, null)
  assert.equal(e.trace.envois[0].url, '/api/docs/abc/images')
  assert.equal(e.trace.envois[0].init.method, 'POST')
})

test('si quelqu’un écrit plus haut pendant l’envoi, l’image tombe à la position mise à jour', async () => {
  let rendre
  const attenteServeur = new Promise((r) => (rendre = r))
  const e = monter({
    serveur: async () => {
      await attenteServeur
      return { ok: true, json: { src: '/api/docs/abc/images/xyz.png' } }
    },
  })
  e.curseurDans(10) // dans « Second »
  e.coller([fichier()])
  await e.attendre(() => e.trace.envois.length === 1)
  // Un autre auteur insère un paragraphe en tête pendant le dépôt.
  e.view.dispatch(e.view.state.tr.insert(0, para('Ajouté en tête')))
  rendre()
  await e.attendre(() => e.images().length === 1)
  assert.deepEqual(
    e.types(),
    ['paragraph', 'paragraph', 'paragraph', 'image'],
    'toujours après « Second », qui est maintenant le troisième'
  )
})

test('en suivi de modifications, l’image naît proposée, au nom de la personne', async () => {
  const e = monter({ suivi: true })
  e.coller([fichier()])
  await e.attendre(() => e.images().length === 1)
  const { suivi } = e.images()[0].attrs
  assert.equal(suivi.type, 'insertion')
  assert.equal(suivi.user, 'Alice')
  assert.equal(suivi.userColor, '#3d5a80')
  assert.ok(Number.isFinite(suivi.ts))
})

test('en suivi sans identité connue, pas de proposition (rien d’inventé)', async () => {
  const e = monter({ suivi: true, getUser: () => null })
  e.coller([fichier()])
  await e.attendre(() => e.images().length === 1)
  assert.equal(e.images()[0].attrs.suivi, null)
})

// ===================================================== les échecs ne laissent rien derrière eux

test('le serveur refuse : son message s’affiche, le repère part, le document est intact', async () => {
  const e = monter({ serveur: { ok: false, status: 413, json: { error: 'Image trop lourde (10 Mo au plus).' } } })
  e.coller([fichier()])
  await e.attendre(() => e.messages().length === 1, 'le message')
  assert.equal(e.reperes().length, 0)
  assert.deepEqual(e.types(), ['paragraph', 'paragraph'])
  const [m] = e.messages()
  assert.ok(m.classList.contains('erreur'))
  assert.equal(m.textContent, 'Image trop lourde (10 Mo au plus).')
})

test('le serveur refuse sans détail lisible : message par défaut', async () => {
  const e = monter({ serveur: { ok: false, status: 502, json: undefined } })
  // Corps non JSON (page d'erreur d'un proxy) : on retombe sur le défaut.
  e.coller([fichier()])
  await e.attendre(() => e.messages().length === 1)
  assert.equal(e.messages()[0].textContent, 'le dépôt a été refusé')
  assert.equal(e.reperes().length, 0)
})

test('le réseau tombe : message, pas de nœud', async () => {
  const e = monter()
  globalThis.fetch = async () => {
    throw new Error('Failed to fetch')
  }
  e.coller([fichier()])
  await e.attendre(() => e.messages().length === 1)
  assert.equal(e.messages()[0].textContent, 'Failed to fetch')
  assert.equal(e.images().length, 0)
  assert.equal(e.reperes().length, 0)
})

test('une image illisible (décodage impossible, canevas qui n’encode pas) : message, aucun envoi', async () => {
  const illisible = monter({ bitmap: new Error('image corrompue') })
  illisible.coller([fichier()])
  await illisible.attendre(() => illisible.messages().length === 1)
  assert.equal(illisible.messages()[0].textContent, 'image corrompue')
  assert.equal(illisible.trace.envois.length, 0)
  assert.equal(illisible.reperes().length, 0)

  const muet = monter({ poids: { png: null, jpeg: null } })
  muet.coller([fichier()])
  await muet.attendre(() => muet.messages().length === 1)
  assert.match(muet.messages()[0].textContent, /pas pu être lue/)
  assert.equal(muet.trace.envois.length, 0)
})

// ===================================================== le message fugace

test('le message fugace se pose dans la page, s’efface, et distingue l’erreur', async () => {
  installerDom()
  messageFugace('Fait.')
  messageFugace('Raté.', { erreur: true })
  const [a, b] = document.querySelectorAll('.message-fugace')
  assert.equal(a.textContent, 'Fait.')
  assert.equal(a.classList.contains('erreur'), false)
  assert.equal(b.classList.contains('erreur'), true)
})

// ===================================================== glisser-déposer et sélecteur (23/10/2026)

test('glisser-déposer : un fichier image se pose après le bloc sous la souris', async () => {
  const e = monter()
  // Le faux navigateur n'a pas de géométrie : on dit où tombe la souris.
  e.view.posAtCoords = () => ({ pos: 3, inside: 1 }) // dans « Premier »
  const { pris, empeche } = e.deposer([fichier()])
  assert.equal(pris, true)
  assert.equal(empeche, 1, 'le navigateur n’ouvre pas le fichier')
  await e.attendre(() => e.images().length === 1)
  assert.deepEqual(e.types(), ['paragraph', 'image', 'paragraph'])
  assert.equal(e.trace.envois[0].url, '/api/docs/abc/images')
})

test('glisser-déposer : un glisser interne (sans fichier) reste à ProseMirror', () => {
  const e = monter()
  const { pris, empeche } = e.deposer([], { avecFichiers: false })
  assert.equal(pris, false)
  assert.equal(empeche, 0)
  assert.equal(e.trace.envois.length, 0)
})

test('glisser-déposer : un fichier qui n’est pas une image est refusé sans quitter la page', () => {
  const e = monter()
  const { pris, empeche } = e.deposer([new File(['x'], 'a.pdf', { type: 'application/pdf' })])
  assert.equal(pris, true)
  assert.equal(empeche, 1, 'sinon le navigateur ouvrirait le PDF à la place de l’éditeur')
  assert.equal(e.trace.envois.length, 0)
  assert.match(e.messages()[0].textContent, /Seules les images/)
})

test('glisser-déposer : sans le droit d’insérer, rien ne part', () => {
  const e = monter({ peutInserer: false })
  const { pris } = e.deposer([fichier()])
  assert.equal(pris, true)
  assert.equal(e.trace.envois.length, 0)
  assert.match(e.messages()[0].textContent, /Seul un éditeur/)
})

test('plusieurs fichiers : déposés dans l’ordre donné, l’un derrière l’autre', async () => {
  let n = 0
  const e = monter({
    // Un nom différent par réponse, pour reconnaître l'ordre.
    serveur: async () => ({ ok: true, json: { src: `/api/docs/abc/images/img${++n}.png` } }),
  })
  e.view.posAtCoords = () => ({ pos: 3, inside: 1 })
  e.deposer([fichier(), fichier(), fichier()])
  await e.attendre(() => e.images().length === 3)
  assert.deepEqual(
    e.images().map((i) => i.attrs.src),
    ['/api/docs/abc/images/img1.png', '/api/docs/abc/images/img2.png', '/api/docs/abc/images/img3.png']
  )
  assert.deepEqual(e.types(), ['paragraph', 'image', 'image', 'image', 'paragraph'])
})

test('imagesDuTransfert : garde les images, dans l’ordre, au plus FICHIERS_MAX', () => {
  const mixtes = [fichier(), new File(['x'], 'a.txt', { type: 'text/plain' }), fichier(5, 'image/jpeg')]
  assert.deepEqual(
    imagesDuTransfert(mixtes).map((f) => f.type),
    ['image/png', 'image/jpeg']
  )
  const beaucoup = Array.from({ length: FICHIERS_MAX + 5 }, () => fichier())
  assert.equal(imagesDuTransfert(beaucoup).length, FICHIERS_MAX)
  assert.deepEqual(imagesDuTransfert(null), [])
})

test('le sélecteur de fichiers : « Image… » ouvre le sélecteur, puis dépose les images choisies', async () => {
  const e = monter()
  e.curseurDans(3)
  let ouvert = null
  const creer = document.createElement.bind(document)
  document.createElement = (nom) => {
    const el = creer(nom)
    if (nom === 'input') {
      ouvert = el
      el.click = () => {}
    }
    return el
  }
  let recu = null
  ouvrirSelecteurImages((fichiers) => (recu = fichiers))
  assert.equal(ouvert.type, 'file')
  assert.equal(ouvert.accept, 'image/*')
  assert.equal(ouvert.multiple, true)
  assert.ok(document.body.contains(ouvert), 'dans la page le temps du choix')
  Object.defineProperty(ouvert, 'files', { value: [fichier(), new File(['x'], 'a.txt', { type: 'text/plain' })] })
  ouvert.dispatchEvent(new window.Event('change'))
  assert.equal(recu.length, 1, 'seules les images sont rendues')
  assert.ok(!document.body.contains(ouvert), 'retiré aussitôt')
  await deposerImages(e.view, 'abc', recu, () => ALICE, e.view.state.selection.$from.pos)
  assert.equal(e.images().length, 1)
})

test('le sélecteur annulé ne laisse rien dans la page', () => {
  monter()
  let ouvert = null
  const creer = document.createElement.bind(document)
  document.createElement = (nom) => {
    const el = creer(nom)
    if (nom === 'input') {
      ouvert = el
      el.click = () => {}
    }
    return el
  }
  let appele = false
  ouvrirSelecteurImages(() => (appele = true))
  ouvert.dispatchEvent(new window.Event('cancel'))
  assert.equal(appele, false)
  assert.ok(!document.body.contains(ouvert))
})
