#!/usr/bin/env node
// C4 — Typst sous contrainte (protocole de test global, §3.4 et §3.4 bis).
//
// Fabrique la source Typst d'un document du corpus *comme le navigateur* (même
// docToTypst, même feuille de style par défaut), puis la poste P fois en
// même temps sur POST /api/docs/<id>/pdf. Le serveur n'a qu'une file d'un
// rendu à la fois, trois en attente au plus (503 au-delà) : ce qu'on mesure
// ici, c'est la durée vue par chaque demandeur, les refus, et — avec la sonde
// indépendante (tools/observer.js) qui tourne à côté — ce que la
// composition coûte aux autres (boucle d'événements, GET, WebSocket).
//
//   node tools/export-pdf.mjs --base https://www.amend.ink --cookie "$(cat tools/.session-admin)" \
//        --doc <id d'un document de test> --profil livre --paralleles 1 --vagues 3 --sortie tests/campagne/c4-1.csv
//
//   --cas valide      (défaut) la source du corpus
//   --cas erreur      une source que Typst refuse (422 attendu, aucun résidu côté serveur)
//   --cas trop-gros   une source de plus de 2 Mo (413 attendu, sans lancer Typst)
//   --pause 20        secondes entre deux vagues (défaut 15)
//   --garder          enregistre un PDF de la première réponse valide (tests/campagne/<sortie>.pdf)

import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}
const base = opt('base', null)
const cookie = opt('cookie', null)
const doc = opt('doc', null)
const profil = opt('profil', 'livre')
const paralleles = Number(opt('paralleles', 1))
const vagues = Number(opt('vagues', 3))
const pause = Number(opt('pause', 15))
const cas = opt('cas', 'valide')
const sortie = opt('sortie', null)
if (!base || !cookie || !doc) {
  console.error(
    'usage : node tools/export-pdf.mjs --base URL --cookie "collabtext_session=…" --doc ID [--profil livre] [--paralleles N] [--vagues N] [--cas valide|erreur|trop-gros] [--sortie fichier.csv]'
  )
  process.exit(1)
}

const { documentProseMirror } = await import(pathToFileURL(join(RACINE, 'tools/corpus.js')).href)
const { docToTypst } = await import(pathToFileURL(join(RACINE, 'client/src/typstExport.js')).href)
const { styleParDefaut } = await import(pathToFileURL(join(RACINE, 'shared/style.js')).href)

let source
if (cas === 'valide') {
  const pm = documentProseMirror(profil)
  if (!pm) throw new Error(`le profil ${profil} n'a pas de document ProseMirror`)
  source = docToTypst(pm, styleParDefaut(), `CORPUS ${profil} — essai de composition`)
} else if (cas === 'erreur') {
  source = '#let x = (\n= Titre\nTexte avec une parenthèse jamais fermée\n'
} else if (cas === 'trop-gros') {
  source = '= Titre\n' + 'Un paragraphe de remplissage assez long pour peser. '.repeat(50000)
} else throw new Error(`cas inconnu : ${cas}`)
const octets = Buffer.byteLength(source, 'utf8')
console.log(
  `source ${cas} : ${octets} octets (${Math.round(octets / 1024)} Ko), ${paralleles} demande(s) simultanée(s) × ${vagues} vague(s), pause ${pause} s`
)
if (sortie) {
  mkdirSync(dirname(sortie), { recursive: true })
  writeFileSync(sortie, 't_iso,vague,demande,statut,duree_ms,octets_pdf,message\n')
}

const corps = JSON.stringify({ source })
const lignes = []
let gardeFait = false

async function une(v, i) {
  const t0 = Date.now()
  let statut = 'réseau',
    octetsPdf = 0,
    message = ''
  try {
    const res = await fetch(`${base}/api/docs/${doc}/pdf`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: corps,
    })
    statut = res.status
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      octetsPdf = buf.length
      if (!gardeFait && args.includes('--garder') && sortie) {
        gardeFait = true
        writeFileSync(sortie.replace(/\.csv$/, '') + '.pdf', buf)
      }
      if (buf.subarray(0, 5).toString() !== '%PDF-') message = 'réponse 200 mais pas un PDF'
    } else {
      message = ((await res.json().catch(() => ({}))).error || '').slice(0, 160).replace(/[",\n]/g, ' ')
    }
  } catch (e) {
    message = String(e.message || e).replace(/[",\n]/g, ' ')
  }
  const l = {
    t_iso: new Date(t0).toISOString(),
    vague: v,
    demande: i,
    statut,
    duree_ms: Date.now() - t0,
    octets_pdf: octetsPdf,
    message,
  }
  lignes.push(l)
  if (sortie) appendFileSync(sortie, Object.values(l).join(',') + '\n')
  console.log(
    `  vague ${v} · demande ${i} · ${statut} · ${l.duree_ms} ms${octetsPdf ? ` · PDF ${Math.round(octetsPdf / 1024)} Ko` : ''}${message ? ` · ${message}` : ''}`
  )
}

for (let v = 1; v <= vagues; v++) {
  console.log(`vague ${v}/${vagues} — ${new Date().toISOString().slice(11, 19)} UTC`)
  await Promise.all(Array.from({ length: paralleles }, (_, i) => une(v, i + 1)))
  if (v < vagues) await new Promise((r) => setTimeout(r, pause * 1000))
}

const q = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null)
const par = {}
for (const l of lignes) par[l.statut] = (par[l.statut] || 0) + 1
const ok = lignes
  .filter((l) => l.statut === 200)
  .map((l) => l.duree_ms)
  .sort((a, b) => a - b)
console.log('--- synthèse C4 ---')
console.log(
  JSON.stringify(
    {
      cas,
      profil,
      source_octets: octets,
      paralleles,
      vagues,
      statuts: par,
      duree_ms_200: ok.length ? { min: ok[0], p50: q(ok, 0.5), p95: q(ok, 0.95), max: ok[ok.length - 1] } : null,
      durees_tous_ms_max: Math.max(...lignes.map((l) => l.duree_ms)),
      pdf_octets: lignes.find((l) => l.octets_pdf)?.octets_pdf ?? null,
    },
    null,
    2
  )
)
