// La sauvegarde du VPS vers Proton Drive (10/10/2026, deploy/sauvegarde-vers-proton.sh).
//
// Le vrai script, avec une fausse production (data/, .env), le vrai
// sauvegarde-serveur.sh pour fabriquer les archives, et un faux « proton-drive »
// qui imite les deux commandes documentées (`filesystem upload` / `filesystem
// list`) sur un dossier local. On vérifie ce qui fait la différence entre
// « ça a tourné » et « c'est arrivé » : un fichier n'est noté envoyé que s'il se
// relit à distance, un échec ne perd rien, une archive suspecte ne part pas, et
// rien n'est supprimé sur Proton sans avoir dit comment.

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  chmodSync,
  utimesSync,
} from 'node:fs'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEPLOY = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'deploy')
const gnu = spawnSync('find', ['--version'], { encoding: 'utf8' })
const opts = {
  skip: gnu.status === 0 && /GNU/.test(gnu.stdout) ? false : 'les scripts de sauvegarde visent GNU/Debian',
}

const DISTANT = '/my-files/Sauvegardes/amend'

/** Un monde neuf : une production, un dossier de sauvegarde, un faux Proton. */
function monter({ dossiersDistants = true } = {}) {
  const racine = mkdtempSync(join(tmpdir(), 'amend-proton-'))
  const data = join(racine, 'prod', 'data')
  const app = join(racine, 'prod', 'app')
  const dest = join(racine, 'sauvegardes')
  const distant = join(racine, 'proton')
  mkdirSync(data, { recursive: true })
  mkdirSync(app, { recursive: true })
  writeFileSync(join(data, 'docs.json'), '{"docs":[]}')
  writeFileSync(join(app, '.env'), 'ANTHROPIC_API_KEY=secret\n')
  if (dossiersDistants)
    for (const n of ['quotidiennes', 'secrets']) mkdirSync(join(distant, DISTANT, n), { recursive: true })

  // Le faux CLI : upload = copie vers le « Proton » local (sauf FAUX_ECHEC),
  // list = les noms du dossier ; trace de chaque appel.
  const cli = join(racine, 'proton-drive')
  writeFileSync(
    cli,
    `#!/bin/bash
echo "$*" >> "${racine}/appels.log"
[ "$1" = "filesystem" ] || exit 2
cmd=$2; shift 2
if [ "$cmd" = "upload" ]; then
  [ -n "\${FAUX_ECHEC:-}" ] && { echo "erreur réseau" >&2; exit 1; }
  args=(); while [ $# -gt 0 ]; do case "$1" in -*) echo "Unknown option '$1'" >&2; exit 1;; *) args+=("$1"); shift;; esac; done
  n=\${#args[@]}
  dest="\${args[$((n-1))]}"
  [ -d "${distant}$dest" ] || { echo "dossier introuvable : $dest" >&2; exit 1; }
  [ -n "\${FAUX_PERTE:-}" ] && exit 0   # répond « bien » sans rien ranger
  for ((i=0; i<n-1; i++)); do cp "\${args[$i]}" "${distant}$dest/"; done
elif [ "$cmd" = "list" ]; then
  [ -d "${distant}$1" ] || { echo "dossier introuvable : $1" >&2; exit 1; }
  ls "${distant}$1"
fi
`
  )
  chmodSync(cli, 0o755)
  // Le faux « supprimer » : retire le fichier distant.
  const rm = join(racine, 'faux-rm')
  writeFileSync(rm, `#!/bin/bash\necho "rm $*" >> "${racine}/appels.log"\nrm -f "${distant}$1"\n`)
  chmodSync(rm, 0o755)

  // Un serveur de fabrication qui échoue pour les secrets (FAUX_SANS_SECRETS).
  const serveur = join(racine, 'serveur.sh')
  writeFileSync(
    serveur,
    `#!/bin/bash\nif [ "$1" = secrets ] && [ -n "\${FAUX_SANS_SECRETS:-}" ]; then echo "boum" >&2; exit 3; fi\nexec bash "${join(DEPLOY, 'sauvegarde-serveur.sh')}" "$@"\n`
  )

  const conf = join(racine, 'conf')
  const ecrireConf = (extra = '') =>
    writeFileSync(conf, `DEST=${dest}\nPROTON_CLI=${cli}\nPROTON_DEST=${DISTANT}\n${extra}`)
  ecrireConf()
  return {
    racine,
    data,
    app,
    dest,
    distant,
    cli,
    rm,
    ecrireConf,
    lancer(args = [], env = {}) {
      return spawnSync('bash', [join(DEPLOY, 'sauvegarde-vers-proton.sh'), ...args], {
        encoding: 'utf8',
        env: {
          ...process.env,
          AMEND_PROTON_CONF: conf,
          AMEND_DATA_DIR: data,
          AMEND_APP_DIR: app,
          SAUVEGARDE_SERVEUR: serveur,
          ...env,
        },
      })
    },
    distantes: (n) => readdirSync(join(distant, DISTANT, n)).sort(),
    locales: (n) => (existsSync(join(dest, n)) ? readdirSync(join(dest, n)).sort() : []),
    appels: () =>
      existsSync(join(racine, 'appels.log'))
        ? readFileSync(join(racine, 'appels.log'), 'utf8').split('\n').filter(Boolean)
        : [],
    envois: () =>
      existsSync(join(racine, 'appels.log'))
        ? readFileSync(join(racine, 'appels.log'), 'utf8')
            .split('\n')
            .filter((l) => l.startsWith('filesystem upload'))
        : [],
    registre: () => readFileSync(join(dest, 'proton-envoye.txt'), 'utf8').split('\n').filter(Boolean).sort(),
  }
}

