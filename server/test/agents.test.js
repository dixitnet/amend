// Les agents invités (29/09/2026, server/agents.js et server/agentTexte.js) :
// le registre des invitations, puis le moteur qui lit et écrit dans le
// document Yjs. La comparaison avec ce que produit le client
// (insertAISuggestion) et la relecture par ProseMirror sont dans
// client/test/agent-moteur.test.js.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Y from 'yjs'
import { Agents, empreinte } from '../agents.js'
import { Storage } from '../storage.js'
import { blocsDuDocument, commenter, fils, modificationsDe, proposer, repondre, situer } from '../agentTexte.js'

const dataDir = mkdtempSync(join(tmpdir(), 'collabtext-test-agents-'))
process.on('exit', () => rmSync(dataDir, { recursive: true, force: true }))

const AUTEUR = { name: 'Claude', color: '#5f7a4a' }

// --- Le registre ------------------------------------------------------------

function nouveauMonde() {
  const dossier = mkdtempSync(join(dataDir, 'm-'))
  const storage = new Storage(dossier)
  const doc = storage.createDoc('Vie et mort de Zan', 'alice@example.com')
  let t = 1_000_000
  const agents = new Agents(dossier, { maintenant: () => t })
  return { dossier, storage, doc, agents, avancer: (ms) => (t += ms), heure: () => t }
}

test('une invitation donne un secret que seule son empreinte garde', () => {
  const { dossier, agents, doc } = nouveauMonde()
  const r = agents.inviter({ docId: doc.id, role: 'correcteur', par: 'alice@example.com' })
  assert.ok(r.ok)
  assert.match(r.secret, /^[A-Za-z0-9_-]{22}$/)
  const fichier = readFileSync(join(dossier, 'agents.json'), 'utf8')
  assert.ok(!fichier.includes(r.secret), 'le secret ne doit pas être dans le fichier')
  assert.ok(fichier.includes(empreinte(r.secret)))
  assert.equal(agents.trouver(r.secret).docId, doc.id)
  assert.equal(agents.trouver('x'.repeat(22)), null)
  assert.equal(agents.trouver('trop-court'), null)
  assert.ok(!JSON.stringify(agents.lister()).includes(empreinte(r.secret)), 'la liste ne montre pas l’empreinte')
})

test('un agent n’est jamais éditeur, et la durée est bornée', () => {
  const { agents, doc } = nouveauMonde()
  assert.equal(agents.inviter({ docId: doc.id, role: 'editeur', par: 'a@x.fr' }).ok, false)
  assert.equal(agents.inviter({ docId: doc.id, role: 'lecteur', par: 'a@x.fr', jours: 0 }).ok, false)
  assert.equal(agents.inviter({ docId: doc.id, role: 'lecteur', par: 'a@x.fr', jours: 400 }).ok, false)
  assert.equal(agents.inviter({ docId: doc.id, role: 'lecteur' }).ok, false, 'sans invitant, pas d’invitation')
})

test('l’invitation expire, se prolonge à partir de maintenant, se révoque', () => {
  const { agents, doc, avancer } = nouveauMonde()
  const r = agents.inviter({ docId: doc.id, role: 'correcteur', par: 'alice@example.com', jours: 7 })
  avancer(6 * 86400_000)
  assert.ok(agents.trouver(r.secret))
  avancer(2 * 86400_000)
  assert.equal(agents.trouver(r.secret), null, 'expirée')
  // Prolonger une invitation périmée la rend valable de nouveau, à partir
  // d'aujourd'hui.
  assert.ok(agents.prolonger(r.id, 3))
  assert.ok(agents.trouver(r.secret))
  assert.ok(agents.revoquer(r.id))
  assert.equal(agents.trouver(r.secret), null, 'révoquée')
  assert.equal(agents.prolonger(r.id, 3), null, 'une révoquée ne se prolonge pas')
  assert.equal(agents.lister()[0].etat, 'révoquée')
})

