// Les compteurs de limites gardés d'un redémarrage à l'autre (point 25, 13/10/2026).
//
// Sans serveur : on joue « arrêt propre puis redémarrage » en créant un
// second registre sur le même dossier.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Limiteur } from '../limiteur.js'
import { RegistreLimiteurs } from '../limiteurs.js'
import { creerLimites } from '../limites.js'
import { QuotasIa } from '../quotasIa.js'
import { ReglagesIa } from '../reglagesIa.js'
import { UsageIa } from '../usageIa.js'
import { limiteurLiensParAdresse } from '../auth.js'

const dossier = () => mkdtempSync(join(tmpdir(), 'collabtext-test-limiteurs-'))
const attendre = (ms) => new Promise((r) => setTimeout(r, ms))
const HEURE = 3600_000

// ===================================================== le limiteur lui-même

test('exporter ne rend que ce qui est dans la fenêtre ; importer le reprend et ignore le douteux', () => {
  const horloge = { t: 1_000_000 }
  const l = new Limiteur({ max: 3, fenetreMs: 1000, maintenant: () => horloge.t })
  l.noter('a')
  horloge.t += 600
  l.noter('a')
  l.noter('b')
  horloge.t += 500 // le premier « a » est sorti, les deux autres restent
  assert.deepEqual(l.exporter(), { a: [1_000_600], b: [1_000_600] })

  const autre = new Limiteur({ max: 3, fenetreMs: 1000, maintenant: () => horloge.t })
  autre.importer({
    a: [1_000_600, 'x', null, Number.NaN, 999_000 /* trop ancien */, 9_999_999 /* dans le futur */],
    b: 'pas une liste',
    c: [],
  })
  assert.equal(autre.compter('a'), 1)
  assert.equal(autre.compter('b'), 0)
  assert.equal(autre.compter('c'), 0)
  autre.importer(undefined)
  autre.importer('texte')
  autre.importer(42)
  assert.equal(autre.compter('a'), 1, 'un état absurde ne change rien')
})

test('un état repris compte vraiment : la limite est atteinte, et se libère à l’heure d’origine', () => {
  const horloge = { t: 5_000_000 }
  const l = new Limiteur({ max: 2, fenetreMs: 1000, maintenant: () => horloge.t })
  l.importer({ p: [4_999_500, 4_999_800] })
  assert.equal(l.atteint('p'), true)
  assert.equal(l.libereA('p'), 5_000_500)
  horloge.t = 5_000_501
  assert.equal(l.essayer('p'), true)
})

test('surChangement est appelé à chaque enregistrement, pas à chaque lecture', () => {
  const l = new Limiteur({ max: 2, fenetreMs: 1000 })
  let appels = 0
  l.surChangement = () => appels++
  l.atteint('a')
  l.compter('a')
  assert.equal(appels, 0)
  l.noter('a')
  l.essayer('b')
  assert.equal(appels, 2)
  l.essayer('b')
  l.essayer('b') // refusé : rien n'est enregistré
  assert.equal(appels, 3)
})

// ===================================================== le registre

test('arrêt propre puis redémarrage : le compteur est repris, la limite tient encore', () => {
  const d = dossier()
  const r1 = new RegistreLimiteurs(d)
  const l1 = r1.adopter('contact', new Limiteur({ max: 2, fenetreMs: HEURE }))
  assert.equal(l1.essayer('a@x.fr'), true)
  assert.equal(l1.essayer('a@x.fr'), true)
  assert.equal(l1.essayer('a@x.fr'), false)
  r1.arreter()

  const r2 = new RegistreLimiteurs(d)
  const l2 = r2.adopter('contact', new Limiteur({ max: 2, fenetreMs: HEURE }))
  assert.equal(l2.essayer('a@x.fr'), false, 'redémarrer ne rend pas les places')
  assert.equal(l2.essayer('b@x.fr'), true, 'les autres clés ne sont pas touchées')
  r2.arreter()
})

