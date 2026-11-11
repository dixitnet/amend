// Dépôt des comptes : le suivi de l'instance pour le back-office (Sylvain,
// 11/11/2026, « stabiliser, fiabiliser ») : un journal des erreurs et des refus
// inhabituels, et la mémoire des processus relevée au fil du temps. Des codes
// et des nombres, jamais un mot d'un document. Aucune règle ici.

/** @param {any} sql  la connexion de `ouvrirBase` */
export function partiesSuivi(sql) {
  return {
    /** Note un événement : `type` (`erreur`, `refus`), un code, et un détail court. */
    noter: (type, code, detail = null) =>
      sql`insert into amend.journal (type, code, detail)
          values (${type}, ${code}, ${detail === null ? null : sql.json(detail)})`.then(() => {}),
    /** Les événements depuis `depuis` (ms), les plus récents d'abord, `limite` au plus. */
    async journal(depuis, limite = 200) {
      return (
        await sql`select le, type, code, detail from amend.journal where le > ${new Date(depuis)}
                  order by le desc, id desc limit ${limite}`
      ).map((j) => ({ le: j.le.getTime(), type: j.type, code: j.code, detail: j.detail }))
    },
    /** Relève la mémoire d'un processus (`serveur`, `collaboration`), en octets. */
    mesurer: (processus, memoire) =>
      sql`insert into amend.mesures (processus, memoire) values (${processus}, ${memoire})`.then(() => {}),
    /** Les relevés depuis `depuis` (ms), dans l'ordre du temps. */
    async mesures(depuis) {
      return (
        await sql`select le, processus, memoire from amend.mesures where le > ${new Date(depuis)} order by le`
      ).map((m) => ({ le: m.le.getTime(), processus: m.processus, memoire: Number(m.memoire) }))
    },
    /** Efface le journal d'avant `journalAvant` et les relevés d'avant `mesuresAvant` (ms). */
    async purgerSuivi({ journalAvant, mesuresAvant }) {
      await sql`delete from amend.journal where le < ${new Date(journalAvant)}`
      await sql`delete from amend.mesures where le < ${new Date(mesuresAvant)}`
    },
  }
}
