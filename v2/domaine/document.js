// L'identifiant d'un document (couche domaine) : il voyage dans les adresses
// et y/hub le reçoit tel qu'il y est écrit, encodé. Règle simple et sûre :
// lettres et chiffres ASCII, tiret, tiret bas, de 1 à 64 signes. Les vrais
// documents auront des identifiants générés (étape 6) ; un accent, une espace
// ou un emoji sont refusés plutôt que de produire deux documents pour un même
// nom (NFC et NFD s'encodent différemment).
import { INVISIBLES } from './personne.js'

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

const LONGUEUR_MAX_TITRE = 200

/** Le titre d'un document (format S : modifiable, dans le bandeau ; Sylvain,
 * 09/11/2026) : NFC, sans espaces en trop ; vide ou absent → `null` (« Sans
 * titre ») ; 200 signes au plus. */
export function titreDocument(brut) {
  if (brut === undefined || brut === null) return { ok: true, titre: null }
  if (typeof brut !== 'string') return { ok: false, code: 'titre-invalide' }
  // Les espaces insécables (typographie française) restent : seuls les blancs
  // ordinaires sont resserrés (audit du 10/11/2026).
  const titre = brut
    .normalize('NFC')
    .replace(/[^\S\u00A0\u202F]+/g, ' ')
    .trim()
  // Ni caractère de contrôle, ni invisible, ni marque de sens d'écriture
  // (même contrôle que le nom d'une personne ; les insécables ne sont pas du lot).
  if (INVISIBLES.test(titre)) return { ok: false, code: 'titre-invalide' }
  if ([...titre].length > LONGUEUR_MAX_TITRE) return { ok: false, code: 'titre-invalide' }
  return { ok: true, titre: titre || null }
}

/** Le nom du fichier d'un export : le titre, sans les signes que refusent
 * les systèmes de fichiers, puis l'extension. Sans titre : `document`. */
export function nomDeFichier(titre, extension) {
  const base = String(titre ?? '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // 120 signes au plus, comptés en points de code : un emoji n'est jamais coupé en deux.
  const court = [...base].slice(0, 120).join('').trim()
  return `${court || 'document'}.${extension}`
}
