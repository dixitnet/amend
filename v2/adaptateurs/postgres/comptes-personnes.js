// Dépôt des comptes : les personnes et leurs sessions.
// Découpé de `comptes.js` sans changement de logique : aucune règle ici, le
// domaine décide avant l'appel.
import { estUuid } from './base.js'

const personneDe = (p) => (p ? { id: p.id, courriel: p.courriel, nom: p.nom } : null)

/** @param {any} sql  la connexion de `ouvrirBase` */
export function partiesPersonnes(sql) {
  return {
    // --- Personnes ---
    async personneParCourriel(courriel) {
      const [p] = await sql`select * from amend.personnes where courriel = ${courriel}`
      return personneDe(p)
    },
    async personne(id) {
      if (!estUuid(id)) return null
      const [p] = await sql`select * from amend.personnes where id = ${id}`
      return personneDe(p)
    },
    /** La personne de cette adresse, créée si besoin. */
    async personneOuNouvelle(courriel) {
      const [p] = await sql`
        insert into amend.personnes (courriel) values (${courriel})
        on conflict (courriel) do update set courriel = excluded.courriel
        returning *`
      return personneDe(p)
    },
    definirNom: (id, nom) => sql`update amend.personnes set nom = ${nom} where id = ${id}`.then(() => {}),
    /** Les noms d'une liste de personnes (identifiants inconnus omis). */
    async noms(ids) {
      const valides = ids.filter(estUuid)
      if (!valides.length) return []
      return (await sql`select id, nom, courriel from amend.personnes where id = any(${valides}::uuid[])`).map(
        personneDe,
      )
    },
    /** « Déconnecter partout » : toute session ouverte avant maintenant est refusée. */
    revoquerSessions: (id) =>
      sql`update amend.personnes set sessions_valides_depuis = now() where id = ${id}`.then(() => {}),
    async sessionsValidesDepuis(id) {
      if (!estUuid(id)) return null
      const [p] = await sql`select sessions_valides_depuis from amend.personnes where id = ${id}`
      return p ? p.sessions_valides_depuis.getTime() : null
    },

    /** Efface une personne : ses accès, rôles, dossiers et favoris partent avec
     * elle ; ses jetons et les invitations à son adresse aussi. Un document
     * encore rangé chez elle passe chez son plus ancien propriétaire. */
    async supprimerPersonne(id, courriel) {
      await sql.begin(async (t) => {
        await t`update amend.documents d set dossier = null, emplacement = (
                  select a.personne from amend.acces a where a.document = d.id and a.role = 'proprietaire'
                    and a.personne <> ${id} order by a.cree_le limit 1)
                where d.emplacement = ${id}`
        await t`delete from amend.jetons_connexion where courriel = ${courriel}`
        await t`delete from amend.invitations where courriel = ${courriel}`
        await t`delete from amend.invitations_equipe where courriel = ${courriel}`
        await t`delete from amend.personnes where id = ${id}`
      })
    },
  }
}
