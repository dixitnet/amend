// L'identifiant d'un document (couche domaine) : il voyage dans les adresses
// et y/hub le reçoit tel qu'il y est écrit, encodé. Règle simple et sûre :
// lettres et chiffres ASCII, tiret, tiret bas, de 1 à 64 signes. Les vrais
// documents auront des identifiants générés (étape 6) ; un accent, une espace
// ou un emoji sont refusés plutôt que de produire deux documents pour un même
// nom (NFC et NFD s'encodent différemment).
const LONGUEUR_MAX_IDENTIFIANT = 64

/** @returns {{ ok: true, id: string } | { ok: false, code: string }} */
export function identifiantDocument(brut) {
  const id = String(brut ?? '').trim()
  if (!id) return { ok: false, code: 'document-vide' }
  if (id.length > LONGUEUR_MAX_IDENTIFIANT) return { ok: false, code: 'document-trop-long' }
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return { ok: false, code: 'document-caracteres' }
  return { ok: true, id }
}

/** La langue d'un document, tant qu'elle n'est pas enregistrée avec lui
 * (étape 6) : le français (décision de Sylvain, étape 4). Elle règle la
 * typographie, et plus tard les exports et Margo ; elle n'est pas la langue
 * de l'interface. */
export const LANGUE_DOCUMENT_PAR_DEFAUT = 'fr'
