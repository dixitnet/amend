// Envoi d'email via l'API HTTP de Mailgun — un simple appel HTTPS
// authentifié (module `https` natif de Node), sans client SMTP ni
// bibliothèque. Voir claude/conception-gestion-utilisateurs.md (projet
// Amend) pour le choix et son contexte.

import { request as requestHttps } from 'node:https'
import { request as requestHttp } from 'node:http'

export class MailConfigError extends Error {}
export class MailSendError extends Error {}

/** Échappement HTML — les textes viennent d'un titre de document et d'une
 * adresse email, donc de saisie humaine. */
function echapper(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
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
 * Un seul lien cliquable (22/10/2026) : le bouton. L'adresse écrite dessous
 * n'est plus un lien — c'est un texte à copier si le bouton ne marche pas. Une
 * passerelle de sécurité d'entreprise compte les liens d'un courrier, et un
 * courrier court, d'un domaine récent, avec deux liens vers le même jeton
 * ressemble à de l'hameçonnage ; la version texte seule garde l'adresse.
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
      <a href="${echapper(lien)}" style="display:inline-block;background:#017d5e;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:6px;font-size:15px;font-weight:600;">${echapper(libelleBouton)}</a>
    </p>
    <p style="margin:0 0 6px;font-size:13px;color:#6b6b6b;">Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :</p>
    <p style="margin:0 0 24px;font-size:13px;word-break:break-all;color:#017d5e;">${echapper(lien)}</p>
    <p style="margin:0;font-size:13px;color:#6b6b6b;line-height:1.5;">${echapper(apres)}</p>
  </div>
  <p style="max-width:520px;margin:14px auto 0;font-size:12px;color:#9a9a9a;text-align:center;">amend.ink</p>
</body></html>`
  return { text, html }
}

// Un envoi de remplacement, **pour les tests seulement** (01/10/2026) : le
// vrai appel part vers Mailgun par HTTPS, et un essai qui veut vérifier le
// chemin de réussite d'un courrier n'a pas à le faire. Posé en mémoire, par
// du code, jamais par la configuration : rien dans le `.env` ne peut
// détourner un courrier.
let envoiDeRemplacement = null
export function remplacerEnvoi(fn) {
  envoiDeRemplacement = typeof fn === 'function' ? fn : null
}

const DELAI_MAILGUN_MS = 15_000

export function sendMail({ to, subject, text, html, replyTo }) {
  if (envoiDeRemplacement) return Promise.resolve(envoiDeRemplacement({ to, subject, text, html, replyTo }))
  const apiKey = process.env.MAILGUN_API_KEY
  const domain = process.env.MAILGUN_DOMAIN
  // Mailgun a deux zones distinctes avec des identifiants et une API
  // séparés (api.mailgun.net pour US, api.eu.mailgun.net pour EU) — le
  // compte de Sylvain est en zone EU, d'où ce choix par défaut. Réglable
  // via MAILGUN_API_HOST si jamais un compte US est utilisé un jour.
  const apiHost = process.env.MAILGUN_API_HOST || 'api.eu.mailgun.net'
  // `MAILGUN_API_URL` (ex. http://127.0.0.1:19002) : un faux Mailgun local
  // pour les essais (tools/faux-mailgun.js). Absent en production.
  const faux = process.env.MAILGUN_API_URL ? new URL(process.env.MAILGUN_API_URL) : null
  const request = faux && faux.protocol === 'http:' ? requestHttp : requestHttps
  if (!apiKey || !domain) {
    return Promise.reject(new MailConfigError('MAILGUN_API_KEY et MAILGUN_DOMAIN requis (voir .env.example)'))
  }
  const from = process.env.MAILGUN_FROM || `amend.ink <no-reply@${domain}>`
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
        hostname: faux ? faux.hostname : apiHost,
        ...(faux && faux.port ? { port: Number(faux.port) } : {}),
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
    // Sans délai, une API qui ne répond pas laisse la requête (et la
    // personne qui attend son courrier) pendante indéfiniment (S11).
    req.setTimeout(DELAI_MAILGUN_MS, () =>
      req.destroy(new Error(`Mailgun n'a pas répondu en ${DELAI_MAILGUN_MS / 1000} s`))
    )
    req.on('error', (err) => reject(new MailSendError(err.message)))
    req.write(body)
    req.end()
  })
}

// --- Ce qu'un courrier est devenu (22/10/2026) --------------------------------
//
// Mailgun répond « mis en file » à l'envoi ; ce qui se passe ensuite (remis au
// serveur de la personne, refusé avec une raison) n'est connu que par ses
// journaux, qu'il garde quelques jours. Le panneau de partage les lit pour dire
// à un éditeur où en est chaque invitation : sans cela, « en attente » veut
// dire aussi bien « pas encore lue » que « jamais arrivée ».

let lectureDeRemplacement = null
/** Une lecture de remplacement, **pour les tests seulement** (comme
 * `remplacerEnvoi`) : reçoit `{ to, depuis, objet }`, renvoie un état. */
export function remplacerLecture(fn) {
  lectureDeRemplacement = typeof fn === 'function' ? fn : null
}

const DELAI_LECTURE_MS = 5_000

