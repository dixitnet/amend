// La suppression d'un compte, côté données (point 7, 13/10/2026) : chaque
// fichier qui garde une adresse sait l'oublier, le registre sait dire ce que
// devient chaque document, et les noms s'effacent d'un document Yjs sans
// toucher à ceux des autres. Le geste complet, par l'API : voir
// suppression-compte.test.js.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Y from 'yjs'
import { Users, idCompte } from '../users.js'
import { Rangements } from '../rangement.js'
import { SessionsRevoquees } from '../sessions.js'
import { Limiteur } from '../limiteur.js'
import { RegistreLimiteurs } from '../limiteurs.js'
import { Storage } from '../storage.js'
import { UsageIa } from '../usageIa.js'
import { Metrics } from '../metrics.js'
import { Agents } from '../agents.js'
import { anonymiserDansDocument, NOM_SUPPRIME, NOM_AGENT_SUPPRIME } from '../suppressionCompte.js'
import { AUTEUR_AGENT, AUTEUR_INCONNU, NOM_COMMENTAIRES, NOM_TEXTE } from '../../shared/protocole.js'

const ALICE = 'alice@test.local'
const BOB = 'bob@test.local'
const CLARA = 'clara@test.local'

function dossier() {
  const d = mkdtempSync(join(tmpdir(), 'amend-suppr-'))
  process.on('exit', () => rmSync(d, { recursive: true, force: true }))
  return d
}
const contenu = (d, f) => readFileSync(join(d, f), 'utf8')

// --- Les fichiers qui gardent une adresse ------------------------------------

test('Users.supprimer efface le compte, et lui seul', () => {
  const d = dossier()
  const u = new Users(d)
  u.definirNom(ALICE, 'Alice')
  u.definirNom(BOB, 'Bob')
  assert.equal(u.supprimer(ALICE), true)
  assert.equal(u.get(ALICE), null)
  assert.equal(u.get(BOB).nom, 'Bob')
  assert.equal(u.supprimer(ALICE), false, 'déjà partie')
  assert.ok(!contenu(d, 'users.json').includes(ALICE))
})

test('Rangements.supprimer efface le fichier de la personne', () => {
  const d = dossier()
  const r = new Rangements(d)
  r.favori(ALICE, 'doc1', true)
  r.favori(BOB, 'doc1', true)
  assert.equal(r.supprimer(ALICE), true)
  assert.deepEqual(r.lire(ALICE).favoris, [])
  assert.deepEqual(r.lire(BOB).favoris, ['doc1'])
  assert.equal(r.supprimer(ALICE), false)
})

test('les sessions : le marqueur est une empreinte, l’ancien format est lu, la purge oublie les vieux', () => {
  const d = dossier()
  const s = new SessionsRevoquees(d)
  s.revoquer(ALICE, 1000)
  assert.ok(!contenu(d, 'sessions-revoquees.json').includes('alice'), 'pas d’adresse en clair')
  assert.equal(s.validesDepuis(ALICE), 1000)
  assert.equal(s.validesDepuis(BOB), 0)

  // Un fichier d'avant, indexé par adresse : toujours respecté, puis remplacé.
  writeFileSync(join(d, 'sessions-revoquees.json'), JSON.stringify({ [BOB]: 500 }))
  const s2 = new SessionsRevoquees(d)
  assert.equal(s2.validesDepuis(BOB), 500)
  s2.revoquer(BOB, 700)
  assert.equal(s2.validesDepuis(BOB), 700)
  assert.ok(!contenu(d, 'sessions-revoquees.json').includes('bob'))

  // La purge : un marqueur plus vieux que la vie d'un cookie ne refuse plus rien.
  s2.revoquer(CLARA, 5000)
  assert.equal(s2.purger(2000, 5500), 1, 'seul celui de Bob (700) est trop vieux') // Alice absente de ce fichier
  assert.equal(s2.validesDepuis(BOB), 0)
  assert.equal(s2.validesDepuis(CLARA), 5000)
  assert.equal(s2.purger(2000, 5500), 0, 'rien à refaire')
})

test('Limiteur.oublier et RegistreLimiteurs.oublier : la clé disparaît aussi du disque', () => {
  const d = dossier()
  const registre = new RegistreLimiteurs(d, { delaiMs: 10 })
  const l = registre.adopter('liens', new Limiteur({ max: 5, fenetreMs: 3600_000 }))
  l.noter(ALICE)
  l.noter(BOB)
  registre.sauver()
  assert.ok(contenu(d, 'limiteurs.json').includes(ALICE))
  assert.ok(registre.oublier(ALICE) >= 1)
  assert.equal(l.compter(ALICE), 0)
  assert.equal(l.compter(BOB), 1)
  const fichier = contenu(d, 'limiteurs.json')
  assert.ok(!fichier.includes(ALICE) && fichier.includes(BOB))
  registre.arreter()
})

