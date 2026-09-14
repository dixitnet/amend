// Envoi d'email via l'API HTTP de Mailgun — un simple appel HTTPS
// authentifié (module `https` natif de Node), sans client SMTP ni
// bibliothèque. Voir claude/conception-gestion-utilisateurs.md (projet
// Amend) pour le choix et son contexte.

import { request } from 'node:https'

export class MailConfigError extends Error {}
export class MailSendError extends Error {}

export function sendMail({ to, subject, text }) {
  const apiKey = process.env.MAILGUN_API_KEY
  const domain = process.env.MAILGUN_DOMAIN
  if (!apiKey || !domain) {
    return Promise.reject(
      new MailConfigError('MAILGUN_API_KEY et MAILGUN_DOMAIN requis (voir .env.example)')
    )
  }
  const from = process.env.MAILGUN_FROM || `Amend <no-reply@${domain}>`
  const body = new URLSearchParams({ from, to, subject, text }).toString()
  const auth = Buffer.from(`api:${apiKey}`).toString('base64')

  return new Promise((resolve, reject) => {
    const req = request(
      {
        method: 'POST',
        hostname: 'api.mailgun.net',
        path: `/v3/${encodeURIComponent(domain)}/messages`,
        headers: {
          authorization: `Basic ${auth}`,
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve()
          else reject(new MailSendError(`Mailgun a répondu ${res.statusCode} : ${data}`))
        })
      }
    )
    req.on('error', (err) => reject(new MailSendError(err.message)))
    req.write(body)
    req.end()
  })
}
