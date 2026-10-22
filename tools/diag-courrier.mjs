#!/usr/bin/env node
// Diagnostic du courrier — « des personnes ne reçoivent pas l'invitation »
// (22/10/2026). **Lecture seule** : rien n'est envoyé, rien n'est modifié chez
// Mailgun, la clé n'est jamais affichée.
//
//   node tools/diag-courrier.mjs                    # 7 derniers jours
//   node tools/diag-courrier.mjs --jours 3
//   node tools/diag-courrier.mjs --adresse nom@exemple.fr
//   node tools/diag-courrier.mjs --complet          # adresses en clair
//
// Pourquoi cet outil : l'application note « courrier envoyé » dès que Mailgun
// répond 2xx, c'est-à-dire « mis en file » (Queued). Ce que devient ensuite le
// courrier (remis, rejeté par le serveur du destinataire, refusé parce que
// l'adresse est dans la liste de blocage de Mailgun, jamais tenté…) n'est
// consigné nulle part chez nous. Ce rapport va le lire chez Mailgun.
//
// Il lit `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_API_HOST` du `.env` ; la
// clé doit pouvoir lire les journaux (clé « privée » du compte, pas une clé
// d'envoi seul). Mailgun ne garde les journaux que quelques jours selon l'offre.
//
// Cinq sections : 1. le domaine et son DNS · 2. l'envoi côté application ·
// 3. le sort des invitations chez Mailgun · 4. les échecs, avec la raison du
// serveur distant · 5. les listes de blocage.

import { request as requestHttps } from 'node:https'
import { request as requestHttp } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { resolveTxt, resolveCname } from 'node:dns/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`)
  return i === -1 ? defaut : args[i + 1]
}
const JOURS = Math.max(1, Number(opt('jours', 7)) || 7)
const COMPLET = args.includes('--complet')
const ADRESSE = (opt('adresse', '') || '').trim().toLowerCase()

// --- .env (sans toucher à l'environnement du processus au-delà de ces clés) --
function lireEnv() {
  const env = {}
  const chemin = join(RACINE, '.env')
  if (existsSync(chemin)) {
    for (const brut of readFileSync(chemin, 'utf8').split('\n')) {
      const l = brut.trim()
      if (!l || l.startsWith('#')) continue
      const eq = l.indexOf('=')
      if (eq === -1) continue
      let v = l.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      env[l.slice(0, eq).trim()] = v
    }
  }
  return env
}
const env = { ...lireEnv(), ...process.env }
const CLE = env.MAILGUN_API_KEY
const DOMAINE = env.MAILGUN_DOMAIN
const HOTE = env.MAILGUN_API_HOST || 'api.eu.mailgun.net'
const FAUX = env.MAILGUN_API_URL ? new URL(env.MAILGUN_API_URL) : null
const DATA = env.DATA_DIR || join(RACINE, 'data')

if (!CLE || !DOMAINE) {
  console.error(
    'MAILGUN_API_KEY et MAILGUN_DOMAIN introuvables dans .env : lancez cet outil à la racine du dépôt, sur le serveur.'
  )
  process.exit(1)
}

