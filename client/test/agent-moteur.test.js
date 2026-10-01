// Ce qu'un agent écrit dans le document, relu **par le client** (29/09/2026,
// server/agentTexte.js). Le moteur du serveur ne connaît pas ProseMirror : il
// écrit dans Yjs la forme que y-prosemirror lui donnerait. Ce fichier est la
// preuve que c'est bien la même :
//
//   - ce que l'agent propose se lit dans ProseMirror comme ce que propose
//     l'IA du panneau (insertAISuggestion) : mêmes marques, même ordre,
//     mêmes groupes ;
//   - accepter tout donne le texte corrigé, refuser tout rend l'original ;
//   - un commentaire de l'agent s'ancre au bon endroit pour le client.
//
// Les deux mondes ne partagent que des octets (opérations Yjs) : le serveur
// a sa propre copie de yjs, le client la sienne.

import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import * as Y from 'yjs'
import {
  prosemirrorToYXmlFragment,
  initProseMirrorDoc,
  yXmlFragmentToProseMirrorRootNode,
  relativePositionToAbsolutePosition,
} from 'y-prosemirror'
import { schema } from '../src/schema.js'
import { acceptAllChanges, rejectAllChanges, insertAISuggestion, rejectAgentChanges, estModificationDAgent, listChanges } from '../src/trackChanges.js'
import { doc as fabriqueDoc, editeur, IA } from './harness.js'

// Le yjs du serveur, chargé depuis le même fichier que celui du moteur
// (sinon les `instanceof` du moteur ne reconnaîtraient rien).
const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const YS = await import(pathToFileURL(join(racine, 'node_modules', 'yjs', 'dist', 'yjs.mjs')).href)
const { proposer, ajouter, commenter, repondre, fils } = await import(pathToFileURL(join(racine, 'server', 'agentTexte.js')).href)

/** Un document ProseMirror → un Y.Doc côté serveur ET côté client. */
function mondes(pmDoc) {
  const client = new Y.Doc()
  prosemirrorToYXmlFragment(pmDoc, client.getXmlFragment('prosemirror-content'))
  const serveur = new YS.Doc()
  YS.applyUpdate(serveur, Y.encodeStateAsUpdate(client))
  return { client, serveur }
}

/** Ce que l'agent écrit côté serveur, rejoué côté client. */
function ecrire(pmDoc, action) {
  const { client, serveur } = mondes(pmDoc)
  let update = null
  serveur.on('update', (u) => {
    update = update ? YS.mergeUpdates([update, u]) : u
  })
  const resultat = action(serveur)
  if (update) Y.applyUpdate(client, update)
  return { client, serveur, resultat }
}

const relu = (client) => yXmlFragmentToProseMirrorRootNode(client.getXmlFragment('prosemirror-content'), schema)

/** La forme d'un document : ses blocs, et pour chaque morceau de texte ses
 * marques de suivi, sans les horodatages ni les identifiants de groupe (les
 * groupes sont ramenés à un rang : « le premier groupe », « le second »). */
function forme(pmDoc) {
  const rangs = new Map()
  const rang = (g) => {
    if (!g) return null
    if (!rangs.has(g)) rangs.set(g, rangs.size + 1)
    return rangs.get(g)
  }
  const out = []
  pmDoc.descendants((noeud) => {
    if (!noeud.isText) return
    const marques = noeud.marks
      .map((m) => {
        const { user, userColor, groupe } = m.attrs
        if (m.type.name === 'insertion' || m.type.name === 'deletion') return `${m.type.name}:${user}:${userColor}:g${rang(groupe)}`
        if (m.type.name === 'authorColor') return `authorColor:${user}:${userColor}`
        return m.type.name
      })
      .sort()
    out.push([noeud.text, marques])
  })
  return out
}

/** Ce que fait le client pour l'IA du panneau, sur le même document. */
function commeLeClient(pmDoc, suggestion) {
  const e = editeur(pmDoc, { suivi: false })
  insertAISuggestion(e.view, 1, e.doc.content.size - 1, suggestion, IA)
  return e.doc
}

const AGENT = { name: IA.name, color: IA.color }

test('un remplacement d’un mot par un autre se lit comme celui de l’IA du panneau', () => {
  // Assez long pour que le client ne bascule pas en « réécriture du
  // paragraphe » (BIG_REWRITE_RATIO) : une correction ordinaire.
  const texte = 'Dans la cuisine de la vieille maison, le chat noir dort tranquillement au soleil de midi.'
  const avant = fabriqueDoc(texte)
  const { client } = ecrire(avant, (s) => proposer(s, [{ bloc: 1, avant: 'le chat noir dort', apres: 'le chien blanc dort' }], AGENT))
  const cible = commeLeClient(avant, texte.replace('chat noir', 'chien blanc'))
  assert.deepEqual(forme(relu(client)), forme(cible))
})