test('un compteur chargé du disque mais pas encore adopté est oublié lui aussi', () => {
  const d = dossier()
  const premier = new RegistreLimiteurs(d, { delaiMs: 10 })
  premier.adopter('liens', new Limiteur({ max: 5, fenetreMs: 3600_000 })).noter(ALICE)
  premier.arreter()
  const second = new RegistreLimiteurs(d, { delaiMs: 10 }) // n'a encore rien adopté
  second.oublier(ALICE)
  assert.ok(!contenu(d, 'limiteurs.json').includes(ALICE))
  second.arreter()
})

test('ListeAttente.retirer ôte toutes les inscriptions de l’adresse, sans casse', () => {
  const d = dossier()
  const st = new Storage(d)
  st.listeAttente.ajouter(ALICE)
  st.listeAttente.ajouter(BOB)
  assert.equal(st.listeAttente.retirer('ALICE@test.local'), 1)
  assert.deepEqual(
    st.listeAttente.lire().map((l) => l.email),
    [BOB]
  )
  assert.equal(st.listeAttente.retirer(ALICE), 0)
})

test('UsageIa.oublier efface la ligne de la personne, pas les totaux par modèle', () => {
  const d = dossier()
  const u = new UsageIa(d)
  const jetons = { entree: 100, sortie: 50 }
  u.enregistrer({ email: ALICE, fonction: 'margo', modele: 'claude-sonnet-4-5', succes: true, signes: 10, jetons })
  u.enregistrer({ email: BOB, fonction: 'margo', modele: 'claude-sonnet-4-5', succes: true, signes: 10, jetons })
  const mois = u.moisDisponibles()[0]
  assert.equal(u.oublier(ALICE), 1)
  const detail = u.detail(mois)
  assert.deepEqual(
    detail.utilisateurs.map((l) => l.email),
    [BOB]
  )
  assert.equal(Object.values(detail.modeles)[0].appels, 2, 'le coût réel de la clé reste complet')
  assert.ok(!contenu(d, 'usage-ia.json').includes(ALICE))
  assert.equal(u.oublier(ALICE), 0)
})

test('Modeles.supprimerPersonnels : les siens seulement, jamais ceux de l’instance', () => {
  const d = dossier()
  const st = new Storage(d)
  const m = st.styles.modeles
  const a = m.creer({ nom: 'Perso Alice', categorie: 'Test', depuis: 'defaut', portee: 'perso', email: ALICE })
  const b = m.creer({ nom: 'Perso Bob', categorie: 'Test', depuis: 'defaut', portee: 'perso', email: BOB })
  const i = m.creer({ nom: 'Instance', categorie: 'Test', depuis: 'defaut', portee: 'instance', email: ALICE })
  assert.deepEqual(m.supprimerPersonnels(ALICE), [a.id])
  assert.equal(m.existe(a.id), false)
  assert.ok(m.existe(b.id) && m.existe(i.id))
})

test('Metrics.effacer rend l’adresse anonyme dans les événements, qui restent', () => {
  const d = dossier()
  const m = new Metrics(d)
  m.log('connexions', { email: ALICE, docId: 'd1' })
  m.log('connexions', { email: BOB, docId: 'd1' })
  m.log('ia', { email: 'Alice@Test.local', docId: 'd2', entree: 3 })
  assert.equal(m.effacer(ALICE), 2)
  const lignes = m.read('connexions')
  assert.equal(lignes.length, 2, 'l’événement compte toujours')
  assert.equal(lignes[0].email, null)
  assert.equal(lignes[0].docId, 'd1')
  assert.equal(lignes[1].email, BOB)
  assert.equal(m.read('ia')[0].entree, 3)
  assert.ok(!contenu(d, 'events-connexions.jsonl').includes(ALICE))
  assert.equal(m.effacer(ALICE), 0)
})

