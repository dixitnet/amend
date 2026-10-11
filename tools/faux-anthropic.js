#!/usr/bin/env node
// Un faux Anthropic pour les essais (protocole de test global, claude/
// protocole-test-global.md, §2.4). À brancher avec :
//
//   node tools/faux-anthropic.js --port 19001 --latence 800,6000 --erreur-429 0.05
//   ANTHROPIC_API_URL=http://127.0.0.1:19001 ANTHROPIC_API_KEY=faux node server/server.js
//
// Il sert deux choses : charger Margo et le bouton « Corriger » sans payer un
// jeton, et provoquer des pannes reproductibles (429, 500, 529, silence,
// coupure de la connexion) que la vraie API ne donne pas à la demande.
// **Jamais en production** : la variable ANTHROPIC_API_URL n'y est pas posée.
//
// Options (en ligne de commande ou variables FAUX_*) :
//   --port N          port d'écoute (19001)
//   --latence A,B     délai de réponse tiré entre A et B millisecondes (200,1500)
//   --erreur-429 P    part des réponses en 429 (0)
//   --erreur-500 P    part des réponses en 500 (0)
//   --erreur-529 P    part des réponses en 529, « surchargé » (0)
//   --silence P       part des requêtes jamais répondues (0)
//   --coupure P       part des connexions coupées net, sans réponse (0)
//   --tronque P       part des réponses coupées par max_tokens (0)
//   --outils          le faux modèle appelle d'abord l'outil `plan` (exerce la boucle de Margo)

import { createServer } from 'node:http'

const args = process.argv.slice(2)
const opt = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`)
  if (i !== -1) return args[i + 1]
  const env = process.env[`FAUX_${nom.toUpperCase().replace(/-/g, '_')}`]
  return env === undefined ? defaut : env
}
const PORT = Number(opt('port', 19001))
const [LAT_MIN, LAT_MAX] = String(opt('latence', '200,1500')).split(',').map(Number)
const P = {
  429: Number(opt('erreur-429', 0)),
  500: Number(opt('erreur-500', 0)),
  529: Number(opt('erreur-529', 0)),
  silence: Number(opt('silence', 0)),
  coupure: Number(opt('coupure', 0)),
  tronque: Number(opt('tronque', 0)),
}
const OUTILS = args.includes('--outils') || process.env.FAUX_OUTILS === '1'

const compteurs = { requetes: 0, ok: 0, 429: 0, 500: 0, 529: 0, silence: 0, coupure: 0, tronque: 0, enCours: 0, pic: 0 }
const dors = (ms) => new Promise((r) => setTimeout(r, ms))
const tirage = (p) => p > 0 && Math.random() < p

function dernierTexte(corps) {
  const messages = Array.isArray(corps.messages) ? corps.messages : []
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'user') continue
    if (typeof m.content === 'string') return m.content
    if (Array.isArray(m.content)) {
      const t = m.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
      if (t) return t
    }
  }
  return ''
}

function dejaUnResultatDOutil(corps) {
  return (corps.messages || []).some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result'))
}

const serveur = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/stats') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify(compteurs))
  }
  if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) {
    res.writeHead(404).end()
    return
  }
  let brut = ''
  for await (const morceau of req) brut += morceau
  let corps = {}
  try {
    corps = JSON.parse(brut)
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'JSON illisible' } }))
  }
  compteurs.requetes++
  compteurs.enCours++
  compteurs.pic = Math.max(compteurs.pic, compteurs.enCours)
  res.on('close', () => { compteurs.enCours-- })

  if (tirage(P.silence)) { compteurs.silence++; return } // jamais de réponse
  if (tirage(P.coupure)) { compteurs.coupure++; req.socket.destroy(); return }
  await dors(LAT_MIN + Math.random() * Math.max(0, LAT_MAX - LAT_MIN))
  for (const code of [429, 500, 529]) {
    if (tirage(P[code])) {
      compteurs[code]++
      res.writeHead(code, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ type: 'error', error: { type: code === 429 ? 'rate_limit_error' : 'api_error', message: `faux ${code}` } }))
    }
  }

  const texte = dernierTexte(corps)
  const entree = Math.ceil(JSON.stringify(corps).length / 3.2)
  const aOutils = Array.isArray(corps.tools) && corps.tools.some((t) => t.name === 'plan')
  let reponse
  if (OUTILS && aOutils && !dejaUnResultatDOutil(corps) && corps.tool_choice?.type !== 'none') {
    reponse = {
      id: 'msg_faux', type: 'message', role: 'assistant', model: corps.model || 'faux',
      content: [{ type: 'tool_use', id: `toolu_faux_${compteurs.requetes}`, name: 'plan', input: {} }],
      stop_reason: 'tool_use', usage: { input_tokens: entree, output_tokens: 30 },
    }
  } else if (tirage(P.tronque)) {
    compteurs.tronque++
    reponse = {
      id: 'msg_faux', type: 'message', role: 'assistant', model: corps.model || 'faux',
      content: [{ type: 'text', text: 'Une réponse coupée en' }],
      stop_reason: 'max_tokens', usage: { input_tokens: entree, output_tokens: corps.max_tokens || 100 },
    }
  } else {
    // Le « modèle » rend le passage presque tel quel : de quoi produire une
    // suggestion à comparer, sans rien inventer.
    const rendu = texte ? texte.replace(/\s+/g, ' ').trim().slice(0, 400) : 'Réponse du faux modèle.'
    reponse = {
      id: 'msg_faux', type: 'message', role: 'assistant', model: corps.model || 'faux',
      content: [{ type: 'text', text: rendu }],
      stop_reason: 'end_turn', usage: { input_tokens: entree, output_tokens: Math.ceil(rendu.length / 3.2) },
    }
  }
  compteurs.ok++
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(reponse))
})

serveur.listen(PORT, '127.0.0.1', () => {
  console.log(`faux Anthropic sur http://127.0.0.1:${PORT}  latence ${LAT_MIN}-${LAT_MAX} ms  erreurs ${JSON.stringify(P)}${OUTILS ? '  outils' : ''}`)
})
