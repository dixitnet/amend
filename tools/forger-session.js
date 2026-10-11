#!/usr/bin/env node
// Fabrique des cookies de session pour une instance de TEST locale
// (protocole de test global, §2.4) : on connaît son SESSION_SECRET, on signe
// soi-même. Sert aux essais en local avec plusieurs identités (fuzz,
// matrice des droits, Playwright) — jamais en production, dont le secret ne
// quitte pas le serveur.
//
//   SESSION_SECRET=essai node tools/forger-session.js a@test.local b@test.local
//   → une ligne « adresse<TAB>collabtext_session=… » par adresse
//
// Ou, depuis un autre outil : `import { cookieDeSession } from './forger-session.js'`.

import { pathToFileURL } from 'node:url'

let secretFige = null

export async function cookieDeSession(email, secret = process.env.SESSION_SECRET) {
  if (!secret) throw new Error('SESSION_SECRET requis (celui de l’instance de test)')
  // server/auth.js lit le secret **une fois** à son premier import : un second
  // secret dans le même process signerait des cookies que personne ne
  // reconnaîtrait. On le dit au lieu de laisser un 401 mystérieux.
  if (secretFige && secretFige !== secret) throw new Error('un seul SESSION_SECRET par process (server/auth.js le fige au premier import)')
  secretFige = secret
  process.env.SESSION_SECRET = secret
  const { sessionCookieHeader } = await import('../server/auth.js')
  return sessionCookieHeader(email, { secure: false }).split(';')[0]
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const adresses = process.argv.slice(2)
  if (!adresses.length) {
    console.error('Usage : SESSION_SECRET=… node tools/forger-session.js adresse [adresse…]')
    process.exit(64)
  }
  for (const a of adresses) console.log(`${a}\t${await cookieDeSession(a)}`)
}
