// La règle du correcteur (point 8, 13/10/2026 ; server/correcteur.js) : ce
// qu'elle laisse passer — tout ce que l'éditeur fait faire à un correcteur —
// et ce qu'elle refuse — tout ce qui toucherait au texte hors suivi, ou
// signerait du nom d'un autre. Les cas « légitimes » sont écrits comme
// y-prosemirror les écrit dans Yjs ; la preuve avec l'éditeur lui-même est
// dans client/test/correcteurEtanche.test.js.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { analyser, comparer, estSousSuite, cleDeNom } from '../correcteur.js'
import { NOM_TEXTE } from '../../shared/protocole.js'

const ELLE = 'Camille Correcteur'
const MARIE = 'Marie Éditrice'
const marque = (user, extra = {}) => ({ user, userColor: '#336699', ts: 1, groupe: null, ...extra })
const ins = (user) => ({ insertion: marque(user), authorColor: { user, userColor: '#336699' } })
const sup = (user) => ({ deletion: marque(user) })

/** Un document : chaque bloc est `[nomDuNoeud, attrs, ...passages]`, un passage `[texte, marques]`. */
function fabriquer(...blocs) {
  const doc = new Y.Doc()
  const racine = doc.getXmlFragment(NOM_TEXTE)
  blocs.forEach((b, i) => {
    const [nom, attrs, ...passages] = b
    const el = new Y.XmlElement(nom)
    racine.insert(i, [el])
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v)
    const xt = new Y.XmlText()
    el.insert(0, [xt])
    let pos = 0
    for (const [t, m] of passages) {
      xt.insert(pos, t, m || {})
      pos += t.length
    }
  })
  return doc
}
const P = (...passages) => ['paragraph', {}, ...passages]
const racine = (doc) => doc.getXmlFragment(NOM_TEXTE)
const texteDe = (doc, i) => racine(doc).get(i).get(0)
const analyse = (doc) => analyser(racine(doc))
/** Joue `geste` sur le document, et rend le verdict de la règle pour `ELLE`. */
function verdict(doc, geste, noms = [ELLE]) {
  const avant = analyse(doc)
  geste(doc)
  return comparer(avant, analyse(doc), noms)
}
const refuse = (v, motif) => {
  assert.equal(v.ok, false, 'devrait être refusé')
  if (motif) assert.match(v.raison + ' ' + v.detail, motif)
}

// --- Ce que le correcteur a le droit de faire -----------------------------------

test('taper : une insertion à son nom, avec sa couleur d’auteur', () => {
  const doc = fabriquer(P(['Bonjour le monde']))
  const v = verdict(doc, () => texteDe(doc, 0).insert(7, ' tout', ins(ELLE)))
  assert.deepEqual(v, { ok: true })
})

test('supprimer : une marque de suppression, le texte reste', () => {
  const doc = fabriquer(P(['Bonjour le monde']))
  assert.equal(verdict(doc, () => texteDe(doc, 0).format(8, 2, sup(ELLE))).ok, true)
})

test('remplacer : suppression et insertion, groupées', () => {
  const doc = fabriquer(P(['Bonjour le monde']))
  const groupe = 'g1'
  const v = verdict(doc, () => {
    const xt = texteDe(doc, 0)
    xt.format(11, 5, { deletion: marque(ELLE, { groupe }) })
    xt.insert(16, 'univers', { insertion: marque(ELLE, { groupe }), authorColor: { user: ELLE, userColor: '#336699' } })
  })
  assert.equal(v.ok, true)
})

test('Entrée au milieu d’un mot : le saut en attente referme la base', () => {
  const doc = fabriquer(P(['Bonjourlemonde']))
  const v = verdict(doc, () => {
    // Comme y-prosemirror : la fin du texte passe dans un nouveau paragraphe.
    const xt = texteDe(doc, 0)
    xt.delete(7, 7)
    const p2 = new Y.XmlElement('paragraph')
    racine(doc).insert(1, [p2])
    p2.setAttribute('trackedBreak', marque(ELLE))
    const xt2 = new Y.XmlText()
    p2.insert(0, [xt2])
    xt2.insert(0, 'lemonde')
  })
  assert.equal(v.ok, true)
})