test('Agents.retirerPar révoque ses agents et efface son adresse de leurs fiches', () => {
  const d = dossier()
  const ag = new Agents(d)
  const a = ag.inviter({ docId: 'd1', role: 'correcteur', par: ALICE })
  const b = ag.inviter({ docId: 'd1', role: 'correcteur', par: BOB })
  assert.deepEqual(ag.retirerPar(ALICE), { revoques: 1, effaces: 1 })
  assert.equal(ag.trouver(a.secret), null, 'son agent ne lit plus rien')
  assert.ok(ag.trouver(b.secret), 'celui de Bob continue')
  assert.ok(!contenu(d, 'agents.json').includes(ALICE))
  assert.deepEqual(ag.retirerPar(ALICE), { revoques: 0, effaces: 0 })
})

// --- Ce que devient chaque document -------------------------------------------

/** Un registre où Alice est dans toutes les situations. */
function registreDAlice() {
  const d = dossier()
  const st = new Storage(d)
  const reg = {
    seule: { title: 'Seule', owner: ALICE, access: [{ email: ALICE, role: 'editeur', grantedAt: 1 }] },
    invitationSeule: {
      title: 'Invitation en attente',
      owner: ALICE,
      access: [
        { email: ALICE, role: 'editeur', grantedAt: 1 },
        { email: BOB, role: 'editeur', grantedAt: 2, status: 'invite', tokenHash: 'h', invitedBy: ALICE },
      ],
    },
    partagee: {
      title: 'Partagée',
      owner: ALICE,
      access: [
        { email: ALICE, role: 'editeur', grantedAt: 1 },
        { email: CLARA, role: 'editeur', grantedAt: 9, status: 'actif', invitedBy: ALICE },
        { email: BOB, role: 'editeur', grantedAt: 5, status: 'actif', invitedBy: ALICE },
      ],
    },
    bloquee: {
      title: 'Bloquée',
      owner: ALICE,
      access: [
        { email: ALICE, role: 'editeur', grantedAt: 1 },
        { email: BOB, role: 'lecteur', grantedAt: 2, status: 'actif' },
        { email: CLARA, role: 'correcteur', grantedAt: 3, status: 'actif' },
      ],
    },
    invitee: {
      title: 'Celle de Bob',
      owner: BOB,
      access: [
        { email: BOB, role: 'editeur', grantedAt: 1 },
        { email: ALICE, role: 'lecteur', grantedAt: 2, status: 'actif', invitedBy: BOB },
      ],
    },
    enCorbeille: {
      title: 'Jetée',
      owner: ALICE,
      access: [{ email: ALICE, role: 'editeur', grantedAt: 1 }],
      corbeille: { le: 5, par: ALICE },
    },
    jetee: {
      title: 'Celle de Clara, jetée par Alice',
      owner: CLARA,
      access: [
        { email: CLARA, role: 'editeur', grantedAt: 1 },
        { email: ALICE, role: 'editeur', grantedAt: 2, status: 'actif' },
      ],
      corbeille: { le: 6, par: ALICE },
    },
    etrangere: { title: 'Sans Alice', owner: BOB, access: [{ email: BOB, role: 'editeur', grantedAt: 1 }] },
  }
  writeFileSync(join(d, 'docs.json'), JSON.stringify(reg))
  return st
}

const ids = (l) => l.map((x) => x.id).sort()

test('planSuppressionCompte : chaque document dans sa catégorie', () => {
  const plan = registreDAlice().planSuppressionCompte(ALICE)
  assert.deepEqual(ids(plan.supprimes), ['enCorbeille', 'invitationSeule', 'seule'])
  assert.deepEqual(ids(plan.transferes), ['partagee'])
  assert.equal(plan.transferes[0].vers, BOB, 'l’éditeur le plus ancien, pas le dernier arrivé')
  assert.deepEqual(ids(plan.bloquants), ['bloquee'])
  assert.deepEqual(ids(plan.quittes), ['invitee', 'jetee'])
})

test('planSuppressionCompte : une adresse sans rien, ou vide, n’a rien à décider', () => {
  const st = registreDAlice()
  for (const e of ['nobody@test.local', '', null, undefined]) {
    assert.deepEqual(st.planSuppressionCompte(e), { quittes: [], supprimes: [], transferes: [], bloquants: [] })
  }
})

test('planSuppressionCompte : sans champ owner, le propriétaire est l’éditeur le plus ancien', () => {
  const d = dossier()
  const st = new Storage(d)
  writeFileSync(
    join(d, 'docs.json'),
    JSON.stringify({
      ancien: {
        title: 'Ancien',
        access: [
          { email: BOB, role: 'editeur', grantedAt: 5 },
          { email: ALICE, role: 'editeur', grantedAt: 1 },
        ],
      },
    })
  )
  const plan = st.planSuppressionCompte(ALICE)
  assert.deepEqual(ids(plan.transferes), ['ancien'])
  assert.equal(plan.transferes[0].vers, BOB)
})

