// Le schéma SQL du dépôt des comptes et du partage (schéma `amend`, dans la
// base de y/hub), rejoué à chaque ouverture : tout y est idempotent.
// Découpé de `comptes.js` sans changement du texte SQL.
export const SCHEMA = `
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
-- Les images d'un document (lots du 11/11/2026, lot B ; Docs les met dans un
-- stockage objet) : dans la base, que la sauvegarde de la nuit emporte ; elles
-- partent avec le document.
create table if not exists amend.images (
  document text not null references amend.documents (id) on delete cascade,
  nom text not null,
  type text not null,
  octets bytea not null,
  taille integer not null,
  cree_par uuid references amend.personnes (id) on delete set null,
  cree_le timestamptz not null default now(),
  primary key (document, nom)
);
-- Les images d'une copie (audit du 11/11/2026 ; comme Docs, dont la copie garde
-- la liste des images que son texte cite sans recopier les fichiers) : l'adresse
-- d'une image nomme le document où elle a été envoyée (\`origine\`, qui ne change
-- jamais) ; \`document\` est celui qui la garde aujourd'hui. Une copie hérite des
-- images de sa source : qui lit la copie les lit, et elles passent à une copie
-- quand le document qui les gardait est effacé.
alter table amend.images add column if not exists origine text;
update amend.images set origine = document where origine is null;
create index if not exists images_origine on amend.images (origine, nom);
create table if not exists amend.images_heritees (
  document text not null references amend.documents (id) on delete cascade,
  origine text not null,
  primary key (document, origine)
);
create index if not exists images_heritees_origine on amend.images_heritees (origine);
-- Les réglages de l'instance, choisis au back-office (le modèle de Margo, étape 8).
create table if not exists amend.reglages (
  cle text primary key,
  valeur jsonb not null,
  modifie_par uuid references amend.personnes (id) on delete set null,
  modifie_le timestamptz not null default now()
);
`
