// Dépôt des comptes : les accès aux documents, le passage par le lien de partage
// et les invitations (documents et équipes).
// Découpé de `comptes.js` sans changement de logique : aucune règle ici, le
// domaine décide avant l'appel.
import { estUuid } from './base.js'

/**
 * @param {any} sql  la connexion de `ouvrirBase`
 * @param {any} depot  le dépôt assemblé (`donnerAcces` appelle `modifierAcces` de l'objet rendu)
 */
export function partiesAcces(sql, depot) {
  return {
    // --- Accès ---
    /** Les rôles d'une personne sur un document (son accès, et le lien si elle est passée par lui). */
    /** Les rôles d'une personne sur un document ; aucun s'il est à la corbeille,
     * sauf avec \`{ corbeille: true }\` (pour l'y restaurer ou l'effacer). */
    async rolesDe(document, personne, { corbeille = false } = {}) {
      if (!estUuid(personne)) return []
      const [r] = await sql`
        select a.role, case when l.personne is not null then d.role_lien end as lien, m.role as membre
        from amend.documents d
        left join amend.acces a on a.document = d.id and a.personne = ${personne}
        left join amend.membres m on m.equipe = d.equipe and m.personne = ${personne}
        left join amend.passages_par_lien l on l.document = d.id and l.personne = ${personne}
        where d.id = ${document} and (${corbeille} or d.supprime_le is null)`
      return r ? [r.role, r.lien, r.membre].filter(Boolean) : []
    },
    /** Le rôle donné en propre (hors lien), ou null. */
    async acces(document, personne) {
      const [a] = await sql`select role from amend.acces where document = ${document} and personne = ${personne}`
      return a?.role ?? null
    },
    async accesDuDocument(document) {
      return (
        await sql`
        select a.personne, a.equipe, a.role, p.courriel, p.nom from amend.acces a
        left join amend.personnes p on p.id = a.personne
        where a.document = ${document} order by a.cree_le`
      ).map((a) => ({ personne: a.personne, equipe: a.equipe || null, role: a.role, courriel: a.courriel, nom: a.nom }))
    },
    async proprietaires(document) {
      const [{ n }] =
        await sql`select count(*)::int as n from amend.acces where document = ${document} and role = 'proprietaire'`
      return n
    },
    /** Donne un rôle (`auteur` : qui le donne, montré dans « Partagé avec moi »),
     * avec la même garde que `modifierAcces` (jamais sans propriétaire) : rend
     * `'dernier-proprietaire'` ou `null`. */
    donnerAcces: (document, personne, role, auteur = null) => depot.modifierAcces(document, personne, role, auteur),
    /**
     * Change (ou retire : `role === null`) l'accès d'une personne, en
     * transaction, sans jamais laisser le document sans propriétaire ; rend
     * `'dernier-proprietaire'` si c'était le cas, sinon `null`.
     */
    async modifierAcces(document, personne, role, auteur = null) {
      return sql.begin(async (t) => {
        const proprietaires =
          await t`select personne from amend.acces where document = ${document} and role = 'proprietaire' for update`
        const etaitProprietaire = proprietaires.some((p) => p.personne === personne)
        if (etaitProprietaire && role !== 'proprietaire' && proprietaires.length <= 1) return 'dernier-proprietaire'
        if (role === null) await t`delete from amend.acces where document = ${document} and personne = ${personne}`
        else
          await t`insert into amend.acces (document, personne, role, auteur) values (${document}, ${personne}, ${role}, ${auteur})
                  on conflict (document, personne) where personne is not null
          do update set role = excluded.role, auteur = coalesce(excluded.auteur, amend.acces.auteur)`
        // Un document est rangé chez l'un de ses propriétaires : s'il cesse de
        // l'être, le document passe à la racine de Mes documents d'un autre.
        if (etaitProprietaire && role !== 'proprietaire')
          await t`update amend.documents set dossier = null, emplacement = (
                    select personne from amend.acces where document = ${document} and role = 'proprietaire'
                    order by cree_le limit 1)
                  where id = ${document} and emplacement = ${personne}`
        return null
      })
    },
    noterPassageParLien: (document, personne) =>
      sql`insert into amend.passages_par_lien (document, personne) values (${document}, ${personne}) on conflict do nothing`.then(
        () => {},
      ),
    retirerPassageParLien: (document, personne) =>
      sql`delete from amend.passages_par_lien where document = ${document} and personne = ${personne}`.then(() => {}),

    // --- Invitations ---
    inviter: (document, courriel, role, auteur) =>
      sql`insert into amend.invitations (document, courriel, role, auteur) values (${document}, ${courriel}, ${role}, ${auteur})
          on conflict (document, courriel) do update set role = excluded.role, auteur = excluded.auteur, cree_le = now()`.then(
        () => {},
      ),
    async invitationsDe(courriel) {
      return (
        await sql`select document, role, auteur, cree_le from amend.invitations where courriel = ${courriel}`
      ).map((i) => ({
        document: i.document,
        role: i.role,
        auteur: i.auteur,
        creeLe: i.cree_le.getTime(),
      }))
    },
    async invitationsDuDocument(document) {
      return (
        await sql`select courriel, role, cree_le from amend.invitations where document = ${document} order by cree_le`
      ).map((i) => ({
        courriel: i.courriel,
        role: i.role,
        creeLe: i.cree_le.getTime(),
      }))
    },
    retirerInvitation: (document, courriel) =>
      sql`delete from amend.invitations where document = ${document} and courriel = ${courriel}`.then(() => {}),

    // --- Invitations des équipes ---
    inviterMembre: (equipe, courriel, role, auteur) =>
      sql`insert into amend.invitations_equipe (equipe, courriel, role, auteur) values (${equipe}, ${courriel}, ${role}, ${auteur})
          on conflict (equipe, courriel) do update set role = excluded.role, auteur = excluded.auteur, cree_le = now()`.then(
        () => {},
      ),
    async invitationsEquipeDe(courriel) {
      return (
        await sql`select equipe, role, auteur, cree_le from amend.invitations_equipe where courriel = ${courriel}`
      ).map((i) => ({ equipe: i.equipe, role: i.role, auteur: i.auteur, creeLe: i.cree_le.getTime() }))
    },
    async invitationsDeLEquipe(equipe) {
      return (
        await sql`select courriel, role, cree_le from amend.invitations_equipe where equipe = ${equipe} order by cree_le`
      ).map((i) => ({ courriel: i.courriel, role: i.role, creeLe: i.cree_le.getTime() }))
    },
    retirerInvitationEquipe: (equipe, courriel) =>
      sql`delete from amend.invitations_equipe where equipe = ${equipe} and courriel = ${courriel}`.then(() => {}),
  }
}
