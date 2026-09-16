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

import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

/** Palette des couleurs d'auteur — la même que celle du client
 * (client/src/user.js), tenue à jour à la main : deux paquets npm séparés
 * pour huit chaînes de caractères stables ne se justifierait pas. */
export const COULEURS = ['#e07a5f', '#3d5a80', '#81b29a', '#f2cc8f', '#9b5de5', '#00b4d8', '#e56b6f', '#588157']

export const NOM_MAX = 40

export class Users {
  constructor(dataDir) {
    this.path = join(dataDir, 'users.json')
    if (!existsSync(this.path)) writeFileSync(this.path, JSON.stringify({}), 'utf8')
  }

  _lire() {
    try {
      return JSON.parse(readFileSync(this.path, 'utf8'))
    } catch {
      return {}
    }
  }

  /** Écriture atomique (fichier temporaire puis rename), comme le registre
   * des documents : un arrêt en plein milieu ne laisse pas un fichier de
   * comptes tronqué. */
  _ecrire(registre) {
    const tmp = this.path + '.tmp'
    writeFileSync(tmp, JSON.stringify(registre, null, 2), 'utf8')
    renameSync(tmp, this.path)
  }

  /** Le compte d'une adresse, ou `null` s'il n'a jamais été créé — ce qui
   * est le cas de tout le monde tant que la personne n'a pas ouvert un
   * premier document. Une adresse sans compte n'est pas une anomalie. */
  get(email) {
    if (!email) return null
    return this._lire()[email] || null
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
   * (Laisser la personne changer son nom et sa couleur reste à faire — noté
   * avec Sylvain le 16/09 : on verra après les tests utilisateurs. D'ici
   * là, corriger une faute de frappe se fait dans ce fichier.) */
  definirNom(email, nom) {
    const propre = String(nom || '').trim().slice(0, NOM_MAX)
    if (!email || !propre) return null
    const registre = this._lire()
    const existant = registre[email]
    const compte = {
      email,
      nom: propre,
      couleur: (existant && existant.couleur) || COULEURS[Math.floor(Math.random() * COULEURS.length)],
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
