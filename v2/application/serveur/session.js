// Session signée dans un cookie (ADR 0005) : l'identifiant de la personne,
// son nom et la date d'émission. Le serveur refuse une session de plus de
// 30 jours, ou émise avant un « déconnecter partout » (domaine, dépôt).
import { createHmac, timingSafeEqual } from 'node:crypto'

export const NOM_COOKIE = 'amend2_session'

const signer = (secret, texte) => createHmac('sha256', secret).update(texte).digest('base64url')

export function creerJeton(secret, personne, emis = Date.now()) {
  const corps = Buffer.from(JSON.stringify({ id: personne.id, nom: personne.nom ?? '', emis })).toString('base64url')
  return `${corps}.${signer(secret, corps)}`
}

export function lireJeton(secret, jeton) {
  const [corps, signature] = String(jeton || '').split('.')
  if (!corps || !signature) return null
  const attendue = Buffer.from(signer(secret, corps))
  const recue = Buffer.from(signature)
  if (attendue.length !== recue.length || !timingSafeEqual(attendue, recue)) return null
  try {
    const p = JSON.parse(Buffer.from(corps, 'base64url').toString('utf8'))
    return typeof p.id === 'string' && typeof p.nom === 'string' && Number.isSafeInteger(p.emis) ? p : null
  } catch {
    return null
  }
}

export function lireCookie(entete) {
  for (const morceau of String(entete || '').split(';')) {
    const [k, ...v] = morceau.trim().split('=')
    if (k === NOM_COOKIE) return v.join('=')
  }
  return null
}
