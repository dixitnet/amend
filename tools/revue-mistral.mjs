#!/usr/bin/env node
// Revue automatique du code par Mistral (16/10/2026). Un relecteur qui n'a pas
// écrit le code : l'essentiel de l'intérêt tient là.
//
//   MISTRAL_API_KEY=… node tools/revue-mistral.mjs --tout      la première fois : tout le code (≈ 1 $)
//   MISTRAL_API_KEY=… node tools/revue-mistral.mjs             ensuite : ce qui a changé depuis la dernière revue
//   MISTRAL_API_KEY=… node tools/revue-mistral.mjs --jours 30  ou : les fichiers touchés ces 30 derniers jours
//   node tools/revue-mistral.mjs --essai                       dit ce qui serait envoyé, sans rien envoyer
//   --modele mistral-large-4-0 (défaut), --dossier server (limite à un dossier)
//
// Écrit `revue-AAAA-MM-JJ.md` à la racine (ignoré par git). Chaque constat porte
// le fichier, la ligne et la citation du code ; un constat dont la citation
// n'existe pas mot pour mot dans le fichier est jeté (c'est une invention).
//
// Ce qui part chez Mistral : le code suivi par git de server/, shared/,
// client/src/, deploy/ et tools/ — jamais `.env` ni `data/` (ignorés par git).
// Avant l'envoi, un motif de clé dans un fichier arrête tout.
// La clé vient de l'environnement, jamais d'un fichier, jamais écrite.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
/** Le commit relu la dernière fois (ignoré par git) : la prochaine revue part de là. */
const REPERE = join(RACINE, '.revue-derniere')
const DOSSIERS = ['server', 'shared', 'client/src', 'deploy', 'tools']
const EXTENSIONS = /\.(js|mjs|sh|service|timer)$|(^|\/)Caddyfile[^/]*$/
const EXCLUS = /(^|\/)(test|fonts|node_modules)\//
/** Une requête pèse au plus ça (octets de code) : au-delà, la relecture se dilue. */
export const LOT_OCTETS = 180_000
/** Tarif de catalogue de Mistral Large 4 en dollars par million de jetons : estimation haute. */
const TARIF = { entree: 1.36, sortie: 4.18 }

// ------------------------------------------------------------------ sélection
export function fichiersASoumettre(
  { tout, jours, depuis, dossier },
  git = (...a) => execFileSync('git', a, { cwd: RACINE, encoding: 'utf8' })
) {
  const suivis = git('ls-files').split('\n').filter(Boolean)
  let liste = suivis.filter((f) => EXTENSIONS.test(f) && !EXCLUS.test(f) && DOSSIERS.some((d) => f.startsWith(`${d}/`)))
  if (dossier) liste = liste.filter((f) => f.startsWith(`${dossier.replace(/\/$/, '')}/`))
  if (tout) return liste
  const journal = jours
    ? git('log', `--since=${jours} days ago`, '--name-only', '--pretty=format:')
    : git('diff', '--name-only', depuis, 'HEAD')
  const touches = new Set(
    journal
      .split('\n')
      .concat(
        git('status', '--porcelain')
          .split('\n')
          .map((l) => l.slice(3))
      )
      .filter(Boolean)
  )
  return liste.filter((f) => touches.has(f))
}

/** Regroupe par dossier voisin, sans dépasser LOT_OCTETS ; un fichier plus gros part seul. */
export function lots(fichiers, taille) {
  const tries = [...fichiers].sort()
  const sortie = []
  let courant = []
  let poids = 0
  for (const f of tries) {
    const t = taille(f)
    if (courant.length && poids + t > LOT_OCTETS) {
      sortie.push(courant)
      courant = []
      poids = 0
    }
    courant.push(f)
    poids += t
  }
  if (courant.length) sortie.push(courant)
  return sortie
}

