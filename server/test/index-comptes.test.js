// L'index des comptes et le registre en cache (point 12, 13/10/2026).
//
// Le contrat : les réponses sont exactement celles de l'ancien parcours du
// registre, mais sans le relire à chaque question. Deux sortes de vérifications :
//   - l'équivalence, sur des registres tirés au hasard (corbeille, jetons en
//     clair, fiches sans accès, entrées bancales) : chaque question de
//     `Storage` est comparée à une définition naïve écrite ici ;
//   - l'invalidation : toute écriture — par `Storage` ou par un autre
//     programme — est vue tout de suite, et ce qui sort du stockage ne
//     partage aucun objet avec le cache.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { Storage } from '../storage.js'

const racine = mkdtempSync(join(tmpdir(), 'collabtext-test-index-'))
process.on('exit', () => rmSync(racine, { recursive: true, force: true }))
let n = 0
const nouveauDossier = () => join(racine, `d${++n}`)
const empreinte = (t) => createHash('sha256').update(String(t)).digest('hex')

/** Un générateur pseudo-aléatoire reproductible. */
function alea(graine) {
  let s = graine
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
}

const PERSONNES = Array.from({ length: 12 }, (_, i) => `p${i}@ex.test`)

function registreAuHasard(graine, nbDocs = 60) {
  const r = alea(graine)
  const choisir = (l) => l[Math.floor(r() * l.length)]
  const reg = {}
  for (let i = 0; i < nbDocs; i++) {
    const id = `doc${i}`
    const tirage = r()
    if (tirage < 0.03) {
      reg[id] = null // fiche bancale
      continue
    }
    const meta = { title: `Doc ${i}`, createdAt: i, updatedAt: Math.floor(r() * 50) }
    if (tirage > 0.1) {
      const proprio = choisir(PERSONNES)
      const access = [{ email: proprio, role: 'editeur', grantedAt: 1 + Math.floor(r() * 5), status: 'actif' }]
      const autres = Math.floor(r() * 4)
      for (let k = 0; k < autres; k++) {
        const e = { email: choisir(PERSONNES), role: choisir(['editeur', 'correcteur', 'lecteur']), grantedAt: 3 + k }
        if (r() < 0.5) {
          e.status = 'invite'
          e.tokenHash = empreinte(`jeton-${i}-${k}`)
          e.tokenExpiresAt = Date.now() + 1e6
        }
        if (r() < 0.1) e.token = `clair-${i}-${k}` // ancien format
        access.push(e)
      }
      if (r() < 0.05) access.push({ role: 'lecteur' }) // entrée bancale : sans adresse
      meta.access = access
      if (r() < 0.7) meta.owner = proprio
    } // sinon : pas de liste d'accès du tout
    if (r() < 0.2) meta.corbeille = { le: Math.floor(r() * 1000), par: choisir(PERSONNES) }
    reg[id] = meta
  }
  return reg
}

// --- Les définitions naïves : l'ancien code, au mot près -----------------------

function proprietaire(meta) {
  if (!meta) return null
  if (meta.owner) return meta.owner
  if (!Array.isArray(meta.access)) return null
  const editeurs = meta.access.filter((a) => a && a.role === 'editeur')
  if (!editeurs.length) return null
  return editeurs.reduce((p, a) => ((a.grantedAt || Infinity) < (p.grantedAt || Infinity) ? a : p)).email
}

const naif = {
  ids(reg, email) {
    return Object.entries(reg)
      .filter(([, meta]) => {
        if (!meta || meta.corbeille) return false
        if (!email || !Array.isArray(meta.access)) return false
        return meta.access.some((a) => a && a.email === email)
      })
      .map(([id]) => id)
  },
  documentsDe(reg, email, avecCorbeille = false) {
    if (!email) return []
    return Object.entries(reg)
      .filter(([, meta]) => meta && proprietaire(meta) === email && (avecCorbeille || !meta.corbeille))
      .map(([id]) => id)
  },
  corbeille(reg, email) {
    return Object.entries(reg)
      .filter(([, meta]) => meta && meta.corbeille && proprietaire(meta) === email)
      .map(([id]) => id)
  },
  aUnAcces(reg, email) {
    return Object.values(reg).some((d) => d && Array.isArray(d.access) && d.access.some((a) => a && a.email === email))
  },
  invitation(reg, jeton) {
    for (const [id, doc] of Object.entries(reg)) {
      if (!doc || !Array.isArray(doc.access) || doc.corbeille) continue
      const h = empreinte(jeton)
      const entry = doc.access.find((a) => a && (a.tokenHash === h || (a.token && a.token === jeton)))
      if (!entry) continue
      return { id, email: entry.email, role: entry.role }
    }
    return null
  },
  depuis(reg, ms, maintenant) {
    return Object.entries(reg)
      .filter(([, meta]) => meta && meta.corbeille && maintenant - meta.corbeille.le > ms)
      .map(([id]) => id)
  },
}