test('retirerCompte : transferts, départs et fiches des autres, en une écriture', () => {
  const st = registreDAlice()
  const plan = st.planSuppressionCompte(ALICE)
  const avant = st.documentsAvecAcces(BOB).length
  const touches = st.retirerCompte(ALICE, { ...plan, supprimes: [], bloquants: [] })
  assert.deepEqual(touches.sort(), ['invitee', 'jetee', 'partagee'])

  // Transférée à Bob, qui reste éditeur ; Alice n'y figure plus.
  assert.equal(st.ownerOf('partagee'), BOB)
  assert.ok(!st.getAccess('partagee').some((a) => a.email === ALICE))
  assert.equal(st.getAccess('partagee').find((a) => a.email === BOB).role, 'editeur')
  // Quittée : les autres gardent tout.
  assert.ok(!st.getAccess('invitee').some((a) => a.email === ALICE))
  assert.equal(st.ownerOf('invitee'), BOB)
  assert.equal(st.documentsAvecAcces(BOB).length, avant)

  // Plus aucune trace de l'adresse dans les fiches des documents conservés.
  const brut = JSON.parse(readFileSync(join(st.dataDir, 'docs.json'), 'utf8'))
  for (const id of ['partagee', 'invitee', 'jetee']) {
    assert.ok(!JSON.stringify(brut[id]).includes(ALICE), `${id} garde encore l'adresse`)
  }
  assert.equal(brut.jetee.corbeille.par, null)
  assert.equal(brut.jetee.corbeille.le, 6)
  // Ce que le plan ne traitait pas n'est pas touché.
  assert.ok(JSON.stringify(brut.seule).includes(ALICE))
  assert.ok(JSON.stringify(brut.bloquee).includes(ALICE))
  // L'index suit.
  assert.deepEqual(st.documentsAvecAcces(ALICE).sort(), ['bloquee', 'enCorbeille', 'invitationSeule', 'seule'].sort())
})

// --- Les noms, dans un document -------------------------------------------------

const idA = idCompte(ALICE)
const idB = idCompte(BOB)

/** Un document avec du texte marqué : Alice et Bob y proposent, une note porte
 * la marque d'Alice, un commentaire d'Alice, un de Bob, un de l'agent d'Alice. */
function documentMarque() {
  const doc = new Y.Doc()
  const racine = doc.getXmlFragment(NOM_TEXTE)
  const p = new Y.XmlElement('paragraph')
  racine.insert(0, [p])
  const xt = new Y.XmlText()
  p.insert(0, [xt])
  const marque = (user, couleur) => ({ user, userColor: couleur, ts: 1, groupe: null })
  xt.insert(0, 'Bonjour ', {})
  xt.insert(8, 'Alice écrit', {
    insertion: marque('Alice', '#111111'),
    authorColor: { user: 'Alice', userColor: '#111111' },
  })
  xt.insert(19, ' puis Bob', { deletion: marque('Bob', '#222222') })
  const note = new Y.XmlElement('footnote')
  note.setAttribute('suivi', { type: 'insertion', user: 'Alice', userColor: '#111111', ts: 2 })
  const interne = new Y.XmlText()
  note.insert(0, [interne])
  interne.insert(0, 'Note d’Alice', { insertion: marque('Alice', '#111111') })
  const p2 = new Y.XmlElement('paragraph')
  racine.insert(1, [p2])
  p2.setAttribute('trackedBreak', { user: 'Alice', userColor: '#111111', ts: 3 })
  p2.insert(0, [note])
  const c = doc.getMap(NOM_COMMENTAIRES)
  c.set('c1', { id: 'c1', author: 'Alice', authorId: idA, color: '#111111', text: 'Mon avis', createdAt: 1 })
  c.set('c2', { id: 'c2', author: 'Bob', authorId: idB, color: '#222222', text: 'Le sien', createdAt: 2 })
  c.set('c3', { id: 'c3', author: 'Claude (pour Alice)', authorId: AUTEUR_AGENT, text: 'L’agent', createdAt: 3 })
  c.set('c4', { id: 'c4', author: 'Claude (pour Bob)', authorId: AUTEUR_AGENT, text: 'L’agent de Bob', createdAt: 4 })
  return doc
}

