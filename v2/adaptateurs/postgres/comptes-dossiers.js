// Dépôt des comptes : les dossiers (rangement personnel, étape 6c, et dossiers d'équipe, 6d).
// Découpé de `comptes.js` sans changement de logique : aucune règle ici, le
// domaine décide avant l'appel.
import { estUuid } from './base.js'

/** @param {any} sql  la connexion de `ouvrirBase` */
export function partiesDossiers(sql) {
  return {
    // --- Dossiers (rangement personnel, étape 6c) ---
    /** Les dossiers d'un espace : ceux d'une personne (Mes documents), ou d'une équipe. */
    async dossiersDe(personne, equipe = null) {
      const lignes = equipe
        ? await sql`select id, nom, parent from amend.dossiers where equipe = ${equipe} order by nom, cree_le`
        : await sql`select id, nom, parent from amend.dossiers where personne = ${personne} order by nom, cree_le`
      return lignes.map((d) => ({ id: d.id, nom: d.nom, parent: d.parent }))
    },
    async dossier(id) {
      if (!estUuid(id)) return null
      const [d] = await sql`select id, nom, parent, personne, equipe from amend.dossiers where id = ${id}`
      return d ? { id: d.id, nom: d.nom, parent: d.parent, personne: d.personne, equipe: d.equipe } : null
    },
    /** Crée un dossier dans Mes documents de `personne`, ou dans l'équipe `equipe`. */
    async creerDossier(personne, nom, parent = null, equipe = null) {
      const [d] = await sql`insert into amend.dossiers (personne, nom, parent, equipe)
        values (${equipe ? null : personne}, ${nom}, ${parent}, ${equipe}) returning id`
      return d.id
    },
    renommerDossier: (id, nom) => sql`update amend.dossiers set nom = ${nom} where id = ${id}`.then(() => {}),
    /**
     * Déplace un dossier, en transaction : `refus` (la règle du domaine)
     * reçoit les dossiers de la personne, verrouillés ; deux déplacements
     * simultanés ne créent pas de boucle. Rend le code de refus, ou `null`.
     */
    async deplacerDossier(personne, id, parent, refus, equipe = null) {
      return sql.begin(async (t) => {
        const dossiers = equipe
          ? await t`select id, parent from amend.dossiers where equipe = ${equipe} for update`
          : await t`select id, parent from amend.dossiers where personne = ${personne} for update`
        const code = refus(dossiers.map((d) => ({ id: d.id, parent: d.parent })))
        if (code) return code
        await t`update amend.dossiers set parent = ${parent} where id = ${id}`
        return null
      })
    },
    /** Supprime un dossier s'il est vide (ni dossier ni document) ; rend `true` si c'est fait. */
    async supprimerDossierVide(id) {
      const r = await sql`
        delete from amend.dossiers d where d.id = ${id}
          and not exists (select 1 from amend.dossiers e where e.parent = d.id)
          and not exists (select 1 from amend.documents o where o.dossier = d.id and o.supprime_le is null)
        returning d.id`
      return r.length > 0
    },
  }
}