test('une lettre qui change, un ajout, une suppression : mêmes marques que le client', () => {
  const cas = [
    ['Un chomage massif.', { avant: 'chomage', apres: 'chômage' }, 'Un chômage massif.'],
    ['Le chat dort dans le panier.', { avant: 'Le chat dort', apres: 'Le chat noir dort' }, 'Le chat noir dort dans le panier.'],
    ['Un très petit panier.', { avant: 'Un très petit', apres: 'Un petit' }, 'Un petit panier.'],
  ]
  for (const [texte, remplacement, suggestion] of cas) {
    const avant = fabriqueDoc(texte)
    const { client } = ecrire(avant, (s) => proposer(s, [{ bloc: 1, ...remplacement }], AGENT))
    assert.deepEqual(forme(relu(client)), forme(commeLeClient(avant, suggestion)), texte)
  }
})

test('accepter tout donne le texte corrigé, refuser tout rend l’original', () => {
  const avant = fabriqueDoc({ h: 1, texte: 'Chapitre' }, 'Ils mange des pomme au marché.', 'Un autre paragraphe, intact.')
  const { client } = ecrire(avant, (s) =>
    proposer(
      s,
      [
        { bloc: 2, avant: 'Ils mange', apres: 'Ils mangent' },
        { bloc: 2, avant: 'des pomme au', apres: 'des pommes au' },
        { bloc: 2, avant: 'marché', apres: 'marchés' },
      ],
      AGENT
    )
  )
  const propose = relu(client)
  const accepter = editeur(propose, { suivi: false })
  acceptAllChanges(accepter.view)
  assert.equal(accepter.texte(), 'Chapitre\nIls mangent des pommes au marchés.\nUn autre paragraphe, intact.')
  const refuser = editeur(propose, { suivi: false })
  rejectAllChanges(refuser.view)
  assert.equal(refuser.texte(), 'Chapitre\nIls mange des pomme au marché.\nUn autre paragraphe, intact.')
})

test('la mise en forme du passage remplacé passe au nouveau texte', () => {
  const gras = schema.marks.strong.create()
  const avant = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('Le '), schema.text('chat noir', [gras]), schema.text(' dort.')]),
  ])
  const { client } = ecrire(avant, (s) => proposer(s, [{ bloc: 1, avant: 'chat noir', apres: 'chien blanc' }], AGENT))
  const spans = forme(relu(client))
  for (const mot of ['chien', 'blanc']) {
    const nouveau = spans.find(([t]) => t === mot)
    assert.ok(nouveau[1].includes('strong') && nouveau[1].some((m) => m.startsWith('insertion:')), mot)
  }
  for (const mot of ['chat', 'noir']) {
    const ancien = spans.find(([t]) => t === mot)
    assert.ok(ancien[1].includes('strong') && ancien[1].some((m) => m.startsWith('deletion:')), mot)
  }
})

test('une note et un saut de ligne dans le paragraphe restent intacts', () => {
  const note = schema.node('footnote', null, [schema.text('ma note')])
  const avant = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('Avant la note'), note, schema.node('hard_break'), schema.text(' et le chat noir après.')]),
  ])
  const { client } = ecrire(avant, (s) => proposer(s, [{ bloc: 1, avant: 'le chat noir', apres: 'le chien' }], AGENT))
  const propose = relu(client)
  let notes = 0
  let sauts = 0
  propose.descendants((n) => {
    if (n.type.name === 'footnote') notes++
    if (n.type.name === 'hard_break') sauts++
  })
  assert.equal(notes, 1)
  assert.equal(sauts, 1)
  const e = editeur(propose, { suivi: false })
  acceptAllChanges(e.view)
  assert.match(e.texte(), /le chien après\./)
})

