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
  'Open Sans',
  'Courier Prime',
]
const fichier = (url) => fileURLToPath(url)
const octets = (url) => new Uint8Array(readFileSync(fichier(url)))

test('le catalogue : onze familles', () => {
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

/** Les fonctions OpenType d'un fichier de police, lues dans la liste de sa table GSUB (substitutions de glyphes),
 * non cherchées dans ses octets bruts (audit partiel du 19/11/2026). */
function fonctionsOpenType(o) {
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength)
  const tag = (p) => String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3))
  const fonctions = new Set()
  for (let i = 0; i < v.getUint16(4); i++) {
    const p = 12 + 16 * i
    if (tag(p) !== 'GSUB') continue
    const liste = v.getUint32(p + 8) + v.getUint16(v.getUint32(p + 8) + 6)
    for (let k = 0; k < v.getUint16(liste); k++) fonctions.add(tag(liste + 2 + 6 * k))
  }
  return fonctions
}

// Les petites capitales (19/11/2026) : Typst emploie celles de la police (fonction OpenType `smcp`) et ne les
// imite pas. Le catalogue dit quelles familles en ont ; le formulaire des modèles le répète. Une police qui en
// gagne ou en perd à une mise à jour fait échouer ce contrat.
for (const { famille, fichiers, petitesCapitales } of REGLES_MODELES.polices)
  test(`${famille} : ${petitesCapitales ? 'de vraies petites capitales dans ses quatre fichiers' : 'pas de petites capitales dans tous ses fichiers'}`, () => {
    // Annoncée seulement si ses quatre styles en ont (Source Serif 4 et Source Sans 3 n'en ont pas en italique).
    const toutes = fichiers.every((url) => fonctionsOpenType(octets(url)).has('smcp'))
    assert.equal(toutes, petitesCapitales === true)
  })

test('les familles qui ont des petites capitales dans leurs quatre styles : trois sur onze', () => {
  assert.deepEqual(
    REGLES_MODELES.polices.filter((p) => p.petitesCapitales).map((p) => p.famille),
    ['EB Garamond', 'Spectral', 'Roboto'],
  )
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