test('l’écriture est différée et groupée, puis a bien lieu sans arrêt propre', async () => {
  const d = dossier()
  const chemin = join(d, 'limiteurs.json')
  const r = new RegistreLimiteurs(d, { delaiMs: 30 })
  const l = r.adopter('x', new Limiteur({ max: 99, fenetreMs: HEURE }))
  for (let i = 0; i < 20; i++) l.noter(`cle-${i}`)
  assert.equal(existsSync(chemin), false, 'rien n’est écrit à chaque requête')
  await attendre(120)
  assert.equal(existsSync(chemin), true)
  const contenu = JSON.parse(readFileSync(chemin, 'utf8'))
  assert.equal(Object.keys(contenu.limiteurs.x).length, 20, 'les vingt enregistrements sont dans une seule écriture')
  assert.equal(statSync(chemin).mode & 0o077, 0, 'illisible pour les autres comptes du serveur')
  assert.deepEqual(
    readdirSync(d).filter((f) => f.endsWith('.tmp')),
    [],
    'aucun fichier temporaire ne traîne'
  )
})

test('arreter() écrit tout de suite et annule l’écriture différée', async () => {
  const d = dossier()
  const r = new RegistreLimiteurs(d, { delaiMs: 60_000 })
  const l = r.adopter('x', new Limiteur({ max: 9, fenetreMs: HEURE }))
  l.noter('a')
  r.arreter()
  assert.equal(JSON.parse(readFileSync(join(d, 'limiteurs.json'), 'utf8')).limiteurs.x.a.length, 1)
  assert.equal(r.minuteur, null)
})

test('un fichier absent, abîmé, d’une autre version ou aux formes absurdes : on repart de zéro, sans rien refuser', () => {
  const ecrire = (d, contenu) => writeFileSync(join(d, 'limiteurs.json'), contenu)
  for (const contenu of [
    '{ pas du json',
    '[]',
    'null',
    JSON.stringify({ version: 99, limiteurs: { x: { a: [Date.now()] } } }),
    JSON.stringify({ version: 1, limiteurs: 'x' }),
  ]) {
    const d = dossier()
    ecrire(d, contenu)
    const l = new RegistreLimiteurs(d).adopter('x', new Limiteur({ max: 1, fenetreMs: HEURE }))
    assert.equal(l.atteint('a'), false, contenu)
  }
  assert.equal(
    new RegistreLimiteurs(dossier()).adopter('x', new Limiteur({ max: 1, fenetreMs: HEURE })).atteint('a'),
    false
  )
})

test('l’état sauvegardé trop ancien pour sa fenêtre est oublié au chargement et jamais réécrit', () => {
  const d = dossier()
  const vieux = Date.now() - 3 * HEURE
  writeFileSync(
    join(d, 'limiteurs.json'),
    JSON.stringify({ version: 1, limiteurs: { x: { a: [vieux] }, disparu: { b: [Date.now()] } } })
  )
  const r = new RegistreLimiteurs(d)
  const l = r.adopter('x', new Limiteur({ max: 1, fenetreMs: HEURE }))
  assert.equal(l.atteint('a'), false)
  r.arreter()
  const apres = JSON.parse(readFileSync(join(d, 'limiteurs.json'), 'utf8'))
  assert.deepEqual(apres.limiteurs, {}, 'ni l’ancien horodatage, ni le limiteur qui n’existe plus')
})

test('adopter deux fois le même nom est une erreur de programmation', () => {
  const r = new RegistreLimiteurs(dossier())
  r.adopter('x', new Limiteur({ max: 1, fenetreMs: HEURE }))
  assert.throws(() => r.adopter('x', new Limiteur({ max: 1, fenetreMs: HEURE })), /déjà adopté/)
})

test('une panne d’écriture ne casse rien : le comptage continue en mémoire', () => {
  const d = join(dossier(), 'inexistant', 'et-pas-creable')
  const r = new RegistreLimiteurs(d)
  const l = r.adopter('x', new Limiteur({ max: 1, fenetreMs: HEURE }))
  l.noter('a')
  const erreurs = []
  const origine = console.error
  console.error = (...a) => erreurs.push(a.join(' '))
  try {
    r.arreter()
  } finally {
    console.error = origine
  }
  assert.equal(erreurs.length, 1)
  assert.match(erreurs[0], /compteurs de limites non enregistrés/)
  assert.equal(l.atteint('a'), true)
})

// ===================================================== ce que le serveur adopte

