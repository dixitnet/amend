// Migration ponctuelle (15/09/2026) : retire les liens d'invitation
// partagés par rôle (`inviteLinks`), remplacés par les invitations
// nominatives par email — voir claude/conception-gestion-utilisateurs.md.
// Les routes correspondantes n'existent plus, ces jetons sont donc déjà
// inertes ; ce script les efface pour de bon, et marque explicitement
// `status: 'actif'` les accès existants (l'absence de statut se lisait
// déjà ainsi, autant l'écrire).
//
// Usage : node server/scripts/drop-invite-links.js [dossier-data]

import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const dataDir = process.argv[2] || process.env.DATA_DIR || './data'
const chemin = join(dataDir, 'docs.json')

let registre
try {
  registre = JSON.parse(readFileSync(chemin, 'utf8'))
} catch (err) {
  console.error(`Impossible de lire ${chemin} : ${err.message}`)
  process.exit(1)
}

let liensRetires = 0
let statutsEcrits = 0
for (const [id, doc] of Object.entries(registre)) {
  if (doc.inviteLinks) {
    delete doc.inviteLinks
    liensRetires++
    console.log(`  liens retirés : ${id} — ${doc.title}`)
  }
  if (Array.isArray(doc.access)) {
    for (const entree of doc.access) {
      if (!entree.status) {
        entree.status = 'actif'
        statutsEcrits++
      }
    }
  }
}

const tmp = chemin + '.tmp'
writeFileSync(tmp, JSON.stringify(registre, null, 2), 'utf8')
renameSync(tmp, chemin)

console.log(
  `\n${liensRetires} document(s) débarrassé(s) de leurs liens partagés, ` +
    `${statutsEcrits} accès marqué(s) « actif », sur ${Object.keys(registre).length} document(s) dans ${dataDir}.`
)