function stockage(registre) {
  const dossier = nouveauDossier()
  const s = new Storage(dossier)
  writeFileSync(join(dossier, 'docs.json'), JSON.stringify(registre, null, 2))
  return { s, dossier }
}

test('équivalence avec le parcours du registre, sur des registres tirés au hasard', () => {
  for (const graine of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const reg = registreAuHasard(graine)
    const { s } = stockage(reg)
    for (const email of [...PERSONNES, 'inconnu@ex.test', '', null, undefined]) {
      assert.deepEqual(
        s
          .listDocs(email)
          .map((d) => d.id)
          .sort(),
        naif.ids(reg, email).sort(),
        `listDocs ${email} (graine ${graine})`
      )
      assert.deepEqual(s.documentsDe(email).sort(), naif.documentsDe(reg, email).sort(), `documentsDe ${email}`)
      assert.deepEqual(
        s.documentsDe(email, { avecCorbeille: true }).sort(),
        naif.documentsDe(reg, email, true).sort(),
        `documentsDe avec corbeille ${email}`
      )
      assert.deepEqual(
        s
          .listCorbeille(email)
          .map((d) => d.id)
          .sort(),
        email ? naif.corbeille(reg, email).sort() : [],
        `corbeille ${email}`
      )
      assert.equal(s.emailHasAnyAccess(email), email ? naif.aUnAcces(reg, email) : false, `emailHasAnyAccess ${email}`)
    }
    // Les jetons : ceux qui existent, ceux en clair d'avant, et un inconnu.
    for (let i = 0; i < 60; i++) {
      for (let k = 0; k < 4; k++) {
        for (const jeton of [`jeton-${i}-${k}`, `clair-${i}-${k}`]) {
          const attendu = naif.invitation(reg, jeton)
          const obtenu = s.findInvitation(jeton)
          assert.equal(obtenu && obtenu.id, attendu && attendu.id, `findInvitation ${jeton}`)
          if (attendu) {
            assert.equal(obtenu.email, attendu.email)
            assert.equal(obtenu.role, attendu.role)
          }
        }
      }
    }
    assert.equal(s.findInvitation('jamais-vu'), null)
    for (const ms of [0, 200, 900]) {
      assert.deepEqual(
        s.enCorbeilleDepuis(ms, 1000).sort(),
        naif.depuis(reg, ms, 1000).sort(),
        `enCorbeilleDepuis ${ms}`
      )
    }
  }
})

test('le même ordre qu’avant : du plus récemment modifié au plus ancien, les égalités dans l’ordre du registre', () => {
  const reg = registreAuHasard(11)
  const { s } = stockage(reg)
  for (const email of PERSONNES) {
    const attendu = naif.ids(reg, email)
    const parDate = attendu
      .map((id, i) => [id, i])
      .sort((a, b) => (reg[b[0]].updatedAt || 0) - (reg[a[0]].updatedAt || 0) || a[1] - b[1])
      .map(([id]) => id)
    assert.deepEqual(
      s.listDocs(email).map((d) => d.id),
      parDate,
      email
    )
  }
})

test('la liste porte le rôle, les droits et la propriété de la personne, sans jeton', () => {
  const reg = registreAuHasard(5)
  const { s } = stockage(reg)
  for (const email of PERSONNES) {
    for (const d of s.listDocs(email)) {
      const meta = reg[d.id]
      assert.equal(d.myRole, meta.access.find((a) => a && a.email === email).role)
      assert.equal(d.owner, proprietaire(meta))
      assert.equal(d.jeSuisProprietaire, proprietaire(meta) === email)
      assert.ok(d.myCapabilities && typeof d.myCapabilities === 'object')
      assert.ok(!JSON.stringify(d).includes('tokenHash') && !JSON.stringify(d).includes('"token"'), 'aucun jeton')
    }
  }
})