test('taper sur une ligne blanche, puis effacer ce qu’on a tapé', () => {
  const doc = fabriquer(P(['Un']), P(), P(['Deux']))
  assert.equal(verdict(doc, () => texteDe(doc, 1).insert(0, 'nouveau', ins(ELLE))).ok, true)
  assert.equal(verdict(doc, () => texteDe(doc, 1).delete(0, 7)).ok, true, 'effacer sa propre insertion, pour de vrai')
})

test('effacer pour de vrai l’insertion en attente de quelqu’un d’autre', () => {
  const doc = fabriquer(P(['Texte ', {}], ['ajout de Marie', ins(MARIE)], [' fin', {}]))
  assert.equal(verdict(doc, () => texteDe(doc, 0).delete(6, 14)).ok, true)
})

test('une note insérée en suivi par elle, un saut en attente à elle', () => {
  const doc = fabriquer(P(['Texte']))
  const v = verdict(doc, () => {
    const note = new Y.XmlElement('footnote')
    texteDe(doc, 0).parent.insert(1, [note])
    note.setAttribute('suivi', { type: 'insertion', user: ELLE, userColor: '#336699', ts: 2 })
  })
  assert.equal(v.ok, true)
})

test('rien ne change : une opération sans effet sur le texte passe', () => {
  const doc = fabriquer(P(['Texte']))
  assert.equal(verdict(doc, () => {}).ok, true)
})

test('le nom est comparé sans que l’Unicode ou les espaces trompent', () => {
  const doc = fabriquer(P(['Bonjour']))
  // Le serveur connaît « Zoé » (é d'un seul signe) ; le document porte « Zoé » décomposé, avec des espaces autour.
  const v = verdict(doc, () => texteDe(doc, 0).insert(7, '!', ins('  Zoe\u0301 ')), ['Zo\u00e9'])
  assert.equal(v.ok, true)
  assert.equal(cleDeNom('  Zoe\u0301 '), 'Zo\u00e9')
})

// --- Ce qu’elle n’a pas le droit de faire ---------------------------------------

test('écrire sans marque', () => {
  const doc = fabriquer(P(['Bonjour']))
  refuse(
    verdict(doc, () => texteDe(doc, 0).insert(7, ' clandestin')),
    /suivi de modifications/
  )
})

test('effacer du texte pour de vrai', () => {
  const doc = fabriquer(P(['Bonjour le monde']))
  refuse(verdict(doc, () => texteDe(doc, 0).delete(7, 9)))
})

test('changer un style sans suivi', () => {
  const doc = fabriquer(P(['Bonjour le monde']))
  refuse(verdict(doc, () => texteDe(doc, 0).format(0, 7, { strong: {} })))
})

test('changer la structure : niveau de titre, type de bloc, bloc supprimé', () => {
  const doc = fabriquer(['heading', { level: 2 }, ['Titre']], P(['Texte']), P(['Fin']))
  refuse(verdict(doc, () => racine(doc).get(0).setAttribute('level', 1)))
  refuse(verdict(doc, () => racine(doc).delete(1, 1)))
})

test('ajouter un paragraphe plein, sans marque, ni saut', () => {
  const doc = fabriquer(P(['Un']))
  refuse(
    verdict(doc, () => {
      const p = new Y.XmlElement('paragraph')
      racine(doc).insert(1, [p])
      const xt = new Y.XmlText()
      p.insert(0, [xt])
      xt.insert(0, 'glissé')
    })
  )
})

test('écrire sous le nom de quelqu’un d’autre', () => {
  const doc = fabriquer(P(['Bonjour']))
  refuse(
    verdict(doc, () => texteDe(doc, 0).insert(7, ' faux', ins(MARIE))),
    /ne signe que ses propres/
  )
})

test('écrire avec une marque d’insertion sans auteur', () => {
  const doc = fabriquer(P(['Bonjour']))
  refuse(
    verdict(doc, () => texteDe(doc, 0).insert(7, ' anonyme', { insertion: { ts: 1 } })),
    /ne signe que/
  )
})

