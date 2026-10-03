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
import { ajouterNotes, blocsDuDocument, commenter, fils, modificationsDe, proposer, repondre, situer } from '../agentTexte.js'

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

// --- Les notes de bas de page (03/10/2026) ---------------------------------------

/** Une note déjà dans le document : un élément `footnote` qui contient son
 * texte. `suivi` : null, ou `{ type, user, userColor, ts }`. */
function note(texte, suivi = null) {
  return { note: texte, suivi }
}

/** Comme `bloc`, mais les morceaux `{ note, suivi }` deviennent des notes. */
function blocAvecNotes(parent, nom, morceaux, attrs = {}) {
  const el = new Y.XmlElement(nom)
  parent.push([el])
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  let xt = null
  for (const m of morceaux) {
    if (m && !Array.isArray(m) && typeof m === 'object' && m.note !== undefined) {
      const fn = new Y.XmlElement('footnote')
      el.push([fn])
      if (m.suivi) fn.setAttribute('suivi', m.suivi)
      const interne = new Y.XmlText()
      fn.push([interne])
      interne.insert(0, m.note)
      xt = null
      continue
    }
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

const SUIVI_INS = { type: 'insertion', user: 'Marie', userColor: '#aa5555', ts: 1 }
const SUIVI_DEL = { type: 'deletion', user: 'Marie', userColor: '#aa5555', ts: 1 }

/** La forme d'un paragraphe : ses enfants, texte et notes. */
function forme(el) {
  const brut = (xt) => xt.toDelta().map((op) => op.insert).join('')
  return el.toArray().map((c) => (c instanceof Y.XmlText ? brut(c) : `{${c.nodeName}${c.getAttribute('suivi') ? ':' + c.getAttribute('suivi').type : ''}|${c.toArray().map(brut).join('')}}`))
}

test('les notes se lisent : repère, numéro dans le document, texte — et celles qu’on barre ne comptent plus', () => {
  const y = docAvec((f) => {
    blocAvecNotes(f, 'paragraph', ['Zan naquit', note('Source : mairie.'), ' un mardi.'])
    blocAvecNotes(f, 'paragraph', ['Il mourut', note('Archives.', SUIVI_DEL), ' jeune', { atome: 'image' }, '.', note('Voir aussi.', SUIVI_INS)])
    blocAvecNotes(f, 'paragraph', ['Fin', note('Dernière.')])
  })
  const blocs = blocsDuDocument(y)
  assert.equal(blocs[0].texte, 'Zan naquit⟦1⟧ un mardi.', 'le texte du bloc ne change pas : un repère')
  assert.deepEqual(blocs[0].notes.map((n) => [n.k, n.numero, n.texte, n.enAttente]), [[1, 1, 'Source : mairie.', false]])
  // Le repère ⟦k⟧ compte les images aussi ; le numéro, lui, ne compte que les notes.
  assert.deepEqual(blocs[1].notes.map((n) => [n.k, n.numero, n.supprimee, n.enAttente]), [[1, null, true, true], [3, 2, false, true]])
  assert.equal(blocs[1].texte, 'Il mourut jeune⟦2⟧.⟦3⟧', 'une note proposée à la suppression n’est plus dans le texte à relire')
  assert.equal(blocs[2].notes[0].numero, 3, 'les numéros se suivent d’un bloc à l’autre')
  assert.equal(blocs[1].enAttente, true, 'un bloc qui porte une note en attente est en attente')
  assert.equal(blocs[0].enAttente, false)
})

test('poser une note au milieu d’une phrase coupe le texte en deux, la mise en forme suit', () => {
  const y = docAvec((f) => bloc(f, 'paragraph', ['Le ', ['chat', { strong: {} }], ' noir dort.']))
  const r = ajouterNotes(y, [{ bloc: 1, apres: 'chat', texte: 'Un chat de gouttière.' }], AUTEUR, 42)
  assert.deepEqual(r.appliques, [{ index: 0, bloc: 1 }])
  assert.deepEqual(r.refuses, [])
  const p = y.getXmlFragment('prosemirror-content').get(0)
  assert.deepEqual(forme(p), ['Le chat', '{footnote:insertion|Un chat de gouttière.}', ' noir dort.'])
  const fn = p.toArray()[1]
  assert.deepEqual(fn.getAttribute('suivi'), { type: 'insertion', user: 'Claude', userColor: '#5f7a4a', ts: 42 })
  // La mise en forme du texte coupé est conservée de part et d'autre.
  assert.deepEqual(p.toArray()[0].toDelta(), [{ insert: 'Le ' }, { insert: 'chat', attributes: { strong: {} } }])
  const b = blocsDuDocument(y)[0]
  assert.equal(b.texte, 'Le chat⟦1⟧ noir dort.')
  assert.equal(b.notes[0].texte, 'Un chat de gouttière.')
  assert.equal(b.enAttente, true)
})

test('une note se pose aussi à la fin d’un texte, avant une image, ou à la fin du bloc', () => {
  const y = docAvec((f) => {
    bloc(f, 'paragraph', ['Une phrase.'])
    bloc(f, 'paragraph', ['Avant l’image', { atome: 'image' }, ' et après.'])
    bloc(f, 'paragraph', [])
  })
  const r = ajouterNotes(
    y,
    [
      { bloc: 1, apres: 'phrase.', texte: 'Fin de texte.' },
      { bloc: 2, apres: 'Avant l’image', texte: 'Avant un atome.' },
      { bloc: 2, texte: 'À la fin du bloc.' },
      { bloc: 3, texte: 'Dans un bloc vide.' },
    ],
    AUTEUR
  )
  assert.equal(r.appliques.length, 4, JSON.stringify(r))
  const f = y.getXmlFragment('prosemirror-content')
  assert.deepEqual(forme(f.get(0)), ['Une phrase.', '{footnote:insertion|Fin de texte.}'])
  assert.deepEqual(forme(f.get(1)), ['Avant l’image', '{footnote:insertion|Avant un atome.}', '{image|}', ' et après.', '{footnote:insertion|À la fin du bloc.}'])
  assert.deepEqual(forme(f.get(2)), ['{footnote:insertion|Dans un bloc vide.}'])
})

test('plusieurs notes dans un même texte : chacune à sa place, dans l’ordre demandé quand elles se touchent', () => {
  const y = docAvec((f) => bloc(f, 'paragraph', ['Un deux trois quatre cinq.']))
  const r = ajouterNotes(
    y,
    [
      { bloc: 1, apres: 'deux', texte: 'N1' },
      { bloc: 1, apres: 'quatre', texte: 'N4' },
      { bloc: 1, apres: 'deux', texte: 'N2 (au même endroit)' },
      { bloc: 1, apres: 'Un', texte: 'N0' },
    ],
    AUTEUR
  )
  assert.equal(r.appliques.length, 4)
  const p = y.getXmlFragment('prosemirror-content').get(0)
  assert.deepEqual(forme(p), [
    'Un',
    '{footnote:insertion|N0}',
    ' deux',
    '{footnote:insertion|N1}',
    '{footnote:insertion|N2 (au même endroit)}',
    ' trois quatre',
    '{footnote:insertion|N4}',
    ' cinq.',
  ])
  assert.equal(blocsDuDocument(y)[0].texte, 'Un⟦1⟧ deux⟦2⟧⟦3⟧ trois quatre⟦4⟧ cinq.')
})

test('ce qui ne peut pas recevoir une note est refusé avec sa raison, le reste passe', () => {
  const y = docAvec((f) => {
    bloc(f, 'heading', ['Un titre'], { level: 1 })
    bloc(f, 'paragraph', ['Le chat et le chat.'])
    bloc(f, 'paragraph', ['Un ', ['ajout', { insertion: { user: 'Marie', userColor: '#a55', ts: 1, groupe: null }, authorColor: { user: 'Marie', userColor: '#a55' } }], ' en cours.'])
    bloc(f, 'paragraph', ['Texte sain.'])
  })
  const r = ajouterNotes(
    y,
    [
      { bloc: 1, apres: 'Un titre', texte: 'Non.' },
      { bloc: 2, apres: 'chat', texte: 'Ambigu.' },
      { bloc: 2, apres: 'chien', texte: 'Absent.' },
      { bloc: 3, apres: 'aj', texte: 'Dans la proposition d’un autre.' },
      { bloc: 4, apres: 'Texte', texte: '   ' },
      { bloc: 99, apres: 'x', texte: 'Hors document.' },
      { bloc: 4, apres: 'sain', texte: 'x'.repeat(2001) },
      { bloc: 4, apres: 'sain', texte: 'Une note\nsur deux lignes.' },
    ],
    AUTEUR
  )
  assert.deepEqual(r.appliques, [{ index: 7, bloc: 4 }])
  const raisons = Object.fromEntries(r.refuses.map((x) => [x.index, x.raison]))
  assert.match(raisons[0], /titre/)
  assert.match(raisons[1], /2 fois/)
  assert.match(raisons[2], /introuvable/)
  assert.match(raisons[3], /modification déjà en attente/)
  assert.match(raisons[4], /vide/)
  assert.match(raisons[5], /pas de bloc 99/)
  assert.match(raisons[6], /trop long/)
  assert.equal(blocsDuDocument(y)[3].notes[0].texte, 'Une note sur deux lignes.', 'un saut de ligne devient une espace')
  // Rien n'a été écrit pour les refusés.
  assert.equal(blocsDuDocument(y)[0].notes.length, 0)
  assert.equal(blocsDuDocument(y)[2].notes.length, 0)
})

test('poser une note ne casse pas les commentaires : ceux d’après l’appel suivent le texte', () => {
  const y = docAvec((f) => bloc(f, 'paragraph', ['Zan naquit un mardi, et il mourut un jeudi, dit-on.']))
  commenter(y, { bloc: 1, citation: 'Zan', texte: 'Avant.' }, AUTEUR)
  commenter(y, { bloc: 1, citation: 'un jeudi', texte: 'Après.' }, AUTEUR)
  commenter(y, { bloc: 1, citation: 'mardi, et il mourut', texte: 'À cheval.' }, AUTEUR)
  commenter(y, { bloc: 1, citation: 'dit-on.', texte: 'Au bout.' }, AUTEUR)
  const r = ajouterNotes(y, [{ bloc: 1, apres: 'mardi', texte: 'Un mardi.' }], AUTEUR)
  assert.equal(r.appliques.length, 1)
  const passages = Object.fromEntries(fils(y).map((c) => [c.texte, c.passage]))
  assert.equal(passages['Avant.'], 'Zan')
  assert.equal(passages['Après.'], 'un jeudi', 'un commentaire placé après l’appel garde son passage')
  assert.equal(passages['Au bout.'], 'dit-on.', 'même collé à la fin du texte')
  assert.equal(passages['À cheval.'], 'mardi', 'à cheval sur l’appel : ramené à ce qui précède')
  assert.ok(fils(y).every((c) => c.bloc === 1))
})

test('une demande de notes = une seule opération Yjs, et se rejoue ailleurs à l’identique', () => {
  const y = docAvec((f) => bloc(f, 'paragraph', ['Un deux trois.']))
  const autre = new Y.Doc()
  Y.applyUpdate(autre, Y.encodeStateAsUpdate(y))
  let transactions = 0
  y.on('afterTransaction', (t) => {
    if (t.changed.size) transactions++
  })
  ajouterNotes(y, [{ bloc: 1, apres: 'Un', texte: 'A' }, { bloc: 1, apres: 'deux', texte: 'B' }], AUTEUR)
  assert.equal(transactions, 1)
  Y.applyUpdate(autre, Y.encodeStateAsUpdate(y, Y.encodeStateVector(autre)))
  assert.deepEqual(forme(autre.getXmlFragment('prosemirror-content').get(0)), forme(y.getXmlFragment('prosemirror-content').get(0)))
})

test('corriger une note : les mêmes marques qu’un paragraphe, dans le texte de la note', () => {
  const y = docAvec((f) => {
    blocAvecNotes(f, 'paragraph', ['Zan naquit', note('Source : la mairie de Lyon, 1887.'), ' un mardi.'])
  })
  const r = proposer(y, [{ bloc: 1, note: 1, avant: 'Lyon, 1887', apres: 'Lyon, 1878' }], AUTEUR, 7)
  assert.deepEqual(r.refuses, [])
  assert.equal(r.appliques.length, 1)
  const n = blocsDuDocument(y)[0].notes[0]
  // Le texte lu est celui d'après acceptation ; l'ancien est barré, pas perdu.
  assert.equal(n.texte, 'Source : la mairie de Lyon, 1878.')
  assert.equal(n.enAttente, true)
  const interne = y.getXmlFragment('prosemirror-content').get(0).toArray()[1].toArray()[0]
  const marques = interne.toDelta().filter((op) => op.attributes && (op.attributes.insertion || op.attributes.deletion))
  assert.ok(marques.some((op) => op.attributes.insertion && op.attributes.insertion.user === 'Claude'))
  assert.ok(marques.some((op) => op.attributes.deletion))
  // Le texte du bloc, lui, n'a pas bougé.
  assert.equal(blocsDuDocument(y)[0].texte, 'Zan naquit⟦1⟧ un mardi.')
})

test('corriger une note : ce qui est refusé l’est avec sa raison', () => {
  const y = docAvec((f) => {
    blocAvecNotes(f, 'paragraph', ['A', note('Une note.'), ' B', note('Nouvelle.', SUIVI_INS), ' C', note('Barrée.', SUIVI_DEL)])
    bloc(f, 'paragraph', ['Sans note.'])
  })
  const r = proposer(
    y,
    [
      { bloc: 1, note: 9, avant: 'Une', apres: 'La' },
      { bloc: 1, note: 2, avant: 'Nouvelle', apres: 'Autre' },
      { bloc: 1, note: 3, avant: 'Barrée', apres: 'Autre' },
      { bloc: 2, note: 1, avant: 'Sans', apres: 'Avec' },
      { bloc: 1, note: 1, avant: 'absent', apres: 'x' },
      { bloc: 1, note: 0, avant: 'Une', apres: 'La' },
      { bloc: 1, note: 1, avant: 'Une note', apres: 'Une autre note' },
    ],
    AUTEUR
  )
  assert.deepEqual(r.appliques, [{ index: 6, bloc: 1 }])
  const raisons = Object.fromEntries(r.refuses.map((x) => [x.index, x.raison]))
  assert.match(raisons[0], /pas de note ⟦9⟧ dans le bloc 1/)
  assert.match(raisons[1], /vient d'être proposée/)
  assert.match(raisons[2], /déjà proposée à la suppression/)
  assert.match(raisons[3], /ne porte aucune note/)
  assert.match(raisons[4], /introuvable dans la note ⟦1⟧ du bloc 1/)
  assert.match(raisons[5], /repère/)
})

test('commenter une note : ancré contre son appel, et le commentaire dit de quelle note il parle', () => {
  const y = docAvec((f) => {
    blocAvecNotes(f, 'paragraph', ['Zan naquit un mardi', note('Source douteuse.'), ', dit-on.'])
    blocAvecNotes(f, 'paragraph', [note('Note en tête.'), 'Texte après.'])
    blocAvecNotes(f, 'paragraph', [note('Note seule.')])
  })
  const a = commenter(y, { bloc: 1, note: 1, texte: 'À sourcer.' }, AUTEUR)
  assert.ok(a.ok)
  const b = commenter(y, { bloc: 2, note: 1, texte: 'Trop vague.' }, AUTEUR)
  assert.ok(b.ok)
  const c = commenter(y, { bloc: 3, note: 1, texte: 'Rien autour.' }, AUTEUR)
  assert.equal(c.ok, false)
  assert.match(c.raison, /aucun texte autour/)
  assert.equal(commenter(y, { bloc: 1, note: 4, texte: 'x' }, AUTEUR).ok, false)
  // Deux commentaires posés dans la même milliseconde n'ont pas d'ordre garanti : on les retrouve par leur texte.
  const par = Object.fromEntries(fils(y).map((c) => [c.texte, c]))
  const premier = par['À propos de la note 1 : À sourcer.']
  assert.equal(premier.passage, 'Zan naquit un mardi', 'le texte qui précède l’appel')
  assert.equal(premier.bloc, 1)
  const second = par['À propos de la note 2 : Trop vague.']
  assert.equal(second.passage, 'Texte après.', 'sans texte avant, celui qui suit')
  assert.equal(second.bloc, 2)
})