test('l’accès dépend du document et de la personne qui a invité', () => {
  const { agents, doc, storage } = nouveauMonde()
  storage.grantAccess(doc.id, 'carol@example.com', 'editeur')
  const r = agents.inviter({ docId: doc.id, role: 'correcteur', par: 'carol@example.com' })
  const acces = agents.acces(r.secret, storage)
  assert.equal(acces.capabilities.canProposeChanges, true)
  assert.equal(acces.capabilities.canEditFreely, false)
  // Carol perd son accès : l'agent qu'elle a invité s'arrête, sans rien
  // d'autre à faire.
  storage.revokeAccess(doc.id, 'carol@example.com')
  assert.equal(agents.acces(r.secret, storage), null)
  // Rétrogradée à correcteur : elle ne peut plus inviter non plus.
  storage.grantAccess(doc.id, 'carol@example.com', 'correcteur')
  assert.equal(agents.acces(r.secret, storage), null)
  // Le document supprimé, l'adresse ne mène nulle part.
  const s = agents.inviter({ docId: doc.id, role: 'lecteur', par: 'alice@example.com' })
  assert.ok(agents.acces(s.secret, storage))
  storage.deleteDoc(doc.id)
  assert.equal(agents.acces(s.secret, storage), null)
})

test('supprimer un document révoque ses agents', () => {
  const { agents, doc } = nouveauMonde()
  const a = agents.inviter({ docId: doc.id, role: 'lecteur', par: 'alice@example.com' })
  const b = agents.inviter({ docId: 'autre', role: 'lecteur', par: 'alice@example.com' })
  assert.equal(agents.revoquerDocument(doc.id), 1)
  assert.equal(agents.trouver(a.secret), null)
  assert.ok(agents.trouver(b.secret))
})

test('le script et le serveur se voient : une invitation écrite par un autre processus est reconnue', () => {
  const { dossier, agents, doc, storage } = nouveauMonde()
  const ailleurs = new Agents(dossier)
  const r = ailleurs.inviter({ docId: doc.id, role: 'correcteur', par: 'alice@example.com' })
  assert.ok(agents.acces(r.secret, storage), 'le serveur relit le fichier modifié')
  ailleurs.revoquer(r.id)
  assert.equal(agents.acces(r.secret, storage), null, 'et voit la révocation')
})

test('les essais infructueux sont comptés par origine', () => {
  const { agents } = nouveauMonde()
  for (let i = 0; i < 29; i++) agents.noterEchec('1.2.3.4')
  assert.equal(agents.bloque('1.2.3.4'), false)
  agents.noterEchec('1.2.3.4')
  assert.equal(agents.bloque('1.2.3.4'), true)
  assert.equal(agents.bloque('5.6.7.8'), false)
})

test('un agents.json illisible est mis de côté, pas écrasé', () => {
  const dossier = mkdtempSync(join(dataDir, 'i-'))
  writeFileSync(join(dossier, 'agents.json'), '{pas du json', 'utf8')
  const agents = new Agents(dossier)
  assert.deepEqual(agents.lister(), [])
  const r = agents.inviter({ docId: 'd', role: 'lecteur', par: 'a@x.fr' })
  assert.ok(r.ok)
})

// --- Le moteur --------------------------------------------------------------

/** Un bloc de texte tel que y-prosemirror le range : des XmlText et, entre
 * eux, des atomes en ligne. `morceaux` : "texte", ["texte", {marques}] ou
 * {atome: 'hard_break'}. */
function bloc(parent, nom, morceaux, attrs = {}) {
  const el = new Y.XmlElement(nom)
  parent.push([el])
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  let xt = null
  for (const m of morceaux) {
    if (m && !Array.isArray(m) && typeof m === 'object' && m.atome) {
      el.push([new Y.XmlElement(m.atome)])
      xt = null
      continue
    }
    if (!xt) {
      xt = new Y.XmlText()
      el.push([xt])
    }
    const [texte, marques] = Array.isArray(m) ? m : [m, {}]
    xt.insert(xt.length, texte, marques)
  }
  return el
}

function docAvec(fabrique) {
  const y = new Y.Doc()
  const f = y.getXmlFragment('prosemirror-content')
  fabrique(f)
  return y
}

/** Le texte d'un bloc tel qu'il se lit une fois tout accepté, et tel qu'il
 * se lirait une fois tout refusé. */
