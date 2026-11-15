// Dépôt des comptes : les polices de l'instance (13/11/2026). Aucune règle
// ici : le domaine a lu et accepté le fichier avant l'appel.
import { estUuid } from './base.js'

/** @param {any} sql  la connexion de `ouvrirBase` */
export function partiesPolices(sql) {
  return {
    /** Les fichiers de police de l'instance, sans leurs octets. */
    async polices() {
      return (
        await sql`select id, famille, style, graisse, fichier, taille, cree_le, actif from amend.polices order by famille, cree_le`
      ).map((p) => ({
        id: p.id,
        famille: p.famille,
        style: p.style,
        graisse: p.graisse,
        fichier: p.fichier,
        octets: p.taille,
        creeLe: p.cree_le.getTime(),
        actif: p.actif,
      }))
    },
    /** Garde un fichier de police ; rend son identifiant. */
    async garderPolice({ famille, style, graisse, fichier }, octets, personne) {
      const [p] = await sql`insert into amend.polices (famille, style, graisse, fichier, octets, taille, cree_par)
                            values (${famille}, ${style}, ${graisse}, ${fichier}, ${octets}, ${octets.length}, ${personne})
                            on conflict (famille, style, graisse) do nothing
                            returning id`
      // `null` : ce style de cette famille est déjà là (envoi simultané).
      return p?.id ?? null
    },
    /** Les octets d'un fichier de police, ou `null`. */
    async octetsPolice(id) {
      if (!estUuid(id)) return null
      const [p] = await sql`select octets from amend.polices where id = ${id}`
      return p ? new Uint8Array(p.octets) : null
    },
    /** Active ou désactive une famille (tous ses fichiers) ; rend le nombre de fichiers touchés. */
    async activerFamille(famille, actif) {
      return (await sql`update amend.polices set actif = ${actif} where famille = ${famille} returning id`).length
    },
    /** Supprime tous les fichiers d'une famille ; rend leur nombre. */
    async supprimerFamille(famille) {
      return (await sql`delete from amend.polices where famille = ${famille} returning id`).length
    },
    /** Supprime un fichier de police ; rend vrai s'il existait. */
    async supprimerPolice(id) {
      if (!estUuid(id)) return false
      return (await sql`delete from amend.polices where id = ${id} returning id`).length > 0
    },
  }
}
