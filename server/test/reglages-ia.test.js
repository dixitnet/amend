// Réglages d'IA, compteurs mensuels et vérification commune : les règles, sans serveur (13/10/2026).

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAUTS, MANIERE_MARGO_DEFAUT, ReglagesIa } from '../reglagesIa.js'
import { garde } from '../garde-fous.js'
import { UsageIa, coutUsd, moisDe, moisSuivant } from '../usageIa.js'
import { QuotasIa, accesIa, signes } from '../quotasIa.js'

const dossier = () => mkdtempSync(join(tmpdir(), 'collabtext-test-reglages-ia-'))

test('sans fichier : les valeurs par défaut ; un fichier abîmé ou aux valeurs absurdes y retombe champ par champ', () => {
  const d = dossier()
  assert.deepEqual(new ReglagesIa(d).de('corrections'), DEFAUTS.corrections)
  writeFileSync(
    join(d, 'reglages-ia.json'),
    JSON.stringify({
      corrections: { modele: 'claude-opus-5', signesParDemande: 5000, demandesParHeure: -3, acces: 'tous' },
      margo: 'x',
    })
  )
  const r = new ReglagesIa(d)
  assert.equal(r.de('corrections').modele, DEFAUTS.corrections.modele)
  assert.equal(r.de('corrections').signesParDemande, 5000, 'la valeur valable est gardée')
  assert.equal(r.de('corrections').demandesParHeure, DEFAUTS.corrections.demandesParHeure)
  assert.equal(r.de('corrections').acces, 'editeur')
  assert.deepEqual(r.de('margo'), DEFAUTS.margo)
  writeFileSync(join(d, 'reglages-ia.json'), '{ pas du json')
  assert.deepEqual(new ReglagesIa(d).de('margo'), DEFAUTS.margo)
})

test('une modification est écrite sur le disque et relue au redémarrage', () => {
  const d = dossier()
  const r = new ReglagesIa(d, { maintenant: () => 42 })
  r.modifier({ margo: { modele: 'claude-haiku-5-5', signesParMois: 12_345 } }, 'admin@x.fr')
  const relu = new ReglagesIa(d)
  assert.equal(relu.de('margo').modele, 'claude-haiku-5-5')
  assert.equal(relu.de('margo').signesParMois, 12_345)
  assert.equal(relu.tous().modifiePar, 'admin@x.fr')
  assert.equal(JSON.parse(readFileSync(join(d, 'reglages-ia.json'), 'utf8')).modifieLe, 42)
})

test('le mois civil se compte à l’heure de Paris, et change le 1er à minuit là-bas', () => {
  assert.equal(moisDe(Date.parse('2026-10-31T22:59:00Z')), '2026-10') // 23 h 59 à Paris
  assert.equal(moisDe(Date.parse('2026-10-31T23:00:00Z')), '2026-11') // minuit à Paris
  assert.equal(moisSuivant('2026-12'), '2027-01')
  assert.equal(moisSuivant('2026-10'), '2026-11')
})

test('les signes ne comptent que pour les demandes réussies ; les jetons toujours ; un nouveau mois repart à zéro', () => {
  const d = dossier()
  const horloge = { t: Date.parse('2026-10-12T10:00:00Z') }
  const u = new UsageIa(d, { maintenant: () => horloge.t })
  u.enregistrer({
    email: 'A@X.fr',
    fonction: 'corrections',
    modele: 'claude-haiku-5-5',
    succes: true,
    signes: 500,
    jetons: { entree: 100, sortie: 20 },
  })
  u.enregistrer({
    email: 'a@x.fr',
    fonction: 'corrections',
    modele: 'claude-haiku-5-5',
    succes: false,
    signes: 900,
    jetons: { entree: 40, sortie: 0 },
  })
  assert.equal(u.signesDuMois('a@x.fr', 'corrections'), 500, 'adresse insensible à la casse, l’échec ne compte pas')
  const detail = u.detail()
  assert.equal(detail.utilisateurs[0].corrections.echecs, 1)
  assert.equal(detail.utilisateurs[0].corrections.entree, 140)
  assert.equal(detail.modeles['claude-haiku-5-5'].appels, 2)

  // Relu depuis le disque.
  assert.equal(new UsageIa(d, { maintenant: () => horloge.t }).signesDuMois('a@x.fr', 'corrections'), 500)
  // Le mois suivant.
  horloge.t = Date.parse('2026-11-01T09:00:00Z')
  assert.equal(u.signesDuMois('a@x.fr', 'corrections'), 0)
  assert.deepEqual(u.moisDisponibles(), ['2026-10'])
  assert.equal(u.signesDuMois('a@x.fr', 'corrections', '2026-10'), 500)
})

