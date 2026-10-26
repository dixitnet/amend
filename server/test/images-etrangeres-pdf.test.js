// Le PDF d'un document qui contient une image copiée d'un autre document
// (24/10/2026) : le serveur dépose cette image à côté de la source, mais
// seulement si la personne peut lire l'autre document.

import test from 'node:test'
import assert from 'node:assert/strict'

const { imagesDuRendu } = await import('../routes/export.js')

const SOURCE = `#image("images/ici.png")
#image("images/autre/la-bas.png")
#image("images/ferme/interdite.png")
#image("images/autre/la-bas.png")
#image("images/inconnu/x.png")`

function contexte() {
  const lecteurs = { autre: true, ferme: false }
  return {
    storage: {
      getDoc: (id) => (['abc', 'autre', 'ferme'].includes(id) ? { id } : null),
      roleFor: (id) => (lecteurs[id] ? 'editor' : null),
    },
    uploads: {
      lister: (id) => (id === 'abc' ? [{ nom: 'ici.png', chemin: '/d/abc/ici.png' }] : []),
      chemin: (id, nom) => (id === 'autre' || id === 'ferme' ? `/d/${id}/${nom}` : null),
    },
  }
}

test('les images du document, plus celles des autres documents lisibles', () => {
  const images = imagesDuRendu(SOURCE, 'abc', { headers: {} }, contexte())
  assert.deepEqual(images.map((i) => i.nom).sort(), ['autre/la-bas.png', 'ici.png'])
})

test('un document illisible ou inconnu ne livre aucune image', () => {
  const noms = imagesDuRendu(SOURCE, 'abc', { headers: {} }, contexte()).map((i) => i.nom)
  assert.ok(!noms.some((n) => n.startsWith('ferme/') || n.startsWith('inconnu/')))
})

test('une source sans image étrangère : comme avant', () => {
  const images = imagesDuRendu('#image("images/ici.png")', 'abc', { headers: {} }, contexte())
  assert.deepEqual(images, [{ nom: 'ici.png', chemin: '/d/abc/ici.png' }])
})

// Ce que le compilateur trouve réellement à côté de la source : avec un faux
// binaire qui note le contenu de `images/` au moment de compiler.
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { Typst } = await import('../typst.js')

test('l’image d’un autre document est déposée dans images/<document>/', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'amend-faux-typst-'))
  const journal = join(dossier, 'vu.txt')
  const binaire = join(dossier, 'typst')
  writeFileSync(
    binaire,
    `#!/bin/sh\nif [ "$1" = "compile" ]; then find images -type f | sort > "${journal}"; printf '%%PDF-faux' > sortie.pdf; fi\n`
  )
  chmodSync(binaire, 0o755)
  const sources = join(dossier, 'sources')
  mkdirSync(join(sources, 'abc'), { recursive: true })
  mkdirSync(join(sources, 'autre'), { recursive: true })
  writeFileSync(join(sources, 'abc', 'ici.png'), 'x')
  writeFileSync(join(sources, 'autre', 'la-bas.png'), 'y')
  const t = new Typst({ binaire })
  await t.rendre('#image("images/ici.png")', {
    images: [
      { nom: 'ici.png', chemin: join(sources, 'abc', 'ici.png') },
      { nom: 'autre/la-bas.png', chemin: join(sources, 'autre', 'la-bas.png') },
      { nom: '../evasion.png', chemin: join(sources, 'abc', 'ici.png') },
    ],
  })
  assert.equal(readFileSync(journal, 'utf8').trim(), 'images/autre/la-bas.png\nimages/ici.png')
})
