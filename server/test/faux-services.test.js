// Les deux faux services des essais (tools/faux-anthropic.js, faux-mailgun.js)
// et les variables qui les branchent (ANTHROPIC_API_URL, MAILGUN_API_URL) —
// protocole de test global, §2.4. Sans eux, la charge de l'IA et de la
// connexion ne se joue qu'en production, avec de vrais jetons et de vrais
// courriels.

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { urlAnthropic, suggestEdit } from '../ai.js'
import { sendMail } from '../mailgun.js'

const outils = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tools')
const processus = []
function lancer(script, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [join(outils, script), ...args], { stdio: ['ignore', 'pipe', 'inherit'] })
    processus.push(p)
    p.stdout.once('data', () => resolve(p))
    p.once('error', reject)
  })
}
test.after(() => {
  for (const p of processus) p.kill()
  setTimeout(() => process.exit(0), 50).unref()
})

test('sans variable, l’adresse est celle de l’API ; avec, celle du faux serveur', () => {
  delete process.env.ANTHROPIC_API_URL
  assert.equal(urlAnthropic(), 'https://api.anthropic.com/v1/messages')
  process.env.ANTHROPIC_API_URL = 'http://127.0.0.1:1234/'
  assert.equal(urlAnthropic(), 'http://127.0.0.1:1234/v1/messages')
  delete process.env.ANTHROPIC_API_URL
})

test('le bouton « Corriger » parle au faux Anthropic, et ses pannes sont lisibles', async () => {
  await lancer('faux-anthropic.js', ['--port', '19871', '--latence', '1,5'])
  process.env.ANTHROPIC_API_URL = 'http://127.0.0.1:19871'
  const r = await suggestEdit({ apiKey: 'faux' }, 'Le chat dort sur le canapé du salon.', 'Corrige.')
  assert.ok(r && (r.suggestion || r.text || typeof r === 'object'), 'une suggestion revient')
  const stats = await (await fetch('http://127.0.0.1:19871/stats')).json()
  assert.ok(stats.ok >= 1, 'le faux serveur a bien reçu l’appel')

  await lancer('faux-anthropic.js', ['--port', '19872', '--latence', '1,5', '--erreur-529', '1'])
  process.env.ANTHROPIC_API_URL = 'http://127.0.0.1:19872'
  await assert.rejects(() => suggestEdit({ apiKey: 'faux' }, 'Le chat dort.', 'Corrige.'), /529/)
  delete process.env.ANTHROPIC_API_URL
})

test('le faux Mailgun garde les courriers, et ses pannes se lisent', async () => {
  await lancer('faux-mailgun.js', ['--port', '19873', '--latence', '1,5'])
  process.env.MAILGUN_API_KEY = 'faux'
  process.env.MAILGUN_DOMAIN = 'test.local'
  process.env.MAILGUN_API_URL = 'http://127.0.0.1:19873'
  await sendMail({ to: 'a@test.local', subject: 'Bonjour', text: 'Un lien' })
  const courriers = await (await fetch('http://127.0.0.1:19873/courriers')).json()
  assert.equal(courriers.length, 1)
  assert.equal(courriers[0].to, 'a@test.local')

  await lancer('faux-mailgun.js', ['--port', '19874', '--latence', '1,5', '--erreur-500', '1'])
  process.env.MAILGUN_API_URL = 'http://127.0.0.1:19874'
  await assert.rejects(() => sendMail({ to: 'b@test.local', subject: 'x', text: 'y' }), /500/)
  delete process.env.MAILGUN_API_URL
})