test('un commentaire de l’agent s’ancre sur le bon passage pour le client', () => {
  const avant = fabriqueDoc('Premier paragraphe.', { h: 2, texte: 'Un titre' }, 'Zan naquit un mardi, sous un ciel de plomb.')
  const { client, resultat } = ecrire(avant, (s) => commenter(s, { bloc: 3, citation: 'un mardi', texte: 'Précisez la date.' }, AGENT))
  assert.ok(resultat.ok)
  const { doc: pm, mapping } = initProseMirrorDoc(client.getXmlFragment('prosemirror-content'), schema)
  const c = client.getMap('comments').get(resultat.id)
  const fragment = client.getXmlFragment('prosemirror-content')
  const de = relativePositionToAbsolutePosition(client, fragment, Y.createRelativePositionFromJSON(c.anchorFrom), mapping)
  const a = relativePositionToAbsolutePosition(client, fragment, Y.createRelativePositionFromJSON(c.anchorTo), mapping)
  assert.equal(pm.textBetween(de, a), 'un mardi')
  assert.equal(c.author, 'IA')
  assert.equal(typeof c.createdAt, 'number')
})

test('un commentaire posé après une note et un saut de ligne s’ancre encore juste', () => {
  const note = schema.node('footnote', null, [schema.text('ma note')])
  const avant = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('Avant'), note, schema.node('hard_break'), schema.text('et voici le passage visé, plus loin.')]),
  ])
  const { client, resultat } = ecrire(avant, (s) => commenter(s, { bloc: 1, citation: 'le passage visé', texte: 'Flou.' }, AGENT))
  assert.ok(resultat.ok)
  const { doc: pm, mapping } = initProseMirrorDoc(client.getXmlFragment('prosemirror-content'), schema)
  const c = client.getMap('comments').get(resultat.id)
  const fragment = client.getXmlFragment('prosemirror-content')
  const de = relativePositionToAbsolutePosition(client, fragment, Y.createRelativePositionFromJSON(c.anchorFrom), mapping)
  const a = relativePositionToAbsolutePosition(client, fragment, Y.createRelativePositionFromJSON(c.anchorTo), mapping)
  assert.equal(pm.textBetween(de, a), 'le passage visé')
})

test('les fils et les réponses de l’agent ont la forme que le client attend', () => {
  const avant = fabriqueDoc('Un paragraphe à commenter.')
  const { client, resultat } = ecrire(avant, (s) => {
    const c = commenter(s, { bloc: 1, citation: 'à commenter', texte: 'Question.' }, AGENT)
    const r = repondre(s, { commentaire: c.id, texte: 'Réponse.' }, AGENT)
    return { c, r, liste: fils(s) }
  })
  const carte = client.getMap('comments')
  assert.equal(carte.get(resultat.r.id).parent, resultat.c.id)
  assert.equal(carte.get(resultat.r.id).author, 'IA')
  assert.equal(resultat.liste[0].reponses.length, 1)
})

test('« Tout rejeter — Claude » reconnaît ce que l’agent écrit, et lui seul', () => {
  const avant = fabriqueDoc('Ils mange des pomme au marché.')
  const CLAUDE = { name: 'Claude (pour Sylvain)', color: '#5f7a4a' }
  const { client } = ecrire(avant, (s) =>
    proposer(s, [{ bloc: 1, avant: 'Ils mange', apres: 'Ils mangent' }, { bloc: 1, avant: 'des pomme au', apres: 'des pommes au' }], CLAUDE)
  )
  const propose = relu(client)
  assert.ok(listChanges(propose).length >= 2)
  assert.ok(listChanges(propose).every(estModificationDAgent), 'tout ce qu’il a écrit est reconnu comme sien')
  const e = editeur(propose, { suivi: false })
  rejectAgentChanges(e.view)
  assert.equal(e.texte(), 'Ils mange des pomme au marché.')
  assert.equal(listChanges(e.doc).length, 0)
  // Et le nom « IA » du panneau (même vert) n'est pas pris pour Claude.
  assert.equal(estModificationDAgent({ user: 'IA', userColor: '#5f7a4a' }), false)
})

// --- Paragraphes ajoutés ------------------------------------------------------

