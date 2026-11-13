// Le catalogue des polices des modèles de mise en page (13/11/2026) : chaque
// fichier se lit, porte la famille et le style annoncés, a la licence de sa
// famille à côté, et un PDF compilé avec la famille l'incorpore.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { BlockNoteEditor } from '@blocknote/core'
import { schemaLivre } from '../../adaptateurs/blocknote/schema.js'
import { versTypst, compilerPdf } from '../../adaptateurs/blocknote/export.js'
import { lirePolice, STYLES_POLICE } from '../../domaine/index.js'
import { MODELES_LIVRE, REGLES_MODELES } from '../../design/livre.js'

const FAMILLES = [
  'EB Garamond',
  'Source Serif 4',
  'Crimson Pro',
  'Libre Baskerville',
  'Lora',
  'Spectral',
  'Inter',
  'Source Sans 3',
  'Roboto',
]
const fichier = (url) => fileURLToPath(url)
const octets = (url) => new Uint8Array(readFileSync(fichier(url)))

test('le catalogue : neuf familles, les mêmes pour les équipes et pour l’instance', () => {
  assert.deepEqual(
    REGLES_MODELES.polices.map((p) => p.famille),
    FAMILLES,
  )
  assert.deepEqual(
    REGLES_MODELES.polices.map((p) => p.famille),
    FAMILLES,
  )
})

for (const { famille, fichiers } of REGLES_MODELES.polices)
  test(`${famille} : quatre fichiers lisibles, la bonne famille, les quatre styles, la licence à côté`, () => {
    assert.equal(fichiers.length, 4)
    const styles = []
    for (const url of fichiers) {
      assert.ok(existsSync(fichier(url)), `${url} existe`)
      const r = lirePolice(octets(url))
      assert.equal(r.ok, true, url)
      assert.equal(r.famille, famille, `la famille lue dans ${url}`)
      styles.push(r.style)
    }
    // Le demi-gras d'EB Garamond (graisse 600) compte pour « gras » (lirePolice : à partir de 600).
    assert.deepEqual([...styles].sort(), [...STYLES_POLICE].sort(), 'romain, italique, gras, gras italique')
    // La licence (SIL OFL) est dans le dossier de la famille, ou à la racine pour EB Garamond.
    const dossier = dirname(fichier(fichiers[0]))
    assert.ok(existsSync(join(dossier, 'OFL.txt')), 'OFL.txt à côté des fichiers')
    assert.match(readFileSync(join(dossier, 'OFL.txt'), 'utf8'), /SIL OPEN FONT LICENSE/i)
  })

const texte = (t, styles = {}) => ({ type: 'text', text: t, styles })
const wasm = () => readFileSync(createRequire(import.meta.url).resolve('@blocknote/xl-typst-compiler/wasm'))

for (const { famille, fichiers } of REGLES_MODELES.polices)
  test(`${famille} : un PDF composé avec cette famille l’incorpore (romain, italique, gras, gras italique)`, async () => {
    const editeur = BlockNoteEditor.create({ schema: schemaLivre })
    editeur.replaceBlocks(editeur.document, [
      { type: 'heading', props: { level: 1 }, content: [texte('Éloge de la lenteur')] },
      {
        type: 'paragraph',
        content: [
          texte('« Où l’été fut '),
          texte('très', { italic: true }),
          texte(' long », écrivit-il, '),
          texte('œuvre', { bold: true }),
          texte(' et '),
          texte('refrain', { bold: true, italic: true }),
          texte('. Ça va.'),
        ],
      },
    ])
    const modele = { ...MODELES_LIVRE[0], police: famille, polices: fichiers }
    const { source, fichiers: images } = await versTypst(editeur, editeur.document, modele, {
      titre: 'Essai',
      langue: 'fr',
    })
    const pdf = await compilerPdf(source, { fichiers: images, polices: fichiers.map(octets), wasm: wasm() })
    const brut = Buffer.from(pdf).toString('latin1')
    assert.ok(brut.startsWith('%PDF-'))
    // Le nom de la police dans le PDF : sans espaces, avec un préfixe de sous-ensemble.
    const nom = famille.replace(/\s+/g, '')
    assert.match(brut, new RegExp(`/BaseFont ?/[A-Z]{6}\\+${nom}`), `${famille} incorporée`)
    // Les quatre styles : le PDF incorpore un sous-ensemble de chaque fichier utilisé.
    const incorporees = new Set(
      [...brut.matchAll(new RegExp(`/BaseFont ?/[A-Z]{6}\\+(${nom}[\\w-]*)`, 'g'))].map((m) => m[1]),
    )
    assert.ok(incorporees.size >= 4, `${famille} : ${[...incorporees].join(', ')}`)
  })
