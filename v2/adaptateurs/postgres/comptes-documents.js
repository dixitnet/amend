// Dépôt des comptes : les documents, leur corbeille, leurs images et leurs favoris.
// Découpé de `comptes.js` sans changement de logique : aucune règle ici, le
// domaine décide avant l'appel.

/** @param {any} sql  la connexion de `ouvrirBase` */
export function partiesDocuments(sql) {
  return {
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
    /** Garde une image d'un document. */
    garderImage: (document, nom, type, octets, personne) =>
      sql`insert into amend.images (document, origine, nom, type, octets, taille, cree_par)
          values (${document}, ${document}, ${nom}, ${type}, ${octets}, ${octets.length}, ${personne})`.then(() => {}),
    /** Une image, par le document nommé dans son adresse (\`origine\`) :
     * \`{ document, type, octets }\` (le document qui la garde aujourd'hui), ou \`null\`. */
    async image(origine, nom) {
      const [i] = await sql`select document, type, octets from amend.images where origine = ${origine} and nom = ${nom}`
      return i ? { document: i.document, type: i.type, octets: i.octets } : null
    },
    /** Une copie hérite des images de sa source (les siennes et celles dont elle hérite déjà). */
    heriterImages: (copie, source) =>
      sql`insert into amend.images_heritees (document, origine)
          select ${copie}, o.origine from (
            select distinct origine from amend.images where document = ${source}
            union select origine from amend.images_heritees where document = ${source}) o
          on conflict do nothing`.then(() => {}),
    /** Les documents qui héritent des images envoyées dans \`origine\`. */
    async heritiersImages(origine) {
      return (await sql`select document from amend.images_heritees where origine = ${origine}`).map((h) => h.document)
    },
    /** Toutes les images de l'instance, sans leurs octets (l'analyse des orphelines, 14/11/2026). */
    async toutesLesImages() {
      return (await sql`select document, nom, taille, cree_le from amend.images`).map((i) => ({
        document: i.document,
        nom: i.nom,
        taille: i.taille,
        creeLe: i.cree_le.getTime(),
      }))
    },
    /** Les identifiants de tous les documents de l'instance, corbeille comprise. */
    async tousLesDocuments() {
      return (await sql`select id from amend.documents`).map((d) => d.id)
    },
    /** Le poids de toutes les images d'un document, en octets. */
    async poidsImages(document) {
      const [r] = await sql`select coalesce(sum(taille), 0)::bigint as n from amend.images where document = ${document}`
      return Number(r.n)
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
    async supprimerDocument(id) {
      await sql.begin(async (t) => {
        // Les images dont une copie hérite passent à cette copie avant l'effacement.
        await t`update amend.images i set document = h.document
                from (select distinct on (origine) origine, document from amend.images_heritees
                      where document <> ${id} order by origine, document) h
                where i.document = ${id} and i.origine = h.origine`
        await t`delete from amend.documents where id = ${id}`
      })
    },
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

    // --- Suppression d'un compte (lots du 11/11/2026, lot D) ---
    /** Les documents (hors équipes, corbeille comprise) où une personne a un
     * accès en propre, avec tous leurs accès dans l'ordre où ils ont été donnés. */
    async documentsEnPropre(personne) {
      const lignes = await sql`
        select d.id, d.titre, a.personne, a.role from amend.documents d
        join amend.acces a on a.document = d.id
        where d.equipe is null and exists (
          select 1 from amend.acces m where m.document = d.id and m.personne = ${personne})
        order by d.cree_le, a.cree_le, a.id`
      const parId = new Map()
      for (const l of lignes) {
        if (!parId.has(l.id)) parId.set(l.id, { id: l.id, titre: l.titre, acces: [] })
        parId.get(l.id).acces.push({ personne: l.personne, role: l.role })
      }
      return [...parId.values()]
    },
  }
}
