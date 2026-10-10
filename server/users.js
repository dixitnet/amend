// Registre des comptes (16/09/2026). Premier endroit où l'utilisateur
// existe comme entité, et non plus seulement comme une adresse répétée dans
// la liste d'accès de chaque document — le « centraliser la gestion des
// utilisateurs » acté le 15/09 comme cap, sans urgence.
//
// Volontairement pauvre : email, nom affiché, couleur, date de création. Ni
// mot de passe (l'identité reste l'email prouvé par la réception d'un mail),
// ni rôle (il est par document, et reste dans docs.json), ni quota. On ne
// sait pas encore ce qu'un compte doit porter ; les tests utilisateurs sont
// précisément ce qui va l'apprendre, et il sera toujours temps d'ajouter un
// champ à un fichier qui n'en a que trois.
//
// Ce que ça règle tout de suite : le nom et la couleur vivaient dans le
// localStorage du navigateur. La même personne était donc nommée et colorée
// différemment sur son téléphone et sur son ordinateur — et dans un
// document en suivi de modifications, c'est la couleur qu'on lit d'un coup
// d'œil. Rattachés au compte, ils la suivent partout.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { lireJson, ecrireJsonAtomique } from './fichiers.js'

/** La couleur de l'IA, réservée (17/09/2026).
 *
 * C'est aussi l'accent de l'application : le vert des acceptations, des
 * boutons principaux, du « .ink » du logo. Une personne qui en hériterait
 * verrait ses propres modifications se confondre avec celles de l'IA dans
 * la marge et dans le texte — exactement la distinction que le suivi des
 * modifications existe pour rendre lisible. Aucune couleur d'auteur ne doit
 * donc s'en approcher. */
export const COULEUR_IA = '#5f7a4a'

/** Palette des couleurs d'auteur — la même que celle du client
 * (client/src/user.js), tenue à jour à la main : deux paquets npm séparés
 * pour huit chaînes de caractères stables ne se justifierait pas.
 *
 * **Aucun vert ici, délibérément** : les deux verts d'origine (`#81b29a`
 * sauge et `#588157` sapin) sont remplacés par un brun et une framboise.
 * Ce n'est pas une question de nuance exacte mais de coup d'œil — dans la
 * marge, à côté d'une suggestion de l'IA, un vert reste un vert. */
export const COULEURS = ['#e07a5f', '#3d5a80', '#8d6e63', '#f2cc8f', '#9b5de5', '#00b4d8', '#e56b6f', '#c9184a']

/** Les couleurs retirées, et par quoi les remplacer. Un compte créé avant
 * le 17/09/2026 a pu recevoir un vert : on ne le laisse pas, mais on ne
 * réattribue pas non plus au hasard — la couleur d'une personne est ce
 * qu'on lit d'un coup d'œil dans la marge, et la voir changer sans raison
 * est déroutant. La correspondance est donc fixe. */
const REMPLACEMENTS = {
  '#81b29a': '#8d6e63',
  '#588157': '#c9184a',
  [COULEUR_IA]: '#e07a5f',
}

/** La couleur d'un compte, corrigée si elle est retirée ou réservée. */
export function couleurAutorisee(couleur) {
  if (!couleur) return null
  const c = String(couleur).toLowerCase()
  return REMPLACEMENTS[c] || c
}

/** L'identifiant stable d'un compte, écrit dans chacun de ses commentaires
 * (`authorId`, S12) : 16 caractères tirés d'une empreinte SHA-256 de
 * l'adresse. Le nom affiché n'est pas unique et change ; l'adresse, elle,
 * ne doit pas voyager dans le document, que tous ses membres lisent. Sel
 * fixe et public : l'identifiant doit rester le même après un changement de
 * `SESSION_SECRET` — on ne le dérive donc d'aucun secret. Conséquence
 * assumée : quelqu'un qui a déjà l'adresse d'une personne peut vérifier
 * qu'elle a écrit un commentaire. */
