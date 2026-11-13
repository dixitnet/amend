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
    /** Les modèles de toutes les équipes (pour chercher ceux qui utilisent une police). */
    async modelesDeToutesLesEquipes() {
      return (await sql`select id, nom, base, ecarts, equipe from amend.modeles where equipe is not null`).map((m) => ({
        id: m.id,
        nom: m.nom,
        base: m.base,
        ecarts: m.ecarts,
        equipe: m.equipe,
      }))
    },
    /** Les modèles de l'instance (sans équipe), avec ce qui s'en sert :
     * documents qui les ont choisis, équipes qui en ont fait leur défaut,
     * modèles d'équipe qui en dérivent. */
    async modelesInstance() {
      return (
        await sql`select m.id, m.nom, m.base, m.ecarts, m.modifie_le,
                         (select count(*)::int from amend.documents d where d.modele = m.id::text) as documents,
                         (select count(*)::int from amend.equipes e where e.modele_defaut = m.id::text) as equipes,
                         (select count(*)::int from amend.modeles x where x.base = m.id::text) as derives
                  from amend.modeles m where m.equipe is null order by m.nom, m.cree_le`
      ).map((m) => ({
        id: m.id,
        nom: m.nom,
        base: m.base,
        ecarts: m.ecarts,
        modifieLe: m.modifie_le.getTime(),
        documents: m.documents,
        equipes: m.equipes,
        derives: m.derives,
      }))
    },
    /** Supprime un modèle de l'instance : documents et équipes qui l'avaient
     * retombent sur le défaut, les modèles d'équipe qui en dérivaient
     * repartent de `base` ; rend le nombre de documents touchés. */
    async supprimerModeleInstance(id, base) {
      return sql.begin(async (t) => {
        const touches = await t`update amend.documents set modele = null where modele = ${id} returning id`
        await t`update amend.equipes set modele_defaut = null where modele_defaut = ${id}`
        await t`update amend.modeles set base = ${base}, modifie_le = now() where base = ${id}`
        await t`delete from amend.modeles where id = ${id} and equipe is null`
        return touches.length
      })
    },
    /** La reprise d'un modèle qui quitte le code (12/11/2026) : ce qui citait
     * `ancien` cite désormais `nouveau`. */
    async reprendreModele(ancien, nouveau) {
      await sql.begin(async (t) => {
        await t`update amend.documents set modele = ${nouveau} where modele = ${ancien}`
        await t`update amend.equipes set modele_defaut = ${nouveau} where modele_defaut = ${ancien}`
        await t`update amend.modeles set base = ${nouveau} where base = ${ancien}`
      })
    },
    /** L'ancien réglage « chapitre en belle page » des modèles d'équipe devient
     * le début de chapitre (12/11/2026). */
    async reprendreBellePage() {
      await sql`update amend.modeles set ecarts = (ecarts - 'chapitre.bellePage') ||
          jsonb_build_object('chapitre.debut', case when (ecarts->>'chapitre.bellePage')::boolean then 'belle-page' else 'page' end)
        where ecarts ? 'chapitre.bellePage'`
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
