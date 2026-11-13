// Dépôt des comptes : les polices de l'instance (13/11/2026). Aucune règle
// ici : le domaine a lu et accepté le fichier avant l'appel.
import { estUuid } from './base.js'

/** @param {any} sql  la connexion de `ouvrirBase` */
export function partiesPolices(sql) {
  return {
    /** Les fichiers de police de l'instance, sans leurs octets. */
    async polices() {
      return (
        await sql`select id, famille, style, graisse, fichier, taille, cree_le from amend.polices order by famille, cree_le`
      ).map((p) => ({
        id: p.id,
        famille: p.famille,
        style: p.style,
        graisse: p.graisse,
        fichier: p.fichier,
        octets: p.taille,
        creeLe: p.cree_le.getTime(),
      }))
    },
    /** Garde un fichier de police ; rend son identifiant. */
    async garderPolice({ famille, style, graisse, fichier }, octets, personne) {
      const [p] = await sql`insert into amend.polices (famille, style, graisse, fichier, octets, taille, cree_par)
                            values (${famille}, ${style}, ${graisse}, ${fichier}, ${octets}, ${octets.length}, ${personne})
                            returning id`
      return p.id
    },
    /** Les octets d'un fichier de police, ou `null`. */
    async octetsPolice(id) {
      if (!estUuid(id)) return null
      const [p] = await sql`select octets from amend.polices where id = ${id}`
      return p ? new Uint8Array(p.octets) : null
    },
    /** Les modèles (de l'instance et des équipes) qui ont choisi cette famille. */
    async modelesUtilisantPolice(famille) {
      return (await sql`select nom from amend.modeles where ecarts->>'police' = ${famille} order by nom`).map(
        (m) => m.nom,
      )
    },
    /** Supprime un fichier de police ; rend vrai s'il existait. */
    async supprimerPolice(id) {
      if (!estUuid(id)) return false
      return (await sql`delete from amend.polices where id = ${id} returning id`).length > 0
    },
  }
}