function lectures(ydoc, n) {
  const b = blocsDuDocument(ydoc)[n - 1]
  let accepte = ''
  let refuse = ''
  for (const s of b.segments) {
    if (s.atome) {
      accepte += s.texte
      refuse += s.texte
      continue
    }
    if (!s.attrs.deletion) accepte += s.texte
    if (!s.attrs.insertion) refuse += s.texte
  }
  return { accepte, refuse, segments: b.segments }
}

test('les blocs sont numérotés dans l’ordre, listes et citations comprises', () => {
  const y = docAvec((f) => {
    bloc(f, 'heading', ['Titre'], { level: 2 })
    bloc(f, 'paragraph', ['Un ', ['gras', { strong: {} }], ' et un ', { atome: 'hard_break' }, 'saut.'])
    const ul = new Y.XmlElement('bullet_list')
    f.push([ul])
    const li = new Y.XmlElement('list_item')
    ul.push([li])
    bloc(li, 'paragraph', ['premier point'])
    const bq = new Y.XmlElement('blockquote')
    f.push([bq])
    bloc(bq, 'paragraph', ['une citation'])
    bloc(f, 'paragraph', [])
  })
  const blocs = blocsDuDocument(y)
  assert.equal(blocs.length, 5)
  assert.deepEqual(blocs.map((b) => b.n), [1, 2, 3, 4, 5])
  assert.equal(blocs[0].niveau, 2)
  assert.equal(blocs[1].texte, 'Un gras et un \nsaut.')
  assert.deepEqual(blocs[2].contexte, ['bullet_list', 'list_item'])
  assert.deepEqual(blocs[3].contexte, ['blockquote'])
  assert.equal(blocs[4].texte, '')
})

test('un remplacement est un suivi de modifications : le nouveau texte précède l’ancien barré, même groupe', () => {
  const y = docAvec((f) => bloc(f, 'paragraph', ['Le ', ['chat', { strong: {} }], ' noir dort.']))
  const v = proposer(y, [{ bloc: 1, avant: 'chat', apres: 'chien' }], AUTEUR, 1234)
  assert.deepEqual(v.appliques, [{ index: 0, bloc: 1 }])
  assert.deepEqual(v.refuses, [])
  const { accepte, refuse, segments } = lectures(y, 1)
  assert.equal(accepte, 'Le chien noir dort.')
  assert.equal(refuse, 'Le chat noir dort.')
  const ins = segments.find((s) => s.attrs.insertion)
  const del = segments.find((s) => s.attrs.deletion)
  assert.equal(ins.texte, 'chien')
  assert.equal(del.texte, 'chat')
  assert.ok(segments.indexOf(ins) < segments.indexOf(del), 'le nouveau précède l’ancien')
  assert.deepEqual(ins.attrs.insertion, { user: 'Claude', userColor: '#5f7a4a', ts: 1234, groupe: ins.attrs.insertion.groupe })
  assert.match(ins.attrs.insertion.groupe, /^1234-[a-z0-9]+$/)
  assert.equal(del.attrs.deletion.groupe, ins.attrs.insertion.groupe)
  assert.deepEqual(ins.attrs.authorColor, { user: 'Claude', userColor: '#5f7a4a' })
  // La mise en forme du passage remplacé passe au nouveau texte.
  assert.deepEqual(ins.attrs.strong, {})
  assert.deepEqual(del.attrs.strong, {})
})

test('plusieurs mots qui changent donnent une carte par mot, comme l’IA du panneau', () => {
  const y = docAvec((f) => bloc(f, 'paragraph', ['Le chat noir dort au soleil.']))
  proposer(y, [{ bloc: 1, avant: 'chat noir dort', apres: 'chien blanc dort' }], AUTEUR, 5)
  const { accepte, refuse, segments } = lectures(y, 1)
  assert.equal(accepte, 'Le chien blanc dort au soleil.')
  assert.equal(refuse, 'Le chat noir dort au soleil.')
  const ins = segments.filter((s) => s.attrs.insertion)
  const del = segments.filter((s) => s.attrs.deletion)
  assert.deepEqual(ins.map((s) => s.texte), ['chien', 'blanc'])
  assert.deepEqual(del.map((s) => s.texte), ['chat', 'noir'])
  assert.notEqual(ins[0].attrs.insertion.groupe, ins[1].attrs.insertion.groupe)
  assert.equal(ins[0].attrs.insertion.groupe, del[0].attrs.deletion.groupe)
  assert.equal(ins[1].attrs.insertion.groupe, del[1].attrs.deletion.groupe)
})