test('le coût estimé tient compte du cache (lecture au dixième, écriture à 1,25)', () => {
  assert.equal(coutUsd('claude-sonnet-5-5', { entree: 1e6, sortie: 0, cacheLu: 0, cacheEcrit: 0 }), 2)
  assert.equal(coutUsd('claude-sonnet-5-5', { entree: 0, sortie: 1e6 }), 10)
  assert.ok(Math.abs(coutUsd('claude-sonnet-5-5', { cacheLu: 1e6 }) - 0.2) < 1e-9)
  assert.ok(Math.abs(coutUsd('claude-sonnet-5-5', { cacheEcrit: 1e6 }) - 2.5) < 1e-9)
  assert.equal(coutUsd('modele-inconnu', { entree: 1e6 }), 0)
})

test('le tableau des accès : un niveau minimal, jamais un lecteur ni quelqu’un sans rôle', () => {
  const cas = [
    // niveau, personne, attendu
    ['admin', { admin: true, role: 'editeur' }, true],
    ['admin', { admin: true, role: 'lecteur' }, false],
    ['admin', { admin: true, role: null }, false],
    ['admin', { admin: false, role: 'editeur' }, false],
    ['editeur', { admin: false, role: 'editeur' }, true],
    ['editeur', { admin: true, role: 'correcteur' }, true],
    ['editeur', { admin: false, role: 'correcteur' }, false],
    ['correcteur', { admin: false, role: 'correcteur' }, true],
    ['correcteur', { admin: false, role: 'editeur' }, true],
    ['correcteur', { admin: false, role: 'lecteur' }, false],
    ['correcteur', { admin: true, role: null }, false],
    ['inconnu', { admin: true, role: 'editeur' }, false],
  ]
  for (const [niveau, personne, attendu] of cas)
    assert.equal(accesIa(niveau, personne), attendu, `${niveau} ${JSON.stringify(personne)}`)
})

test('la vérification commune dit la règle en signes et l’heure où une place se libère', () => {
  const d = dossier()
  const horloge = { t: Date.parse('2026-10-12T10:00:00Z') }
  const reglages = new ReglagesIa(d)
  reglages.modifier({ corrections: { signesParDemande: 1000, demandesParHeure: 1, signesParMois: 2000 } }, 'a')
  const usage = new UsageIa(d, { maintenant: () => horloge.t })
  const q = new QuotasIa({ reglages, usage, maintenant: () => horloge.t })
  const ex = (taille) => {
    try {
      q.verifier({ fonction: 'corrections', email: 'p@x.fr', taille })
      return null
    } catch (e) {
      return e
    }
  }
  assert.equal(ex(1001).status, 413)
  assert.match(ex(1001).message, /1 001 signes/)
  assert.equal(ex(500), null)
  const heure = ex(10)
  assert.equal(heure.status, 429)
  assert.match(heure.message, /1 demande par heure\. Une place se libère à 1\d h 00/)
  horloge.t += 3601_000
  usage.enregistrer({
    email: 'p@x.fr',
    fonction: 'corrections',
    modele: 'claude-haiku-5-5',
    succes: true,
    signes: 1900,
  })
  const mois = ex(200)
  assert.equal(mois.status, 429)
  assert.match(mois.message, /100 signes/)
  assert.equal(signes(1), '1 signe')
})

test('la manière de répondre de Margo : un texte libre, par instance, borné ; Corrections IA n’en a pas', () => {
  const d = dossier()
  const r = new ReglagesIa(d)
  assert.equal(r.de('margo').maniere, MANIERE_MARGO_DEFAUT)
  assert.match(MANIERE_MARGO_DEFAUT, /vouvoies/)
  assert.ok(MANIERE_MARGO_DEFAUT.length < garde('maniereSignes'), 'le texte livré tient dans la limite')
  assert.equal('maniere' in r.de('corrections'), false)

  r.modifier({ margo: { maniere: '  Sois bref.\r\nVouvoie.  ' } }, 'a@x.fr')
  assert.equal(r.de('margo').maniere, 'Sois bref.\nVouvoie.', 'espaces de bord ôtés, fins de ligne unifiées')
  assert.equal(new ReglagesIa(d).de('margo').maniere, 'Sois bref.\nVouvoie.', 'relu du disque')
  r.modifier({ margo: { maniere: '' } }, 'a@x.fr')
  assert.equal(r.de('margo').maniere, '', 'vide est permis : plus de consigne de style')

  assert.throws(() => r.modifier({ margo: { maniere: 'x'.repeat(garde('maniereSignes') + 1) } }, 'a'), /trop longue/)
  assert.throws(() => r.modifier({ margo: { maniere: 42 } }, 'a'), /doit être un texte/)
  assert.throws(() => r.modifier({ corrections: { maniere: 'x' } }, 'a'), /réglage inconnu/)
  assert.equal(r.de('margo').maniere, '', 'un refus n’applique rien')

  // Un fichier aux valeurs absurdes retombe sur le défaut, champ par champ.
  writeFileSync(
    join(d, 'reglages-ia.json'),
    JSON.stringify({ margo: { maniere: 'x'.repeat(garde('maniereSignes') + 5) } })
  )
  assert.equal(new ReglagesIa(d).de('margo').maniere, MANIERE_MARGO_DEFAUT)
})
