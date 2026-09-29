// La copie régulière tirée par la machine de sauvegarde (30/09/2026).
//
// Ces tests font tourner les vrais scripts de deploy/ — celui du serveur,
// celui du NAS — reliés par un faux `ssh` qui appelle directement le
// premier. On ne vérifie pas « qu'un fichier arrive » : on vérifie ce qui
// fait qu'une sauvegarde en est une — elle se déplie, elle tourne, elle
// refuse de remplacer une bonne archive par une archive tronquée, et elle
// dit quand elle échoue.
//
// Les scripts visent Debian (`find -printf`, `stat -c`, GNU) : ailleurs
// (macOS), on saute plutôt que de tester un autre `find`.

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, statSync, utimesSync, copyFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const ICI = dirname(fileURLToPath(import.meta.url))
const DEPLOY = resolve(ICI, '..', '..', 'deploy')

const gnu = spawnSync('find', ['--version'], { encoding: 'utf8' })
const SAUTER = !(gnu.status === 0 && /GNU/.test(gnu.stdout))
const opts = { skip: SAUTER ? 'les scripts de sauvegarde visent GNU/Debian' : false }

const racine = mkdtempSync(join(tmpdir(), 'amend-copie-'))
const PROD = join(racine, 'prod')
const DATA = join(PROD, 'opt', 'amend', 'data')
const APP = join(PROD, 'opt', 'amend', 'app')
const NAS = join(racine, 'nas')
mkdirSync(join(DATA, 'uploads', 'abc'), { recursive: true })
mkdirSync(APP, { recursive: true })
writeFileSync(join(DATA, 'docs.json'), '{"abc":{"title":"x"}}')
writeFileSync(join(DATA, 'abc.log'), 'journal')
writeFileSync(join(DATA, 'ecriture.tmp'), 'à moitié écrit')
writeFileSync(join(APP, '.env'), 'SESSION_SECRET=faux-pour-le-test\n')

// Le « ssh » : appelle le script du serveur avec la commande demandée.
const fauxSsh = join(racine, 'faux-ssh.sh')
writeFileSync(
  fauxSsh,
  `#!/bin/bash
AMEND_DATA_DIR="${DATA}" AMEND_APP_DIR="${APP}" SSH_ORIGINAL_COMMAND="$2" exec bash "${join(DEPLOY, 'sauvegarde-serveur.sh')}"
`
)
chmodSync(fauxSsh, 0o755)
const conf = join(racine, 'conf')
writeFileSync(conf, `HOTE=amend@test\nDEST=${NAS}\nSSH_CMD=${fauxSsh}\n`)

function tirer(env = {}, args = []) {
  return spawnSync('bash', [join(DEPLOY, 'tirer-sauvegarde.sh'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, AMEND_SAUVEGARDE_CONF: conf, ...env },
  })
}
const liste = (d) => (existsSync(d) ? readdirSync(d).sort() : [])
const contenu = (archive) =>
  spawnSync('tar', ['tzf', archive], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean)

test('un passage tire les données et les secrets, se déplie, et signale la copie au serveur', opts, () => {
  const r = tirer()
  assert.equal(r.status, 0, r.stderr)

  const [q] = liste(join(NAS, 'quotidiennes'))
  assert.match(q, /^amend-\d{8}-\d{6}\.tar\.gz$/)
  const dedans = contenu(join(NAS, 'quotidiennes', q))
  assert.ok(dedans.includes('data/docs.json'))
  assert.ok(dedans.includes('data/abc.log'))
  assert.ok(dedans.includes('data/uploads/abc/'))
  assert.ok(!dedans.some((n) => n.endsWith('.tmp')), 'un fichier temporaire n’a rien à faire dans une sauvegarde')

  // Les secrets sont à part, dans un dossier fermé.
  const [sec] = liste(join(NAS, 'secrets'))
  assert.ok(contenu(join(NAS, 'secrets', sec)).some((n) => n.endsWith('/.env')))
  assert.equal(statSync(join(NAS, 'secrets')).mode & 0o777, 0o700)
  assert.equal(statSync(join(NAS, 'secrets', sec)).mode & 0o777, 0o600)
  // …et jamais mêlés aux données.
  assert.ok(!dedans.some((n) => n.endsWith('.env')))

  // Le serveur a été prévenu (le back-office l’affichera).
  const signal = JSON.parse(readFileSync(join(DATA, 'sauvegarde-distante.json'), 'utf8'))
  assert.ok(Math.abs(signal.ts - Date.now()) < 60_000)
  assert.ok(existsSync(join(NAS, 'dernier-succes')))
})