test('le fichier n’est analysé qu’une fois pour toute une rafale de questions', () => {
  const { s } = stockage(registreAuHasard(3, 200))
  let lectures = 0
  const lire = s._readRegistry.bind(s)
  s._readRegistry = () => (lectures++, lire())
  for (let i = 0; i < 100; i++) {
    const email = PERSONNES[i % PERSONNES.length]
    s.listDocs(email)
    s.roleFor(`doc${i}`, email)
    s.getDoc(`doc${i}`)
    s.emailHasAnyAccess(email)
    s.documentsDe(email)
    s.listCorbeille(email)
    s.findInvitation('x')
    s.ownerOf(`doc${i}`)
    s.getAccess(`doc${i}`)
  }
  assert.equal(lectures, 1, 'une seule analyse du registre')
})

test('toute écriture de Storage est vue tout de suite par les questions suivantes', () => {
  const { s } = stockage({})
  const doc = s.createDoc('Un', 'a@ex.test')
  assert.deepEqual(s.documentsDe('a@ex.test'), [doc.id])
  assert.equal(s.emailHasAnyAccess('b@ex.test'), false)

  s.grantAccess(doc.id, 'b@ex.test', 'correcteur')
  assert.equal(s.emailHasAnyAccess('b@ex.test'), true)
  assert.deepEqual(
    s.listDocs('b@ex.test').map((d) => d.id),
    [doc.id]
  )
  assert.equal(s.roleFor(doc.id, 'b@ex.test'), 'correcteur')

  const { token } = s.inviteEmail(doc.id, 'c@ex.test', 'lecteur', 'a@ex.test')
  assert.equal(s.findInvitation(token).email, 'c@ex.test')
  s.revokeAccess(doc.id, 'c@ex.test')
  assert.equal(s.findInvitation(token), null, 'l’invitation retirée ne se retrouve plus')
  assert.equal(s.emailHasAnyAccess('c@ex.test'), false)

  s.mettreALaCorbeille(doc.id, 'a@ex.test')
  assert.deepEqual(s.listDocs('b@ex.test'), [])
  assert.equal(s.roleFor(doc.id, 'b@ex.test'), null)
  assert.deepEqual(s.documentsDe('a@ex.test'), [])
  assert.deepEqual(s.documentsDe('a@ex.test', { avecCorbeille: true }), [doc.id])
  assert.deepEqual(
    s.listCorbeille('a@ex.test').map((d) => d.id),
    [doc.id]
  )
  assert.equal(s.estALaCorbeille(doc.id), true)
  assert.deepEqual(s.enCorbeilleDepuis(0, Date.now() + 10), [doc.id])

  s.restaurerDeLaCorbeille(doc.id)
  assert.deepEqual(
    s.listDocs('b@ex.test').map((d) => d.id),
    [doc.id]
  )
  assert.deepEqual(s.listCorbeille('a@ex.test'), [])

  s.transferOwnership(doc.id, 'b@ex.test')
  assert.deepEqual(s.documentsDe('b@ex.test'), [doc.id])
  assert.deepEqual(s.documentsDe('a@ex.test'), [])
  s.leaveDoc(doc.id, 'a@ex.test')
  assert.equal(s.roleFor(doc.id, 'a@ex.test'), null)
  assert.equal(s.emailHasAnyAccess('a@ex.test'), false)

  s.renameDoc(doc.id, 'Deux')
  assert.equal(s.getDoc(doc.id).title, 'Deux')
  s.deleteDoc(doc.id)
  assert.equal(s.getDoc(doc.id), null)
  assert.deepEqual(s.documentsDe('b@ex.test'), [])
  assert.equal(s.emailHasAnyAccess('b@ex.test'), false)
})

test('une écriture par un autre programme est vue aussi (le fichier change de signature)', () => {
  const { s, dossier } = stockage({
    x: { title: 'X', access: [{ email: 'a@ex.test', role: 'editeur', grantedAt: 1 }] },
  })
  assert.equal(s.roleFor('x', 'a@ex.test'), 'editeur')
  assert.equal(s.roleFor('x', 'z@ex.test'), null)
  // Un script externe réécrit le fichier. (Limite connue de la signature : une
  // réécriture **sur place**, de **même taille**, dans le même battement
  // d'horloge du système de fichiers, passerait inaperçue. Les programmes qui
  // écrivent ce registre le remplacent par renommage — inode neuf.)
  const chemin = join(dossier, 'docs.json')
  const lu = JSON.parse(readFileSync(chemin, 'utf8'))
  lu.x.access = [{ email: 'z@ex.test', role: 'editeur', grantedAt: 1 }]
  lu.y = { title: 'Y', access: [{ email: 'z@ex.test', role: 'lecteur', grantedAt: 2 }] }
  writeFileSync(chemin, JSON.stringify(lu, null, 2))
  assert.equal(s.roleFor('x', 'a@ex.test'), null)
  assert.equal(s.roleFor('x', 'z@ex.test'), 'editeur')
  assert.equal(s.emailHasAnyAccess('a@ex.test'), false)
  assert.equal(s.emailHasAnyAccess('z@ex.test'), true)
})