// ------------------------------------------------------------------- sécurité
const MOTIFS_CLE = [
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /key-[0-9a-f]{32}/,
  /(API_KEY|SECRET|TOKEN)\s*[=:]\s*['"]?[A-Za-z0-9_-]{24,}/,
]
/** Les fichiers où un motif de clé apparaît (on ne rend jamais la clé elle-même). */
export function fichiersAvecCle(contenus) {
  return Object.keys(contenus).filter((f) => MOTIFS_CLE.some((m) => m.test(contenus[f])))
}

// -------------------------------------------------------------------- prompt
export const CONSIGNE = `Tu relis le code d'amend.ink, un éditeur de texte collaboratif auto-hébergé (Node 22, Yjs, aucune base de données : des fichiers dans data/). Il est exposé sur Internet derrière Caddy ; les comptes entrent par un lien envoyé par courriel ; les rôles sont éditeur, correcteur (ne modifie qu'en suivi de modifications) et lecteur. Le code et ses commentaires sont en français.

Cherche, dans cet ordre, des défauts RÉELS :
1. sécurité : contrôle d'accès manquant sur une route ou une opération, injection (HTML, chemin de fichier, en-tête, commande), contenu fourni par un utilisateur rendu sans échappement, secret dans un journal, comparaison non constante d'un secret, déni de service (mémoire ou CPU sans borne) ;
2. fiabilité : erreur non rattrapée, course entre opérations asynchrones, perte de données à l'arrêt ou au plantage, écriture non atomique, ressource jamais libérée ;
3. lisibilité : seulement ce qui trompe un lecteur (commentaire faux, nom trompeur, logique dupliquée qui divergera).

Règles : ne signale que ce que le code montré prouve ; recopie la ligne en cause à l'identique dans « citation » ; pas de remarque de style ni de goût ; ne conteste pas les choix assumés (pas de base de données, WebSocket écrit à la main, limiteurs en mémoire, valeurs réglables au back-office) — mais cherche les défauts dans leur réalisation ; au plus 15 constats, les plus graves d'abord ; si rien n'est à signaler, renvoie une liste vide.

Réponds par un objet JSON : {"constats":[{"fichier":"…","ligne":N,"gravite":"critique|importante|mineure","categorie":"securite|fiabilite|lisibilite","citation":"…","probleme":"…","scenario":"entrée ou état précis qui fait échouer","correctif":"…"}]}`

export function messageUtilisateur(contenus) {
  return Object.entries(contenus)
    .map(([f, t]) => {
      const num = t
        .split('\n')
        .map((l, i) => `${i + 1}| ${l}`)
        .join('\n')
      return `===== ${f} =====\n${num}`
    })
    .join('\n\n')
}

// -------------------------------------------------------------- vérification
const sansEspaces = (s) => String(s).replace(/\s+/g, ' ').trim()

/** Ne garde que les constats dont le fichier est dans le lot et dont la citation existe, mot pour mot. */
export function verifier(constats, contenus) {
  const gardes = []
  let jetes = 0
  for (const c of Array.isArray(constats) ? constats : []) {
    const texte = c && contenus[c.fichier]
    const citation = c && sansEspaces(c.citation || '')
    if (texte && citation.length >= 8 && sansEspaces(texte).includes(citation)) gardes.push(c)
    else jetes++
  }
  return { gardes, jetes }
}

const ORDRE = { critique: 0, importante: 1, mineure: 2 }

export function rapport({ date, modele, fichiers, constats, jetes, jetons, cout }) {
  const tries = [...constats].sort((a, b) => (ORDRE[a.gravite] ?? 3) - (ORDRE[b.gravite] ?? 3))
  const l = [`# Revue du ${date} — ${modele}`, '']
  l.push(
    `${fichiers.length} fichier(s) relus · ${tries.length} constat(s) vérifié(s) · ${jetes} jeté(s) (citation introuvable) · ` +
      `${jetons.entree} jetons en entrée, ${jetons.sortie} en sortie · ≈ ${cout.toFixed(2)} $ (estimation haute).`,
    '',
    '*Ce sont des hypothèses d’un relecteur automatique : chacune est à vérifier dans le code avant d’agir.*',
    ''
  )
  tries.forEach((c, i) => {
    l.push(
      `## ${i + 1}. [${c.gravite}] ${c.fichier}:${c.ligne} — ${c.categorie}`,
      '',
      '```',
      String(c.citation).trim(),
      '```',
      ''
    )
    l.push(`**Problème.** ${c.probleme}`, '', `**Scénario.** ${c.scenario}`, '', `**Correctif.** ${c.correctif}`, '')
  })
  if (!tries.length) l.push('Aucun constat vérifié.')
  return l.join('\n')
}

// ----------------------------------------------------------------- appel API
export async function demander({ modele, cle, url, contenus }, requete = fetch) {
  const corps = {
    model: modele,
    temperature: 0.2,
    max_tokens: 16_000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: CONSIGNE },
      { role: 'user', content: messageUtilisateur(contenus) },
    ],
  }
  for (let essai = 1; ; essai++) {
    const r = await requete(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cle}` },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(280_000), // Node coupe à 300 s un appel sans flux
    })
    if (r.ok) {
      const j = await r.json()
      const m = j.choices?.[0]?.message?.content
      const texte = Array.isArray(m)
        ? m
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('')
        : String(m ?? '')
      let constats = []
      try {
        constats = JSON.parse(texte).constats
      } catch {
        // une réponse illisible vaut « rien de vérifiable » : le lot est compté mais rien n'est retenu
      }
      return { constats, usage: j.usage || {} }
    }
    if (essai < 2 && (r.status === 429 || r.status >= 500)) {
      await new Promise((ok) => setTimeout(ok, 5000))
      continue
    }
    // Jamais le corps de la requête ni la clé : seulement ce que dit le service.
    throw new Error(`Mistral a répondu ${r.status} : ${(await r.text()).slice(0, 300)}`)
  }
}

// ---------------------------------------------------------------------- main
function options(argv) {
  const o = { tout: false, essai: false, jours: 0, modele: 'mistral-large-4-0', dossier: '' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--tout') o.tout = true
    else if (a === '--essai') o.essai = true
    else if (a === '--jours') o.jours = Number(argv[++i]) || 7
    else if (a === '--modele') o.modele = argv[++i]
    else if (a === '--dossier') o.dossier = argv[++i]
    else throw new Error(`option inconnue : ${a}`)
  }
  return o
}

async function main() {
  const o = options(process.argv.slice(2))
  let depuis = ''
  try {
    depuis = readFileSync(REPERE, 'utf8').trim()
  } catch {
    // pas encore de revue : voir juste après
  }
  if (!o.tout && !o.jours && !depuis) {
    return console.log(
      'Première revue : lancez-la avec --tout (tout le code, ≈ 1 $) ou --jours N (les fichiers touchés ces N jours).'
    )
  }
  const fichiers = fichiersASoumettre({ ...o, depuis })
  if (!fichiers.length) return console.log('Rien n’a changé depuis la dernière revue.')
  const contenus = Object.fromEntries(fichiers.map((f) => [f, readFileSync(join(RACINE, f), 'utf8')]))
  const avecCle = fichiersAvecCle(contenus)
  if (avecCle.length) throw new Error(`Un motif de clé apparaît dans : ${avecCle.join(', ')}. Rien n'a été envoyé.`)
  const groupes = lots(fichiers, (f) => Buffer.byteLength(contenus[f]))
  const octets = fichiers.reduce((s, f) => s + Buffer.byteLength(contenus[f]), 0)
  console.log(
    `${fichiers.length} fichier(s), ${(octets / 1024).toFixed(0)} Ko, ${groupes.length} requête(s) à ${o.modele}.`
  )
  if (o.essai) return fichiers.forEach((f) => console.log(`  ${f}`))
  const cle = process.env.MISTRAL_API_KEY
  if (!cle) throw new Error('MISTRAL_API_KEY absente de l’environnement.')
  const url = `${(process.env.MISTRAL_API_URL || 'https://api.eu.mistral.ai').replace(/\/$/, '')}/v1/chat/completions`
  const constats = []
  let jetes = 0
  const jetons = { entree: 0, sortie: 0 }
  for (const [i, g] of groupes.entries()) {
    const lot = Object.fromEntries(g.map((f) => [f, contenus[f]]))
    process.stdout.write(`  requête ${i + 1}/${groupes.length} (${g.length} fichiers)… `)
    const { constats: brut, usage } = await demander({ modele: o.modele, cle, url, contenus: lot })
    const v = verifier(brut, lot)
    constats.push(...v.gardes)
    jetes += v.jetes
    jetons.entree += usage.prompt_tokens || 0
    jetons.sortie += usage.completion_tokens || 0
    console.log(`${v.gardes.length} retenu(s), ${v.jetes} jeté(s)`)
  }
  const cout = (jetons.entree * TARIF.entree + jetons.sortie * TARIF.sortie) / 1e6
  const date = new Date().toISOString().slice(0, 10)
  const chemin = join(RACINE, `revue-${date}.md`)
  writeFileSync(chemin, rapport({ date, modele: o.modele, fichiers, constats, jetes, jetons, cout }) + '\n')
  // Le repère n'avance que pour une revue de tout le périmètre (pas d'un seul dossier).
  if (!o.dossier) writeFileSync(REPERE, execFileSync('git', ['rev-parse', 'HEAD'], { cwd: RACINE, encoding: 'utf8' }))
  console.log(`Rapport : ${chemin}\n${constats.length} constat(s), ≈ ${cout.toFixed(2)} $.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}
