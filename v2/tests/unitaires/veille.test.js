// T1 : la veille de la production (exploitation/prod/veiller.sh) et le masquage des alertes
// (alerter.sh), joués pour de vrai avec de faux `systemctl`, `journalctl` et `curl` : un incident
// ne donne qu'un courriel, puis un « rétabli » ; un redémarrage seul est signalé, pas celui d'un
// déploiement ; aucun secret ne part dans une alerte (audit du 16/11/2026, reste du lot E).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PROD = fileURLToPath(new URL('../../exploitation/prod/', import.meta.url))

/** Un faux VPS : état des services dans des fichiers, alertes notées dans `alertes.txt`. */
function fauxVps(t) {
  const d = mkdtempSync(join(tmpdir(), 'veille-'))
  // Nettoyé même si une assertion échoue.
  t.after(() => rmSync(d, { recursive: true, force: true }))
  const bin = join(d, 'bin')
  mkdirSync(bin)
  mkdirSync(join(d, 'sauvegarde'))
  const script = (nom, corps) => {
    writeFileSync(join(bin, nom), `#!/bin/bash\n${corps}\n`)
    chmodSync(join(bin, nom), 0o755)
  }
  // systemctl : is-active [--quiet] S ; is-failed --quiet S ; show -p X --value S.
  script(
    'systemctl',
    `F=${d}
s="\${@: -1}"
case "$1" in
  is-active) if [[ -e "$F/inactif-$s" ]]; then [[ "$2" == --quiet ]] || echo inactive; exit 3; fi; [[ "$2" == --quiet ]] || echo active; exit 0 ;;
  is-failed) exit 1 ;;
  show) if [[ "$3" == NRestarts ]]; then cat "$F/redemarrages-$s" 2>/dev/null || echo 0; else echo success; fi ;;
esac`,
  )
  script('journalctl', 'exit 0')
  script('curl', `[[ -e ${d}/site-en-panne ]] && exit 22; exit 0`)
  script('alerter', `echo "$1" >> ${d}/alertes.txt`)
  writeFileSync(join(d, 'v2.env'), 'V2_ADRESSE=https://exemple.invalid\n')
  writeFileSync(join(d, 'sauvegarde', 'derniere-sauvegarde.txt'), new Date().toISOString() + '\n')
  const passer = (env = {}) => {
    const r = spawnSync('bash', [join(PROD, 'veiller.sh')], {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        V2_ENV: join(d, 'v2.env'),
        V2_VEILLE: join(d, 'veille'),
        V2_SAUVEGARDE: join(d, 'sauvegarde'),
        V2_ALERTER: join(bin, 'alerter'),
        ...env,
      },
      encoding: 'utf8',
    })
    assert.equal(r.status, 0, 'la veille ne fait jamais échouer ce qui l’appelle')
  }
  /** Les alertes envoyées depuis le dernier appel. */
  const alertes = () => {
    const f = join(d, 'alertes.txt')
    const lues = existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean) : []
    rmSync(f, { force: true })
    return lues
  }
  return {
    d,
    passer,
    alertes,
    poser: (nom, contenu = '') => writeFileSync(join(d, nom), contenu),
    oter: (nom) => rmSync(join(d, nom), { force: true }),
  }
}

test('veille : au premier passage, un seul courriel « en place » ; ensuite, le silence quand tout va bien', (t) => {
  const v = fauxVps(t)
  v.passer()
  assert.deepEqual(v.alertes(), ['la veille est en place'])
  v.passer()
  assert.deepEqual(v.alertes(), [])
})

test('veille : un service arrêté donne un courriel, un seul, puis un « rétabli »', (t) => {
  const v = fauxVps(t)
  v.passer()
  v.alertes()
  v.poser('inactif-amend-v2')
  v.passer()
  assert.deepEqual(v.alertes(), ['le service amend-v2 ne tourne pas'])
  v.passer()
  assert.deepEqual(v.alertes(), [], 'pas de second courriel tant que l’incident dure')
  v.oter('inactif-amend-v2')
  v.passer()
  assert.deepEqual(v.alertes(), ['rétabli : le service amend-v2 tourne de nouveau'])
})

test('veille : un redémarrage seul est signalé ; celui d’un déploiement ne l’est pas', (t) => {
  const v = fauxVps(t)
  v.passer()
  v.alertes()
  v.poser('redemarrages-amend-v2-collab', '1\n')
  v.passer()
  assert.deepEqual(v.alertes(), ['le service amend-v2-collab a redémarré tout seul'])
  v.poser('redemarrages-amend-v2-collab', '2\n')
  v.passer({ AMEND_VEILLE_DEPLOYE: '1' })
  assert.deepEqual(v.alertes(), [], 'le passage qui déploie relève le compteur sans comparer')
  v.passer()
  assert.deepEqual(v.alertes(), [], 'compteur inchangé depuis')
})

test('veille : l’application qui ne répond pas est signalée au deuxième passage de suite, puis « rétabli »', (t) => {
  const v = fauxVps(t)
  v.passer()
  v.alertes()
  v.poser('site-en-panne')
  v.passer()
  assert.deepEqual(v.alertes(), [], 'un seul échec ne prévient pas')
  v.passer()
  assert.deepEqual(v.alertes(), ['l’application de la v2 ne répond pas'])
  v.oter('site-en-panne')
  v.passer()
  assert.deepEqual(v.alertes(), ['rétabli : l’application de la v2 répond de nouveau'])
})

test('veille : une sauvegarde trop vieille est signalée', (t) => {
  const v = fauxVps(t)
  v.passer()
  v.alertes()
  v.poser('sauvegarde/derniere-sauvegarde.txt', new Date(Date.now() - 30 * 3600_000).toISOString() + '\n')
  v.passer()
  assert.deepEqual(v.alertes(), ['la sauvegarde de la base est absente ou trop vieille'])
})

test('alerte : la clé de Mailgun et les adresses de bases n’apparaissent jamais, même au journal', (t) => {
  const d = mkdtempSync(join(tmpdir(), 'alerte-'))
  t.after(() => rmSync(d, { recursive: true, force: true }))
  // Une clé sans domaine : l'alerte ne part pas, elle est écrite au journal (stderr), masquée.
  writeFileSync(join(d, 'v2.env'), 'V2_MAILGUN_CLE=cle-tres-secrete-123\n')
  const r = spawnSync(
    'bash',
    [
      join(PROD, 'alerter.sh'),
      'essai',
      'clé cle-tres-secrete-123 ; base postgres://amend:motdepasse@127.0.0.1/x et redis://:secret@127.0.0.1',
    ],
    { env: { ...process.env, V2_ENV: join(d, 'v2.env') }, encoding: 'utf8' },
  )
  assert.equal(r.status, 0)
  assert.doesNotMatch(r.stderr, /cle-tres-secrete-123|motdepasse|:secret@/)
  assert.match(r.stderr, /postgres:\/\/\*\*\*/)
})
