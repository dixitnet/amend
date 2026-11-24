// Correctif temporaire d'un défaut de Yjs 14 (`adaptateurs/blocknote/correctif-forme.js`) :
// retirer une mise en forme en voyant les corrections. À retirer avec lui.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import { preparerCorrectifForme } from '../../adaptateurs/blocknote/correctif-forme.js'

const ORIGINE = { liaison: true }

/** Un texte et ses suggestions, liés comme dans l'éditeur (cache tenu par Yjs, écriture par deltas). */
function monter({ correctif = true } = {}) {
  const texte = new Y.Doc()
  const cote = new Y.Doc({ isSuggestionDoc: true })
  const brancher = correctif ? preparerCorrectifForme(texte) : () => {}
  const afficheur = Y.createDiffRenderer(texte, cote)
  brancher(afficheur)
  afficheur.suggestionMode = false
  const type = cote.get('doc')
  type.useRenderer(afficheur)
  void type.delta.fingerprint
  const ecrire = (d) => cote.transact(() => type.applyDelta(d.done(), ORIGINE, { renderer: afficheur }), ORIGINE)
  // L'ordre des clés d'une mise en forme ne compte pas.
  const trier = (v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((c) => [c, trier(v[c])]),
        )
      : Array.isArray(v)
        ? v.map(trier)
        : v
  const lire = (d) => JSON.stringify(trier(d.toJSON().children ?? []))
  return {
    afficheur,
    ecrire,
    /** Ce que l'éditeur affiche (le cache que Yjs tient à jour). */
    affiche: () => lire(type.delta),
    /** Ce qu'il devrait afficher (un rendu complet). */
    juste: () => lire(type.toDeltaDeep({ renderer: afficheur })),
    texte: () => lire(texte.get('doc').toDelta()),
  }
}
const PHRASE = 'Voir le site officiel'
const SEUL = (t) => JSON.stringify([{ insert: t, type: 'insert' }])
const sur = (debut, longueur, forme) => delta.create().retain(debut).retain(longueur, forme)

test('retirer un gras en voyant les corrections : rien ne disparaît, rien ne reste marqué', () => {
  const m = monter()
  m.ecrire(delta.create().insert(PHRASE))
  m.ecrire(sur(8, 4, { bold: true }))
  assert.equal(m.affiche(), m.juste())
  m.ecrire(sur(8, 4, { bold: null }))
  assert.equal(m.affiche(), m.juste())
  assert.equal(m.affiche(), SEUL(PHRASE))
  assert.equal(m.texte(), m.affiche())
})

test('retirer un lien, puis des mises en forme qui se chevauchent : l’affichage reste juste', () => {
  const m = monter()
  m.ecrire(delta.create().insert(PHRASE))
  m.ecrire(sur(8, 4, { link: { href: 'https://exemple.fr' } }))
  m.ecrire(sur(8, 4, { link: null }))
  assert.equal(m.affiche(), SEUL(PHRASE))
  m.ecrire(sur(8, 4, { bold: true }))
  m.ecrire(delta.create().retain(10).insert('XX'))
  m.ecrire(sur(5, 11, { italic: true }))
  assert.equal(m.affiche(), m.juste())
  m.ecrire(sur(5, 11, { italic: null, bold: null }))
  assert.equal(m.affiche(), m.juste())
  assert.equal(m.affiche(), SEUL('Voir le siXXte officiel'))
})

test('une correction en attente dans le passage reste une correction, le texte autour est juste', () => {
  const m = monter()
  m.ecrire(delta.create().insert(PHRASE))
  m.afficheur.suggestionMode = true
  m.ecrire(delta.create().retain(2).insert('AJOUT'))
  m.afficheur.suggestionMode = false
  m.ecrire(sur(0, 20, { bold: true }))
  m.ecrire(sur(0, 20, { bold: null }))
  const morceaux = JSON.parse(m.affiche())
  assert.equal(morceaux.map((o) => o.insert).join(''), 'VoAJOUTir le site officiel')
  // Limite connue : seule la correction garde une marque de mise en forme en plus de la sienne.
  for (const o of morceaux) assert.equal(Boolean(o.attribution), o.insert === 'AJOUT', o.insert)
  assert.equal(m.texte(), SEUL(PHRASE))
})

test('le défaut de l’amont existe encore (sinon : retirer le correctif)', () => {
  const m = monter({ correctif: false })
  m.ecrire(delta.create().insert(PHRASE))
  m.ecrire(sur(8, 4, { bold: true }))
  m.ecrire(sur(8, 4, { bold: null }))
  assert.notEqual(m.affiche(), m.juste(), 'Yjs redessine juste sans le correctif : le retirer (correctif-forme.js)')
})

test('l’écoute du correctif part avec l’afficheur', () => {
  const texte = new Y.Doc()
  const cote = new Y.Doc({ isSuggestionDoc: true })
  // Les écoutes posées sur le document du texte, comptées par ses méthodes publiques.
  let nombre = 0
  const { on, off } = texte
  texte.on = function (nom, f) {
    if (nom === 'beforeObserverCalls') nombre++
    return on.call(this, nom, f)
  }
  texte.off = function (nom, f) {
    if (nom === 'beforeObserverCalls') nombre--
    return off.call(this, nom, f)
  }
  const brancher = preparerCorrectifForme(texte)
  const afficheur = Y.createDiffRenderer(texte, cote)
  brancher(afficheur)
  assert.equal(nombre, 2)
  afficheur.destroy()
  assert.equal(nombre, 0)
})
