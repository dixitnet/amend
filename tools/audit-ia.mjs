// Audit du code de la v2 par une IA de Scaleway (règles de la v2, § 6 ;
// décisions de Sylvain du 08/11/2026 : GLM-5.3 pour les deux audits).
//
//   node tools/audit-ia.mjs --modele=glm-5.3 [--depuis=<commit>] [--jusqua=<commit>] [--reflexion=low] [--essai]
//   (`--jusqua` : auditer un lot trop gros en tranches de commits ; par défaut HEAD)
//   node tools/audit-ia.mjs --modele=glm-5.3 --complet --outils=<dossier> [--reflexion=low] [--essai]
//
// Partiel (avant une fusion) : le diff de v2/ depuis `--depuis` (par défaut la
// base commune avec origin/main), lignes numérotées comme dans le fichier final.
// Complet (selon les règles de l'art, moins fréquent) : tout v2/, module par
// module, sources entières aux lignes numérotées, avec les résultats des outils
// déterministes (fichiers texte du dossier `--outils` : npm audit, couverture,
// knip, Semgrep…) et la liste des tests existants.
// Dans les deux cas : règles de la v2, ADR et registre des renoncements joints ;
// chaque constat doit citer `fichier:ligne`, et le script vérifie chaque citation.
// L'avis est écrit dans docs/v2-revues/ (partiel) ou docs/v2-audits/ (complet) ;
// Claude y répond point par point, Sylvain arbitre. Clé : injectée par le proxy
// de la session (api.scaleway.ai) ou SCALEWAY_AUDIT_API_KEY ; jamais dans le code.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (nom, defaut = null) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.split('=')[1] ?? defaut
const MODELE = arg('modele')
const COMPLET = process.argv.includes('--complet')
const OUTILS = arg('outils')
const ESSAI = process.argv.includes('--essai')
// Intensité de la réflexion (none, low, high, max) : au-delà de « low », la
// réflexion de DeepSeek et de GLM épuise la sortie avant toute réponse (essai du 08/11).
const REFLEXION = arg('reflexion', 'low')
const PLAFOND_SIGNES = 400_000
const ADRESSE = 'https://api.scaleway.ai/v1/chat/completions'

if (!MODELE || (COMPLET && !OUTILS)) {
  console.error(
    'Usage : node tools/audit-ia.mjs --modele=<id> [--depuis=<commit>] [--reflexion=low] [--essai]\n' +
      '        node tools/audit-ia.mjs --modele=<id> --complet --outils=<dossier> [--reflexion=low] [--essai]'
  )
  process.exit(2)
}

/** Derrière un proxy, fetch de Node ne le suit qu'avec NODE_USE_ENV_PROXY=1. */
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY && !ESSAI) {
  const r = spawnSync(process.execPath, ['--disable-warning=UNDICI-EHPA', ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  })
  process.exit(r.status ?? 1)
}

