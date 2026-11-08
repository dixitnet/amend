// T4 : les composants de présentation, rendus sans navigateur (React côté
// serveur, chargé par Vite pour le JSX et les feuilles de style), en
// français, en anglais et en pseudo-langue.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { creerTraducteur, CATALOGUES, LANGUE_SOURCE, cles } from '../../i18n/index.js'

const V2 = new URL('../..', import.meta.url).pathname
let vite, design
before(async () => {
  vite = await createServer({
    root: V2,
    configFile: false,
    logLevel: 'error',
    server: { middlewareMode: true },
    appType: 'custom',
  })
  design = await vite.ssrLoadModule(`${V2}design/index.js`)
})
after(() => vite?.close())

const LANGUES = ['fr', 'en', 'pseudo']
const echapper = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

test('chaque message de chaque langue se formate (pseudo-langue comprise)', () => {
  const exemple = { id: 'essai', n: 2, etat: 'connecte', code: 'test' }
  for (const l of LANGUES) {
    const t = creerTraducteur(l)
    for (const cle of cles(CATALOGUES[LANGUE_SOURCE])) assert.ok(t(cle, exemple).length > 0, `${l}:${cle}`)
  }
})

test('la pseudo-langue allonge d’au moins 30 % et encadre chaque texte', () => {
  const fr = creerTraducteur('fr')
  const ps = creerTraducteur('pseudo')
  for (const cle of cles(CATALOGUES[LANGUE_SOURCE]).filter((c) => !c.includes('participants') && !c.includes('etat'))) {
    const p = ps(cle, { id: 'x', code: 'y' })
    assert.match(p, /^⟦[\s\S]*⟧$/, cle)
    assert.ok(p.length >= fr(cle, { id: 'x', code: 'y' }).length * 1.3, cle)
  }
})

test('page d’édition : tous ses textes s’affichent, dans chaque langue, avec les bons rôles', () => {
  for (const l of LANGUES) {
    const t = creerTraducteur(l)
    const textes = {
      titre: t('document.titre', { id: 'essai' }),
      etat: t('document.etat', { etat: 'connecte' }),
      participants: t('document.participants', { n: 2 }),
    }
    const html = renderToStaticMarkup(h(design.PageEdition, { ...textes, editeur: h('div', { id: 'editeur' }) }))
    for (const [nom, texte] of Object.entries(textes)) assert.ok(html.includes(echapper(texte)), `${l} : ${nom}`)
    assert.match(html, /role="document"/)
    assert.match(html, /role="status"/)
    assert.match(html, /id="editeur"/, 'l’éditeur reçu en emplacement est rendu')
  }
})

test('écran de connexion : champ étiqueté, bouton, textes de chaque langue', () => {
  for (const l of LANGUES) {
    const t = creerTraducteur(l)
    const html = renderToStaticMarkup(
      h(design.EcranConnexion, {
        titre: t('connexion.titre'),
        explication: t('connexion.explication'),
        libelleNom: t('connexion.nom'),
        libelleBouton: t('connexion.bouton'),
        surEntrer: () => {},
      }),
    )
    for (const cle of ['connexion.titre', 'connexion.explication', 'connexion.nom', 'connexion.bouton'])
      assert.ok(html.includes(echapper(t(cle))), `${l} : ${cle}`)
    assert.match(html, /<label[^>]*>[\s\S]*<input[^>]*name="nom"/, 'le champ est dans son étiquette')
    assert.match(html, /<button[^>]*type="submit"/)
  }
})

test('un texte piégé s’affiche comme du texte, jamais comme du code', () => {
  const html = renderToStaticMarkup(
    h(design.PageEdition, { titre: '<script>alert(1)</script>', etat: '<b>x</b>', participants: '&', editeur: null }),
  )
  assert.doesNotMatch(html, /<script>|<b>/)
  assert.doesNotMatch(html, /page-edition__mention/, 'pas de mention sans texte')
  const avec = renderToStaticMarkup(h(design.PageEdition, { titre: 'x', mention: 'Lecture seule', editeur: null }))
  assert.match(avec, /class="page-edition__mention">Lecture seule</)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
})

test('couleur d’auteur : stable, et toujours un des 8 emplacements', () => {
  for (const id of ['alice', 'bruno', 'dev-xyz', '', '👩🏽\u200D💻']) {
    const c = design.couleurAuteur(id)
    assert.equal(c, design.couleurAuteur(id))
    assert.match(c, /^var\(--auteur-[1-8]\)$/)
  }
})
