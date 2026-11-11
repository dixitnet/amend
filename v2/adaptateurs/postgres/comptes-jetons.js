// Dépôt des comptes : les jetons de connexion (gardés par leur empreinte) et la
// purge de ce qui a vieilli.
// Découpé de `comptes.js` sans changement de logique : aucune règle ici, le
// domaine décide avant l'appel.
import { createHash, randomBytes } from 'node:crypto'

const empreinte = (jeton) => createHash('sha256').update(jeton).digest('hex')

/** @param {any} sql  la connexion de `ouvrirBase` */
export function partiesJetons(sql) {
  return {
    // --- Jetons de connexion ---
    /** Un jeton à usage unique ; rend sa forme en clair (pour le courrier). */
    async creerJeton(courriel, document, dureeMs) {
      const jeton = randomBytes(32).toString('base64url')
      await sql`insert into amend.jetons_connexion (empreinte, courriel, document, expire_le)
                values (${empreinte(jeton)}, ${courriel}, ${document}, ${new Date(Date.now() + dureeMs)})`
      return jeton
    },
    /** Consomme un jeton : `{ courriel, document }` s'il est valable et neuf, sinon null. */
    async consommerJeton(jeton) {
      if (typeof jeton !== 'string' || !jeton || jeton.length > 100) return null
      const [j] = await sql`
        update amend.jetons_connexion set utilise_le = now()
        where empreinte = ${empreinte(jeton)} and utilise_le is null and expire_le > now()
        returning courriel, document`
      return j ? { courriel: j.courriel, document: j.document } : null
    },
    /**
     * Efface ce qui ne sert plus : les jetons de connexion expirés ou utilisés
     * depuis plus de 24 h, et les invitations (documents et équipes) créées
     * avant `invitationsAvant` (la durée d'une invitation est une règle du
     * domaine : l'appelant donne la date limite). Rend les nombres effacés.
     * @param {number} [maintenant]  ms
     * @param {{ invitationsAvant: number }} limites  ms
     * @returns {Promise<{ jetons: number, invitations: number }>}
     */
    async purgerPerimes(maintenant = Date.now(), { invitationsAvant }) {
      const limiteJetons = new Date(maintenant - 24 * 3600 * 1000)
      const limiteInvitations = new Date(invitationsAvant)
      return sql.begin(async (t) => {
        const jetons = await t`delete from amend.jetons_connexion
          where expire_le < ${limiteJetons} or utilise_le < ${limiteJetons}`
        const docs = await t`delete from amend.invitations where cree_le < ${limiteInvitations}`
        const equipes = await t`delete from amend.invitations_equipe where cree_le < ${limiteInvitations}`
        return { jetons: jetons.count, invitations: docs.count + equipes.count }
      })
    },
    async jetonsRecents(courriel, depuisMs) {
      const [{ n }] =
        await sql`select count(*)::int as n from amend.jetons_connexion where courriel = ${courriel} and cree_le > ${new Date(Date.now() - depuisMs)}`
      return n
    },
  }
}