const git = (...a) => execFileSync('git', a, { cwd: RACINE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const INTERDIT = /(^|\/)\.env|\.key$|\.pem$|(^|\/)data\//
const lire = (f) => {
  if (INTERDIT.test(f)) throw new Error(`fichier interdit dans un audit : ${f}`)
  return readFileSync(join(RACINE, f), 'utf8')
}
const SECRET = /(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|collabtext_session=)/
const suivis = (motif) => git('ls-files', '--', motif).split('\n').filter(Boolean)
// Date et heure (UTC) dans le nom du fichier : deux audits du même jour ne
// s'écrasent pas ; l'écriture refuse en plus un fichier existant (flag 'wx').
const maintenant = new Date().toISOString()
const date = maintenant.slice(0, 10)
const horodatage = `${date}-${maintenant.slice(11, 16).replace(':', '')}`
const JUSQUA = arg('jusqua', 'HEAD')
const commit = git('rev-parse', '--short', JUSQUA).trim()

/** Les pièces communes : règles, renoncements, décisions. */
const piecesCommunes = () => [
  ...['docs/v2-regles-developpement.md', 'docs/v2-renoncements.md'].map((f) => ({ titre: f, texte: lire(f) })),
  ...suivis('v2/adr/*.md').map((f) => ({ titre: f, texte: lire(f) })),
]

/** Le diff, chaque ligne présente dans le fichier final précédée de son numéro. */
function diffNumerote(diff) {
  const sortie = []
  let ligne = 0
  for (const l of diff.split('\n')) {
    const entete = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l)
    if (entete) {
      ligne = Number(entete[1])
      sortie.push(l)
    } else if (l.startsWith('+++') || l.startsWith('---') || l.startsWith('diff ') || l.startsWith('index '))
      sortie.push(l)
    else if (l.startsWith('-')) sortie.push(`      ${l}`)
    else if (l.startsWith('+') || l.startsWith(' ')) sortie.push(`${String(ligne++).padStart(5)} ${l}`)
    else sortie.push(l)
  }
  return sortie.join('\n')
}
const numerote = (texte) =>
  texte
    .split('\n')
    .map((l, i) => `${String(i + 1).padStart(5)}  ${l}`)
    .join('\n')

const GRILLE_PARTIELLE = `1. Couches : arête hors du graphe des dépendances (règles, § 2) ? élément de design hors de v2/design/ ?
2. API publique : chemin interne, membre privé, code de fondation copié ?
3. Redondance avec l'amont : refait-on ce qu'une fondation fait déjà ?
4. Simplicité : code mort, abstraction inutile, option « au cas où » ?
5. Sécurité et droits : contrôle côté client seulement, fuite entre documents, injection, secret ?
6. Correction : erreur de logique, cas limite oublié, condition de course, fuite de ressource ?
7. Tests : ce qui change est-il couvert ? un test qui ne vérifie pas ce qu'il annonce ?
8. Exports propres et typographie : NFC, remplacements parasites ?
9. Traductions : texte en dur, phrase assemblée, langue d'interface confondue avec celle du document ?
10. Licences : dépendance nouvelle ?`

const GRILLE_COMPLETE = `1. Architecture : couches et graphe des dépendances (règles, § 2), API publique des fondations, montées de version protégées.
2. Sécurité, d'après l'OWASP ASVS (niveau 2 quand il s'applique) : authentification et session, contrôle d'accès, validation des entrées, encodage des sorties (XSS), CSRF, en-têtes, secrets, journaux.
3. Correction et robustesse : erreurs non traitées, cas limites, conditions de course, fuites de ressources, comportement en panne.
4. Simplicité : code mort, abstraction inutile, duplication, complexité.
5. Tests : comportements importants non testés, tests qui ne vérifient pas ce qu'ils annoncent.
6. Accessibilité (RGAA niveau AA) : sémantique, rôles, clavier.
7. Performance et mémoire, au regard de la petite machine de production.
8. Exploitation : configuration, limites des services, journaux, sauvegarde et restauration.
9. Données personnelles (RGPD) : ce qui est stocké, combien de temps, qui y accède.
10. Traductions, exports propres, licences.`

const consigne = (
  perimetre,
  grille,
  outilsTraitesAilleurs = false
) => `Tu audites le code d'amend.ink v2, un éditeur de texte collaboratif pour auteurs et éditeurs. Un autre modèle (Claude) a écrit ce code ; ton rôle est de trouver ce qu'il a pu manquer. Réponds en français.

Tu reçois les règles de développement, les décisions (ADR), le registre des renoncements, puis ${perimetre}. Chaque ligne de code est précédée de son numéro de ligne dans le fichier.

Règles d'audit, strictes :
- N'audite que le code fourni ; pas de remarque sur ce qui relève d'une étape future du plan.
- Juge par rapport aux règles et décisions fournies, pas par rapport à tes préférences. Un choix écrit dans une règle, un ADR ou le registre des renoncements n'est pas un défaut.
- Chaque constat cite au moins un emplacement exact au format \`chemin/du/fichier.js:123\`, avec le numéro de ligne donné. Un constat sans citation exacte sera écarté.
- N'invente rien : si tu n'es pas sûr, classe le constat en « question ».${
  outilsTraitesAilleurs
    ? `
- Les résultats des outils déterministes (npm audit, couverture, knip, Semgrep…) ne sont pas joints à ce module : ils sont traités une seule fois, dans le dernier module de l'audit. N'en parle pas ici.`
    : ''
}

Grille :
${grille}

Format de réponse, strictement :
## Synthèse
(3 à 5 lignes)
## Constats
Une liste numérotée A1, A2, … Pour chaque constat, sur une ligne d'en-tête : **[grave | important | mineur | question]**, le point de grille, la ou les citations \`fichier:ligne\` ; puis le constat en une ou deux phrases, et ce que tu proposes.
## Points de grille sans remarque
(les numéros)`

/** Un appel au modèle ; une connexion coupée en cours de réponse (10/11/2026) est retentée deux fois. */
async function appeler(systeme, dossier) {
  for (let essai = 1; ; essai++) {
    try {
      return await appelerUneFois(systeme, dossier)
    } catch (e) {
      if (essai >= 3 || String(e.message).startsWith('Scaleway :')) throw e
      console.error(`Connexion coupée (${e.message}), nouvel essai ${essai + 1}/3`)
      await new Promise((ok) => setTimeout(ok, 5000 * essai))
    }
  }
}

/** Un appel au modèle, en réception progressive. */
async function appelerUneFois(systeme, dossier) {
  const debut = Date.now()
  const r = await fetch(ADRESSE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.SCALEWAY_AUDIT_API_KEY || 'injectee-par-le-proxy'}`,
    },
    body: JSON.stringify({
      model: MODELE,
      temperature: 0.2,
      // La réflexion compte dans la sortie : sans limite explicite, celle par
      // défaut s'y épuise et la réponse arrive vide. 16 000 jetons : le maximum de GLM-5.3.
      max_tokens: 16000,
      reasoning_effort: REFLEXION,
      stream: true,
      messages: [
        { role: 'system', content: systeme },
        { role: 'user', content: `Dossier d'audit :\n\n${dossier}` },
      ],
    }),
  })
  if (!r.ok) throw new Error(`Scaleway : ${r.status} ${(await r.text()).slice(0, 300)}`)
  let avis = ''
  let reflexion = 0
  let arret = ''
  let reste = ''
  const decodeur = new TextDecoder()
  for await (const morceau of r.body) {
    reste += decodeur.decode(morceau, { stream: true })
    const lignes = reste.split('\n')
    reste = lignes.pop()
    for (const ligne of lignes) {
      if (!ligne.startsWith('data:')) continue
      const donnees = ligne.slice(5).trim()
      if (!donnees || donnees === '[DONE]') continue
      const choix = JSON.parse(donnees).choices?.[0]
      avis += choix?.delta?.content || ''
      reflexion += (choix?.delta?.reasoning_content || choix?.delta?.reasoning || '').length
      arret = choix?.finish_reason || arret
    }
  }
  return { avis: avis.trim() || '(réponse vide)', reflexion, arret, duree: Math.round((Date.now() - debut) / 1000) }
}

