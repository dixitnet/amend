// Dépôt des comptes : les équipes (dossiers d'équipe, étape 6d), leurs membres
// et le contenu qu'elles partagent.
// Découpé de `comptes.js` sans changement de logique : aucune règle ici, le
// domaine décide avant l'appel.
import { estUuid } from './base.js'

/** @param {any} sql  la connexion de `ouvrirBase` */
export function partiesEquipes(sql) {
  return {
    // --- Équipes (dossiers d'équipe, étape 6d) ---
    /** Crée une équipe, dont `personne` est gestionnaire (rôle `proprietaire`). */
    async creerEquipe(nom, personne) {
      return sql.begin(async (t) => {
        const [e] = await t`insert into amend.equipes (nom) values (${nom}) returning id`
        await t`insert into amend.membres (equipe, personne, role) values (${e.id}, ${personne}, 'proprietaire')`
        return e.id
      })
    },
    async equipe(id) {
      if (!estUuid(id)) return null
      const [e] = await sql`select id, nom, modele_defaut from amend.equipes where id = ${id}`
      return e ? { id: e.id, nom: e.nom, modeleDefaut: e.modele_defaut } : null
    },
    renommerEquipe: (id, nom) => sql`update amend.equipes set nom = ${nom} where id = ${id}`.then(() => {}),
    /** Supprime une équipe sans document ni dossier ; rend `true` si c'est fait. */
    async supprimerEquipeVide(id) {
      const r = await sql`
        delete from amend.equipes e where e.id = ${id}
          and not exists (select 1 from amend.documents d where d.equipe = e.id)
          and not exists (select 1 from amend.dossiers o where o.equipe = e.id)
        returning e.id`
      return r.length > 0
    },
    /** Les documents d'une équipe, corbeille comprise. */
    async idsDocumentsDeLEquipe(equipe) {
      return (await sql`select id from amend.documents where equipe = ${equipe}`).map((d) => d.id)
    },
    /** Supprime une équipe dont les documents ont été effacés, avec ses dossiers. */
    async supprimerEquipe(id) {
      await sql.begin(async (t) => {
        await t`delete from amend.dossiers where equipe = ${id}`
        await t`delete from amend.equipes e where e.id = ${id}
                and not exists (select 1 from amend.documents d where d.equipe = e.id)`
      })
    },

    /** Les équipes d'une personne, avec son rôle. */
    async equipesDe(personne) {
      return (
        await sql`select e.id, e.nom, m.role from amend.membres m join amend.equipes e on e.id = m.equipe
                  where m.personne = ${personne} order by e.nom, e.cree_le`
      ).map((e) => ({ id: e.id, nom: e.nom, role: e.role }))
    },
    /** Le rôle de membre d'une personne, ou null. */
    async roleMembre(equipe, personne) {
      if (!estUuid(equipe) || !estUuid(personne)) return null
      const [m] = await sql`select role from amend.membres where equipe = ${equipe} and personne = ${personne}`
      return m?.role ?? null
    },
    async membresDe(equipe) {
      return (
        await sql`select m.personne, m.role, p.nom, p.courriel from amend.membres m
                  join amend.personnes p on p.id = m.personne where m.equipe = ${equipe} order by m.cree_le`
      ).map((m) => ({ personne: m.personne, role: m.role, nom: m.nom, courriel: m.courriel }))
    },
    async gestionnaires(equipe) {
      const [{ n }] =
        await sql`select count(*)::int as n from amend.membres where equipe = ${equipe} and role = 'proprietaire'`
      return n
    },
    /**
     * Donne, change ou retire (`role === null`) le rôle d'un membre, en
     * transaction, sans jamais laisser l'équipe sans gestionnaire ; rend
     * `'dernier-gestionnaire'` si c'était le cas, sinon `null`.
     */
    async modifierMembre(equipe, personne, role, auteur = null) {
      return sql.begin(async (t) => {
        const gestionnaires =
          await t`select personne from amend.membres where equipe = ${equipe} and role = 'proprietaire' for update`
        const etait = gestionnaires.some((g) => g.personne === personne)
        if (etait && role !== 'proprietaire' && gestionnaires.length <= 1) return 'dernier-gestionnaire'
        if (role === null) await t`delete from amend.membres where equipe = ${equipe} and personne = ${personne}`
        else
          await t`insert into amend.membres (equipe, personne, role, auteur) values (${equipe}, ${personne}, ${role}, ${auteur})
                  on conflict (equipe, personne) do update set role = excluded.role`
        return null
      })
    },
    /** Le contenu d'une équipe vu par un membre : dossiers et documents, avec ses rôles. */
    async documentsDeLEquipe(equipe, personne) {
      return (
        await sql`
        select d.id, d.titre, d.cree_le, d.modifie_le, d.dossier, p.nom as createur, a.role, m.role as role_membre,
               case when l.personne is not null then d.role_lien end as lien,
               f.personne is not null as favori
        from amend.documents d
        join amend.membres m on m.equipe = d.equipe and m.personne = ${personne}
        left join amend.favoris f on f.document = d.id and f.personne = ${personne}
        left join amend.personnes p on p.id = d.cree_par
        left join amend.acces a on a.document = d.id and a.personne = ${personne}
        left join amend.passages_par_lien l on l.document = d.id and l.personne = ${personne}
        where d.equipe = ${equipe} and d.supprime_le is null
        order by d.cree_le desc`
      ).map((d) => ({
        id: d.id,
        titre: d.titre,
        creeLe: d.cree_le.getTime(),
        modifieLe: (d.modifie_le ?? d.cree_le).getTime(),
        dossier: d.dossier,
        createur: d.createur,
        roles: [d.role, d.lien, d.role_membre].filter(Boolean),
        favori: d.favori,
      }))
    },
    /** Crée un document dans une équipe (elle en est propriétaire ; pas d'accès propre). */
    async creerDocumentEquipe(id, equipe, createur, titre = null, dossier = null) {
      await sql`insert into amend.documents (id, titre, cree_par, equipe, dossier)
                values (${id}, ${titre}, ${createur}, ${equipe}, ${dossier})`
    },
    /** Un document entre dans une équipe : ses propriétaires en deviennent éditeurs (arbitrage 4.1). */
    async entrerDansEquipe(document, equipe, dossier = null) {
      await sql.begin(async (t) => {
        await t`update amend.acces set role = 'editeur' where document = ${document} and role = 'proprietaire'`
        await t`update amend.documents set equipe = ${equipe}, emplacement = null, dossier = ${dossier} where id = ${document}`
      })
    },
    /** Un document sort de son équipe vers Mes documents de `personne`, qui en devient propriétaire (5.1). */
    async sortirDeLEquipe(document, personne, dossier = null) {
      await sql.begin(async (t) => {
        // Un modèle d'équipe ne suit pas le document hors de l'équipe (ADR 0011).
        await t`update amend.documents set equipe = null, emplacement = ${personne}, dossier = ${dossier},
                  modele = case when modele in (select id::text from amend.modeles where equipe = amend.documents.equipe)
                                then null else modele end
                where id = ${document}`
        await t`insert into amend.acces (document, personne, role) values (${document}, ${personne}, 'proprietaire')
                on conflict (document, personne) where personne is not null do update set role = 'proprietaire'`
      })
    },
  }
}
