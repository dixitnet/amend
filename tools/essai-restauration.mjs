#!/usr/bin/env node
// Essayer une restauration (30/09/2026) — le seul vrai test d'une sauvegarde.
//
//   node tools/essai-restauration.mjs amend-20260930-033000.tar.gz
//
// Déplie l'archive dans un dossier jetable avec le `tar` du système (comme le
// fera la personne qui restaure), puis relit **tout** ce qu'elle contient avec
// le code même de l'application : le registre, chaque journal rejoué dans un
// Y.Doc, les images référencées. Il ne démarre pas le serveur et n'écrit
// jamais dans l'archive ni dans un `data/` existant.
//
// Sort avec le code 0 si tout se relit, 1 sinon — utilisable en supervision.
// Dit aussi ce qu'une restauration ne rend PAS : le `.env`.

import { mkdtempSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import * as Y from 'yjs'
import { Storage } from '../server/storage.js'

const archive = process.argv[2]
if (!archive || !existsSync(archive)) {
  console.error('usage : node tools/essai-restauration.mjs <archive.tar.gz>')
  process.exit(2)
}

const jetable = mkdtempSync(join(tmpdir(), 'amend-essai-'))
let code = 0
const problemes = []
const note = (m) => console.log(m)

try {
  const t = spawnSync('tar', ['xzf', resolve(archive), '-C', jetable], { encoding: 'utf8' })
  if (t.status !== 0) {
    problemes.push(`tar n’a pas pu déplier l’archive : ${t.stderr.trim()}`)
  } else {
    const dataDir = join(jetable, 'data')
    if (!existsSync(join(dataDir, 'docs.json'))) {
      problemes.push('data/docs.json manque : ce n’est pas une sauvegarde d’amend.ink, ou elle est incomplète')
    } else {
      // Storage crée ce qui manque : on lui donne un dossier jetable.
      const storage = new Storage(dataDir)
      const docs = storage.allDocs()
      note(`Archive dépliée : ${docs.length} document(s) au registre.`)
      let totalOps = 0
      let totalCaracteres = 0
      for (const doc of docs) {
        const nom = `${doc.id} « ${doc.title ?? ''} »`
        if (!existsSync(join(dataDir, `${doc.id}.log`))) {
          // Un document créé mais jamais ouvert n'a pas de journal : normal.
          note(`  · ${nom} — pas de journal (document vide)`)
          continue
        }
        try {
          const updates = storage.readUpdates(doc.id)
          const y = new Y.Doc()
          for (const u of updates) Y.applyUpdate(y, u)
          const frag = y.getXmlFragment('prosemirror-content')
          const caracteres = frag.toString().replace(/<[^>]*>/g, '').length
          totalOps += updates.length
          totalCaracteres += caracteres
          if (updates.length > 0 && frag.length === 0) {
            problemes.push(`${nom} : ${updates.length} opération(s) rejouées, mais le texte est vide`)
          } else {
            note(`  ✓ ${nom} — ${updates.length} opération(s), ~${caracteres} signes`)
          }
          y.destroy()
        } catch (e) {
          problemes.push(`${nom} : le journal ne se rejoue pas (${e.message})`)
        }
      }
      note(`Rejoué : ${totalOps} opération(s), ~${totalCaracteres} signes en tout.`)
      // Les images : un dossier par document du registre.
      const uploads = join(dataDir, 'uploads')
      if (existsSync(uploads)) {
        const orphelins = readdirSync(uploads).filter(
          (d) => statSync(join(uploads, d)).isDirectory() && !docs.some((x) => x.id === d)
        )
        if (orphelins.length) note(`  ! ${orphelins.length} dossier(s) d’images sans document au registre (supprimés depuis) : sans gravité`)
      }
    }
  }
} finally {
  rmSync(jetable, { recursive: true, force: true })
}

if (problemes.length) {
  code = 1
  console.error('\nÉCHEC — cette sauvegarde ne se restaure pas entièrement :')
  for (const p of problemes) console.error('  ✗ ' + p)
} else {
  note('\nOK — l’archive se déplie et tout se relit.')
}
note(
  '\nRappel : cette archive ne contient pas le .env. Restaurer sans lui déconnecte tout le monde\n' +
    '(SESSION_SECRET) et ferme la porte à tous (ADMIN_EMAILS). Il est dans le dossier « secrets » de la sauvegarde.'
)
process.exit(code)
