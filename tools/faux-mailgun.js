#!/usr/bin/env node
// Un faux Mailgun pour les essais (protocole de test global, §2.4) :
//
//   node tools/faux-mailgun.js --port 19002 --latence 50,400 --erreur-500 0.1
//   MAILGUN_API_URL=http://127.0.0.1:19002 MAILGUN_API_KEY=faux MAILGUN_DOMAIN=test.local node server/server.js
//
// Garde les courriers « envoyés » en mémoire (GET /courriers) : un essai peut
// y lire le lien magique, sans boîte aux lettres. **Jamais en production.**
//
// Options : --port N (19002) · --latence A,B (50,300) · --erreur-500 P ·
// --erreur-429 P · --silence P (jamais de réponse : exerce le délai de 15 s)

import { createServer } from 'node:http'

const args = process.argv.slice(2)
const opt = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`)
  return i === -1 ? defaut : args[i + 1]
}
const PORT = Number(opt('port', 19002))
const [LAT_MIN, LAT_MAX] = String(opt('latence', '50,300')).split(',').map(Number)
const P500 = Number(opt('erreur-500', 0))
const P429 = Number(opt('erreur-429', 0))
const PSILENCE = Number(opt('silence', 0))
const courriers = []
const dors = (ms) => new Promise((r) => setTimeout(r, ms))

const serveur = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/courriers') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify(courriers))
  }
  if (req.method !== 'POST' || !/^\/v3\/[^/]+\/messages$/.test(req.url)) return res.writeHead(404).end()
  let brut = ''
  for await (const m of req) brut += m
  if (Math.random() < PSILENCE) return
  await dors(LAT_MIN + Math.random() * Math.max(0, LAT_MAX - LAT_MIN))
  if (Math.random() < P429) return res.writeHead(429).end('{"message":"faux 429"}')
  if (Math.random() < P500) return res.writeHead(500).end('{"message":"faux 500"}')
  const champs = Object.fromEntries(new URLSearchParams(brut))
  courriers.push({ quand: new Date().toISOString(), to: champs.to, subject: champs.subject, text: champs.text })
  if (courriers.length > 5000) courriers.shift()
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ id: `<faux.${courriers.length}@test.local>`, message: 'Queued. Thank you.' }))
})
serveur.listen(PORT, '127.0.0.1', () => console.log(`faux Mailgun sur http://127.0.0.1:${PORT}`))