function lireMailgun(chemin) {
  const apiKey = process.env.MAILGUN_API_KEY
  const apiHost = process.env.MAILGUN_API_HOST || 'api.eu.mailgun.net'
  const faux = process.env.MAILGUN_API_URL ? new URL(process.env.MAILGUN_API_URL) : null
  const request = faux && faux.protocol === 'http:' ? requestHttp : requestHttps
  const auth = Buffer.from(`api:${apiKey}`).toString('base64')
  return new Promise((resolve, reject) => {
    const req = request(
      {
        method: 'GET',
        hostname: faux ? faux.hostname : apiHost,
        ...(faux && faux.port ? { port: Number(faux.port) } : {}),
        path: chemin,
        headers: { authorization: `Basic ${auth}` },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300)
            return reject(new MailSendError(`Mailgun ${res.statusCode}`))
          try {
            resolve(JSON.parse(data))
          } catch {
            reject(new MailSendError('réponse illisible'))
          }
        })
      }
    )
    req.setTimeout(DELAI_LECTURE_MS, () => req.destroy(new Error('délai dépassé')))
    req.on('error', (err) => reject(new MailSendError(err.message)))
    req.end()
  })
}

const raisonDe = (e) =>
  String(e['delivery-status']?.message || e['delivery-status']?.description || e.reject?.reason || e.reason || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)

/**
 * Où en est le courrier d'invitation envoyé à `to` depuis `depuis` (ms) ?
 * Renvoie toujours `{ etat, detail? }`, sans jamais lever :
 *   - `remis`    : le serveur de la personne l'a accepté (ce n'est pas dire
 *                  qu'il est dans sa boîte : un filtre peut l'écarter ensuite) ;
 *   - `refuse`   : refusé pour de bon, `detail` donne la raison du serveur ;
 *   - `en_cours` : mis en file ou différé, Mailgun réessaie ;
 *   - `inconnu`  : rien dans les journaux (trop ancien, Mailgun non configuré,
 *                  lecture refusée ou en panne).
 * Seuls les courriers dont l'objet répond à `objet` comptent (par défaut, ceux
 * qui commencent par « Invitation » ; le courrier d'embarquement s'appelle
 * « Bienvenue… »).
 */
export async function etatDuCourrier({ to, depuis, objet = /^Invitation/i }) {
  try {
    if (lectureDeRemplacement) return await lectureDeRemplacement({ to, depuis, objet })
    const domain = process.env.MAILGUN_DOMAIN
    if (!process.env.MAILGUN_API_KEY || !domain) return { etat: 'inconnu' }
    const debut = Math.floor(depuis / 1000) - 60
    const maintenant = Math.floor(Date.now() / 1000) + 60
    // Ordre décroissant : `begin` est la date la plus récente, `end` la plus ancienne.
    const r = await lireMailgun(
      `/v3/${encodeURIComponent(domain)}/events?recipient=${encodeURIComponent(to)}` +
        `&begin=${maintenant}&end=${debut}&ascending=no&limit=50`
    )
    const evts = (r.items || []).filter((e) => objet.test(e.message?.headers?.subject || '') && e.timestamp >= debut)
    if (evts.some((e) => e.event === 'delivered')) return { etat: 'remis' }
    const refus = evts.find((e) => e.event === 'rejected' || (e.event === 'failed' && e.severity !== 'temporary'))
    if (refus) return { etat: 'refuse', detail: raisonDe(refus) }
    const differe = evts.find((e) => e.event === 'failed')
    if (differe) return { etat: 'en_cours', detail: raisonDe(differe) }
    if (evts.some((e) => e.event === 'accepted')) return { etat: 'en_cours' }
    return { etat: 'inconnu' }
  } catch {
    return { etat: 'inconnu' }
  }
}

// Ce que le fournisseur a dit d'un courrier, gardé un moment : les écrans qui
// l'affichent se rouvrent souvent, et un état définitif (remis, refusé) ne
// change plus. Un état provisoire est relu au bout d'une demi-minute.
const CACHE_ETAT = new Map()
const DUREE_DEFINITIF_MS = 10 * 60_000
const DUREE_PROVISOIRE_MS = 30_000
const CACHE_ETAT_MAX = 500
const DELAI_ETAT_MS = 6_000
/** Au-delà, le fournisseur n'a plus rien : inutile de le demander. */
export const CONSERVATION_JOURNAUX_MS = 6 * 86_400_000

export async function etatDuCourrierEnMemoire(to, depuis, objet = /^Invitation/i) {
  if (Date.now() - depuis > CONSERVATION_JOURNAUX_MS) return { etat: 'inconnu' }
  const cle = `${to}|${depuis}|${objet.source}`
  const vu = CACHE_ETAT.get(cle)
  if (vu && vu.jusqua > Date.now()) return vu.etat
  const etat = await Promise.race([
    etatDuCourrier({ to, depuis, objet }),
    new Promise((resolve) => setTimeout(() => resolve({ etat: 'inconnu' }), DELAI_ETAT_MS).unref()),
  ])
  if (CACHE_ETAT.size >= CACHE_ETAT_MAX) CACHE_ETAT.clear()
  const definitif = etat.etat === 'remis' || etat.etat === 'refuse'
  CACHE_ETAT.set(cle, { etat, jusqua: Date.now() + (definitif ? DUREE_DEFINITIF_MS : DUREE_PROVISOIRE_MS) })
  return etat
}