test('une lettre qui change reste une lettre ; un mot qui change est un mot', () => {
  assert.deepEqual(modificationsDe('un chomage', 'un chômage'), [{ de: 5, fin: 6, nouveau: 'ô', paire: true }])
  assert.deepEqual(modificationsDe('un chat noir', 'un chien noir'), [{ de: 3, fin: 7, nouveau: 'chien', paire: true }])
  assert.deepEqual(modificationsDe('la maison', 'une maison'), [{ de: 0, fin: 2, nouveau: 'une', paire: true }])
  assert.deepEqual(modificationsDe('pareil', 'pareil'), [])
  // Un ajout de mot, une suppression de mot.
  const ajout = modificationsDe('un chat', 'un gros chat')
  assert.equal(ajout.length, 1)
  assert.equal(ajout[0].fin, ajout[0].de)
  assert.equal(ajout[0].nouveau.trim(), 'gros')
  const retrait = modificationsDe('un gros chat', 'un chat')
  assert.equal(retrait.length, 1)
  assert.equal('un gros chat'.slice(retrait[0].de, retrait[0].fin).trim(), 'gros')
  assert.equal(retrait[0].nouveau, '')
})

test('insérer et supprimer sont des propositions sans groupe', () => {
  const y = docAvec((f) => {
    bloc(f, 'paragraph', ['Le chat dort dans un très petit panier.'])
    bloc(f, 'paragraph', ['Un chomage massif.'])
  })
  proposer(
    y,
    [
      { bloc: 1, avant: 'Le chat dort', apres: 'Le chat noir dort' },
      { bloc: 1, avant: 'un très petit', apres: 'un petit' },
      { bloc: 2, avant: 'chomage', apres: 'chômage' },
    ],
    AUTEUR,
    77
  )
  const un = lectures(y, 1)
  assert.equal(un.accepte, 'Le chat noir dort dans un petit panier.')
  assert.equal(un.refuse, 'Le chat dort dans un très petit panier.')
  const ins = un.segments.find((s) => s.attrs.insertion)
  assert.equal(ins.texte.trim(), 'noir')
  assert.equal(ins.attrs.insertion.groupe, null)
  const del = un.segments.find((s) => s.attrs.deletion)
  assert.equal(del.texte.trim(), 'très')
  assert.equal(del.attrs.deletion.groupe, null)
  const deux = lectures(y, 2)
  assert.equal(deux.accepte, 'Un chômage massif.')
  assert.equal(deux.refuse, 'Un chomage massif.')
  assert.deepEqual(deux.segments.filter((s) => s.attrs.insertion || s.attrs.deletion).map((s) => s.texte), ['ô', 'o'])
})

test('plusieurs remplacements dans un même bloc s’appliquent tous, du dernier au premier', () => {
  const y = docAvec((f) => bloc(f, 'paragraph', ['Ils mange des pomme et des poire au jardin.']))
  const v = proposer(
    y,
    [
      { bloc: 1, avant: 'Ils mange', apres: 'Ils mangent' },
      { bloc: 1, avant: 'des pomme et', apres: 'des pommes et' },
      { bloc: 1, avant: 'des poire au', apres: 'des poires au' },
    ],
    AUTEUR
  )
  assert.equal(v.appliques.length, 3)
  assert.equal(lectures(y, 1).accepte, 'Ils mangent des pommes et des poires au jardin.')
  assert.equal(lectures(y, 1).refuse, 'Ils mange des pomme et des poire au jardin.')
})

test('une demande = une seule opération Yjs, atomique', () => {
  const y = docAvec((f) => {
    bloc(f, 'paragraph', ['Alpha beta.'])
    bloc(f, 'paragraph', ['Gamma delta.'])
  })
  let operations = 0
  y.on('update', () => operations++)
  proposer(y, [{ bloc: 1, avant: 'beta', apres: 'bêta' }, { bloc: 2, avant: 'Gamma', apres: 'Gama' }], AUTEUR)
  assert.equal(operations, 1)
  // Rien d'accepté : aucune opération.
  proposer(y, [{ bloc: 1, avant: 'introuvable', apres: 'x' }], AUTEUR)
  assert.equal(operations, 1)
})

