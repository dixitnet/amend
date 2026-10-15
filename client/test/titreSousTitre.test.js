// Les styles « Titre » et « Sous-titre » (14/10/2026) : deux styles de
// paragraphe de la page de titre, après les trois niveaux de titre dans la
// liste déroulante et dans la feuille de style. Ce ne sont pas des titres de
// section : rien dans le plan ni dans la table des matières.

import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { JSDOM } from 'jsdom'
import { EditorState, TextSelection } from 'prosemirror-state'
import { DOMSerializer, DOMParser as PMDOMParser } from 'prosemirror-model'
import { schema } from '../src/schema.js'
import { styleDeBlocCommun, appliquerStyleDeBloc } from '../src/commandesBarre.js'
import { docToTypst } from '../src/typstExport.js'
import { docToMarkdown } from '../src/mdExport.js'
import { docPourPublication } from '../src/publicationExport.js'
import { buildDocxBlob } from '../src/docxExport.js'
import { buildStyleCss } from '../src/styleConfig.js'
import { BLOCS, STYLES_PARAGRAPHE, blocDuParagraphe, styleParDefaut, fusionner } from '../../shared/style.js'
import { doc } from './harness.js'

const { document: documentDom } = new JSDOM('<!DOCTYPE html><body></body>').window

const para = (texte, style = null) => schema.node('paragraph', { style }, [schema.text(texte)])
const docDe = (...blocs) => schema.node('doc', null, blocs)

function vue(d, debut) {
  let state = EditorState.create({ doc: d, schema })
  state = state.apply(state.tr.setSelection(TextSelection.create(d, debut)))
  const v = {
    get state() {
      return state
    },
    dispatch(tr) {
      state = state.apply(tr)
    },
    focus() {},
  }
  return v
}

// ===================================================== la feuille de style

test('la feuille de style : « Titre » et « Sous-titre » viennent après Titre 1 à 3', () => {
  assert.deepEqual(
    BLOCS.map((b) => b.id),
    ['body', 'quote', 'h1', 'h2', 'h3', 'title', 'subtitle']
  )
  const titre = BLOCS.find((b) => b.id === 'title')
  const sous = BLOCS.find((b) => b.id === 'subtitle')
  assert.equal(titre.label, 'Titre')
  assert.equal(sous.label, 'Sous-titre')
  assert.ok(titre.defauts.size > sous.defauts.size, 'le titre est plus grand')
  assert.equal(titre.docxHeading, null, 'pas un titre de section')
  assert.equal(sous.docxHeading, null)
  assert.deepEqual(
    STYLES_PARAGRAPHE.map((s) => s.valeur),
    ['titre', 'sous-titre']
  )
})

test('un style de paragraphe inconnu retombe en texte courant', () => {
  assert.equal(blocDuParagraphe('titre'), 'title')
  assert.equal(blocDuParagraphe('sous-titre'), 'subtitle')
  assert.equal(blocDuParagraphe(null), 'body')
  assert.equal(blocDuParagraphe('inconnu'), 'body')
})

test('un document dont la feuille de style date d’avant reçoit les valeurs par défaut des deux nouveaux blocs', () => {
  const ancienne = { version: 2, blocs: { body: { size: 12 } } }
  const complet = fusionner(ancienne)
  assert.equal(complet.blocs.body.size, 12)
  assert.equal(complet.blocs.title.size, styleParDefaut().blocs.title.size)
  assert.ok(complet.blocs.subtitle)
})