test('un registre illisible lève, ne vide rien, et la réparation est vue', () => {
  const { s, dossier } = stockage({
    x: { title: 'X', access: [{ email: 'a@ex.test', role: 'editeur', grantedAt: 1 }] },
  })
  assert.equal(s.roleFor('x', 'a@ex.test'), 'editeur')
  const chemin = join(dossier, 'docs.json')
  const bon = readFileSync(chemin, 'utf8')
  writeFileSync(chemin, bon.slice(0, 20))
  const silencieux = console.error
  console.error = () => {}
  try {
    assert.throws(
      () => s.roleFor('x', 'a@ex.test'),
      (e) => e.code === 'FICHIER_ILLISIBLE'
    )
    assert.throws(
      () => s.listDocs('a@ex.test'),
      (e) => e.code === 'FICHIER_ILLISIBLE'
    )
  } finally {
    console.error = silencieux
  }
  writeFileSync(chemin, bon)
  assert.equal(s.roleFor('x', 'a@ex.test'), 'editeur')
})

test('ce qui sort du stockage ne partage rien avec le cache : le modifier ne change pas les réponses suivantes', () => {
  const { s } = stockage({
    x: {
      title: 'X',
      modele: 'm1',
      style: { a: { b: 1 } },
      access: [{ email: 'a@ex.test', role: 'editeur', grantedAt: 1 }],
      corbeille: { le: 5, par: 'a@ex.test' },
    },
  })
  const d = s.getDoc('x')
  d.title = 'Piraté'
  d.style.a.b = 99
  d.corbeille.le = 0
  d.access.push({ email: 'pirate@ex.test', role: 'editeur' })
  const liste = s.allDocs()
  liste[0].style.a.b = 77
  liste[0].access[0].role = 'lecteur'
  const dedans = s.listCorbeille('a@ex.test')
  dedans[0].corbeille.le = 1
  assert.equal(s.getDoc('x').title, 'X')
  assert.equal(s.getDoc('x').style.a.b, 1)
  assert.equal(s.getDoc('x').corbeille.le, 5)
  assert.equal(s.roleFor('x', 'pirate@ex.test'), null)
  assert.equal(s.getAccess('x')[0].role, 'editeur')
  assert.equal(s.listCorbeille('a@ex.test')[0].corbeille.le, 5)
})

test('un identifiant qui est un nom de l’objet (constructor, __proto__, toString) n’est pas un document', () => {
  const { s } = stockage({ x: { title: 'X', access: [{ email: 'a@ex.test', role: 'editeur', grantedAt: 1 }] } })
  for (const id of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    assert.equal(s.getDoc(id), null, id)
    assert.equal(s.roleFor(id, 'a@ex.test'), null, id)
    assert.equal(s.ownerOf(id), null, id)
    assert.equal(s.estALaCorbeille(id), false, id)
    assert.deepEqual(s.getAccess(id), [], id)
  }
})

test('documentsAvecAcces : tous les documents où l’adresse a une entrée, en attente et corbeille comprises', () => {
  const { s } = stockage({})
  const a = s.createDoc('A', 'x@ex.test')
  const b = s.createDoc('B', 'y@ex.test')
  const c = s.createDoc('C', 'y@ex.test')
  s.grantAccess(b.id, 'x@ex.test', 'lecteur')
  s.inviteEmail(c.id, 'x@ex.test', 'correcteur', 'y@ex.test')
  s.mettreALaCorbeille(c.id, 'y@ex.test')
  assert.deepEqual(s.documentsAvecAcces('x@ex.test').sort(), [a.id, b.id, c.id].sort())
  assert.deepEqual(s.documentsAvecAcces('personne@ex.test'), [])
  assert.deepEqual(s.documentsAvecAcces(''), [])
})
