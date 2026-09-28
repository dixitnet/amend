// Migration ponctuelle (voir claude/conception-gestion-utilisateurs.md,
// projet Amend) : les documents créés avant la gestion des utilisateurs
// n'ont pas de liste d'accès et restent "ouverts à tout le monde" par
// compatibilité (voir Storage.roleFor). C'est sans risque
// tant que basic-auth filtre qui arrive jusqu'au serveur, mais devient une
// vraie fuite le jour où ce filtre est retiré. Ce script attribue le rôle
// éditeur, sur tous les documents qui n'ont pas encore de liste d'accès, à
// l'adresse email passée en argument — à lancer une fois avant de retirer
// basic-auth (sur le Mac ET sur le VPS, chacun a son propre DATA_DIR).
//
// Usage : node server/scripts/migrate-legacy-access.js vous@exemple.fr
//         node server/scripts/migrate-legacy-access.js vous@exemple.fr /chemin/vers/data

import { Storage } from '../storage.js'

const email = process.argv[2]
const dataDir = process.argv[3] || process.env.DATA_DIR || './data'

if (!email || !email.includes('@')) {
  console.error('Usage : node server/scripts/migrate-legacy-access.js <email> [dossier-data]')
  process.exit(1)
}

const storage = new Storage(dataDir)
// Le registre lui-même : depuis le 28/09/2026, listDocs sans email ne
// renvoie plus rien (un document sans liste d'accès n'est plus « ouvert »).
const docs = Object.entries(storage._readRegistry()).map(([id, meta]) => ({ id, ...meta }))
let migrated = 0

for (const doc of docs) {
  if (Array.isArray(doc.access)) continue // déjà géré, ne pas toucher aux accès existants
  storage.grantAccess(doc.id, email, 'editeur')
  migrated++
  console.log(`  migré : ${doc.id} — ${doc.title}`)
}

console.log(`\n${migrated} document(s) migré(s) (${email} en éditeur), sur ${docs.length} au total dans ${dataDir}.`)
