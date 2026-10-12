// Les versions enregistrées (23/09/2026, voir
// claude/conception-compactage-versions.md).
//
// Ce qui est vérifié ici tient en une phrase : **compacter ne doit plus
// effacer le passé**. Jusqu'au 23/09, l'historique reconstruisait une
// version en rejouant les n premières opérations du journal, et le
// compactage remplaçait justement ces n opérations par un instantané —
// après quoi tout ce qui précédait était irrécupérable.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Versions, aSupprimer } from '../versions.js'

const dataDir = mkdtempSync(join(tmpdir(), 'collabtext-test-versions-'))
process.on('exit', () => rmSync(dataDir, { recursive: true, force: true }))

const octets = (n, remplissage = 7) => Buffer.alloc(n, remplissage)

test('un instantané enregistré se relit tel quel', () => {
  const v = new Versions(dataDir)
  const contenu = octets(64, 3)
  const fiche = v.enregistrer('doc-a', contenu, { ts: 1000, origine: 'compactage' })
  assert.equal(fiche.ts, 1000)
  assert.deepEqual(v.lire('doc-a', 1000), contenu, 'octet pour octet')
})

test('les versions se listent de la plus récente à la plus ancienne', () => {
  const v = new Versions(dataDir)
  v.enregistrer('doc-b', octets(10), { ts: 100 })
  v.enregistrer('doc-b', octets(20), { ts: 300 })
  v.enregistrer('doc-b', octets(30), { ts: 200 })
  assert.deepEqual(v.lister('doc-b').map((x) => x.ts), [300, 200, 100])
  assert.equal(v.lister('doc-b')[0].octets, 20)
  assert.equal(v.octets('doc-b'), 60)
})

test('chaque version dit d’où elle vient', () => {
  const v = new Versions(dataDir)
  v.enregistrer('doc-c', octets(8), { ts: 42, origine: 'compactage' })
  v.enregistrer('doc-c', octets(8), { ts: 43, origine: 'nommee', par: 'moi@example.com', nom: 'Envoi au ministère' })
  const [nommee, auto] = v.lister('doc-c')
  assert.equal(nommee.origine, 'nommee')
  assert.equal(nommee.nom, 'Envoi au ministère')
  assert.equal(nommee.par, 'moi@example.com')
  assert.equal(auto.origine, 'compactage')
})

test('un document sans version répond une liste vide, pas une erreur', () => {
  const v = new Versions(dataDir)
  assert.deepEqual(v.lister('jamais-vu'), [])
  assert.equal(v.lire('jamais-vu', 1), null)
  assert.equal(v.octets('jamais-vu'), 0)
})

test('une version dont les métadonnées manquent reste listée', () => {
  // C'est l'instantané qui compte ; le fichier jumeau n'est qu'un confort,
  // et il est écrit en « best-effort ».
  const v = new Versions(dataDir)
  v.enregistrer('doc-d', octets(16), { ts: 777 })
  rmSync(join(dataDir, 'versions', 'doc-d', '777.json'))
  const liste = v.lister('doc-d')
  assert.equal(liste.length, 1)
  assert.equal(liste[0].origine, 'inconnue')
  assert.ok(v.lire('doc-d', 777), 'et l’instantané est toujours là')
})

test('un instantané vide n’est pas une version', () => {
  const v = new Versions(dataDir)
  assert.equal(v.enregistrer('doc-e', Buffer.alloc(0)), null)
  assert.equal(v.enregistrer('doc-e', null), null)
  assert.deepEqual(v.lister('doc-e'), [])
})

test('un fichier étranger déposé dans le dossier est ignoré', () => {
  const v = new Versions(dataDir)
  v.enregistrer('doc-f', octets(8), { ts: 1 })
  writeFileSync(join(dataDir, 'versions', 'doc-f', 'notes.txt'), 'bonjour', 'utf8')
  writeFileSync(join(dataDir, 'versions', 'doc-f', 'pasunts.bin'), 'x', 'utf8')
  assert.deepEqual(v.lister('doc-f').map((x) => x.ts), [1])
})

