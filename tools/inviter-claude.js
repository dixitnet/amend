#!/usr/bin/env node
// Invite Claude (ou tout client MCP) sur UN document d'amend.ink — marche 1
// du prototype (claude/etude-inviter-claude.md §8).
//
// À lancer sur le serveur, par SSH, dans le dossier de l'application :
//
//   node tools/inviter-claude.js "Vie et mort de Zan" --role correcteur --jours 7
//   node tools/inviter-claude.js --liste
//   node tools/inviter-claude.js --prolonger ag-1a2b3c4d --jours 7
//   node tools/inviter-claude.js --revoquer ag-1a2b3c4d
//
// Le document se désigne par son identifiant ou par son titre (entier, ou
// un fragment s'il est unique). L'adresse du connecteur est affichée **une
// seule fois** : elle ne se retrouve pas ensuite (on ne garde que son
// empreinte). Elle s'ajoute dans Claude, Paramètres → Connecteurs →
// Ajouter un connecteur personnalisé.
//
// Rôles : lecteur (lit, commente) ou correcteur (lit, commente, propose des
// corrections en suivi de modifications). Jamais éditeur.
//
// `--par` : l'adresse de la personne qui invite (le propriétaire du
// document par défaut). L'agent n'agit que tant qu'elle peut inviter sur le
// document.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Agents, DUREE_DEFAUT_JOURS, ROLES_AGENT } from '../server/agents.js'
import { Storage } from '../server/storage.js'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')

function lireCleDuEnv(cle) {
  const chemin = join(RACINE, '.env')
  if (!existsSync(chemin)) return null
  for (const brut of readFileSync(chemin, 'utf8').split('\n')) {
    const ligne = brut.trim()
    if (!ligne || ligne.startsWith('#')) continue
    const egal = ligne.indexOf('=')
    if (egal === -1 || ligne.slice(0, egal).trim() !== cle) continue
    return ligne.slice(egal + 1).trim().replace(/^["']|["']$/g, '')
  }
  return null
}

function analyser(argv) {
  const out = { mots: [], options: {} }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const nom = a.slice(2)
      if (['liste'].includes(nom)) out.options[nom] = true
      else out.options[nom] = argv[++i]
    } else out.mots.push(a)
  }
  return out
}

function echec(message) {
  console.error(message)
  process.exit(1)
}

const jour = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')

export function trouverDocument(storage, designation) {
  const tous = storage.allDocs ? storage.allDocs() : []
  const parId = tous.find((d) => d.id === designation)
  if (parId) return { doc: parId }
  const bas = designation.toLocaleLowerCase('fr')
  const exacts = tous.filter((d) => (d.title || '').toLocaleLowerCase('fr') === bas)
  if (exacts.length === 1) return { doc: exacts[0] }
  const approx = tous.filter((d) => (d.title || '').toLocaleLowerCase('fr').includes(bas))
  if (exacts.length > 1 || approx.length > 1) {
    const candidats = (exacts.length > 1 ? exacts : approx).map((d) => `  ${d.id}  ${d.title}`).join('\n')
    return { erreur: `Plusieurs documents correspondent — donne l'identifiant :\n${candidats}` }
  }
  if (approx.length === 1) return { doc: approx[0] }
  return { erreur: `Aucun document ne correspond à « ${designation} ».` }
}

function main() {
  const { mots, options } = analyser(process.argv.slice(2))
  const dataDir = process.env.DATA_DIR || join(RACINE, 'data')
  const storage = new Storage(dataDir)
  const agents = new Agents(dataDir)

  if (options.liste) {
    const liste = agents.lister()
    if (!liste.length) return console.log('Aucune invitation.')
    for (const a of liste) {
      const doc = storage.getDoc(a.docId)
      console.log(
        `${a.id}  ${a.etat.padEnd(8)}  ${a.role.padEnd(10)}  ${(doc ? doc.title : `(document supprimé ${a.docId})`).slice(0, 40).padEnd(40)}  expire ${jour(a.expiresAt)}  ` +
          `usage ${a.dernierUsage ? jour(a.dernierUsage) : 'jamais'}  par ${a.par}`
      )
    }
    return
  }

  if (options.revoquer) {
    return console.log(agents.revoquer(options.revoquer) ? `Invitation ${options.revoquer} révoquée.` : `Aucune invitation active ${options.revoquer}.`)
  }

  if (options.prolonger) {
    const jusqua = agents.prolonger(options.prolonger, options.jours || DUREE_DEFAUT_JOURS)
    return console.log(jusqua ? `Invitation ${options.prolonger} valable jusqu'au ${jour(jusqua)}.` : `Aucune invitation active ${options.prolonger}, ou durée invalide.`)
  }

  const designation = mots.join(' ').trim()
  if (!designation) echec('Usage : node tools/inviter-claude.js "<document>" --role correcteur|lecteur [--jours 7] [--par adresse] [--nom Claude]\n        --liste | --revoquer <id> | --prolonger <id> [--jours N]')
  const { doc, erreur } = trouverDocument(storage, designation)
  if (erreur) echec(erreur)

  const par = options.par || storage.ownerOf(doc.id)
  if (!par) echec("Ce document n'a pas de propriétaire : indique --par <adresse d'un éditeur>.")
  const role = options.role || 'correcteur'
  if (!ROLES_AGENT.includes(role)) echec(`Rôle « ${role} » refusé : ${ROLES_AGENT.join(' ou ')}.`)

  const invitation = agents.inviter({ docId: doc.id, role, jours: options.jours ?? DUREE_DEFAUT_JOURS, par, nom: options.nom || 'Claude' })
  if (!invitation.ok) echec(invitation.raison)

  const base = (options.base || process.env.APP_BASE_URL || lireCleDuEnv('APP_BASE_URL') || 'https://www.amend.ink').replace(/\/+$/, '')
  console.log(`
Invitation ${invitation.id} — « ${doc.title} », rôle ${role}, valable jusqu'au ${jour(invitation.expiresAt)}.

Adresse du connecteur (affichée UNE fois, à traiter comme un mot de passe) :

  ${base}/mcp/${invitation.secret}

Dans Claude : Paramètres → Connecteurs → Ajouter un connecteur personnalisé,
nom « amend.ink — ${doc.title.slice(0, 30)} », cette adresse, sans identifiant.
Pour la couper : node tools/inviter-claude.js --revoquer ${invitation.id}
`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