export function idCompte(email) {
  return createHash('sha256').update(`amend:compte:${String(email || '').toLowerCase()}`).digest('hex').slice(0, 16)
}

export const NOM_MAX = 40

/** Le nom, tel qu'on le range : sans caractères de contrôle, espaces
 * resserrés, coupé à NOM_MAX. */
export function nomPropre(nom) {
  return String(nom || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NOM_MAX)
    .trim()
}

/** Pourquoi un nom est refusé, ou `null` s'il est acceptable (10/10/2026,
 * quand on a laissé chacun changer le sien).
 *
 * Deux sortes de noms seraient des mensonges dans la marge et la liste des
 * présents : ceux qui se donnent pour **l'IA** — « Margo (IA) » est le
 * nom de l'auteur des propositions de l'IA, et « Claude (pour X) » celui de
 * l'assistant invité — et rien d'autre. « Claude » ou « Margo » tout court
 * restent des prénoms. La couleur verte, réservée, est de toute façon ce
 * que le suivi regarde pour reconnaître l'IA. */
export function raisonDeRefus(nom) {
  const propre = nomPropre(nom)
  if (!propre) return 'le nom est vide'
  if (/\(\s*(ia|pour)\b/i.test(propre)) return 'ce nom se donne pour celui d’une IA'
  return null
}

export class Users {
  constructor(dataDir) {
    this.path = join(dataDir, 'users.json')
    if (!existsSync(this.path)) writeFileSync(this.path, JSON.stringify({}), 'utf8')
  }

  _lire() {
    // Un fichier de comptes illisible n'est pas un fichier vide (audit A1).
    return lireJson(this.path, {})
  }

  /** Écriture atomique (fichier temporaire puis rename), comme le registre
   * des documents : un arrêt en plein milieu ne laisse pas un fichier de
   * comptes tronqué. */
  _ecrire(registre) {
    ecrireJsonAtomique(this.path, registre)
  }

  /** Le compte d'une adresse, ou `null` s'il n'a jamais été créé — ce qui
   * est le cas de tout le monde tant que la personne n'a pas ouvert un
   * premier document. Une adresse sans compte n'est pas une anomalie. */
  get(email) {
    if (!email) return null
    const compte = this._lire()[email]
    if (!compte) return null
    // La correction se fait à la lecture, et se fige au prochain
    // enregistrement du nom : pas de script de migration pour trois
    // comptes, et rien à relancer si d'autres verts dormaient quelque part.
    const couleur = couleurAutorisee(compte.couleur)
    return couleur === compte.couleur ? compte : { ...compte, couleur }
  }

  /** Le nom affiché, ou `null` — c'est cette valeur qui décide, côté
   * client, s'il faut demander son nom à la personne. */
  nomDe(email) {
    const compte = this.get(email)
    return compte ? compte.nom : null
  }

  /** Enregistre le nom choisi, en créant le compte au passage. La couleur
   * est tirée au sort **une seule fois**, à la création, et ne bouge plus :
   * c'est ce qui la rend stable d'un appareil à l'autre. Renommer quelqu'un
   * plus tard ne la retire donc pas.
   *
   * Changer son nom (10/10/2026) passe par ici aussi : la couleur ne change
   * pas. La couleur, elle, reste à faire. */
  definirNom(email, nom) {
    const propre = nomPropre(nom)
    if (!email || raisonDeRefus(propre)) return null
    const registre = this._lire()
    const existant = registre[email]
    const compte = {
      email,
      nom: propre,
      couleur:
        (existant && couleurAutorisee(existant.couleur)) ||
        COULEURS[Math.floor(Math.random() * COULEURS.length)],
      createdAt: (existant && existant.createdAt) || Date.now(),
    }
    registre[email] = compte
    this._ecrire(registre)
    return compte
  }

  /** Pour le back-office : tous les comptes, indexés par email. */
  tous() {
    return this._lire()
  }
}
