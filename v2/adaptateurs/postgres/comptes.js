// Adaptateur PostgreSQL (couche 2) : le dépôt des comptes et du partage
// (étape 6a), sur le modèle de Docs (`User`, `Document`, `DocumentAccess`,
// `Invitation`, `LinkTrace`). Aucune règle ici : qui peut faire quoi est
// décidé par le domaine, avant l'appel. Schéma `amend`, dans la base de y/hub.
//  - un accès est donné à une personne OU à une équipe (contrainte de Docs) ;
//    pas d'interface d'équipe à cette étape ;
//  - les jetons de connexion ne sont gardés que par leur empreinte ;
//  - étape 6c : un document est rangé dans « Mes documents » d'une personne
//    (`emplacement`, d'abord son créateur), éventuellement dans l'un de ses
//    dossiers ; un dossier de Mes documents est un rangement personnel ;
//  - étape 6d : une équipe (dossier d'équipe) a des membres, chacun avec un
//    rôle pour tout le dossier ; un document ou un dossier appartient à une
//    personne (`emplacement`, `personne`) ou à une équipe (`equipe`).
import postgres from 'postgres'
import { createHash, randomBytes } from 'node:crypto'

const SCHEMA = `
create schema if not exists amend;
create table if not exists amend.personnes (
  id uuid primary key default gen_random_uuid(),
  courriel text not null unique,
  nom text,
  cree_le timestamptz not null default now(),
  sessions_valides_depuis timestamptz not null default to_timestamp(0)
);
create table if not exists amend.documents (
  id text primary key,
  titre text,
  cree_par uuid references amend.personnes (id) on delete set null,
  cree_le timestamptz not null default now(),
  role_lien text
);
create table if not exists amend.acces (
  id bigserial primary key,
  document text not null references amend.documents (id) on delete cascade,
  personne uuid references amend.personnes (id) on delete cascade,
  equipe text not null default '',
  role text not null,
  cree_le timestamptz not null default now(),
  constraint acces_personne_ou_equipe check ((personne is not null and equipe = '') or (personne is null and equipe <> ''))
);
create unique index if not exists acces_document_personne on amend.acces (document, personne) where personne is not null;
create unique index if not exists acces_document_equipe on amend.acces (document, equipe) where equipe <> '';
create table if not exists amend.invitations (
  document text not null references amend.documents (id) on delete cascade,
  courriel text not null,
  role text not null,
  auteur uuid references amend.personnes (id) on delete set null,
  cree_le timestamptz not null default now(),
  primary key (document, courriel)
);
create table if not exists amend.passages_par_lien (
  document text not null references amend.documents (id) on delete cascade,
  personne uuid not null references amend.personnes (id) on delete cascade,
  cree_le timestamptz not null default now(),
  primary key (document, personne)
);
create table if not exists amend.dossiers (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  parent uuid references amend.dossiers (id) on delete cascade,
  personne uuid not null references amend.personnes (id) on delete cascade,
  cree_le timestamptz not null default now()
);
create index if not exists dossiers_personne on amend.dossiers (personne);
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'amend' and table_name = 'documents' and column_name = 'emplacement') then
    alter table amend.documents
      add column emplacement uuid references amend.personnes (id) on delete set null,
      add column dossier uuid references amend.dossiers (id) on delete set null;
    update amend.documents set emplacement = cree_par;
  end if;
end $$;
create index if not exists documents_emplacement on amend.documents (emplacement);
alter table amend.acces add column if not exists auteur uuid references amend.personnes (id) on delete set null;
create table if not exists amend.equipes (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  cree_le timestamptz not null default now()
);
create table if not exists amend.membres (
  equipe uuid not null references amend.equipes (id) on delete cascade,
  personne uuid not null references amend.personnes (id) on delete cascade,
  role text not null,
  auteur uuid references amend.personnes (id) on delete set null,
  cree_le timestamptz not null default now(),
  primary key (equipe, personne)
);
create index if not exists membres_personne on amend.membres (personne);
create table if not exists amend.invitations_equipe (
  equipe uuid not null references amend.equipes (id) on delete cascade,
  courriel text not null,
  role text not null,
  auteur uuid references amend.personnes (id) on delete set null,
  cree_le timestamptz not null default now(),
  primary key (equipe, courriel)
);
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'amend' and table_name = 'documents' and column_name = 'equipe') then
    alter table amend.documents add column equipe uuid references amend.equipes (id) on delete restrict;
    alter table amend.dossiers add column equipe uuid references amend.equipes (id) on delete cascade;
    alter table amend.dossiers alter column personne drop not null;
    alter table amend.dossiers add constraint dossiers_personne_ou_equipe
      check ((personne is not null) <> (equipe is not null));
  end if;
end $$;
create index if not exists documents_equipe on amend.documents (equipe);
create index if not exists dossiers_equipe on amend.dossiers (equipe);
-- Les favoris d'une personne (Sylvain, 10/11/2026 ; comme les favoris de Docs).
create table if not exists amend.favoris (
  personne uuid not null references amend.personnes (id) on delete cascade,
  document text not null references amend.documents (id) on delete cascade,
  cree_le timestamptz not null default now(),
  primary key (personne, document)
);
create table if not exists amend.jetons_connexion (
  empreinte text primary key,
  courriel text not null,
  document text,
  expire_le timestamptz not null,
  utilise_le timestamptz,
  cree_le timestamptz not null default now()
);
create index if not exists jetons_courriel on amend.jetons_connexion (courriel, cree_le);
-- Les modèles de mise en page des équipes (étape 7, ADR 0011) : un modèle
-- d'amend.ink (\`base\`) et des écarts ; le modèle choisi pour un document et
-- le modèle par défaut d'une équipe (identifiant d'un modèle d'amend.ink ou
-- d'un modèle d'équipe).
create table if not exists amend.modeles (
  id uuid primary key default gen_random_uuid(),
  equipe uuid not null references amend.equipes (id) on delete cascade,
  nom text not null,
  base text not null,
  ecarts jsonb not null default '{}',
  cree_par uuid references amend.personnes (id) on delete set null,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create index if not exists modeles_equipe on amend.modeles (equipe);
alter table amend.documents add column if not exists modele text;
alter table amend.equipes add column if not exists modele_defaut text;
-- Lots du 11/11/2026 (comme Docs, \`updated_at\` et \`deleted_at\`) : la date de
-- la dernière modification du contenu, donnée par y/hub, et la corbeille.
alter table amend.documents add column if not exists modifie_le timestamptz;
alter table amend.documents add column if not exists supprime_le timestamptz;
create index if not exists documents_supprime on amend.documents (supprime_le) where supprime_le is not null;
`

