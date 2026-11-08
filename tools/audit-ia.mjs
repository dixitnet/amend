// Audit partiel du code de la v2 par une IA de Scaleway, avant une fusion dans
// main (règles de la v2, § 6 ; décisions de Sylvain du 08/11/2026).
//
//   node tools/audit-ia.mjs --modele=<id Scaleway> [--depuis=<commit>] [--essai]
//
// Envoie le diff de v2/ depuis `--depuis` (par défaut : la base commune avec
// origin/main), chaque ligne numérotée comme dans le fichier, avec les règles
// de la v2, les ADR et le registre des renoncements. Le modèle rend des
// constats cités par fichier et ligne ; le script vérifie chaque citation
// (un constat sans citation, ou citant une ligne qui n'existe pas, est marqué
// comme tel). L'avis est écrit dans docs/v2-revues/ ; Claude y répond point
// par point, Sylvain arbitre. Clé : injectée par le proxy de la session
// (api.scaleway.ai) ou SCALEWAY_AUDIT_API_KEY ; jamais dans le code.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (nom, defaut = null) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.split('=')[1] ?? defaut
const MODELE = arg('modele')
const ESSAI = process.argv.includes('--essai')
const PLAFOND_SIGNES = 400_000
const ADRESSE = 'https://api.scaleway.ai/v1/chat/completions'

if (!MODELE) {
  console.error('Usage : node tools/audit-ia.mjs --modele=<id Scaleway> [--depuis=<commit>] [--essai]')
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
const DEPUIS = arg('depuis') || git('merge-base', 'HEAD', 'origin/main').trim()
const INTERDIT = /(^|\/)\.env|\.key$|\.pem$|(^|\/)data\//
const lire = (f) => {
  if (INTERDIT.test(f)) throw new Error(`fichier interdit dans un audit : ${f}`)
  return readFileSync(join(RACINE, f), 'utf8')
}

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

// 1. Les pièces : les règles et décisions, puis le diff numéroté.
const pieces = []
const ajouter = (titre, texte) => pieces.push({ titre, texte })
for (const f of ['docs/v2-regles-developpement.md', 'docs/v2-renoncements.md']) ajouter(f, lire(f))
for (const f of git('ls-files', '--', 'v2/adr/*.md').split('\n').filter(Boolean)) ajouter(f, lire(f))
const exclus = [':(exclude)v2/package-lock.json', ':(exclude)v2/LICENSE']
const fichiers = git('diff', '--name-only', `${DEPUIS}..HEAD`, '--', 'v2/', ...exclus)
  .split('\n')
  .filter(Boolean)
if (!fichiers.length) {
  console.log(`Aucun changement dans v2/ depuis ${DEPUIS} : rien à auditer.`)
  process.exit(0)
}
ajouter(
  `Diff de v2/ depuis ${DEPUIS.slice(0, 7)}, lignes numérotées comme dans le fichier final`,
  diffNumerote(git('diff', '-U5', `${DEPUIS}..HEAD`, '--', 'v2/', ...exclus))
)
const total = pieces.reduce((n, p) => n + p.texte.length, 0)
if (total > PLAFOND_SIGNES) throw new Error(`dossier trop gros (${total} signes) : auditer en plusieurs fois`)
const SECRET = /(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|collabtext_session=)/
for (const p of pieces)
  if (SECRET.test(p.texte)) throw new Error(`motif de secret repéré dans « ${p.titre} » : audit annulé`)

// 2. La consigne : la grille du § 6 des règles, sur le diff seul.
const consigne = `Tu audites le code d'amend.ink v2, un éditeur de texte collaboratif pour auteurs et éditeurs, avant une fusion dans la branche principale. Un autre modèle (Claude) a écrit ce code ; ton rôle est de trouver ce qu'il a pu manquer. Réponds en français.

Tu reçois les règles de développement, les décisions (ADR), le registre des renoncements, puis le diff à auditer. Chaque ligne du diff présente dans le fichier final est précédée de son numéro de ligne ; les lignes retirées (commençant par « - ») n'en ont pas.

Règles d'audit, strictes :
- N'audite que le diff : pas de remarque sur du code absent du diff, ni sur ce qui relève d'une étape future du plan.
- Juge par rapport aux règles et décisions fournies, pas par rapport à tes préférences. Un choix écrit dans une règle ou un ADR n'est pas un défaut.
- Chaque constat cite au moins un emplacement exact au format \`chemin/du/fichier.js:123\`, avec le numéro de ligne donné dans le diff. Un constat sans citation exacte sera écarté.
- N'invente rien : si tu n'es pas sûr, classe le constat en « question ».

Grille :
1. Couches : fondation importée hors de son adaptateur ? domaine dépendant ? élément de design hors de v2/design/ ?
2. API publique : chemin interne, membre privé, code de fondation copié ?
3. Redondance avec l'amont : refait-on ce qu'une fondation fait déjà ?
4. Simplicité : code mort, abstraction inutile, option « au cas où » ?
5. Sécurité et droits : contrôle côté client seulement, fuite entre documents, injection, secret ?
6. Correction : erreur de logique, cas limite oublié, condition de course, fuite de ressource ?
7. Tests : ce qui change est-il couvert ? un test qui ne vérifie pas ce qu'il annonce ?
8. Exports propres et typographie : NFC, remplacements parasites ?
9. Traductions : texte en dur, phrase assemblée, langue d'interface confondue avec celle du document ?
10. Licences : dépendance nouvelle ?

Format de réponse, strictement :
## Synthèse
(3 à 5 lignes)
## Constats
Une liste numérotée A1, A2, … Pour chaque constat, sur une ligne d'en-tête : **[grave | important | mineur | question]**, le point de grille (1 à 10), la ou les citations \`fichier:ligne\` ; puis le constat en une ou deux phrases, et ce que tu proposes.
## Points de grille sans remarque
(les numéros)`

const dossier = pieces.map((p) => `===== ${p.titre} =====\n${p.texte}`).join('\n\n')
const date = new Date().toISOString().slice(0, 10)
const sortie = join(RACINE, 'docs/v2-revues', `${date}-audit-partiel-${MODELE}.md`)
console.log(
  `Dossier : ${pieces.length} pièces, ${total} signes, ${fichiers.length} fichiers modifiés ; modèle ${MODELE}`
)
if (ESSAI) process.exit(0)

// 3. L'appel, en réception progressive (une longue réponse d'un bloc peut
// être coupée par un intermédiaire).
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
    stream: true,
    messages: [
      { role: 'system', content: consigne },
      { role: 'user', content: `Dossier d'audit :\n\n${dossier}` },
    ],
  }),
})
if (!r.ok) {
  console.error(`Scaleway : ${r.status} ${(await r.text()).slice(0, 300)}`)
  process.exit(1)
}
let avis = ''
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
    avis += JSON.parse(donnees).choices?.[0]?.delta?.content || ''
  }
}
avis = avis.trim() || '(réponse vide)'
const duree = Math.round((Date.now() - debut) / 1000)