/** Les citations de chaque constat, vérifiées contre les fichiers audités. */
function verifier(avis, fichiers) {
  const DEBUT = /^\s*\**(A?\d+)[.)]?\**[\s.]/
  const constats = avis
    // Les constats seulement : de « Constats » au titre suivant (la liste des
    // points de grille sans remarque commence aussi par des numéros).
    .slice(Math.max(0, avis.indexOf('## Constats')))
    .split(/\n(?=#{1,4} )/)
    .slice(0, 1)
    .join('\n')
    .split('\n')
    .reduce(
      (liste, l) =>
        DEBUT.test(l) ? [...liste, l] : liste.length ? [...liste.slice(0, -1), `${liste.at(-1)}\n${l}`] : liste,
      []
    )
  const nbLignes = new Map()
  const lignesDe = (f) => {
    if (!nbLignes.has(f)) nbLignes.set(f, existsSync(join(RACINE, f)) ? lire(f).split('\n').length : 0)
    return nbLignes.get(f)
  }
  /** Un chemin cité, ramené à un fichier audité (complet, sans `v2/`, ou nom seul s'il est unique). */
  const fichierCite = (cite) => {
    const c = fichiers.filter((f) => f === cite || f === `v2/${cite}` || f.endsWith(`/${cite}`))
    return c.length === 1 ? c[0] : cite
  }
  return constats.map((c) => {
    const numero = DEBUT.exec(c)[1]
    const citations = [...c.matchAll(/`?((?:v2\/)?[\w./-]+\.\w+):(\d+)`?/g)].map((m) => ({
      fichier: fichierCite(m[1]),
      ligne: Number(m[2]),
    }))
    if (!citations.length) return `- ${numero} : **sans citation** (écarté d'office)`
    const fausses = citations.filter(
      (x) => !fichiers.includes(x.fichier) || x.ligne < 1 || x.ligne > lignesDe(x.fichier)
    )
    return fausses.length
      ? `- ${numero} : **citation invalide** (${fausses.map((x) => `${x.fichier}:${x.ligne}`).join(', ')})`
      : `- ${numero} : citations valides`
  })
}

const dossierDe = (pieces) => {
  const total = pieces.reduce((n, p) => n + p.texte.length, 0)
  if (total > PLAFOND_SIGNES) throw new Error(`dossier trop gros (${total} signes) : découper`)
  for (const p of pieces)
    if (SECRET.test(p.texte)) throw new Error(`motif de secret repéré dans « ${p.titre} » : audit annulé`)
  return { texte: pieces.map((p) => `===== ${p.titre} =====\n${p.texte}`).join('\n\n'), total }
}
const conso = (envoyes, r) =>
  `${envoyes} signes envoyés, ${r.avis.length} reçus (et ${r.reflexion} de réflexion) ; réflexion \`${REFLEXION}\` ; ${r.duree} s ; arrêt : ${r.arret || 'inconnu'}`

// --- Audit partiel -----------------------------------------------------------
async function auditPartiel() {
  const depuis = arg('depuis') || git('merge-base', 'HEAD', 'origin/main').trim()
  const exclus = [':(exclude)v2/package-lock.json', ':(exclude)v2/LICENSE']
  const fichiers = git('diff', '--name-only', `${depuis}..${JUSQUA}`, '--', 'v2/', ...exclus)
    .split('\n')
    .filter(Boolean)
  if (!fichiers.length) return console.log(`Aucun changement dans v2/ depuis ${depuis} : rien à auditer.`)
  const pieces = [
    ...piecesCommunes(),
    {
      titre: `Diff de v2/ depuis ${depuis.slice(0, 7)}, lignes numérotées comme dans le fichier final`,
      texte: diffNumerote(git('diff', '-U5', `${depuis}..${JUSQUA}`, '--', 'v2/', ...exclus)),
    },
  ]
  const { texte, total } = dossierDe(pieces)
  const systeme = consigne(
    'le diff à auditer (les lignes retirées, commençant par « - », n’ont pas de numéro)',
    GRILLE_PARTIELLE
  )
  console.log(`Audit partiel : ${total} signes, ${fichiers.length} fichiers modifiés ; modèle ${MODELE}`)
  if (ESSAI) return
  const r = await appeler(systeme, texte)
  const sortie = join(RACINE, 'docs/v2-revues', `${horodatage}-audit-partiel-${MODELE}.md`)
  mkdirSync(dirname(sortie), { recursive: true })
  writeFileSync(
    sortie,
    `# Audit partiel avant fusion (${date})

- Auditeur : Scaleway, modèle \`${MODELE}\` ; consommation : ${conso(total + systeme.length, r)}
- Diff audité : \`v2/\` de \`${depuis.slice(0, 7)}\` à \`${commit}\` (${fichiers.length} fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

${r.avis}

## Citations vérifiées par le script

${verifier(r.avis, fichiers).join('\n') || '(aucun constat numéroté reconnu)'}

## Réponse de Claude

(Pour chaque constat : *juste* et corrigé, *faux* avec la preuve, *hors sujet*, ou *question pour Sylvain*.)

## Arbitrage de Sylvain

(À compléter.)
`,
    { flag: 'wx' }
  )
  console.log(`Audit écrit : ${sortie.replace(RACINE + '/', '')}`)
}

// --- Audit complet -----------------------------------------------------------
/** Les modules audités un à un : chacun tient dans un appel. */
const MODULES = [
  ['Domaine', ['v2/domaine/']],
  ['Traductions', ['v2/i18n/']],
  ['Adaptateurs Yjs et y/hub', ['v2/adaptateurs/yjs/', 'v2/adaptateurs/yhub/']],
  [
    'Adaptateurs PostgreSQL, courrier et IA',
    ['v2/adaptateurs/postgres/', 'v2/adaptateurs/courrier/', 'v2/adaptateurs/ia/'],
  ],
  ['Adaptateur BlockNote et extensions', ['v2/adaptateurs/blocknote/', 'v2/extensions/']],
  ['Serveur et collaboration', ['v2/application/serveur/', 'v2/application/collab/']],
  ['Client', ['v2/application/client/']],
  ['Design', ['v2/design/']],
  ['Exploitation', ['v2/exploitation/']],
  ['Déploiement automatique', ['deploy/auto/']],
  [
    'Garde-fous (lint, contrats statiques, configuration)',
    ['v2/eslint.config.js', 'v2/contrats/statiques/', 'v2/package.json', 'v2/vite.config.js', 'v2/knip.json'],
  ],
]
/**
 * Le titre d'un test : `test`, `it` ou un enrobage `t2`, `t3`… (éventuellement `.skip`, `.only`), avec
 * le titre entre apostrophes, guillemets ou accents graves, même sur la ligne suivante.
 */
const TITRE_DE_TEST = /^\s*(?:test|it|t\d)(?:\.\w+)?\(\s*(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/gm
const SOURCE = /\.(m?js|jsx|json|css|sh|service|timer|conf|html|md)$|Caddyfile/

async function auditComplet() {
  const outils = readdirSync(OUTILS)
    .filter((f) => /\.(txt|md)$/.test(f))
    .map((f) => ({ titre: `Résultat d'outil : ${f}`, texte: readFileSync(join(OUTILS, f), 'utf8') }))
  const tests = suivis('v2/')
    .filter((f) => /\/(tests|contrats)\/.*\.test\.m?js$/.test(f))
    .map((f) => `${f}\n` + [...lire(f).matchAll(TITRE_DE_TEST)].map((m) => `  - ${m[2]}`).join('\n'))
    .join('\n')
  const sections = []
  let envoyesTotal = 0
  let recusTotal = 0
  for (const [i, [nom, chemins]] of MODULES.entries()) {
    // Les résultats des outils ne sont joints qu'au dernier module : joints à
    // chacun, l'auditeur répétait les mêmes constats d'outils partout (11/11/2026).
    const dernier = i === MODULES.length - 1
    const fichiers = chemins.flatMap((c) => suivis(c)).filter((f) => SOURCE.test(f) && !/package-lock|LISEZMOI/.test(f))
    const pieces = [
      ...piecesCommunes(),
      ...(dernier ? outils : []),
      { titre: 'Tests existants (fichier, puis titres)', texte: tests },
      ...fichiers.map((f) => ({ titre: `${f} (lignes numérotées)`, texte: numerote(lire(f)) })),
    ]
    const { texte, total } = dossierDe(pieces)
    const systeme = consigne(
      `${dernier ? 'les résultats des outils déterministes, ' : ''}la liste des tests existants, et les sources du module « ${nom} »`,
      GRILLE_COMPLETE,
      !dernier
    )
    console.log(`${nom} : ${fichiers.length} fichiers, ${total} signes`)
    if (ESSAI) continue
    const r = await appeler(systeme, texte)
    envoyesTotal += total + systeme.length
    recusTotal += r.avis.length
    sections.push(`## ${nom}

- Fichiers : ${fichiers.map((f) => `\`${f}\``).join(', ')}
- Consommation : ${conso(total + systeme.length, r)}

### Avis de l'auditeur

${r.avis.replace(/^## /gm, '#### ')}

### Citations vérifiées par le script

${verifier(r.avis, fichiers).join('\n') || '(aucun constat numéroté reconnu)'}

### Réponse de Claude

(À écrire.)
`)
  }
  if (ESSAI) return
  const sortie = join(RACINE, 'docs/v2-audits', `${horodatage}-audit-complet.md`)
  mkdirSync(dirname(sortie), { recursive: true })
  writeFileSync(
    sortie,
    `# Audit complet de la v2 (${date})

- Auditeur : Scaleway, modèle \`${MODELE}\`, réflexion \`${REFLEXION}\` ; consommation totale : ${envoyesTotal} signes envoyés, ${recusTotal} reçus
- Code audité : \`v2/\` au commit \`${commit}\`, module par module
- Outils déterministes : ${outils.map((o) => `\`${o.titre.replace("Résultat d'outil : ", '')}\``).join(', ')}
- Statut : avis reçus ; réponses de Claude à écrire ; arbitrage de Sylvain à venir.

${sections.join('\n')}
## Arbitrage de Sylvain

(À compléter.)
`,
    { flag: 'wx' }
  )
  console.log(`Audit écrit : ${sortie.replace(RACINE + '/', '')}`)
}

await (COMPLET ? auditComplet() : auditPartiel())