test('l’opération se rejoue ailleurs à l’identique (c’est ce que le serveur diffuse)', () => {
  const y = docAvec((f) => bloc(f, 'paragraph', ['Bonjour le monde.']))
  const copie = new Y.Doc()
  Y.applyUpdate(copie, Y.encodeStateAsUpdate(y))
  let update = null
  y.on('update', (u) => (update = u))
  proposer(y, [{ bloc: 1, avant: 'le monde', apres: 'tout le monde' }], AUTEUR)
  Y.applyUpdate(copie, update)
  assert.equal(lectures(copie, 1).accepte, lectures(y, 1).accepte)
  assert.equal(lectures(copie, 1).accepte, 'Bonjour tout le monde.')
})

test('ce qui ne peut pas être proposé est refusé avec sa raison, le reste passe', () => {
  const y = docAvec((f) => {
    bloc(f, 'paragraph', ['Le chat, le chien.'])
    bloc(f, 'paragraph', ['avant ', { atome: 'hard_break' }, 'après'])
    bloc(f, 'paragraph', ['Ce texte est correct.'])
  })
  const v = proposer(
    y,
    [
      { bloc: 1, avant: 'le chien', apres: 'la chienne' }, // passe
      { bloc: 1, avant: 'absent', apres: 'x' }, // introuvable
      { bloc: 1, avant: 'ch', apres: 'sh' }, // ambigu : « chat » et « chien »
      { bloc: 2, avant: 'avant \naprès', apres: 'x' }, // traverse un saut de ligne
      { bloc: 9, avant: 'x', apres: 'y' }, // bloc inexistant
      { bloc: 3, avant: 'Ce texte est correct.', apres: 'Ce texte est correct.' }, // rien ne change
      { bloc: 'un', avant: 'x', apres: 'y' }, // numéro invalide
      { bloc: 3, avant: 'texte', apres: 5 }, // pas du texte
    ],
    AUTEUR
  )
  assert.deepEqual(v.appliques, [{ index: 0, bloc: 1 }])
  const raisons = Object.fromEntries(v.refuses.map((r) => [r.index, r.raison]))
  assert.match(raisons[1], /introuvable/)
  assert.match(raisons[2], /2 fois/)
  assert.match(raisons[3], /saut de ligne/)
  assert.match(raisons[4], /pas de bloc 9/)
  assert.match(raisons[5], /rien ne change/)
  assert.match(raisons[6], /numéro/)
  assert.match(raisons[7], /texte/)
  assert.equal(lectures(y, 3).accepte, 'Ce texte est correct.')
})

test('un passage déjà touché par une modification en attente ne se modifie pas', () => {
  const y = docAvec((f) => bloc(f, 'paragraph', ['Le chat dort au soleil.']))
  proposer(y, [{ bloc: 1, avant: 'chat', apres: 'chien' }], AUTEUR)
  // Le texte lu est « Le chien dort au soleil. » : chien est une insertion
  // en attente, et l'agent n'écrit pas par-dessus.
  const v = proposer(y, [{ bloc: 1, avant: 'chien dort', apres: 'chat dort' }], AUTEUR)
  assert.equal(v.appliques.length, 0)
  assert.match(v.refuses[0].raison, /en attente/)
  // Mais ailleurs dans le même bloc, oui.
  const w = proposer(y, [{ bloc: 1, avant: 'au soleil', apres: 'à l’ombre' }], AUTEUR)
  assert.equal(w.appliques.length, 1)
  assert.equal(lectures(y, 1).accepte, 'Le chien dort à l’ombre.')
})

test('deux remplacements qui se chevauchent : le premier passe, l’autre est refusé', () => {
  const y = docAvec((f) => bloc(f, 'paragraph', ['Une phrase assez longue pour le test.']))
  const v = proposer(
    y,
    [
      { bloc: 1, avant: 'phrase assez longue', apres: 'phrase courte' },
      { bloc: 1, avant: 'assez longue pour', apres: 'très longue pour' },
    ],
    AUTEUR
  )
  assert.equal(v.appliques.length, 1)
  assert.match(v.refuses[0].raison, /chevauche/)
})