// 4. Les citations, vérifiées : chaque constat doit citer une ligne réelle
// d'un fichier du diff.
const lignesDe = new Map()
const nbLignes = (f) => {
  if (!lignesDe.has(f)) lignesDe.set(f, existsSync(join(RACINE, f)) ? lire(f).split('\n').length : 0)
  return lignesDe.get(f)
}
const constats = avis.split(/\n(?=\s*\**A\d+\b)/).filter((c) => /^\s*\**A\d+\b/.test(c))
const verifications = constats.map((c) => {
  const numero = /A\d+/.exec(c)[0]
  const citations = [...c.matchAll(/`?((?:v2\/)?[\w./-]+\.\w+):(\d+)`?/g)].map((m) => ({
    fichier: m[1].startsWith('v2/') ? m[1] : `v2/${m[1]}`,
    ligne: Number(m[2]),
  }))
  if (!citations.length) return `- ${numero} : **sans citation** (écarté d'office)`
  const fausses = citations.filter((x) => !fichiers.includes(x.fichier) || x.ligne < 1 || x.ligne > nbLignes(x.fichier))
  return fausses.length
    ? `- ${numero} : **citation invalide** (${fausses.map((x) => `${x.fichier}:${x.ligne}`).join(', ')} hors du diff ou au-delà du fichier)`
    : `- ${numero} : citations valides`
})

// 5. Le fichier d'audit. Règle 5 de CLAUDE.md : la consommation se dit en signes.
mkdirSync(dirname(sortie), { recursive: true })
writeFileSync(
  sortie,
  `# Audit partiel avant fusion (${date})

- Auditeur : Scaleway, modèle \`${MODELE}\` ; consommation : ${total + consigne.length} signes envoyés, ${avis.length} reçus ; ${duree} s
- Diff audité : \`v2/\` de \`${DEPUIS.slice(0, 7)}\` à \`${git('rev-parse', '--short', 'HEAD').trim()}\` (${fichiers.length} fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

${avis}

## Citations vérifiées par le script

${verifications.join('\n') || '(aucun constat numéroté reconnu)'}

## Réponse de Claude

(Pour chaque constat : *juste* et corrigé, *faux* avec la preuve, *hors sujet*, ou *question pour Sylvain*.)

## Arbitrage de Sylvain

(À compléter.)
`
)
console.log(`Audit écrit : ${sortie.replace(RACINE + '/', '')}`)
