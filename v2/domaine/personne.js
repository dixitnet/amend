// Le nom affiché d'une personne (couche domaine) : en NFC, sans espaces en
// trop, sans caractère invisible ni de contrôle, 80 signes au plus. Les
// emojis composés (avec liant sans chasse) restent permis.
export const LONGUEUR_MAX_NOM = 80

// Contrôles, espace sans chasse, marques et isolats de sens d'écriture.
const INVISIBLES = /[\p{Cc}\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u

/** @returns {{ ok: true, nom: string } | { ok: false, code: string }} */
export function nomPersonne(brut) {
  const nom = String(brut ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
  if (!nom) return { ok: false, code: 'nom-vide' }
  if (INVISIBLES.test(nom) || /^\p{M}/u.test(nom)) return { ok: false, code: 'nom-caracteres' }
  if ([...nom].length > LONGUEUR_MAX_NOM) return { ok: false, code: 'nom-trop-long' }
  return { ok: true, nom }
}