test('prêter son texte à quelqu’un : authorColor, suppression, note, saut au nom d’un autre', () => {
  const doc = fabriquer(P(['Bonjour le monde']))
  refuse(verdict(doc, () => texteDe(doc, 0).format(0, 3, { authorColor: { user: MARIE, userColor: '#336699' } })))
  refuse(verdict(doc, () => texteDe(doc, 0).format(4, 2, sup(MARIE))))
  refuse(
    verdict(doc, () => {
      const note = new Y.XmlElement('footnote')
      racine(doc).get(0).insert(1, [note])
      note.setAttribute('suivi', { type: 'insertion', user: MARIE, ts: 1 })
    })
  )
})

test('faire passer du texte de la base pour l’insertion d’un autre (il disparaîtrait de la base)', () => {
  const doc = fabriquer(P(['Texte à cacher']))
  refuse(verdict(doc, () => texteDe(doc, 0).format(0, 5, ins(MARIE))))
})

test('un nom qui n’est pas le sien n’est pas le sien : la liste des noms décide', () => {
  const doc = fabriquer(P(['Bonjour']))
  const avant = analyse(doc)
  texteDe(doc, 0).insert(7, '!', ins(MARIE))
  assert.equal(comparer(avant, analyse(doc), [ELLE]).ok, false)
  assert.equal(comparer(avant, analyse(doc), [ELLE, MARIE]).ok, true, 'Marie parle ici avec la voix de l’appelant')
})

test('le détail dit où : le numéro du bloc modifié', () => {
  const doc = fabriquer(P(['Un']), P(['Deux']), P(['Trois']))
  const v = verdict(doc, () => texteDe(doc, 1).insert(0, 'X'))
  refuse(v, /bloc 2/)
})

test('un saut en attente d’un autre ne s’efface pas des propositions de cet autre', () => {
  // Marie a un saut en attente ; la correctrice ne peut pas en poser un à son nom.
  const doc = fabriquer(P(['Un']))
  const v = verdict(doc, () => {
    const p2 = new Y.XmlElement('paragraph')
    racine(doc).insert(1, [p2])
    p2.setAttribute('trackedBreak', marque(MARIE))
  })
  refuse(v, /ne signe que/)
})

// --- Les rouages -------------------------------------------------------------------

test('estSousSuite', () => {
  assert.equal(estSousSuite('', ''), true)
  assert.equal(estSousSuite('ace', 'abcde'), true)
  assert.equal(estSousSuite('aec', 'abcde'), false)
  assert.equal(estSousSuite('abcdef', 'abcde'), false)
  assert.equal(estSousSuite('aa', 'aba'), true)
  assert.equal(estSousSuite('aaa', 'aba'), false)
})

test('l’analyse ne dépend ni de la façon dont Yjs découpe les passages ni de l’ordre des clés', () => {
  const a = fabriquer(P(['Bonjour le monde', { strong: {}, link: { href: 'https://x.test', a: 1 } }]))
  const b = fabriquer(
    P(
      ['Bonjour ', { link: { a: 1, href: 'https://x.test' }, strong: {} }],
      ['le monde', { strong: {}, link: { href: 'https://x.test', a: 1 } }]
    )
  )
  assert.equal(analyse(a).base, analyse(b).base)
})

test('une marque qui se superpose (suffixe --) compte pour sa famille', () => {
  const doc = fabriquer(P(['Bonjour']))
  const v = verdict(doc, () =>
    texteDe(doc, 0).insert(7, '!', {
      'insertion--abc': marque(ELLE),
      'authorColor--abc': { user: ELLE, userColor: '#336699' },
    })
  )
  assert.equal(v.ok, true)
})

test('une analyse de ~2 000 blocs reste rapide', () => {
  const blocs = Array.from({ length: 2000 }, (_, i) =>
    P([`Paragraphe numéro ${i}, avec un peu de texte pour que ce soit vraisemblable.`])
  )
  const doc = fabriquer(...blocs)
  const t0 = performance.now()
  analyse(doc)
  const ms = performance.now() - t0
  assert.ok(ms < 500, `${ms.toFixed(0)} ms`)
})