test(
  'un premier passage fabrique données et secrets, les envoie, relit le dossier distant, et le dit au back-office',
  opts,
  () => {
    const m = monter()
    const r = m.lancer([], { HORODATAGE: '20261009-041500' })
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(m.distantes('quotidiennes'), ['amend-20261009-041500.tar.gz'])
    assert.deepEqual(m.distantes('secrets'), ['amend-secrets-20261009-041500.tar.gz'])
    // Aucune option passée au CLI : la 0.9.0 refuse `--conflict-strategy`.
    assert.ok(
      m.envois().every((l) => !/ --/.test(l)),
      m.envois().join('\n')
    )
    assert.deepEqual(m.registre(), [
      'quotidiennes/amend-20261009-041500.tar.gz',
      'secrets/amend-secrets-20261009-041500.tar.gz',
    ])
    assert.ok(existsSync(join(m.dest, 'dernier-succes-proton')))
    assert.ok(!existsSync(join(m.dest, 'dernier-echec-proton')))
    // Les archives envoyées sont de vraies archives, avec ce qu'il faut dedans.
    const liste = spawnSync('tar', ['tzf', join(m.distant, DISTANT, 'quotidiennes', 'amend-20261009-041500.tar.gz')], {
      encoding: 'utf8',
    }).stdout
    assert.match(liste, /data\/docs\.json/)
    const secrets = spawnSync(
      'tar',
      ['tzf', join(m.distant, DISTANT, 'secrets', 'amend-secrets-20261009-041500.tar.gz')],
      { encoding: 'utf8' }
    ).stdout
    assert.match(secrets, /\.env$/m)
    // Le back-office lit ce fichier, à côté de sauvegarde-distante.json.
    const etat = JSON.parse(readFileSync(join(m.data, 'sauvegarde-proton.json'), 'utf8'))
    assert.ok(Math.abs(etat.ts - Date.now()) < 60_000)
    assert.ok(!existsSync(join(m.data, 'sauvegarde-proton.json.tmp')))
  }
)

test('les archives et le dossier de travail ne sont lisibles que de l’utilisateur', opts, () => {
  const m = monter()
  assert.equal(m.lancer([], { HORODATAGE: '20261009-041500' }).status, 0)
  const mode = (f) => spawnSync('stat', ['-c', '%a', f], { encoding: 'utf8' }).stdout.trim()
  assert.equal(mode(m.dest), '700')
  assert.equal(mode(join(m.dest, 'secrets', 'amend-secrets-20261009-041500.tar.gz')), '600')
})