test('les plafonds du serveur survivent à un redémarrage : inscriptions, contact, invitations, liens', () => {
  const d = dossier()
  const r1 = new RegistreLimiteurs(d)
  const a = creerLimites({ registre: r1 })
  for (let i = 0; i < 5; i++) assert.equal(a.inscriptionAutorisee('1.2.3.4'), true)
  assert.equal(a.inscriptionAutorisee('1.2.3.4'), false)
  for (let i = 0; i < 5; i++) assert.equal(a.supportAutorise('p@x.fr'), true)
  assert.equal(a.supportAutorise('p@x.fr'), false)
  for (let i = 0; i < 5; i++) assert.equal(a.invitationAutorisee(`invitant${i}@x.fr`, 'dest@x.fr'), true)
  assert.equal(a.invitationAutorisee('autre@x.fr', 'dest@x.fr'), false, 'cinq invitations pour le même destinataire')
  for (let i = 0; i < a.LIENS_PAR_ORIGINE_HEURE; i++) a.liensParOrigine.noter('9.9.9.9')
  r1.arreter()

  const b = creerLimites({ registre: new RegistreLimiteurs(d) })
  assert.equal(b.inscriptionAutorisee('1.2.3.4'), false)
  assert.equal(b.inscriptionAutorisee('5.6.7.8'), true, 'une autre origine passe')
  assert.equal(b.supportAutorise('p@x.fr'), false)
  assert.equal(b.invitationAutorisee('nouveau@x.fr', 'dest@x.fr'), false)
  assert.equal(b.liensParOrigine.atteint('9.9.9.9'), true)
})

test('les essais sur les pages publiées comptent aussi après un redémarrage', () => {
  const d = dossier()
  const req = { socket: { remoteAddress: '203.0.113.7' }, headers: {} }
  const r1 = new RegistreLimiteurs(d)
  const a = creerLimites({ registre: r1 })
  let derniere
  for (let i = 0; i < 30; i++) derniere = a.essaiPublicationAutorise(req)
  assert.equal(derniere, true, 'le trentième essai passe encore')
  r1.arreter()
  const b = creerLimites({ registre: new RegistreLimiteurs(d) })
  assert.equal(b.essaiPublicationAutorise(req), false, 'le trente et unième, après redémarrage, est refusé')
})

test('sans registre (les tests, un petit script), tout reste en mémoire', () => {
  const a = creerLimites()
  for (let i = 0; i < 5; i++) assert.equal(a.supportAutorise('p@x.fr'), true)
  assert.equal(a.supportAutorise('p@x.fr'), false)
  assert.equal(creerLimites().supportAutorise('p@x.fr'), true)
})

test('le plafond des liens de connexion par adresse est adoptable par le registre', () => {
  assert.ok(limiteurLiensParAdresse instanceof Limiteur)
  assert.equal(limiteurLiensParAdresse.max, 5)
})

test('les demandes d’IA de l’heure survivent à un redémarrage, fonction par fonction', () => {
  const d = dossier()
  const horloge = { t: Date.parse('2026-10-12T10:00:00Z') }
  const fabriquer = (registre) => {
    const reglages = new ReglagesIa(d)
    reglages.modifier({ corrections: { demandesParHeure: 2 } }, 'a')
    return new QuotasIa({
      reglages,
      usage: new UsageIa(d, { maintenant: () => horloge.t }),
      maintenant: () => horloge.t,
      registre,
    })
  }
  const tenter = (q, fonction) => {
    try {
      q.verifier({ fonction, email: 'p@x.fr', taille: 100 })
      return true
    } catch (e) {
      assert.equal(e.status, 429)
      return false
    }
  }
  const r1 = new RegistreLimiteurs(d)
  const q1 = fabriquer(r1)
  assert.equal(tenter(q1, 'corrections'), true)
  assert.equal(tenter(q1, 'corrections'), true)
  assert.equal(tenter(q1, 'corrections'), false)
  assert.equal(tenter(q1, 'margo'), true)
  r1.arreter()

  horloge.t += 10 * 60_000 // dix minutes plus tard, après le redémarrage
  const q2 = fabriquer(new RegistreLimiteurs(d))
  assert.equal(tenter(q2, 'corrections'), false, 'toujours refusé : l’heure n’est pas écoulée')
  assert.equal(q2.etat('margo', 'p@x.fr').heure.utilisees, 1, 'Margo a gardé sa propre demande')
  horloge.t += 51 * 60_000 // plus d'une heure après les deux premières
  assert.equal(tenter(q2, 'corrections'), true, 'la place se libère à l’heure d’origine')
})