test('un paragraphe ajouté : marques d’insertion de l’agent, accepter le garde, rejeter le retire en entier', () => {
  const avant = fabriqueDoc('Premier paragraphe.', 'Deuxième paragraphe.', 'Troisième paragraphe.')
  const CLAUDE = { name: 'Claude (pour Sylvain)', color: '#5f7a4a' }
  const { client, resultat } = ecrire(avant, (s) => ajouter(s, [{ apres_bloc: 2, texte: 'Une transition ajoutée.' }], CLAUDE))
  assert.deepEqual(resultat.appliques, [{ index: 0, bloc: 3, paragraphes: 1 }])
  assert.deepEqual(resultat.refuses, [])
  const propose = relu(client)
  assert.equal(propose.childCount, 4)
  const bloc = propose.child(2)
  assert.equal(bloc.type.name, 'paragraph')
  assert.equal(bloc.attrs.trackedBreak, null, 'le saut n’est pas une modification de plus')
  assert.deepEqual(
    forme(bloc).map(([t, m]) => [t, m.map((x) => x.replace(/:g\d+$/, ':g'))]),
    [['Une transition ajoutée.', ['authorColor:Claude (pour Sylvain):#5f7a4a', 'insertion:Claude (pour Sylvain):#5f7a4a:gnull']]]
  )
  const changes = listChanges(propose)
  assert.equal(changes.length, 1)
  assert.ok(changes.every(estModificationDAgent))

  const accepter = editeur(propose, { suivi: false })
  acceptAllChanges(accepter.view)
  assert.equal(accepter.texte(), 'Premier paragraphe.\nDeuxième paragraphe.\nUne transition ajoutée.\nTroisième paragraphe.')
  assert.equal(listChanges(accepter.doc).length, 0)

  for (const defaire of [rejectAllChanges, rejectAgentChanges]) {
    const refuser = editeur(propose, { suivi: false })
    defaire(refuser.view)
    assert.equal(refuser.texte(), 'Premier paragraphe.\nDeuxième paragraphe.\nTroisième paragraphe.')
    assert.equal(refuser.doc.childCount, 3, 'pas de bloc vide laissé derrière')
  }
})

test('plusieurs lignes, plusieurs ajouts au même endroit, et au tout début : dans l’ordre donné', () => {
  const avant = fabriqueDoc('Un.', 'Deux.')
  const { client, resultat } = ecrire(avant, (s) =>
    ajouter(
      s,
      [
        { apres_bloc: 1, texte: 'A1.\n\n  A2.  ' },
        { apres_bloc: 1, texte: 'B.' },
        { apres_bloc: 0, texte: 'Début.' },
        { apres_bloc: 2, texte: 'Fin.' },
      ],
      AGENT
    )
  )
  assert.deepEqual(resultat.refuses, [])
  assert.deepEqual(resultat.appliques.map((a) => a.paragraphes), [2, 1, 1, 1])
  const e = editeur(relu(client), { suivi: false })
  assert.equal(e.texte(), 'Début.\nUn.\nA1.\nA2.\nB.\nDeux.\nFin.')
  acceptAllChanges(e.view)
  assert.equal(e.texte(), 'Début.\nUn.\nA1.\nA2.\nB.\nDeux.\nFin.')
  assert.equal(listChanges(e.doc).length, 0)
})

test('un ajout refusé dit pourquoi : bloc inconnu, texte vide, liste, citation, trop de lignes', () => {
  const citation = schema.node('blockquote', null, [schema.node('paragraph', null, [schema.text('Une citation.')])])
  const liste = schema.node('bullet_list', null, [
    schema.node('list_item', null, [schema.node('paragraph', null, [schema.text('Un item.')])]),
  ])
  const avant = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Premier.')]), citation, liste])
  const { client, resultat } = ecrire(avant, (s) =>
    ajouter(
      s,
      [
        { apres_bloc: 9, texte: 'x' },
        { apres_bloc: 1, texte: '  \n ' },
        { apres_bloc: 2, texte: 'dans la citation' },
        { apres_bloc: 3, texte: 'dans la liste' },
        { apres_bloc: 1, texte: Array.from({ length: 11 }, (_, i) => `L${i}`).join('\n') },
        { apres_bloc: -1, texte: 'x' },
        { apres_bloc: 1, texte: 'Celui-ci passe.' },
      ],
      AGENT
    )
  )
  assert.equal(resultat.appliques.length, 1)
  assert.equal(resultat.appliques[0].index, 6)
  assert.deepEqual(resultat.refuses.map((r) => r.index), [0, 1, 2, 3, 4, 5])
  assert.match(resultat.refuses[0].raison, /pas de bloc 9/)
  assert.match(resultat.refuses[1].raison, /vide/)
  assert.match(resultat.refuses[2].raison, /citation/)
  assert.match(resultat.refuses[3].raison, /liste/)
  const e = editeur(relu(client), { suivi: false })
  assert.equal(e.doc.childCount, 4)
  assert.equal(e.doc.child(1).textContent, 'Celui-ci passe.')
})

test('rien d’accepté, rien d’écrit : le document ne bouge pas', () => {
  const avant = fabriqueDoc('Un.')
  const { serveur } = mondes(avant)
  let ecrit = false
  serveur.on('update', () => (ecrit = true))
  const r = ajouter(serveur, [{ apres_bloc: 5, texte: 'x' }], AGENT)
  assert.equal(r.appliques.length, 0)
  assert.equal(ecrit, false)
})