// --- Mise en forme -----------------------------------------------------------
const masque = (a) => {
  if (COMPLET || !a || !a.includes('@')) return a || ''
  const [l, d] = a.split('@')
  return `${l.slice(0, 2)}${'*'.repeat(Math.max(1, Math.min(6, l.length - 2)))}@${d}`
}
const titre = (t) => console.log(`\n=== ${t} ===`)
const date = (s) => new Date(s * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
const compte = (liste, cle) => {
  const m = new Map()
  for (const x of liste) m.set(cle(x), (m.get(cle(x)) || 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}
const domaineDe = (a) => String(a || '').split('@')[1] || '?'

// --- Mailgun -----------------------------------------------------------------
const auth = 'Basic ' + Buffer.from(`api:${CLE}`).toString('base64')
function appel(chemin) {
  const requete = FAUX && FAUX.protocol === 'http:' ? requestHttp : requestHttps
  return new Promise((resolve) => {
    const req = requete(
      {
        method: 'GET',
        hostname: FAUX ? FAUX.hostname : HOTE,
        ...(FAUX && FAUX.port ? { port: Number(FAUX.port) } : {}),
        path: chemin,
        headers: { authorization: auth },
        timeout: 20_000,
      },
      (res) => {
        let d = ''
        res.on('data', (c) => (d += c))
        res.on('end', () => {
          let json = null
          try {
            json = JSON.parse(d)
          } catch {}
          resolve({ statut: res.statusCode, json, brut: d })
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error('délai dépassé')))
    req.on('error', (e) => resolve({ statut: 0, json: null, brut: e.message }))
    req.end()
  })
}
const dom = encodeURIComponent(DOMAINE)

/** Parcourt les pages d'un résultat Mailgun (`paging.next`), au plus `pages`. */
async function toutesLesPages(chemin, pages = 12) {
  const items = []
  let url = chemin
  for (let i = 0; i < pages && url; i++) {
    const r = await appel(url)
    if (r.statut !== 200) return { items, erreur: r }
    const lot = r.json?.items || []
    if (!lot.length) break
    items.push(...lot)
    const suivant = r.json?.paging?.next
    url = suivant ? new URL(suivant).pathname + new URL(suivant).search : null
  }
  return { items }
}

// --- 1. Domaine et DNS -------------------------------------------------------
async function sectionDomaine() {
  titre(`1. Domaine d'envoi : ${DOMAINE} (API ${FAUX ? FAUX.host : HOTE})`)
  console.log(`Expéditeur utilisé : ${env.MAILGUN_FROM || `amend.ink <no-reply@${DOMAINE}>`}`)
  const r = await appel(`/v4/domains/${dom}`)
  if (r.statut === 401 || r.statut === 403) {
    console.log(
      `! Mailgun refuse la lecture (${r.statut}). La clé est sans doute une clé d'envoi seul : prenez la clé privée du compte (Mailgun → Settings → API keys) pour ce diagnostic, ou lisez les journaux dans Mailgun → Sending → Logs.`
    )
    return false
  }
  if (r.statut !== 200 || !r.json?.domain) {
    console.log(`! Réponse inattendue (${r.statut}) : ${String(r.brut).slice(0, 200)}`)
    return false
  }
  const d = r.json.domain
  console.log(`État : ${d.state}${d.state === 'active' ? '' : '   ← PROBLÈME : un domaine non actif n’envoie pas'}`)
  console.log(
    `Type : ${d.type || '?'} · créé le ${d.created_at || '?'} · IP dédiée : ${r.json.sending_ips?.length ? 'oui' : 'non (pool partagé)'}`
  )
  const enr = r.json.sending_dns_records || []
  console.log('\nEnregistrements d’envoi attendus par Mailgun, et ce que le DNS public répond :')
  for (const e of enr) {
    let vu = ''
    try {
      if (e.record_type === 'TXT') vu = (await resolveTxt(e.name)).map((x) => x.join('')).join(' | ')
      else if (e.record_type === 'CNAME') vu = (await resolveCname(e.name)).join(' | ')
    } catch (err) {
      vu = `(rien : ${err.code || err.message})`
    }
    const attendu = String(e.value).replace(/\.$/, '')
    const ok = vu && attendu && vu.replace(/\.$/, '').includes(attendu.slice(0, 40))
    console.log(`  ${e.record_type.padEnd(5)} ${e.name}`)
    console.log(`        Mailgun : ${e.valid}${e.valid === 'valid' ? '' : '   ← PROBLÈME'}`)
    console.log(
      `        DNS     : ${ok ? 'conforme' : 'DIFFÉRENT ou absent   ← PROBLÈME'}${ok ? '' : `\n                  vu : ${vu.slice(0, 160)}\n                  attendu : ${attendu.slice(0, 160)}`}`
    )
  }
  // SPF et DMARC du domaine d'envoi et de son parent.
  const parent = DOMAINE.split('.').slice(-2).join('.')
  const verifs = [['SPF', DOMAINE]]
  if (parent !== DOMAINE) verifs.push(['SPF', parent])
  verifs.push(['DMARC', `_dmarc.${parent}`])
  for (const [nom, cible] of verifs) {
    try {
      const t = (await resolveTxt(cible)).map((x) => x.join(''))
      const sel = nom === 'SPF' ? t.filter((x) => x.startsWith('v=spf1')) : t.filter((x) => x.startsWith('v=DMARC1'))
      console.log(`\n${nom} de ${cible} : ${sel.length ? sel.join(' | ') : '(aucun)'}`)
    } catch (err) {
      console.log(`\n${nom} de ${cible} : (rien : ${err.code || err.message})`)
    }
  }
  const suivi = await appel(`/v3/domains/${dom}/tracking`)
  if (suivi.statut === 200 && suivi.json?.tracking) {
    const t = suivi.json.tracking
    console.log(
      `\nSuivi Mailgun : clics ${t.click?.active ? 'ACTIFS (les liens du courrier sont réécrits)' : 'inactifs'} · ouvertures ${t.open?.active ? 'actives (pixel invisible)' : 'inactives'}`
    )
  }
  return true
}

// --- 2. Côté application -----------------------------------------------------
function sectionApplication() {
  titre('2. Ce que l’application a enregistré (data/events-mail.jsonl)')
  const f = join(DATA, 'events-mail.jsonl')
  if (!existsSync(f)) return console.log('(fichier absent)')
  const depuis = Date.now() - JOURS * 86_400_000
  const lignes = readFileSync(f, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l)
      } catch {
        return null
      }
    })
    .filter((e) => e && e.ts >= depuis)
  const types = [...new Set(lignes.map((e) => e.type))]
  for (const t of types) {
    const s = lignes.filter((e) => e.type === t)
    const ok = s.filter((e) => e.ok).length
    console.log(`  ${t.padEnd(14)} ${s.length} envoi(s) : ${ok} acceptés par Mailgun, ${s.length - ok} en erreur`)
    for (const [raison, n] of compte(
      s.filter((e) => !e.ok),
      (e) => String(e.erreur || '?').slice(0, 120)
    ).slice(0, 5)) {
      console.log(`      ${n} × ${raison}`)
    }
  }
  if (!types.length) console.log(`  (aucun courrier sur ${JOURS} jour(s))`)
  console.log('  Rappel : « accepté » veut dire « mis en file chez Mailgun », pas « remis ».')
}

// --- 3 et 4. Journaux Mailgun ------------------------------------------------
async function sectionJournaux() {
  const debut = Math.floor(Date.now() / 1000) - JOURS * 86_400
  const lire = (evenement) =>
    toutesLesPages(
      `/v3/${dom}/events?event=${evenement}&begin=${debut}&ascending=no&limit=300${ADRESSE ? `&recipient=${encodeURIComponent(ADRESSE)}` : ''}`
    )
  const [acceptes, remis, echecs, rejetes, plaintes] = await Promise.all(
    ['accepted', 'delivered', 'failed', 'rejected', 'complained'].map(lire)
  )
  for (const r of [acceptes, remis, echecs, rejetes, plaintes]) {
    if (r.erreur) {
      titre('3. Journaux Mailgun')
      console.log(`! Lecture impossible (${r.erreur.statut}) : ${String(r.erreur.brut).slice(0, 200)}`)
      return
    }
  }
  const estInvitation = (e) => /^Invitation/i.test(e.message?.headers?.subject || '')
  const parId = (e) => e.message?.headers?.['message-id']

  titre(
    `3. Sort des courriers chez Mailgun, ${JOURS} dernier(s) jour(s)${ADRESSE ? `, adresse ${masque(ADRESSE)}` : ''}`
  )
  console.log(
    `  mis en file : ${acceptes.items.length} · remis : ${remis.items.length} · échecs : ${echecs.items.length} · rejetés par Mailgun : ${rejetes.items.length} · plaintes : ${plaintes.items.length}`
  )
  if (!acceptes.items.length)
    console.log(
      '  Aucun événement : soit rien n’est parti, soit la durée de conservation des journaux de l’offre est dépassée (voir --jours 1).'
    )

  const inv = acceptes.items.filter(estInvitation)
  const idRemis = new Set(remis.items.map(parId))
  const idEchec = new Set([...echecs.items, ...rejetes.items].map(parId))
  const sansIssue = inv.filter((e) => !idRemis.has(parId(e)) && !idEchec.has(parId(e)))
  console.log(
    `\n  Invitations : ${inv.length} mises en file · ${inv.filter((e) => idRemis.has(parId(e))).length} remises · ${inv.filter((e) => idEchec.has(parId(e))).length} en échec · ${sansIssue.length} sans aucune issue connue`
  )
  // « Sans issue » ne vaut que pour les courriers assez anciens : un courrier
  // d’il y a trois minutes peut encore être en route.
  const anciens = sansIssue.filter((e) => Date.now() / 1000 - e.timestamp > 3600)
  if (anciens.length) {
    console.log(
      `\n  Invitations vieilles de plus d’une heure, mises en file mais ni remises ni refusées (${anciens.length}) :`
    )
    for (const e of anciens.slice(0, 20)) console.log(`    ${date(e.timestamp)}  ${masque(e.recipient)}`)
  }
  const recus = inv.filter((e) => idRemis.has(parId(e)))
  if (recus.length) {
    console.log('\n  Remises par domaine de destinataire (remis / mis en file) :')
    for (const [d, n] of compte(inv, (e) => domaineDe(e.recipient)).slice(0, 12)) {
      const r = recus.filter((e) => domaineDe(e.recipient) === d).length
      console.log(`    ${d.padEnd(28)} ${r} / ${n}`)
    }
  }

  titre('4. Échecs et rejets : la raison donnée par le serveur du destinataire')
  const pannes = [...echecs.items, ...rejetes.items]
  if (!pannes.length) console.log('  Aucun échec ni rejet sur la période.')
  for (const e of pannes.slice(0, 40)) {
    const ds = e['delivery-status'] || {}
    const raison = ds.message || ds.description || e.reject?.reason || e.reason || e.reject?.description || '?'
    console.log(`  ${date(e.timestamp)}  ${e.event}${e.severity ? `/${e.severity}` : ''}  ${masque(e.recipient)}`)
    console.log(
      `      code ${ds.code ?? '-'}${ds['mx-host'] ? ` · ${ds['mx-host']}` : ''} · ${String(raison).slice(0, 220)}`
    )
  }
  if (pannes.length) {
    console.log('\n  Raisons les plus fréquentes :')
    for (const [raison, n] of compte(pannes, (e) => {
      const ds = e['delivery-status'] || {}
      return String(ds.message || ds.description || e.reject?.reason || e.reason || '?').slice(0, 100)
    }).slice(0, 6))
      console.log(`    ${n} × ${raison}`)
  }
}

// --- 5. Listes de blocage ----------------------------------------------------
async function sectionBlocages() {
  titre('5. Listes de blocage de Mailgun (une adresse qui y figure ne reçoit plus rien)')
  for (const [nom, chemin] of [
    ['Rebonds durs (bounces)', 'bounces'],
    ['Plaintes (complaints)', 'complaints'],
    ['Désinscriptions (unsubscribes)', 'unsubscribes'],
  ]) {
    const r = await appel(`/v3/${dom}/${chemin}?limit=100`)
    if (r.statut !== 200) {
      console.log(`  ${nom} : lecture impossible (${r.statut})`)
      continue
    }
    const items = (r.json?.items || []).filter((x) => !ADRESSE || x.address?.toLowerCase() === ADRESSE)
    console.log(`  ${nom} : ${items.length}${r.json?.paging?.next && items.length >= 100 ? ' ou plus' : ''}`)
    for (const x of items.slice(0, 15)) {
      console.log(
        `      ${masque(x.address)}  ${x.created_at ? x.created_at.slice(0, 16) : ''}  ${x.code ? `code ${x.code}` : ''} ${String(x.error || '').slice(0, 140)}`
      )
    }
  }
  console.log(
    '\n  Pour retirer une adresse d’une liste : Mailgun → Sending → Suppressions, ou DELETE /v3/<domaine>/bounces/<adresse>.'
  )
}

console.log(
  `Diagnostic du courrier amend.ink — ${new Date().toISOString().slice(0, 16)} UTC — ${JOURS} jour(s)${COMPLET ? '' : ' — adresses masquées (--complet pour les voir)'}`
)
const lisible = await sectionDomaine()
sectionApplication()
if (lisible) {
  await sectionJournaux()
  await sectionBlocages()
} else {
  console.log('\n(Sections 3 à 5 sautées : Mailgun ne se laisse pas lire avec cette clé.)')
}
console.log('\nFin du diagnostic. Rien n’a été envoyé ni modifié.')