const quiAlice = (surcharge = {}) => ({
  id: idA,
  nom: 'Alice',
  etiquettesAgent: ['Claude (pour Alice)', 'Claude (pour alice)'],
  nomUnique: true,
  agentUnique: true,
  ...surcharge,
})
const utilisateursDesMarques = (doc) => {
  const vus = []
  const marcher = (n) => {
    for (const e of n.toArray()) {
      if (e instanceof Y.XmlText) {
        for (const op of e.toDelta())
          for (const v of Object.values(op.attributes || {})) if (v && v.user) vus.push(v.user)
      } else if (e instanceof Y.XmlElement) {
        for (const v of Object.values(e.getAttributes())) if (v && v.user) vus.push(v.user)
        marcher(e)
      }
    }
  }
  marcher(doc.getXmlFragment(NOM_TEXTE))
  return vus
}

test('anonymiserDansDocument : ses commentaires et ses marques perdent son nom, ceux des autres non', () => {
  const doc = documentMarque()
  const bilan = anonymiserDansDocument(doc, quiAlice())
  assert.equal(bilan.commentaires, 2, 'le sien et celui de son agent')
  assert.ok(bilan.marques >= 4)

  const c = doc.getMap(NOM_COMMENTAIRES)
  assert.deepEqual(
    { a: c.get('c1').author, id: c.get('c1').authorId, t: c.get('c1').text, col: c.get('c1').color },
    { a: NOM_SUPPRIME, id: AUTEUR_INCONNU, t: 'Mon avis', col: '#111111' }
  )
  assert.equal(c.get('c3').author, NOM_AGENT_SUPPRIME)
  assert.equal(c.get('c3').authorId, AUTEUR_AGENT)
  assert.equal(c.get('c2').author, 'Bob')
  assert.equal(c.get('c2').authorId, idB)
  assert.equal(c.get('c4').author, 'Claude (pour Bob)')

  const users = utilisateursDesMarques(doc)
  assert.ok(!users.includes('Alice'), `reste : ${users}`)
  assert.ok(users.includes('Bob'))
  assert.ok(users.includes(NOM_SUPPRIME))
  // Le texte, lui, n'a pas bougé d'un signe.
  const texte = doc
    .getXmlFragment(NOM_TEXTE)
    .toArray()[0]
    .toArray()[0]
    .toDelta()
    .map((o) => o.insert)
    .join('')
  assert.equal(texte, 'Bonjour Alice écrit puis Bob')
})

test('anonymiserDansDocument : couleur et date des marques restent, c’est idempotent', () => {
  const doc = documentMarque()
  anonymiserDansDocument(doc, quiAlice())
  const delta = doc.getXmlFragment(NOM_TEXTE).toArray()[0].toArray()[0].toDelta()
  const op = delta.find((o) => o.insert === 'Alice écrit')
  assert.equal(op.attributes.insertion.userColor, '#111111')
  assert.equal(op.attributes.insertion.ts, 1)
  assert.equal(op.attributes.authorColor.user, NOM_SUPPRIME)

  const etat = Y.encodeStateAsUpdate(doc).length
  const second = anonymiserDansDocument(doc, quiAlice())
  assert.deepEqual(second, { commentaires: 0, marques: 0 })
  assert.equal(Y.encodeStateAsUpdate(doc).length, etat, 'rien de nouveau n’est écrit')
})

test('anonymiserDansDocument : un nom partagé avec un autre membre n’efface pas les marques, mais les commentaires oui', () => {
  const doc = documentMarque()
  const bilan = anonymiserDansDocument(doc, quiAlice({ nomUnique: false, agentUnique: false }))
  assert.equal(bilan.marques, 0, 'on ne devine pas à qui elles sont')
  assert.ok(utilisateursDesMarques(doc).includes('Alice'))
  const c = doc.getMap(NOM_COMMENTAIRES)
  assert.equal(c.get('c1').author, NOM_SUPPRIME, 'l’identifiant ne se trompe pas, lui')
  assert.equal(c.get('c3').author, 'Claude (pour Alice)', 'un prénom partagé : l’agent reste')
})

test('anonymiserDansDocument : sans nom connu, seuls les commentaires par identifiant sont touchés', () => {
  const doc = documentMarque()
  const bilan = anonymiserDansDocument(doc, quiAlice({ nom: null }))
  assert.equal(bilan.commentaires, 2)
  assert.ok(utilisateursDesMarques(doc).includes('Alice'))
})

test('anonymiserDansDocument : un document vide ou sans marque ne plante pas', () => {
  const doc = new Y.Doc()
  assert.deepEqual(anonymiserDansDocument(doc, quiAlice()), { commentaires: 0, marques: 0 })
})
