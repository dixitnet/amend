#!/usr/bin/env node
// Revue d'architecture et de code de la v2 par une autre IA (Mistral), aux
// étapes de la reconstruction : docs/v2-regles-developpement.md § 6,
// v2/adr/0007-relecteur-ia.md.
//
//   node tools/revue-ia.mjs --etape=1 --phase=ouverture
//   node tools/revue-ia.mjs --etape=1 --phase=cloture --depuis=<commit>
//   options : --modele=<id Mistral>  --essai (prépare le dossier sans l'envoyer)
//
// Le dossier envoyé ne contient que des fichiers suivis par git sous docs/v2-*,
// v2/adr/ et, en clôture, le diff de v2/ : jamais de .env, de clé ni de données.
// La clé est MISTRAL_REVUE_API_KEY (clé dédiée, distincte de la production) ;
// dans l'environnement en nuage de Claude, le proxy l'injecte pour
// api.mistral.ai et la variable peut rester vide.
//
// La réponse est écrite dans docs/v2-revues/AAAA-MM-JJ-etape-N-<phase>.md,
// suivie d'une section où Claude répond point par point. Le texte du relecteur
// est un avis : il n'est jamais exécuté.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync, execFileSync } from 'node:child_process'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (nom, defaut = null) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.split('=')[1] ?? defaut
const ETAPE = arg('etape')
const PHASE = arg('phase')
const DEPUIS = arg('depuis')
const PLAN = arg('plan') // un autre document que docs/v2-etape-N-plan.md (mise en ligne…)
const SUJET = arg('sujet', 'architecture et code') // ce que le relecteur doit regarder
const MODELE = arg('modele', 'mistral-large-latest')
const ESSAI = process.argv.includes('--essai')
const PLAFOND_SIGNES = 400_000