test('rien ne traîne en .tmp après une écriture', () => {
  // L'écriture passe par un temporaire puis un renommage : une coupure
  // laisse le dossier sans version plutôt qu'avec un instantané tronqué,
  // qui serait pire que pas de version du tout.
  const v = new Versions(dataDir)
  v.enregistrer('doc-g', octets(8), { ts: 5 })
  assert.ok(existsSync(join(dataDir, 'versions', 'doc-g', '5.bin')))
  assert.ok(!existsSync(join(dataDir, 'versions', 'doc-g', '5.bin.tmp')))
  assert.equal(JSON.parse(readFileSync(join(dataDir, 'versions', 'doc-g', '5.json'), 'utf8')).ts, 5)
})

test('nommer une version existante, puis retirer son nom', () => {
  const v = new Versions(dataDir)
  v.enregistrer('doc-n', octets(8), { ts: 10, origine: 'session' })
  assert.equal(v.renommer('doc-n', 10, 'Dépôt').nom, 'Dépôt')
  assert.equal(v.lister('doc-n')[0].nom, 'Dépôt')
  assert.equal(v.lister('doc-n')[0].origine, 'session', 'l’origine ne change pas')
  assert.equal(v.renommer('doc-n', 10, null).nom, null)
  assert.equal(v.renommer('doc-n', 11, 'x'), null, 'une version inconnue ne se nomme pas')
})

test('supprimer une version retire l’instantané et sa fiche', () => {
  const v = new Versions(dataDir)
  v.enregistrer('doc-s', octets(8), { ts: 5 })
  assert.equal(v.supprimer('doc-s', 5), true)
  assert.equal(v.lire('doc-s', 5), null)
  assert.deepEqual(v.lister('doc-s'), [])
  assert.equal(v.supprimer('doc-s', 5), false)
})

test('deux versions dans la même milliseconde ne s’écrasent pas', () => {
  const v = new Versions(dataDir)
  const a = v.enregistrer('doc-m', octets(8, 1), { ts: 77 })
  const b = v.enregistrer('doc-m', octets(8, 2), { ts: 77 })
  assert.notEqual(a.ts, b.ts)
  assert.equal(v.lister('doc-m').length, 2)
  assert.deepEqual(v.lire('doc-m', 77), octets(8, 1))
})

const JOUR = 24 * 3600 * 1000
const MAINTENANT = Date.UTC(2026, 9, 11, 12)
const il_y_a = (jours, heures = 0) => MAINTENANT - jours * JOUR - heures * 3600 * 1000
const fiche = (ts, extra = {}) => ({ ts, nom: null, origine: 'session', ...extra })

test('l’amincissement garde tout pendant trois jours', () => {
  const vs = [fiche(il_y_a(0, 1)), fiche(il_y_a(0, 2)), fiche(il_y_a(1)), fiche(il_y_a(2, 5))]
  assert.deepEqual(aSupprimer(vs, MAINTENANT), [])
})

test('puis une par jour jusqu’à trente jours, une par semaine jusqu’à un an, rien au-delà', () => {
  // Deux versions le même jour (il y a 10 jours) : la plus récente reste.
  const jour = [fiche(il_y_a(10, 1)), fiche(il_y_a(10, 5))]
  assert.deepEqual(aSupprimer(jour, MAINTENANT), [il_y_a(10, 5)])
  // Deux versions la même semaine (il y a ~100 jours).
  const base = Math.floor(il_y_a(100) / (7 * JOUR)) * (7 * JOUR) + JOUR
  const semaine = [fiche(base + 2 * JOUR), fiche(base)]
  assert.deepEqual(aSupprimer(semaine, MAINTENANT), [base])
  assert.deepEqual(aSupprimer([fiche(il_y_a(400))], MAINTENANT), [il_y_a(400)])
})

test('une version nommée n’est jamais amincie, même très vieille', () => {
  const vs = [fiche(il_y_a(500), { nom: 'Soutenance' }), fiche(il_y_a(10, 1)), fiche(il_y_a(10, 5), { nom: 'Relu' })]
  assert.deepEqual(aSupprimer(vs, MAINTENANT), [])
})

test('élaguer supprime sur le disque ce que la règle désigne', () => {
  const v = new Versions(dataDir)
  v.enregistrer('doc-e', octets(8), { ts: il_y_a(10, 1) })
  v.enregistrer('doc-e', octets(8), { ts: il_y_a(10, 5) })
  v.enregistrer('doc-e', octets(8), { ts: il_y_a(400), nom: 'Première version' })
  v.enregistrer('doc-e', octets(8), { ts: il_y_a(1) })
  assert.equal(v.elaguer('doc-e', MAINTENANT), 1)
  assert.equal(v.lister('doc-e').length, 3)
})
