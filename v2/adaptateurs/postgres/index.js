// Adaptateur PostgreSQL (couche 2) : le dépôt des commentaires. Comme Docs
// (modèles `Thread`, `Comment`, `Reaction` de son serveur), les fils et les
// commentaires sont dans la base de l'application, pas dans le document ;
// seule l'ancre d'un fil est dans le texte. Ici, aucune règle : qui peut faire
// quoi est décidé par le domaine, avant l'appel. Schéma `amend`, dans la base
// de y/hub (une seule base à installer jusqu'à l'étape 6).
import postgres from 'postgres'

const SCHEMA = `
create schema if not exists amend;
create table if not exists amend.fils (
  id uuid primary key default gen_random_uuid(),
  document text not null,
  auteur text not null,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  resolu boolean not null default false,
  resolu_le timestamptz,
  resolu_par text,
  metadonnees jsonb
);
create index if not exists fils_document on amend.fils (document);
create table if not exists amend.commentaires (
  id uuid primary key default gen_random_uuid(),
  fil uuid not null references amend.fils (id) on delete cascade,
  auteur text not null,
  corps jsonb not null,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  metadonnees jsonb
);
create index if not exists commentaires_fil on amend.commentaires (fil, cree_le);
create table if not exists amend.reactions (
  commentaire uuid not null references amend.commentaires (id) on delete cascade,
  auteur text not null,
  emoji text not null,
  cree_le timestamptz not null default now(),
  primary key (commentaire, auteur, emoji)
);
`

/** Un fil et ses commentaires, dans la forme des fils de BlockNote (`ThreadData`). */
function enFil(f, commentaires, reactions) {
  return {
    type: 'thread',
    id: f.id,
    createdAt: f.cree_le.toISOString(),
    updatedAt: f.modifie_le.toISOString(),
    resolved: f.resolu,
    resolvedUpdatedAt: f.resolu_le?.toISOString(),
    resolvedBy: f.resolu_par ?? undefined,
    metadata: f.metadonnees ?? undefined,
    comments: commentaires
      .filter((c) => c.fil === f.id)
      .map((c) => {
        const parEmoji = new Map()
        for (const r of reactions.filter((r) => r.commentaire === c.id)) {
          const e = parEmoji.get(r.emoji) ?? { emoji: r.emoji, createdAt: r.cree_le.toISOString(), userIds: [] }
          e.userIds.push(r.auteur)
          parEmoji.set(r.emoji, e)
        }
        return {
          type: 'comment',
          id: c.id,
          userId: c.auteur,
          createdAt: c.cree_le.toISOString(),
          updatedAt: c.modifie_le.toISOString(),
          reactions: [...parEmoji.values()],
          metadata: c.metadonnees ?? undefined,
          body: c.corps,
        }
      }),
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const estId = (id) => typeof id === 'string' && UUID.test(id)

/** Ouvre le dépôt ; crée le schéma s'il manque. */
export async function ouvrirCommentaires(url) {
  const sql = postgres(url, { max: 4, onnotice: () => {} })
  await sql.unsafe(SCHEMA)

  async function fils(document, seul = null) {
    const fs = seul
      ? await sql`select * from amend.fils where document = ${document} and id = ${seul}`
      : await sql`select * from amend.fils where document = ${document} order by cree_le`
    if (!fs.length) return []
    const ids = fs.map((f) => f.id)
    const cs = await sql`select * from amend.commentaires where fil = any(${ids}::uuid[]) order by cree_le, id`
    const rs = cs.length
      ? await sql`select * from amend.reactions where commentaire = any(${cs.map((c) => c.id)}::uuid[]) order by cree_le`
      : []
    return fs.map((f) => enFil(f, cs, rs))
  }

  return {
    /** Les fils d'un document, avec leurs commentaires et réactions. */
    fils: (document) => fils(document),
    /** Un fil d'un document, ou `null`. */
    async fil(document, id) {
      if (!estId(id)) return null
      return (await fils(document, id))[0] ?? null
    },
    /** Un commentaire d'un fil d'un document (son auteur), ou `null`. */
    async commentaire(document, fil, id) {
      if (!estId(fil) || !estId(id)) return null
      const [c] = await sql`
        select c.id, c.auteur from amend.commentaires c join amend.fils f on f.id = c.fil
        where c.id = ${id} and c.fil = ${fil} and f.document = ${document}`
      return c ?? null
    },
    /** Crée un fil et son premier commentaire ; rend le fil. */
    async creerFil(document, auteur, corps, metadonnees = null) {
      const id = await sql.begin(async (t) => {
        const [f] =
          await t`insert into amend.fils (document, auteur, metadonnees) values (${document}, ${auteur}, ${metadonnees === null ? null : t.json(metadonnees)}) returning id`
        await t`insert into amend.commentaires (fil, auteur, corps) values (${f.id}, ${auteur}, ${t.json(corps)})`
        return f.id
      })
      return (await fils(document, id))[0]
    },
    async ajouterCommentaire(fil, auteur, corps, metadonnees = null) {
      const [c] =
        await sql`insert into amend.commentaires (fil, auteur, corps, metadonnees) values (${fil}, ${auteur}, ${sql.json(corps)}, ${metadonnees === null ? null : sql.json(metadonnees)}) returning id`
      await sql`update amend.fils set modifie_le = now() where id = ${fil}`
      return c.id
    },
    async modifierCommentaire(id, corps, metadonnees = null) {
      await sql`update amend.commentaires set corps = ${sql.json(corps)}, metadonnees = ${metadonnees === null ? null : sql.json(metadonnees)}, modifie_le = now() where id = ${id}`
    },
    /** Supprime un commentaire ; le fil part avec son dernier commentaire (comme BlockNote). */
    async supprimerCommentaire(fil, id) {
      await sql.begin(async (t) => {
        await t`delete from amend.commentaires where id = ${id}`
        const [{ n }] = await t`select count(*)::int as n from amend.commentaires where fil = ${fil}`
        if (n === 0) await t`delete from amend.fils where id = ${fil}`
        else await t`update amend.fils set modifie_le = now() where id = ${fil}`
      })
    },
    /** Efface tous les fils d'un document (document supprimé). */
    supprimerFilsDuDocument: (document) => sql`delete from amend.fils where document = ${document}`.then(() => {}),
    supprimerFil: (id) => sql`delete from amend.fils where id = ${id}`.then(() => {}),
    async resoudre(id, resolu, par) {
      await sql`update amend.fils set resolu = ${resolu}, resolu_le = now(), resolu_par = ${resolu ? par : null}, modifie_le = now() where id = ${id}`
    },
    async reagir(commentaire, auteur, emoji) {
      await sql`insert into amend.reactions (commentaire, auteur, emoji) values (${commentaire}, ${auteur}, ${emoji}) on conflict do nothing`
    },
    async retirerReaction(commentaire, auteur, emoji) {
      await sql`delete from amend.reactions where commentaire = ${commentaire} and auteur = ${auteur} and emoji = ${emoji}`
    },
    fermer: () => sql.end({ timeout: 5 }),
  }
}
