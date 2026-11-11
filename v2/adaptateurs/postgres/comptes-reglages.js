// Dépôt des comptes : les nombres du back-office et les réglages de l'instance.
// Découpé de `comptes.js` sans changement de logique : aucune règle ici, le
// domaine décide avant l'appel.
import { estUuid } from './base.js'

/** @param {any} sql  la connexion de `ouvrirBase` */
export function partiesReglages(sql) {
  return {
    /** Les nombres du back-office (les comptes d'essai et de développement, en .invalid, à part). */
    async statistiques() {
      const [r] = await sql`select
        (select count(*)::int from amend.personnes where lower(courriel) not like '%.invalid') as personnes,
        (select count(*)::int from amend.personnes where lower(courriel) like '%.invalid') as essai,
        (select count(*)::int from amend.documents where supprime_le is null) as documents,
        (select count(*)::int from amend.equipes) as equipes`
      return { personnes: r.personnes, essai: r.essai, documents: r.documents, equipes: r.equipes }
    },
    // --- Réglages de l'instance (back-office) ---
    /** La valeur d'un réglage, ou `null` s'il n'a jamais été choisi. */
    async reglage(cle) {
      const [r] = await sql`select valeur from amend.reglages where cle = ${cle}`
      return r ? r.valeur : null
    },
    async definirReglage(cle, valeur, par) {
      await sql`insert into amend.reglages (cle, valeur, modifie_par) values (${cle}, ${sql.json(valeur)}, ${estUuid(par) ? par : null})
        on conflict (cle) do update set valeur = excluded.valeur, modifie_par = excluded.modifie_par, modifie_le = now()`
    },
  }
}
