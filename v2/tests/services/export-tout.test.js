// T3 : l'export de tous les documents (exploitation/prod/exporter-tout.mjs),
// contre PostgreSQL, Redis et y/hub réels. Sans services, le fichier se
// déclare sauté. Variable EXPORT_GROS=<signes> : taille du gros document.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { preparerServices, POSTGRES, REDIS } from '../../exploitation/dev/pile.mjs'
import { ouvrirComptes } from '../../adaptateurs/postgres/comptes.js'
import { demarrerCollaboration } from '../../adaptateurs/yhub/index.js'
import { clientCollaboration } from '../../adaptateurs/yhub/client.js'
import { ecrireBlocs, lireBlocs, texteDesBlocs } from '../../adaptateurs/blocknote/serveur.js'

const joignable = (port) =>
  new Promise((r) => {
    const s = net.connect(port, '127.0.0.1')
    s.on('connect', () => (s.destroy(), r(true)))
    s.on('error', () => r(false))
  })
const SCRIPT = join(import.meta.dirname, '../../exploitation/prod/exporter-tout.mjs')
const JETON = 'jeton-interne-de-test-export'
const PORT_COLLAB = 4521
const GROS = Number(process.env.EXPORT_GROS || 60000)
let raisonSaut = null
let comptes, collab, interne, dossier
let proprietaire

before(async () => {
  try {
    preparerServices()
  } catch (e) {
    raisonSaut = `services indisponibles : ${e.message.slice(0, 120)}`
    return
  }
  if (!(await joignable(5432)) || !(await joignable(6379))) {
    raisonSaut = 'PostgreSQL ou Redis injoignable'
    return
  }
  comptes = await ouvrirComptes(POSTGRES)
  collab = await demarrerCollaboration({
    port: PORT_COLLAB,
    redis: REDIS,
    postgres: POSTGRES,
    origines: [],
    delaiPersistance: 300,
    jetonInterne: JETON,
    identifier: async () => null,
    droits: async () => null,
  })
  interne = clientCollaboration({ url: `http://127.0.0.1:${PORT_COLLAB}/collaboration`, jeton: JETON })
  dossier = await mkdtemp(join(tmpdir(), 'export-tout-'))
  const courriel = `export-${randomUUID().slice(0, 8)}@essai.amend.invalid`
  proprietaire = await comptes.personneOuNouvelle(courriel)
})
after(async () => {
  await collab?.fermer()
  await comptes?.fermer()
  if (dossier) await rm(dossier, { recursive: true, force: true })
})

const t3 = (nom, f) => test(nom, (t) => (raisonSaut ? t.skip(raisonSaut) : f(t)))

// Asynchrone : le serveur de collaboration tourne dans ce processus.
function lancer(env = {}, exportDir = join(dossier, 'export')) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ['--max-old-space-size=256', SCRIPT], {
      env: {
        PATH: process.env.PATH,
        V2_POSTGRES: POSTGRES,
        V2_JETON_INTERNE: JETON,
        V2_COLLAB_API: `http://127.0.0.1:${PORT_COLLAB}/collaboration`,
        V2_EXPORT: exportDir,
        ...env,
      },
    })
    let sortie = ''
    let erreur = ''
    p.stdout.on('data', (d) => (sortie += d))
    p.stderr.on('data', (d) => (erreur += d))
    p.on('close', (code) => resolve({ code, sortie, erreur }))
  })
}

