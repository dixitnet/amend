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
//
// Ce fichier assemble le dépôt : le schéma est dans `schema-comptes.js`, les
// méthodes sont réparties par domaine dans `comptes-personnes.js`,
// `comptes-documents.js`, `comptes-dossiers.js`, `comptes-equipes.js`,
// `comptes-modeles.js`, `comptes-acces.js`, `comptes-jetons.js`,
// `comptes-reglages.js` et `comptes-suivi.js`.
import { ouvrirBase } from './base.js'
import { SCHEMA } from './schema-comptes.js'
import { partiesPersonnes } from './comptes-personnes.js'
import { partiesDocuments } from './comptes-documents.js'
import { partiesDossiers } from './comptes-dossiers.js'
import { partiesEquipes } from './comptes-equipes.js'
import { partiesModeles } from './comptes-modeles.js'
import { partiesPolices } from './comptes-polices.js'
import { partiesAcces } from './comptes-acces.js'
import { partiesJetons } from './comptes-jetons.js'
import { partiesReglages } from './comptes-reglages.js'
import { partiesSuivi } from './comptes-suivi.js'

/** Ouvre le dépôt ; crée le schéma s'il manque. */
export async function ouvrirComptes(url) {
  const { sql, rendre } = ouvrirBase(url)
  try {
    await sql.unsafe(SCHEMA)
  } catch (e) {
    await rendre()
    throw e
  }

  /** Le dépôt, sur une réserve ou sur une transaction. */
  const assembler = (base) => {
    const d = {}
    Object.assign(
      d,
      partiesPersonnes(base),
      partiesDocuments(base),
      partiesDossiers(base),
      partiesEquipes(base),
      partiesModeles(base),
      partiesPolices(base),
      partiesAcces(base, d),
      partiesJetons(base),
      partiesReglages(base),
      partiesSuivi(base),
    )
    return d
  }
  /** Une transaction vue comme une réserve : une méthode qui ouvre sa propre
   * transaction (`begin`) y pose un point de reprise (`savepoint`) à la place. */
  const commeReserve = (t) =>
    new Proxy(t, { get: (o, cle) => (cle === 'begin' ? (f) => o.savepoint((s) => f(commeReserve(s))) : o[cle]) })

  const depot = assembler(sql)
  /**
   * Plusieurs écritures en une seule transaction : `f` reçoit un dépôt dont
   * toutes les méthodes écrivent dans la transaction ; une erreur levée par
   * `f` défait tout (suppression d'un compte, audit du 11/11/2026).
   */
  depot.enTransaction = (f) => sql.begin((t) => f(assembler(commeReserve(t))))
  depot.fermer = rendre
  return depot
}