if (!ETAPE || !['ouverture', 'cloture', 'scenarios'].includes(PHASE)) {
  console.error(
    'Usage : node tools/revue-ia.mjs --etape=N --phase=ouverture|cloture [--depuis=<commit>] [--modele=…] [--essai]'
  )
  process.exit(2)
}
if (PHASE === 'cloture' && !DEPUIS) {
  console.error('La clôture demande --depuis=<commit> : le point de départ de l’étape.')
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
const suivis = (motif) => git('ls-files', '--', motif).split('\n').filter(Boolean)
const INTERDIT = /(^|\/)\.env|\.key$|\.pem$|(^|\/)data\//
const lire = (f) => {
  if (INTERDIT.test(f)) throw new Error(`fichier interdit dans une revue : ${f}`)
  return readFileSync(join(RACINE, f), 'utf8')
}

// 1. Les pièces.
const pieces = []
const ajouter = (titre, texte) => pieces.push({ titre, texte })
for (const f of ['docs/v2-regles-developpement.md', 'docs/v2-renoncements.md', 'docs/v2-veille.md']) ajouter(f, lire(f))
for (const f of suivis('v2/adr/*.md')) ajouter(f, lire(f))
const plan = PLAN || `docs/v2-etape-${ETAPE}-plan.md`
if (!existsSync(join(RACINE, plan))) throw new Error(`plan absent : ${plan}`)
ajouter(plan, lire(plan))
const arbo = suivis('v2/').filter((f) => !f.startsWith('v2/adr/'))
ajouter('Arborescence de v2/ (fichiers suivis)', arbo.length ? arbo.join('\n') : '(vide)')
if (existsSync(join(RACINE, 'v2/package.json'))) ajouter('v2/package.json', lire('v2/package.json'))
if (PHASE === 'scenarios') {
  ajouter('docs/v2-procedure-tests.md', lire('docs/v2-procedure-tests.md'))
  ajouter('docs/v2-mise-en-ligne.md', lire('docs/v2-mise-en-ligne.md'))
  const sources = arbo.filter(
    (f) => /\.(m?js|jsx|css|json|sh|service|conf)$|Caddyfile/.test(f) && !/package-lock|\/tests\/|\/contrats\//.test(f)
  )
  for (const f of sources) ajouter(f, lire(f))
  const titres = arbo
    .filter((f) => /\/(tests|contrats)\/.*\.test\.m?js$/.test(f))
    .map((f) => `${f}\n` + [...lire(f).matchAll(/^test\('([^']+)'/gm)].map((m) => `  - ${m[1]}`).join('\n'))
  ajouter('Tests existants (fichier, puis titres)', titres.join('\n'))
}
if (PHASE === 'cloture') {
  const diff = git('diff', `${DEPUIS}..HEAD`, '--', 'v2/', ':(exclude)v2/package-lock.json', ':(exclude)v2/LICENSE')
  ajouter(`Diff de v2/ depuis ${DEPUIS}`, diff || '(aucun changement)')
}
const total = pieces.reduce((n, p) => n + p.texte.length, 0)
if (total > PLAFOND_SIGNES) throw new Error(`dossier trop gros (${total} signes) : découper l’étape ou la revue`)
const SECRET = /(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|collabtext_session=)/
for (const p of pieces)
  if (SECRET.test(p.texte)) throw new Error(`motif de secret repéré dans « ${p.titre} » : revue annulée`)

// 2. La consigne : la grille du § 6 des règles (revues) ou la recherche de
// scénarios adverses (docs/v2-procedure-tests.md).
const consigneRevue = `Tu es relecteur (${SUJET}) pour amend.ink, un éditeur de texte collaboratif pour auteurs et éditeurs, en cours de reconstruction (v2). Un autre modèle (Claude) écrit le code ; ton rôle est de trouver ce qu'il a pu manquer. Réponds en français.

Phase : ${PHASE === 'ouverture' ? `OUVERTURE de l'étape ${ETAPE} — tu relis le PLAN avant tout développement` : `CLÔTURE de l'étape ${ETAPE} — tu relis l'architecture ET le code produit (diff fourni)`}.

Juge par rapport aux règles et décisions fournies (docs/v2-regles-developpement.md, ADR), pas par rapport à tes préférences. Grille :
1. Couches : fondation importée hors de son adaptateur ? lot sur plusieurs couches ? domaine dépendant ?
2. API publique : chemin interne, membre privé, code de fondation copié ?
3. Redondance avec l'amont : refait-on ce qu'une fondation fait déjà ou s'apprête à faire ?
4. Simplicité : code mort, abstraction inutile, option « au cas où », fonction marginale ?
5. Sécurité et droits : contrôle côté client seulement, fuite de données entre documents, secret ?
6. Tests : couverture de ce qui change, contrats manquants ?
7. Exports propres : NFC, remplacements parasites, typographie française.
8. Licences : dépendances nouvelles et compatibilité AGPL-3.0.
9. Design et technique : style dans le code technique, composant de présentation qui appelle ou décide, valeur hors jetons ?
10. Traductions : texte en dur, phrase assemblée, pluriel, formatage manuel, langue d'interface confondue avec celle du document ?
11. Documentation : ADR, renoncements, veille à jour ?

Format de réponse, strictement :
## Synthèse
(3 à 6 lignes : l'avis d'ensemble, et si l'étape peut ${PHASE === 'ouverture' ? 'être lancée' : 'être close'})
## Constats
Une liste numérotée R1, R2, … Pour chaque constat : **[bloquant | important | mineur | question]**, le point de grille concerné (1 à 11), le fichier ou la section, le constat en une ou deux phrases, et ce que tu proposes. Pas de constat sans élément précis du dossier. Ne réécris pas le plan ni le code.
## Points de grille sans remarque
(les numéros)`

const consigneScenarios = `Tu es testeur adverse pour amend.ink, un éditeur de texte collaboratif pour auteurs et éditeurs, en cours de reconstruction (v2) à partir de zéro. Un autre modèle (Claude) écrit le code et les tests ; ton rôle est de trouver ce qui peut casser. Réponds en français.

Étape ${ETAPE}. Tu reçois les règles (avec le découpage en couches), le plan, la procédure de test, le code source et la liste des tests existants. Ne t'appuie que sur ce code : pas de suppositions tirées d'autres logiciels.

On veut des tests **légers et automatiques**, organisés **couche par couche**, qui se **complexifient progressivement**, pour détecter les défauts le plus tôt et le plus bas possible :
- T1 domaine et traductions : fonctions pures, sans réseau ni navigateur ;
- T2 adaptateurs pris isolément : Yjs (deux documents en mémoire), BlockNote (éditeur sans navigateur), y/hub (contre Redis et PostgreSQL locaux, client sans navigateur) ;
- T3 serveur applicatif : requêtes HTTP en processus (routes, codes, cookies) ;
- T4 design : rendu des composants, clair et sombre, français, anglais et pseudo-langue ;
- T5 pile complète dans un navigateur automatisé (Chromium, WebKit, Firefox) ;
- T6 en ligne (v2.amend.ink, derrière un mot de passe).
Pour chaque couche, va du cas nominal au cas limite. Un défaut doit être attrapé à la couche la plus basse possible : ne propose un test T5 ou T6 que si rien de plus bas ne peut l'attraper.

Format de réponse, strictement :
## Scénarios par couche
Pour chaque couche (T1 à T6), une liste numérotée (T1.1, T1.2, …), du plus simple au plus difficile, cinq au plus par couche. Pour chaque scénario : **[grave | moyen | faible]**, le titre, l'élément du code visé (fichier, fonction), les entrées, le résultat attendu. Pas de scénario sans élément précis du dossier ; pas de doublon avec les tests existants.
## Données piégées
Un bloc de code JSON : un objet dont chaque clé est un usage (\"noms\", \"identifiantsDeDocument\", \"textes\", \"cookies\"…) et chaque valeur une liste de chaînes difficiles (Unicode combinant, NFD, emoji, très long, caractères de contrôle, injections), chacune avec la raison en commentaire dans une liste parallèle \"raisons\".`

const consigne = PHASE === 'scenarios' ? consigneScenarios : consigneRevue

const dossier = pieces.map((p) => `===== ${p.titre} =====\n${p.texte}`).join('\n\n')
const date = new Date().toISOString().slice(0, 10)
const sortie =
  PHASE === 'scenarios'
    ? join(RACINE, 'docs/v2-tests', `etape-${ETAPE}-scenarios.md`)
    : join(RACINE, 'docs/v2-revues', `${date}-etape-${ETAPE}-${PHASE}.md`)

console.log(`Dossier : ${pieces.length} pièces, ${total} signes ; modèle ${MODELE}`)
for (const p of pieces) console.log(`  - ${p.titre} (${p.texte.length} signes)`)
if (ESSAI) process.exit(0)

// 3. L'appel, en réception progressive : une longue réponse produite d'un bloc
// était coupée par un intermédiaire (502) ; le flux garde la connexion active.
const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${process.env.MISTRAL_REVUE_API_KEY || 'injectee-par-le-proxy'}`,
  },
  body: JSON.stringify({
    model: MODELE,
    temperature: 0.2,
    stream: true,
    messages: [
      { role: 'system', content: consigne },
      { role: 'user', content: `Dossier de revue :\n\n${dossier}` },
    ],
  }),
})
if (!r.ok) {
  console.error(`Mistral : ${r.status} ${(await r.text()).slice(0, 300)}`)
  process.exit(1)
}
let avis = ''
let modeleServi = MODELE
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
    const evt = JSON.parse(donnees)
    modeleServi = evt.model || modeleServi
    avis += evt.choices?.[0]?.delta?.content || ''
  }
}
if (!avis.trim()) avis = '(réponse vide)'
const j = { model: modeleServi }
// Règle 5 de CLAUDE.md : la consommation d'IA se dit en signes.
const usage = `${total + consigne.length} signes envoyés, ${avis.length} reçus`

// 4. Le fichier de revue.
mkdirSync(dirname(sortie), { recursive: true })
writeFileSync(
  sortie,
  `# ${PHASE === 'scenarios' ? 'Scénarios adverses' : PHASE === 'ouverture' ? 'Revue d’ouverture' : 'Revue de clôture'} de l’étape ${ETAPE} (${date})

- Relecteur : Mistral, modèle \`${j.model || MODELE}\` ; consommation : ${usage}
- Pièces : ${pieces.map((p) => `\`${p.titre}\``).join(', ')}
- Commit relu : \`${git('rev-parse', '--short', 'HEAD').trim()}\`${PHASE === 'cloture' ? ` (depuis \`${DEPUIS}\`)` : ''}
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## ${PHASE === 'scenarios' ? 'Proposition de Mistral' : 'Avis du relecteur'}

${avis.trim()}

## ${PHASE === 'scenarios' ? 'Classement par Claude' : 'Réponse de Claude'}

${PHASE === 'scenarios' ? '(Pour chaque scénario : *automatique* avec le test qui le couvre, *à la main* avec sa ligne de recette, ou *écarté* avec la raison.)' : '(Pour chaque constat : *corrigé*, *contesté* avec l’argument, ou *reporté* avec la suite prévue.)'}

## Arbitrage de Sylvain

(À compléter.)
`
)
console.log(`Revue écrite : ${sortie.replace(RACINE + '/', '')}`)
