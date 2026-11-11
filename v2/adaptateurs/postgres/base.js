// Adaptateur PostgreSQL (couche 2) : la réserve de connexions, partagée. La
// base n'accepte qu'un nombre limité de connexions (17 sur le serveur de
// production) et y/hub en prend sa part : les dépôts de l'application se
// partagent donc UNE réserve par adresse, au lieu d'en ouvrir une chacun.
import postgres from 'postgres'

/** Connexions de la réserve de l'application (y/hub a la sienne : `connexionsPostgres`). */
const CONNEXIONS = 6

/** Les réserves ouvertes, par adresse : `{ sql, utilisateurs }`. */
const reserves = new Map()

/**
 * La réserve de cette adresse (ouverte à la première demande) et la fonction
 * qui la rend. La réserve n'est fermée que lorsque le dernier dépôt la rend.
 * @param {string} url
 * @returns {{ sql: import('postgres').Sql, rendre: () => Promise<void> }}
 */
export function ouvrirBase(url) {
  let reserve = reserves.get(url)
  if (!reserve) {
    reserve = { sql: postgres(url, { max: CONNEXIONS, onnotice: () => {} }), utilisateurs: 0 }
    reserves.set(url, reserve)
  }
  reserve.utilisateurs += 1
  const { sql } = reserve
  let rendue = false
  return {
    sql,
    async rendre() {
      if (rendue) return
      rendue = true
      reserve.utilisateurs -= 1
      if (reserve.utilisateurs > 0) return
      // Retirée avant la fermeture : une ouverture qui suit crée une réserve neuve.
      if (reserves.get(url) === reserve) reserves.delete(url)
      await sql.end({ timeout: 5 })
    },
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** Vrai si la valeur est un UUID en minuscules (sinon PostgreSQL lèverait une erreur de type). */
export const estUuid = (id) => typeof id === 'string' && UUID.test(id)