test(
  'un second passage au même horodatage ne renvoie rien ; un autre jour n’envoie que la nouvelle archive',
  opts,
  () => {
    const m = monter()
    assert.equal(m.lancer([], { HORODATAGE: '20261008-041500' }).status, 0)
    const avant = m.envois().length
    assert.equal(avant, 2) // données, puis secrets
    assert.equal(m.lancer([], { HORODATAGE: '20261008-041500' }).status, 0)
    assert.equal(m.envois().length, avant, 'rien à renvoyer')
    assert.equal(m.lancer([], { HORODATAGE: '20261009-041500' }).status, 0)
    assert.equal(m.envois().length, avant + 2)
    const dernier = m
      .envois()
      .filter((l) => l.includes('quotidiennes'))
      .pop()
    assert.match(dernier, /amend-20261009-041500\.tar\.gz/)
    assert.doesNotMatch(dernier, /amend-20261008-041500\.tar\.gz/)
    assert.deepEqual(m.distantes('quotidiennes'), ['amend-20261008-041500.tar.gz', 'amend-20261009-041500.tar.gz'])
  }
)

test('un envoi qui échoue est tracé sans rien perdre, et la nuit suivante envoie tout ce qui manque', opts, () => {
  const m = monter()
  const r = m.lancer([], { HORODATAGE: '20261008-041500', FAUX_ECHEC: '1' })
  assert.equal(r.status, 1)
  assert.match(readFileSync(join(m.dest, 'dernier-echec-proton'), 'utf8'), /l'envoi a échoué.*erreur réseau/)
  assert.ok(!existsSync(join(m.dest, 'dernier-succes-proton')))
  assert.ok(!existsSync(join(m.data, 'sauvegarde-proton.json')), 'le back-office ne doit pas croire à un succès')
  assert.deepEqual(m.locales('quotidiennes'), ['amend-20261008-041500.tar.gz'], 'l’archive est gardée ici')
  assert.deepEqual(m.distantes('quotidiennes'), [])

  assert.equal(m.lancer([], { HORODATAGE: '20261009-041500' }).status, 0)
  assert.deepEqual(m.distantes('quotidiennes'), ['amend-20261008-041500.tar.gz', 'amend-20261009-041500.tar.gz'])
  assert.deepEqual(m.distantes('secrets'), [
    'amend-secrets-20261008-041500.tar.gz',
    'amend-secrets-20261009-041500.tar.gz',
  ])
  assert.ok(!existsSync(join(m.dest, 'dernier-echec-proton')), 'le succès efface l’échec')
  assert.ok(existsSync(join(m.data, 'sauvegarde-proton.json')))
})

test('un CLI qui répond « bien » sans rien ranger n’est pas cru : rien n’est noté envoyé', opts, () => {
  const m = monter()
  const r = m.lancer([], { HORODATAGE: '20261009-041500', FAUX_PERTE: '1' })
  assert.equal(r.status, 1)
  assert.match(readFileSync(join(m.dest, 'dernier-echec-proton'), 'utf8'), /absent du dossier distant/)
  assert.deepEqual(m.registre(), [])
  assert.ok(!existsSync(join(m.dest, 'dernier-succes-proton')))
})

test('un dossier de destination qui n’existe pas dans Proton est un échec net, qui dit quoi créer', opts, () => {
  const m = monter({ dossiersDistants: false })
  const r = m.lancer([], { HORODATAGE: '20261009-041500' })
  assert.equal(r.status, 1)
  assert.match(readFileSync(join(m.dest, 'dernier-echec-proton'), 'utf8'), /dossier introuvable/)
  assert.deepEqual(m.registre(), [])
})

test(
  'les secrets qui ne se fabriquent pas ne bloquent pas l’envoi des données — mais l’échec est signalé',
  opts,
  () => {
    const m = monter()
    const r = m.lancer([], { HORODATAGE: '20261009-041500', FAUX_SANS_SECRETS: '1' })
    assert.equal(r.status, 1)
    assert.deepEqual(m.distantes('quotidiennes'), ['amend-20261009-041500.tar.gz'])
    assert.deepEqual(m.distantes('secrets'), [])
    assert.match(readFileSync(join(m.dest, 'dernier-echec-proton'), 'utf8'), /secrets : la fabrication a échoué/)
    assert.ok(!existsSync(join(m.dest, 'dernier-succes-proton')))
  }
)

test('une archive bien plus petite que la précédente est mise de côté et ne part pas', opts, () => {
  const m = monter()
  writeFileSync(join(m.data, 'gros.bin'), randomBytes(60_000))
  assert.equal(m.lancer([], { HORODATAGE: '20261008-041500' }).status, 0)
  // Le lendemain, tout le contenu a disparu (mauvais montage, disque vidé…).
  writeFileSync(join(m.data, 'gros.bin'), 'vide')
  const r = m.lancer([], { HORODATAGE: '20261009-041500' })
  assert.equal(r.status, 1)
  assert.match(readFileSync(join(m.dest, 'dernier-echec-proton'), 'utf8'), /suspecte|contre/)
  assert.ok(m.locales('quotidiennes').includes('amend-20261009-041500.tar.gz.suspecte'))
  assert.deepEqual(m.distantes('quotidiennes'), ['amend-20261008-041500.tar.gz'], 'la suspecte ne part pas')
})

test(
  'sans PROTON_RM, rien n’est jamais supprimé sur Proton ; ici, on ne garde que les deux dernières archives',
  opts,
  () => {
    const m = monter()
    for (let j = 1; j <= 9; j++) assert.equal(m.lancer([], { HORODATAGE: `2026100${j}-041500` }).status, 0)
    assert.equal(m.distantes('quotidiennes').length, 9)
    assert.equal(m.distantes('secrets').length, 9)
    assert.equal(m.appels().filter((l) => l.startsWith('rm ')).length, 0)
    assert.equal(m.locales('quotidiennes').length, 2)
    assert.equal(m.locales('secrets').length, 2)
    assert.equal(m.registre().length, 18)
  }
)

test('avec PROTON_RM, Proton garde les 7 dernières quotidiennes + 4 dimanches, et 4 jeux de secrets', opts, () => {
  const m = monter()
  m.ecrireConf(`PROTON_RM=${m.rm}\nGARDER_LOCAL=2\n`)
  // Du 20/09/2026 (un dimanche) au 09/10/2026 : 20 nuits.
  const jours = []
  for (
    let d = new Date(Date.UTC(2026, 8, 20));
    d <= new Date(Date.UTC(2026, 9, 9));
    d = new Date(d.getTime() + 86400_000)
  ) {
    jours.push(d.toISOString().slice(0, 10).replaceAll('-', ''))
  }
  assert.equal(jours.length, 20)
  for (const j of jours) assert.equal(m.lancer([], { HORODATAGE: `${j}-041500` }).status, 0, j)
  assert.deepEqual(
    m.distantes('quotidiennes').map((n) => n.slice(6, 14)),
    // dimanches 20 et 27/09, puis les 7 dernières nuits (3 à 9/10)
    ['20260920', '20260927', '20261003', '20261004', '20261005', '20261006', '20261007', '20261008', '20261009']
  )
  assert.deepEqual(
    m.distantes('secrets').map((n) => n.slice(14, 22)),
    ['20261006', '20261007', '20261008', '20261009']
  )
  // Le registre suit exactement ce qui reste à distance.
  assert.equal(m.registre().length, 9 + 4)
  assert.equal(m.locales('quotidiennes').length, 2)
})

test('une suppression distante refusée est signalée et sera retentée', opts, () => {
  const m = monter()
  const refus = join(m.racine, 'refus')
  writeFileSync(refus, '#!/bin/bash\necho "non" >&2\nexit 1\n')
  chmodSync(refus, 0o755)
  m.ecrireConf(`PROTON_RM=${refus}\nGARDER_PROTON_SECRETS=1\n`)
  assert.equal(m.lancer([], { HORODATAGE: '20261008-041500' }).status, 0)
  const r = m.lancer([], { HORODATAGE: '20261009-041500' })
  assert.equal(r.status, 1)
  assert.match(readFileSync(join(m.dest, 'dernier-echec-proton'), 'utf8'), /suppression distante refusée/)
  // L'ancien jeu de secrets reste au registre : il sera retenté.
  assert.ok(m.registre().includes('secrets/amend-secrets-20261008-041500.tar.gz'))
})

test('« age » : sans envoi réussi ou avec un envoi vieux de plus de 36 h, code 1', opts, () => {
  const m = monter()
  assert.equal(m.lancer(['age']).status, 1)
  assert.equal(m.lancer([], { HORODATAGE: '20261009-041500' }).status, 0)
  assert.equal(m.lancer(['age']).status, 0)
  const vieux = new Date(Date.now() - 40 * 3600_000)
  utimesSync(join(m.dest, 'dernier-succes-proton'), vieux, vieux)
  const r = m.lancer(['age'])
  assert.equal(r.status, 1)
  assert.match(r.stdout, /il y a 4\d h/)
})