t3('export : blocs, texte brut, index, document vide, corbeille, accents en NFC, mémoire', async () => {
  const id = (n) => `t3-export-${Date.now().toString(36)}-${n}`
  const [livre, vide, corbeille, gros] = [id('livre'), id('vide'), id('corbeille'), id('gros')]
  // Le titre est en NFD : l'export doit le rendre en NFC.
  const titreNfd = 'Été à la mer'
  const pers = proprietaire
  for (const [d, titre] of [
    [livre, titreNfd],
    [vide, 'Jamais écrit'],
    [corbeille, 'À la corbeille'],
    [gros, 'Un gros livre'],
  ])
    await comptes.creerDocument(d, pers.id, titre)
  const BLOCS = [
    { id: 'b1', type: 'heading', props: { level: 1 }, content: 'Chapitre premier' },
    { id: 'b2', type: 'paragraph', content: 'Les enfants jouent dans la cour, où l’été s’attarde. Œuvre déjà là.' },
    // « e » + accent combinant (NFD) : doit ressortir précomposé.
    { id: 'b3', type: 'paragraph', content: 'café noir' },
    { id: 'b4', type: 'bulletListItem', content: 'premier point' },
    { id: 'b5', type: 'bulletListItem', content: 'second point' },
    {
      id: 'b6',
      type: 'table',
      content: {
        type: 'tableContent',
        rows: [{ cells: ['Nom', 'Âge'] }, { cells: ['Zoé', '8'] }],
      },
    },
  ]
  await interne.ecrireTexte(livre, ecrireBlocs(BLOCS), pers.id)
  await interne.ecrireTexte(
    corbeille,
    ecrireBlocs([{ id: 'c1', type: 'paragraph', content: 'Supprimé mais gardé.' }]),
    pers.id,
  )
  await interne.mettreALaCorbeille(corbeille)
  await comptes.mettreALaCorbeille(corbeille, true)
  // Un gros document : des paragraphes d'environ 1 000 signes.
  const para = 'Il faisait nuit sur la ville, et les enfants dormaient déjà. '.repeat(17)
  const grosBlocs = Array.from({ length: Math.ceil(GROS / para.length) }, (_, i) => ({
    id: `g${i}`,
    type: 'paragraph',
    content: para,
  }))
  await interne.ecrireTexte(gros, ecrireBlocs(grosBlocs), pers.id)
  await new Promise((r) => setTimeout(r, 800))

  const r = await lancer()
  assert.equal(r.code, 0, r.erreur)
  assert.match(r.sortie, /✓ export des documents : \d+ exporté\(s\), \d+ en erreur/)
  // Rien du contenu dans les journaux.
  assert.doesNotMatch(r.sortie + r.erreur, /Chapitre|cafe|Zoé|Éte|mer/)
  console.log('   ', r.sortie.trim())

  const dir = join(dossier, 'export')
  const index = JSON.parse(await readFile(join(dir, 'index.json'), 'utf8'))
  assert.ok(Date.parse(index.exporteLe) > 0)
  const par = Object.fromEntries(index.documents.map((d) => [d.id, d]))
  for (const d of [livre, vide, corbeille, gros]) assert.ok(par[d], `${d} dans l'index`)
  assert.equal(par[livre].titre, 'Été à la mer', 'titre en NFC')
  assert.equal(par[livre].titre, par[livre].titre.normalize('NFC'))
  assert.equal(par[corbeille].supprimeLe !== null, true)
  assert.equal(par[vide].erreur, undefined, 'un document vide n’est pas une erreur')
  assert.equal(par[vide].signes, 0)
  assert.equal(par[livre].proprietaires.length, 1)

  const fiche = JSON.parse(await readFile(join(dir, `${livre}.json`), 'utf8'))
  assert.equal(fiche.id, livre)
  assert.equal(fiche.titre, 'Été à la mer')
  // Relisible par BlockNote seul : on le réécrit en Yjs sans erreur.
  assert.doesNotThrow(() => ecrireBlocs(fiche.blocs))
  assert.deepEqual(texteDesBlocs(lireBlocs(ecrireBlocs(fiche.blocs))), texteDesBlocs(fiche.blocs))
  const txt = await readFile(join(dir, `${livre}.txt`), 'utf8')
  assert.equal(
    txt,
    [
      'Chapitre premier',
      'Les enfants jouent dans la cour, où l’été s’attarde. Œuvre déjà là.',
      'café noir',
      'premier point',
      'second point',
      'Nom\tÂge',
      'Zoé\t8',
    ].join('\n'),
  )
  assert.equal(txt, txt.normalize('NFC'))
  assert.equal(par[livre].signes, txt.length)
  assert.equal(await readFile(join(dir, `${vide}.txt`), 'utf8'), '')
  assert.equal(JSON.parse(await readFile(join(dir, `${vide}.json`), 'utf8')).blocs.length, 0)
  assert.equal(par[corbeille].erreur, 'corbeille-non-exportee') // y/hub refuse de la rendre
  await assert.rejects(access(join(dir, `${corbeille}.txt`)))
  assert.ok(par[gros].signes >= GROS - para.length)
  const m = r.sortie.match(/(\d+) Mo/)
  console.log(`    gros document : ${par[gros].signes} signes ; mémoire maximale du processus : ${m?.[1]} Mo`)

  // Pas de reste temporaire à côté de l'export.
  assert.deepEqual((await readdir(dossier)).sort(), ['export'])

  // Un second passage remplace le premier ; un document illisible est noté sans arrêter l'export.
  const r2 = await lancer()
  assert.equal(r2.code, 0, r2.erreur)
  assert.deepEqual((await readdir(dossier)).sort(), ['export'])
})

t3('export : y/hub injoignable, rien d’exportable → code non nul, export précédent gardé', async () => {
  const dir = join(dossier, 'garde')
  assert.equal((await lancer({}, dir)).code, 0)
  const avant = await readFile(join(dir, 'index.json'), 'utf8')
  const r = await lancer({ V2_COLLAB_API: 'http://127.0.0.1:1/collaboration' }, dir)
  assert.equal(r.code, 4)
  assert.equal(await readFile(join(dir, 'index.json'), 'utf8'), avant)
  assert.deepEqual(
    (await readdir(dossier)).filter((n) => n.endsWith('.tmp')),
    [],
  )
})

t3('export : base injoignable → code 3 ; variables absentes → code 2', async () => {
  assert.equal((await lancer({ V2_POSTGRES: 'postgres://x:y@127.0.0.1:1/z' })).code, 3)
  assert.equal((await lancer({ V2_JETON_INTERNE: '' })).code, 2)
  await assert.rejects(access(join(dossier, 'export.tmp')))
})