test('les espaces insécables et les apostrophes typographiques ne bloquent pas la recherche', () => {
  const y = docAvec((f) => bloc(f, 'paragraph', ['Quoi ? Elle n’a rien dit.']))
  const bloc1 = blocsDuDocument(y)[0]
  assert.ok(situer(bloc1, 'Quoi ? Elle n\'a rien dit.').ok)
  const v = proposer(y, [{ bloc: 1, avant: "Elle n'a rien dit.", apres: "Elle n'a rien dit du tout." }], AUTEUR)
  assert.equal(v.appliques.length, 1)
  assert.equal(lectures(y, 1).accepte, 'Quoi ? Elle n’a rien dit du tout.')
  // Corriger une espace en espace insécable est une vraie modification.
  const z = docAvec((f) => bloc(f, 'paragraph', ['Vraiment ? Oui.']))
  const w = proposer(z, [{ bloc: 1, avant: 'Vraiment ?', apres: 'Vraiment ?' }], AUTEUR)
  assert.equal(w.appliques.length, 1)
  assert.equal(lectures(z, 1).accepte, 'Vraiment ? Oui.')
})

test('un texte inséré n’hérite pas d’un lien qu’il suit, mais le mot remplacé dans un lien reste dans le lien', () => {
  const lien = { link: { href: 'https://a.org/' } }
  const y = docAvec((f) => bloc(f, 'paragraph', ['Voir ', ['la page', lien], ' et ', ['le site', lien], '.']))
  proposer(y, [{ bloc: 1, avant: 'la page', apres: 'la page web' }], AUTEUR)
  const ins = lectures(y, 1).segments.find((s) => s.attrs.insertion)
  assert.equal(ins.texte, ' web')
  assert.equal(ins.attrs.link, undefined, 'après un lien, on n’est plus dans le lien')
  proposer(y, [{ bloc: 1, avant: 'le site', apres: 'le portail' }], AUTEUR)
  const remplace = lectures(y, 1).segments.find((s) => s.attrs.insertion && s.texte.includes('portail'))
  assert.deepEqual(remplace.attrs.link, lien.link)
})

test('les commentaires s’ancrent sur le passage cité et se retrouvent', () => {
  const y = docAvec((f) => {
    bloc(f, 'paragraph', ['Zan naquit un mardi, dit-on.'])
    bloc(f, 'paragraph', ['Il mourut jeune.'])
  })
  const r = commenter(y, { bloc: 1, citation: 'un mardi', texte: 'Vérifier la date.' }, AUTEUR)
  assert.ok(r.ok)
  assert.equal(commenter(y, { bloc: 1, citation: 'un jeudi', texte: 'x' }, AUTEUR).ok, false)
  assert.equal(commenter(y, { bloc: 2, citation: 'Il mourut jeune.', texte: '  ' }, AUTEUR).ok, false)
  const liste = fils(y)
  assert.equal(liste.length, 1)
  assert.equal(liste[0].passage, 'un mardi')
  assert.equal(liste[0].bloc, 1)
  assert.equal(liste[0].auteur, 'Claude')
  // Le commentaire est celui du client : mêmes champs.
  const brut = y.getMap('comments').get(r.id)
  assert.deepEqual(Object.keys(brut).sort(), ['anchorFrom', 'anchorTo', 'author', 'color', 'createdAt', 'id', 'text'])
  // Répondre : un seul niveau.
  const rep = repondre(y, { commentaire: r.id, texte: 'Confirmé.' }, AUTEUR)
  assert.ok(rep.ok)
  assert.equal(repondre(y, { commentaire: rep.id, texte: 'Encore' }, AUTEUR).ok, false)
  assert.equal(repondre(y, { commentaire: 'c-inconnu', texte: 'x' }, AUTEUR).ok, false)
  assert.deepEqual(fils(y)[0].reponses.map((x) => x.texte), ['Confirmé.'])
})

test('le passage commenté ne montre pas ce qu’une suppression en attente a retiré', () => {
  const y = docAvec((f) => bloc(f, 'paragraph', ['Un très beau jour.']))
  commenter(y, { bloc: 1, citation: 'très beau', texte: 'Lourd.' }, AUTEUR)
  proposer(y, [{ bloc: 1, avant: 'très beau', apres: 'beau' }], AUTEUR)
  assert.equal(fils(y)[0].passage, 'beau')
})
