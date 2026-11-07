// Session signée dans un cookie (étape 1 : identité de développement seulement ;
// le lien magique arrive à l'étape 6, ADR 0005).
import { createHmac, timingSafeEqual } from 'node:crypto'

export const NOM_COOKIE = 'amend2_session'

const signer = (secret, texte) => createHmac('sha256', secret).update(texte).digest('base64url')

export function creerJeton(secret, personne) {
  const corps = Buffer.from(JSON.stringify({ id: personne.id, nom: personne.nom })).toString('base64url')
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
    return typeof p.id === 'string' && typeof p.nom === 'string' ? p : null
  } catch {
    return null
  }
}

export function lireCookie(entete, nom = NOM_COOKIE) {
  for (const morceau of String(entete || '').split(';')) {
    const [k, ...v] = morceau.trim().split('=')
    if (k === nom) return v.join('=')
  }
  return null
}