test('le CSS de la feuille de style cible chaque style par sa classe', () => {
  const css = buildStyleCss(styleParDefaut(), { scope: '.print-doc' })
  assert.match(css, /\.print-doc p \{/, 'le texte courant garde son sélecteur')
  assert.match(css, /\.print-doc p\.style-titre \{[^}]*font-size: 30pt/)
  assert.match(css, /\.print-doc p\.style-sous-titre \{[^}]*font-size: 16pt/)
})

// ===================================================== le nœud

test('le paragraphe porte son style dans le DOM, et le relit', () => {
  const serial = DOMSerializer.fromSchema(schema)
  const rendu = serial.serializeNode(para('Le livre', 'titre'), { document: documentDom })
  assert.equal(rendu.tagName, 'P')
  assert.equal(rendu.className, 'style-titre')
  assert.equal(rendu.getAttribute('data-style'), 'titre')
  const ordinaire = serial.serializeNode(para('Texte'), { document: documentDom })
  assert.equal(ordinaire.className, '')
  assert.equal(ordinaire.getAttribute('data-style'), null)
  // Aller-retour.
  const conteneur = documentDom.createElement('div')
  conteneur.appendChild(rendu)
  const relu = PMDOMParser.fromSchema(schema).parse(conteneur)
  assert.equal(relu.child(0).attrs.style, 'titre')
  // Une valeur inconnue (version plus récente) devient du texte courant.
  const etrange = documentDom.createElement('div')
  etrange.innerHTML = '<p data-style="logo">X</p>'
  assert.equal(PMDOMParser.fromSchema(schema).parse(etrange).child(0).attrs.style, null)
})

// ===================================================== la liste déroulante

test('le menu de style reconnaît « Titre » et « Sous-titre », et les applique', () => {
  const d = docDe(para('Un'), para('Deux', 'titre'), para('Trois', 'sous-titre'))
  // positions : « Un » 1-3, « Deux » 4-9, « Trois » 10-17
  assert.equal(styleDeBlocCommun(vue(d, 2).state), '')
  assert.equal(styleDeBlocCommun(vue(d, 6).state), 'titre')
  assert.equal(styleDeBlocCommun(vue(d, 12).state), 'sous-titre')

  const v = vue(docDe(para('Texte')), 2)
  assert.equal(appliquerStyleDeBloc(v, 'titre'), true)
  assert.equal(v.state.doc.child(0).type.name, 'paragraph', 'un paragraphe, pas un titre de section')
  assert.equal(v.state.doc.child(0).attrs.style, 'titre')
  assert.equal(appliquerStyleDeBloc(v, 'sous-titre'), true)
  assert.equal(v.state.doc.child(0).attrs.style, 'sous-titre')
  assert.equal(appliquerStyleDeBloc(v, '2'), true)
  assert.equal(v.state.doc.child(0).type.name, 'heading')
  assert.equal(appliquerStyleDeBloc(v, ''), true)
  assert.equal(v.state.doc.child(0).attrs.style, null)
})

test('un paragraphe « Titre » peut porter une note (ce n’est pas un titre de section)', () => {
  const note = schema.nodes.footnote.create({ suivi: null })
  const v = vue(docDe(schema.node('paragraph', null, [schema.text('avant'), note, schema.text('après')])), 2)
  assert.equal(appliquerStyleDeBloc(v, 'titre'), true)
  assert.equal(v.state.doc.child(0).attrs.style, 'titre')
})

// ===================================================== les sorties

const page = docDe(
  para('La force des transitions', 'titre'),
  para('Se saisir du pouvoir d’agir', 'sous-titre'),
  para('Texte.')
)

test('Typst : chaque style a sa fonction, et le texte courant garde la sienne', () => {
  const src = docToTypst(page, styleParDefaut(), 'D')
  assert.match(src, /#let amend-title\(corps\) = \{/)
  assert.match(src, /#let amend-subtitle\(corps\) = \{/)
  assert.ok(src.includes('#amend-title[La force des transitions]'))
  assert.ok(src.includes('#amend-subtitle[Se saisir du pouvoir d’agir]'))
  assert.ok(src.includes('#amend-corps[Texte.]'))
  assert.doesNotMatch(src, /heading\(level/, 'ni titre de section, donc rien dans la table des matières')
})

test('Typst : les réglages de la feuille de style atteignent le titre', () => {
  const src = docToTypst(page, fusionner({ blocs: { title: { size: 41, align: 'center' } } }), 'D')
  const i = src.indexOf('#let amend-title(corps)')
  assert.match(src.slice(i, src.indexOf('\n}', i)), /size: 41pt/)
})

test('Word : « Title » et « Subtitle », avec la mise en forme de la feuille de style', async () => {
  const blob = await buildDocxBlob(page, fusionner({ blocs: { title: { size: 40 } } }), 'D')
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const xml = await zip.file('word/document.xml').async('string')
  assert.match(xml, /<w:pStyle w:val="Title"\/>/)
  assert.match(xml, /<w:pStyle w:val="Subtitle"\/>/)
  assert.match(xml, /<w:sz w:val="80"\/>/, 'le titre est à 40 pt')
  const styles = await zip.file('word/styles.xml').async('string')
  assert.match(styles, /w:styleId="Subtitle"/, 'le style Sous-titre existe pour Word')
  assert.doesNotMatch(xml, /<w:pStyle w:val="Heading1"\/>/)
})

test('Markdown : le titre et le sous-titre restent du texte (Markdown n’a pas ces styles)', () => {
  assert.equal(
    docToMarkdown(page).trim(),
    ['La force des transitions', '', 'Se saisir du pouvoir d’agir', '', 'Texte.'].join('\n')
  )
})

test('page publiée : le style voyage ; ni plan, ni titre de section', () => {
  const blocs = docPourPublication(page)
  assert.deepEqual(blocs[0], { type: 'paragraphe', contenu: blocs[0].contenu, style: 'titre' })
  assert.equal(blocs[1].style, 'sous-titre')
  assert.equal(blocs[2].style, undefined)
  assert.ok(blocs.every((b) => b.type === 'paragraphe'))
})

test('un document écrit à la main avec le harnais garde ses paragraphes ordinaires', () => {
  const d = doc('Un', 'Deux')
  assert.ok(d.children.every((n) => n.attrs.style === null))
})
