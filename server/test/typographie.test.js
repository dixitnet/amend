// La typographie des sorties de l'IA et de Claude (08/10/2026).
//
// Le défaut d'origine : les corrections de l'IA rebasculaient en apostrophes
// droites, et le raffinement par caractères (shared/diff.js) proposait chaque
// « ’ » du texte comme une « correction ». Les règles sont dans
// shared/typographie.js (testées côté client) ; ici on vérifie qu'elles sont
// bien appliquées aux quatre endroits où le serveur écrit du texte :
// suggestion de l'IA, remplacements, ajouts et notes de Claude, commentaires.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { suggestEdit } from '../ai.js'
import { ajouter, ajouterNotes, blocsDuDocument, commenter, fils, proposer, repondre } from '../agentTexte.js'
import { NBSP, FINE } from '../../shared/typographie.js'

const AUTEUR = { name: 'Claude', color: '#5f7a4a' }

function docAvec(...paragraphes) {
  const y = new Y.Doc()
  const f = y.getXmlFragment('prosemirror-content')
  for (const texte of paragraphes) {
    const el = new Y.XmlElement('paragraph')
    f.push([el])
    const xt = new Y.XmlText()
    el.push([xt])
    xt.insert(0, texte)
  }
  return y
}

const lecture = (y, n) => {
  const b = blocsDuDocument(y)[n - 1]
  let accepte = ''
  for (const s of b.segments) {
    if (s.atome || !s.attrs.deletion) accepte += s.texte
  }
  return accepte
}

test('IA : la suggestion revient typographiée — un texte déjà juste ne produit plus de fausse correction', async () => {
  const api = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: 'text', text: "L'urbanisme, c'est aussi l'affaire de tous..." }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 10 },
    }),
  })
  const r = await suggestEdit(
    { apiKey: 'sk-test-factice', fetch: api },
    'L’urbanisme, c’est aussi l’affaire de tous…',
    'Corrige.'
  )
  assert.equal(r.suggestion, 'L’urbanisme, c’est aussi l’affaire de tous…', 'identique à l’original : rien à proposer')
})

test('IA : l’enveloppe de guillemets est retirée avant la typographie, pas après', async () => {
  const api = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: 'text', text: '"Il a dit \\"non\\" ?"'.replace(/\\"/g, '"') }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 10 },
    }),
  })
  const r = await suggestEdit({ apiKey: 'sk-test-factice', fetch: api }, 'x', 'Reformule.')
  // L'enveloppe n'en est pas une (il y a des guillemets à l'intérieur) :
  // elle est typographiée comme le reste.
  assert.ok(r.suggestion.includes('«'), r.suggestion)
})

test('Claude : un remplacement est typographié', () => {
  const y = docAvec("Le zonage est un outil, c'est tout.")
  const r = proposer(y, [{ bloc: 1, avant: "c'est tout", apres: "c'est l'essentiel..." }], AUTEUR)
  assert.equal(r.refuses.length, 0, JSON.stringify(r.refuses))
  assert.equal(lecture(y, 1), 'Le zonage est un outil, c’est l’essentiel….')
})

test('Claude : un remplacement dont seule la typographie différait ne propose plus rien de faux', () => {
  // L'original est en apostrophes courbes ; l'agent renvoie des droites.
  const y = docAvec('Le zonage, c’est un outil.')
  const r = proposer(y, [{ bloc: 1, avant: 'c’est un outil', apres: "c'est un outil" }], AUTEUR)
  assert.equal(r.appliques.length, 0)
  assert.match(r.refuses[0].raison, /rien ne change/)
})

test('Claude : les paragraphes ajoutés et les notes sont typographiés', () => {
  const y = docAvec('Un premier paragraphe.')
  const a = ajouter(y, [{ apres_bloc: 1, texte: 'Il dit "oui" ; et puis : rien...' }], AUTEUR)
  assert.equal(a.refuses.length, 0, JSON.stringify(a.refuses))
  assert.equal(lecture(y, 2), `Il dit «${NBSP}oui${NBSP}»${FINE}; et puis${NBSP}: rien…`)
  const n = ajouterNotes(y, [{ bloc: 1, texte: "Voir l'annexe." }], AUTEUR)
  assert.equal(n.refuses.length, 0, JSON.stringify(n.refuses))
  assert.match(y.getXmlFragment('prosemirror-content').toString(), /Voir l’annexe\./)
})

test('Claude : commentaires et réponses sont typographiés', () => {
  const y = docAvec('Zan naquit un mardi, dit-on.')
  const r = commenter(y, { bloc: 1, citation: 'un mardi', texte: "C'est à vérifier..." }, AUTEUR)
  assert.ok(r.ok)
  const rep = repondre(y, { commentaire: r.id, texte: "Oui, c'est confirmé !" }, AUTEUR)
  assert.ok(rep.ok)
  const f = fils(y)[0]
  assert.equal(f.texte, 'C’est à vérifier…')
  assert.equal(f.reponses[0].texte, `Oui, c’est confirmé${FINE}!`)
})
