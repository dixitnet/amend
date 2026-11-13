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
        await sql`select m.id, m.nom, m.valeurs, m.modifie_le,
                         (select count(*)::int from amend.documents d where d.equipe = m.equipe and d.modele = m.id::text) as documents
                  from amend.modeles m where m.equipe = ${equipe} order by m.nom, m.cree_le`
      ).map((m) => ({
        id: m.id,
        nom: m.nom,
        valeurs: m.valeurs,
        modifieLe: m.modifie_le.getTime(),
        documents: m.documents,
      }))
    },
    /** Les modèles de toutes les équipes (pour chercher ceux qui utilisent une police). */
    async modelesDeToutesLesEquipes() {
      return (await sql`select id, nom, valeurs, equipe from amend.modeles where equipe is not null`).map((m) => ({
        id: m.id,
        nom: m.nom,
        valeurs: m.valeurs,
        equipe: m.equipe,
      }))
    },
    /** Les modèles de l'instance (sans équipe), avec ce qui s'en sert :
     * documents qui les ont choisis, équipes qui en ont fait leur défaut. */
    async modelesInstance() {
      return (
        await sql`select m.id, m.nom, m.valeurs, m.modifie_le,
                         (select count(*)::int from amend.documents d where d.modele = m.id::text) as documents,
                         (select count(*)::int from amend.equipes e where e.modele_defaut = m.id::text) as equipes
                  from amend.modeles m where m.equipe is null order by m.nom, m.cree_le`
      ).map((m) => ({
        id: m.id,
        nom: m.nom,
        valeurs: m.valeurs,
        modifieLe: m.modifie_le.getTime(),
        documents: m.documents,
        equipes: m.equipes,
      }))
    },
    /** Supprime un modèle de l'instance : les documents et les équipes qui
     * l'avaient retombent sur le défaut ; rend le nombre de documents touchés. */
    async supprimerModeleInstance(id) {
      return sql.begin(async (t) => {
        const touches = await t`update amend.documents set modele = null where modele = ${id} returning id`
        await t`update amend.equipes set modele_defaut = null where modele_defaut = ${id}`
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
      })
    },
    /** Les modèles enregistrés à l'ancienne façon (base et écarts, sans valeurs
     * complètes), à convertir (13/11/2026). */
    async modelesAConvertir() {
      return (await sql`select id, equipe, base, ecarts from amend.modeles where valeurs is null`).map((m) => ({
        id: m.id,
        equipe: m.equipe,
        base: m.base,
        ecarts: m.ecarts ?? {},
      }))
    },
    /** Les modèles de l'instance enregistrés à l'ancienne façon, pour résoudre les bases. */
    async modelesDeLInstanceAncienne() {
      return (await sql`select id, base, ecarts from amend.modeles where equipe is null`).map((m) => ({
        id: m.id,
        base: m.base,
        ecarts: m.ecarts ?? {},
      }))
    },
    async poserValeurs(id, valeurs) {
      await sql`update amend.modeles set valeurs = ${sql.json(valeurs)} where id = ${id} and valeurs is null`
    },
    async modele(id) {
      if (!estUuid(id)) return null
      const [m] = await sql`select id, equipe, nom, valeurs from amend.modeles where id = ${id}`
      return m ? { id: m.id, equipe: m.equipe, nom: m.nom, valeurs: m.valeurs } : null
    },
    /** Crée un modèle : une copie complète (`valeurs`), indépendante ensuite. */
    async creerModele(equipe, nom, valeurs, auteur) {
      const [m] = await sql`insert into amend.modeles (equipe, nom, valeurs, cree_par)
        values (${equipe}, ${nom}, ${sql.json(valeurs)}, ${auteur}) returning id`
      return m.id
    },
    /** Change le nom et (ou) les valeurs d'un modèle (`undefined` : inchangé). */
    async modifierModele(id, { nom, valeurs }) {
      await sql`update amend.modeles set
        nom = coalesce(${nom ?? null}, nom),
        valeurs = coalesce(${valeurs === undefined ? null : sql.json(valeurs)}, valeurs),
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