test('la rotation garde sept quotidiennes, et le dimanche une hebdomadaire par lien dur', opts, () => {
  const [q] = liste(join(NAS, 'quotidiennes'))
  const modele = join(NAS, 'quotidiennes', q)
  for (let i = 1; i <= 9; i++) {
    const f = join(NAS, 'quotidiennes', `amend-2026090${i}-000000.tar.gz`)
    copyFileSync(modele, f)
    const t = new Date(`2026-09-0${i}T00:00:00Z`)
    utimesSync(f, t, t)
  }
  const r = tirer({ JOUR_SEMAINE: '7' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(liste(join(NAS, 'quotidiennes')).length, 7)
  const hebdo = liste(join(NAS, 'hebdomadaires'))
  assert.equal(hebdo.length, 1)
  assert.ok(statSync(join(NAS, 'hebdomadaires', hebdo[0])).nlink >= 2, 'lien dur : elle ne coûte rien de plus')
})

test('une archive bien plus petite que la précédente est mise de côté, rien ne tourne', opts, () => {
  // Une « précédente » volumineuse et valide.
  const gros = join(racine, 'gros')
  mkdirSync(join(gros, 'data'), { recursive: true })
  writeFileSync(join(gros, 'data', 'docs.json'), '{}')
  writeFileSync(join(gros, 'data', 'x.bin'), randomBytes(400_000))
  const g = join(NAS, 'quotidiennes', 'amend-29990101-000000.tar.gz')
  assert.equal(spawnSync('tar', ['czf', g, '-C', gros, 'data']).status, 0)
  const avant = liste(join(NAS, 'quotidiennes'))

  const r = tirer()
  assert.equal(r.status, 1)
  assert.match(r.stderr, /gardée en .*\.suspecte/)
  const apres = liste(join(NAS, 'quotidiennes'))
  assert.equal(apres.filter((n) => n.endsWith('.suspecte')).length, 1)
  assert.deepEqual(apres.filter((n) => n.endsWith('.tar.gz')), avant, 'aucune archive supprimée ni ajoutée')
  assert.ok(existsSync(join(NAS, 'dernier-echec')))
  rmSync(g)
  for (const n of apres.filter((n) => n.endsWith('.suspecte'))) rmSync(join(NAS, 'quotidiennes', n))
})

test('une connexion qui échoue est tracée et ne touche à aucune sauvegarde', opts, () => {
  const avant = liste(join(NAS, 'quotidiennes'))
  const cassee = join(racine, 'conf-cassee')
  writeFileSync(cassee, `HOTE=amend@test\nDEST=${NAS}\nSSH_CMD=false\n`)
  const r = tirer({ AMEND_SAUVEGARDE_CONF: cassee })
  assert.equal(r.status, 1)
  assert.match(readFileSync(join(NAS, 'dernier-echec'), 'utf8'), /connexion ou la commande a échoué/)
  assert.deepEqual(liste(join(NAS, 'quotidiennes')), avant)
})

test('la commande « age » échoue quand la dernière sauvegarde a plus de 36 heures', opts, () => {
  assert.equal(tirer({}, ['age']).status, 0)
  for (const n of liste(join(NAS, 'quotidiennes'))) {
    const vieux = new Date(Date.now() - 40 * 3600 * 1000)
    utimesSync(join(NAS, 'quotidiennes', n), vieux, vieux)
  }
  assert.equal(tirer({}, ['age']).status, 1)
})

test('le script du serveur refuse tout ce qui n’est pas l’une de ses commandes', opts, () => {
  for (const cmd of ['bash', 'rm -rf /', 'donnees; id', '']) {
    const r = spawnSync('bash', [join(DEPLOY, 'sauvegarde-serveur.sh')], {
      encoding: 'utf8',
      env: { ...process.env, AMEND_DATA_DIR: DATA, AMEND_APP_DIR: APP, SSH_ORIGINAL_COMMAND: cmd },
    })
    assert.equal(r.status, 2, `« ${cmd} » devrait être refusé`)
    assert.equal(r.stdout, '')
  }
})

test.after(() => {
  rmSync(racine, { recursive: true, force: true })
})
