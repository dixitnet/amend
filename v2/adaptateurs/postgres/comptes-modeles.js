// Dépôt des comptes : les modèles de mise en page des équipes (étape 7, ADR 0011).
// Découpé de `comptes.js` sans changement de logique : aucune règle ici, le
// domaine décide avant l'appel.
import { estUuid } from './base.js'

/** @param {any} sql  la connexion de `ouvrirBase` */
export function partiesModeles(sql) {
  return {
    // --- Modèles de mise en page (étape 7, ADR 0011) ---
    /** Les modèles d'une équipe, avec le nombre de documents qui les ont choisis. */
    async modelesDe(equipe) {
      return (
        await sql`select m.id, m.nom, m.base, m.ecarts, m.modifie_le,
                         (select count(*)::int from amend.documents d where d.equipe = m.equipe and d.modele = m.id::text) as documents
                  from amend.modeles m where m.equipe = ${equipe} order by m.nom, m.cree_le`
      ).map((m) => ({
        id: m.id,
        nom: m.nom,
        base: m.base,
        ecarts: m.ecarts,
        modifieLe: m.modifie_le.getTime(),
        documents: m.documents,
      }))
    },
    async modele(id) {
      if (!estUuid(id)) return null
      const [m] = await sql`select id, equipe, nom, base, ecarts from amend.modeles where id = ${id}`
      return m ? { id: m.id, equipe: m.equipe, nom: m.nom, base: m.base, ecarts: m.ecarts } : null
    },
    async creerModele(equipe, nom, base, ecarts, auteur) {
      const [m] = await sql`insert into amend.modeles (equipe, nom, base, ecarts, cree_par)
        values (${equipe}, ${nom}, ${base}, ${sql.json(ecarts)}, ${auteur}) returning id`
      return m.id
    },
    /** Change le nom et (ou) les écarts d'un modèle (`undefined` : inchangé). */
    async modifierModele(id, { nom, ecarts }) {
      await sql`update amend.modeles set
        nom = coalesce(${nom ?? null}, nom),
        ecarts = coalesce(${ecarts === undefined ? null : sql.json(ecarts)}, ecarts),
        modifie_le = now()
        where id = ${id}`
    },
    /** Supprime un modèle : les documents qui l'avaient, et l'équipe s'il
     * était son défaut, retombent sur le défaut ; rend le nombre de documents touchés. */
    async supprimerModele(id) {
      return sql.begin(async (t) => {
        const touches = await t`update amend.documents set modele = null where modele = ${id} returning id`
        await t`update amend.equipes set modele_defaut = null where modele_defaut = ${id}`
        await t`delete from amend.modeles where id = ${id}`
        return touches.length
      })
    },
    definirModeleDefaut: (equipe, modele) =>
      sql`update amend.equipes set modele_defaut = ${modele} where id = ${equipe}`.then(() => {}),
    definirModeleDocument: (document, modele) =>
      sql`update amend.documents set modele = ${modele} where id = ${document}`.then(() => {}),
  }
}