const empreinte = (jeton) => createHash('sha256').update(jeton).digest('hex')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const estUuid = (id) => typeof id === 'string' && UUID.test(id)

/** Ouvre le dépôt ; crée le schéma s'il manque. */
export async function ouvrirComptes(url) {
  const sql = postgres(url, { max: 4, onnotice: () => {} })
  await sql.unsafe(SCHEMA)
  const personneDe = (p) => (p ? { id: p.id, courriel: p.courriel, nom: p.nom } : null)

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

    // --- Documents ---
    /** Crée un document, dont `proprietaire` est propriétaire, rangé dans
     * ses documents (dans `dossier`, ou à la racine). */
    async creerDocument(id, proprietaire, titre = null, dossier = null) {
      await sql.begin(async (t) => {
        await t`insert into amend.documents (id, titre, cree_par, emplacement, dossier)
                values (${id}, ${titre}, ${proprietaire}, ${proprietaire}, ${dossier})`
        await t`insert into amend.acces (document, personne, role) values (${id}, ${proprietaire}, 'proprietaire')`
      })
    },
    async document(id) {
      const [d] = await sql`select * from amend.documents where id = ${id}`
      return d
        ? {
            id: d.id,
            titre: d.titre,
            creePar: d.cree_par,
            creeLe: d.cree_le.getTime(),
            roleLien: d.role_lien,
            emplacement: d.emplacement,
            dossier: d.dossier,
            equipe: d.equipe,
            modele: d.modele,
            modifieLe: (d.modifie_le ?? d.cree_le).getTime(),
            supprimeLe: d.supprime_le ? d.supprime_le.getTime() : null,
          }
        : null
    },
    /** Note que le contenu d'un document a changé (y/hub, comme \`content-updated\` de Docs). */
    noterModification: (id) =>
      sql`update amend.documents set modifie_le = now() where id = ${id} and supprime_le is null`.then(() => {}),
    /** Met un document à la corbeille, ou l'en sort (\`null\`). */
    mettreALaCorbeille: (id, actif) =>
      sql`update amend.documents set supprime_le = ${actif ? sql`now()` : null} where id = ${id}`.then(() => {}),
    /** Les documents de la corbeille que \`personne\` peut restaurer : ceux dont elle
     * est propriétaire, ou gestionnaire de l'équipe, supprimés depuis \`depuis\` (ms). */
    async corbeilleDe(personne, depuis) {
      return (
        await sql`
        select d.id, d.titre, d.supprime_le, d.equipe from amend.documents d
        left join amend.acces a on a.document = d.id and a.personne = ${personne}
        left join amend.membres m on m.equipe = d.equipe and m.personne = ${personne}
        where d.supprime_le is not null and d.supprime_le > ${new Date(depuis)}
          and (a.role = 'proprietaire' or m.role = 'proprietaire')
        order by d.supprime_le desc`
      ).map((d) => ({ id: d.id, titre: d.titre, supprimeLe: d.supprime_le.getTime(), equipe: d.equipe }))
    },
    /** Les documents à la corbeille depuis avant \`avant\` (ms) : à effacer pour de bon. */
    async corbeilleExpiree(avant) {
      return (
        await sql`select id from amend.documents where supprime_le is not null and supprime_le <= ${new Date(avant)}`
      ).map((d) => d.id)
    },
    /** Efface le document et tout ce qui s'y rattache ici (accès, invitations, passages). */
    supprimerDocument: (id) => sql`delete from amend.documents where id = ${id}`.then(() => {}),
    definirRoleLien: (id, role) => sql`update amend.documents set role_lien = ${role} where id = ${id}`.then(() => {}),
    renommerDocument: (id, titre) => sql`update amend.documents set titre = ${titre} where id = ${id}`.then(() => {}),
    /**
     * Les documents d'une personne : ceux où elle a un accès, et ceux ouverts
     * par un lien encore ouvert ; avec où chacun est rangé, et qui le lui a
     * partagé et quand (pour « Partagé avec moi »).
     */
    async documentsDe(personne) {
      const lignes = await sql`
        select d.id, d.titre, d.cree_par, d.cree_le, d.modifie_le, d.role_lien, d.emplacement, d.dossier, d.equipe,
               a.role, a.cree_le as acces_le, p.nom as auteur_nom, p.courriel as auteur_courriel,
               l.cree_le as lien_le, m.role as role_membre, f.personne is not null as favori
        from amend.documents d
        left join amend.favoris f on f.document = d.id and f.personne = ${personne}
        left join amend.acces a on a.document = d.id and a.personne = ${personne}
        left join amend.membres m on m.equipe = d.equipe and m.personne = ${personne}
        left join amend.personnes p on p.id = a.auteur
        left join amend.passages_par_lien l on l.document = d.id and l.personne = ${personne}
        where d.supprime_le is null and (a.id is not null or (l.personne is not null and d.role_lien is not null))
        order by d.cree_le desc`
      return lignes.map((d) => ({
        id: d.id,
        titre: d.titre,
        creeParMoi: d.cree_par === personne,
        creeLe: d.cree_le.getTime(),
        modifieLe: (d.modifie_le ?? d.cree_le).getTime(),
        roles: [d.role, d.lien_le ? d.role_lien : null, d.role_membre].filter(Boolean),
        emplacement: d.emplacement,
        dossier: d.dossier,
        equipe: d.equipe,
        partagePar: d.auteur_nom || d.auteur_courriel ? { nom: d.auteur_nom, courriel: d.auteur_courriel } : null,
        parLien: !d.role && Boolean(d.lien_le),
        partageLe: (d.acces_le ?? d.lien_le).getTime(),
        favori: d.favori,
      }))
    },
    /** Met un document dans les favoris d'une personne, ou l'en retire. */
    async favori(document, personne, actif) {
      if (actif)
        await sql`insert into amend.favoris (personne, document) values (${personne}, ${document}) on conflict do nothing`
      else await sql`delete from amend.favoris where personne = ${personne} and document = ${document}`
    },
    /** Range un document dans un dossier (`null` : à la racine de Mes documents). */
    rangerDocument: (id, dossier) =>
      sql`update amend.documents set dossier = ${dossier} where id = ${id}`.then(() => {}),

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
    /** Donne un rôle (`auteur` : qui le donne, montré dans « Partagé avec moi »). */
    donnerAcces: (document, personne, role, auteur = null) =>
      sql`insert into amend.acces (document, personne, role, auteur) values (${document}, ${personne}, ${role}, ${auteur})
          on conflict (document, personne) where personne is not null
          do update set role = excluded.role, auteur = coalesce(excluded.auteur, amend.acces.auteur)`.then(() => {}),
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
    retirerAcces: (document, personne) =>
      sql`delete from amend.acces where document = ${document} and personne = ${personne}`.then(() => {}),
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

    // --- Jetons de connexion ---
    /** Un jeton à usage unique ; rend sa forme en clair (pour le courrier). */
    async creerJeton(courriel, document, dureeMs) {
      const jeton = randomBytes(32).toString('base64url')
      await sql`insert into amend.jetons_connexion (empreinte, courriel, document, expire_le)
                values (${empreinte(jeton)}, ${courriel}, ${document}, ${new Date(Date.now() + dureeMs)})`
      return jeton
    },
    /** Consomme un jeton : `{ courriel, document }` s'il est valable et neuf, sinon null. */
    async consommerJeton(jeton) {
      if (typeof jeton !== 'string' || !jeton || jeton.length > 100) return null
      const [j] = await sql`
        update amend.jetons_connexion set utilise_le = now()
        where empreinte = ${empreinte(jeton)} and utilise_le is null and expire_le > now()
        returning courriel, document`
      return j ? { courriel: j.courriel, document: j.document } : null
    },
    async jetonsRecents(courriel, depuisMs) {
      const [{ n }] =
        await sql`select count(*)::int as n from amend.jetons_connexion where courriel = ${courriel} and cree_le > ${new Date(Date.now() - depuisMs)}`
      return n
    },
    /** Les nombres du back-office (les comptes d'essai et de développement, en .invalid, à part). */
    async statistiques() {
      const [r] = await sql`select
        (select count(*)::int from amend.personnes where lower(courriel) not like '%.invalid') as personnes,
        (select count(*)::int from amend.personnes where lower(courriel) like '%.invalid') as essai,
        (select count(*)::int from amend.documents where supprime_le is null) as documents,
        (select count(*)::int from amend.equipes) as equipes`
      return { personnes: r.personnes, essai: r.essai, documents: r.documents, equipes: r.equipes }
    },
    fermer: () => sql.end({ timeout: 5 }),
  }
}
