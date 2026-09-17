// Envoi d'email via l'API HTTP de Mailgun — un simple appel HTTPS
// authentifié (module `https` natif de Node), sans client SMTP ni
// bibliothèque. Voir claude/conception-gestion-utilisateurs.md (projet
// Amend) pour le choix et son contexte.

import { request } from 'node:https'

export class MailConfigError extends Error {}
export class MailSendError extends Error {}

/** Échappement HTML — les textes viennent d'un titre de document et d'une
 * adresse email, donc de saisie humaine. */
function echapper(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/**
 * Un courrier à un seul geste : une phrase, un bouton, et l'adresse en
 * clair dessous. Renvoie `{ text, html }` — les deux parties, parce que
 * l'une ne remplace pas l'autre.
 *
 * Pourquoi une partie HTML (16/09/2026) : les deux courriers partaient en
 * texte seul, et beaucoup de clients de messagerie ne transforment pas une
 * URL en lien cliquable — d'autant moins qu'elle contient un `#` et un
 * jeton de trente caractères. Le lien s'affichait, il fallait le
 * sélectionner à la main. Pour l'unique porte d'entrée de l'application,
 * c'est une friction qu'on ne peut pas se permettre.
 *
 * Écrit sans image, sans police distante et sans feuille de style séparée :
 * les clients de messagerie en suppriment la plupart, et un courrier qui
 * dépend de ce qu'ils acceptent est un courrier qui casse.
 */
export function courrierAvecBouton({ titre, intro, libelleBouton, lien, apres }) {
  const text = `${intro}\n\n${lien}\n\n${apres}`
  const html = `<!doctype html>
<html lang="fr"><body style="margin:0;padding:24px;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#1c1c1c;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;padding:28px 30px;">
    <p style="margin:0 0 18px;font-size:19px;font-weight:600;">${echapper(titre)}</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">${echapper(intro)}</p>
    <p style="margin:0 0 24px;">
      <a href="${echapper(lien)}" style="display:inline-block;background:#5f7a4a;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:6px;font-size:15px;font-weight:600;">${echapper(libelleBouton)}</a>
    </p>
    <p style="margin:0 0 6px;font-size:13px;color:#6b6b6b;">Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :</p>
    <p style="margin:0 0 24px;font-size:13px;word-break:break-all;"><a href="${echapper(lien)}" style="color:#5f7a4a;">${echapper(lien)}</a></p>
    <p style="margin:0;font-size:13px;color:#6b6b6b;line-height:1.5;">${echapper(apres)}</p>
  </div>
  <p style="max-width:520px;margin:14px auto 0;font-size:12px;color:#9a9a9a;text-align:center;">Amend</p>
</body></html>`
  return { text, html }
}

export function sendMail({ to, subject, text, html, replyTo }) {
  const apiKey = process.env.MAILGUN_API_KEY
  const domain = process.env.MAILGUN_DOMAIN
  // Mailgun a deux zones distinctes avec des identifiants et une API
  // séparés (api.mailgun.net pour US, api.eu.mailgun.net pour EU) — le
  // compte de Sylvain est en zone EU, d'où ce choix par défaut. Réglable
  // via MAILGUN_API_HOST si jamais un compte US est utilisé un jour.
  const apiHost = process.env.MAILGUN_API_HOST || 'api.eu.mailgun.net'
  if (!apiKey || !domain) {
    return Promise.reject(
      new MailConfigError('MAILGUN_API_KEY et MAILGUN_DOMAIN requis (voir .env.example)')
    )
  }
  const from = process.env.MAILGUN_FROM || `Amend <no-reply@${domain}>`
  const champs = { from, to, subject, text }
  // Mailgun accepte les deux parties et laisse le client choisir : le HTML
  // s'affiche quand il est accepté, le texte sert de repli.
  if (html) champs.html = html
  // Répondre à un signalement doit aller à la personne qui l'a envoyé, pas
  // à la boîte no-reply de l'instance (palette de contact, 17/09/2026).
  if (replyTo) champs['h:Reply-To'] = replyTo
  const body = new URLSearchParams(champs).toString()
  const auth = Buffer.from(`api:${apiKey}`).toString('base64')

  return new Promise((resolve, reject) => {
    const req = request(
      {
        method: 'POST',
        hostname: apiHost,
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
