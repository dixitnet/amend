// Critère de sortie de l'étape 7 (règles, § 8) : l'export d'un livre de référence est identique à
// l'attendu. Un livre qui emploie chaque bloc et chaque style du schéma est exporté avec chaque
// modèle livré ; sa source Typst doit être, au signe près, celle gardée dans
// `tests/donnees/livre-de-reference/`, et son PDF doit avoir le format et le nombre de pages notés.
// Un changement voulu de l'export se constate ici : relire la différence, puis régénérer avec
//   MAJ_REFERENCE=1 node --test contrats/statiques/livre-de-reference.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { BlockNoteEditor } from '@blocknote/core'
import { schemaLivre } from '../../adaptateurs/blocknote/schema.js'
import { versTypst, compilerPdf } from '../../adaptateurs/blocknote/export.js'
import { MODELES_LIVRE, REPRISE_MODELES, REGLES_MODELES, SURLIGNAGE_DU_LIVRE } from '../../design/livre.js'
import { famillesDuModele } from '../../domaine/index.js'

const DOSSIER = new URL('../../tests/donnees/livre-de-reference/', import.meta.url)
const MAJ = process.env.MAJ_REFERENCE === '1'
const t = (text, styles = {}) => ({ type: 'text', text, styles })
const long = 'Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. '

/** Le livre de référence : chaque bloc et chaque style du schéma du livre, dans un ordre de livre. */
const LIVRE = [
  { type: 'titre', content: [t('Petit conte immoral')] },
  { type: 'sousTitre', content: [t('Un essai de référence')] },
  { type: 'pageBreak' },
  { type: 'tableDesMatieres', props: { profondeur: 3 } },
  { type: 'heading', props: { level: 1 }, content: [t('Premier chapitre')] },
  {
    type: 'paragraph',
    content: [t('« Le second [conte] est '), t('parfaitement', { italic: true }), t(' immoral. »')],
  },
  ...Array.from({ length: 12 }, () => ({ type: 'paragraph', content: [t(long.repeat(3).trim())] })),
  { type: 'heading', props: { level: 2 }, content: [t('Les crises de l’idéal du progrès')] },
  {
    type: 'paragraph',
    content: [
      t('Au XIX'),
      t('e', { exposant: true }),
      t(' siècle, un '),
      t('texte', { surligne: true }),
      { type: 'note', props: { texte: 'Une note de bas de page.' } },
      t('.'),
    ],
  },
  {
    type: 'quote',
    content: [
      t('Une citation détachée, sur plus d’une ligne quand le format est étroit comme celui d’un livre de poche.'),
    ],
  },
  { type: 'paragraph', content: [] },
  {
    type: 'paragraph',
    content: [
      t('Un paragraphe après une ligne blanche, avec du '),
      t('gras', { bold: true }),
      t(' et un '),
      { type: 'link', href: 'https://amend.ink', content: [t('lien')] },
      t('.'),
    ],
  },
  { type: 'divider' },
  { type: 'heading', props: { level: 3 }, content: [t('Listes et tableau')] },
  { type: 'bulletListItem', content: [t('un')] },
  { type: 'bulletListItem', content: [t('deux')] },
  { type: 'numberedListItem', content: [t('premier')] },
  { type: 'numberedListItem', content: [t('second')] },
  {
    type: 'table',
    content: { type: 'tableContent', rows: [{ cells: ['Année', 'Titre'] }, { cells: ['1967', 'Petit conte'] }] },
  },
  { type: 'legende', content: [t('Tableau 1 : une légende.')] },
  { type: 'heading', props: { level: 1 }, content: [t('Second chapitre')] },
  { type: 'heading', props: { level: 4 }, content: [t('Un intertitre')] },
  { type: 'heading', props: { level: 5 }, content: [t('Un intertitre mineur')] },
  { type: 'paragraph', content: [t('Fin # $ * _ \\ " ` < > @ [ ] — é ’ « » … œ')] },
  // Un chapitre de titre 2 et sa bibliographie (19/11/2026) : dans le modèle « TàT 140 × 220 », le titre 1 est
  // une partie et le titre 2 ouvre une page.
  { type: 'heading', props: { level: 2 }, content: [t('Bibliographie')] },
  {
    type: 'bibliographie',
    content: [
      t('Ascher, François, '),
      t('Les nouveaux principes de l’urbanisme', { italic: true }),
      t(', La Tour-d’Aigues, Éditions de l’Aube, 2001, une référence assez longue pour passer à la ligne.'),
    ],
  },
  {
    type: 'bibliographie',
    content: [
      t('Choay, Françoise, '),
      t('L’urbanisme, utopies et réalités', { italic: true }),
      t(', Paris, Seuil, 1965.'),
    ],
  },
]

const MODELES = [...MODELES_LIVRE.map((m) => [m.id, m]), ...REPRISE_MODELES.map((m) => [m.id, m.valeurs])]
const polices = (m) =>
  famillesDuModele(m)
    .flatMap((f) => REGLES_MODELES.polices.find((p) => p.famille === f).fichiers)
    .map((url) => new Uint8Array(readFileSync(fileURLToPath(url))))
const wasm = () => readFileSync(createRequire(import.meta.url).resolve('@blocknote/xl-typst-compiler/wasm'))
const pages = (pdf) =>
  [
    ...Buffer.from(pdf)
      .toString('latin1')
      .matchAll(/\/Type ?\/Page\b/g),
  ].length

for (const [id, modele] of MODELES)
  test(`livre de référence, modèle « ${id} » : la source Typst et le PDF sont ceux attendus`, async () => {
    const editeur = BlockNoteEditor.create({ schema: schemaLivre })
    editeur.replaceBlocks(editeur.document, LIVRE)
    const { source, fichiers } = await versTypst(editeur, editeur.document, modele, {
      titre: 'Petit conte immoral',
      langue: 'fr',
      auteur: 'Ada',
      surlignage: SURLIGNAGE_DU_LIVRE,
    })
    const pdf = await compilerPdf(source, { fichiers, polices: polices(modele), wasm: wasm() })
    const constat = { pages: pages(pdf), largeur: modele.page.largeur, hauteur: modele.page.hauteur }
    const fTypst = new URL(`${id}.typ`, DOSSIER)
    const fPdf = new URL(`${id}.json`, DOSSIER)
    if (MAJ) {
      mkdirSync(DOSSIER, { recursive: true })
      writeFileSync(fTypst, source)
      writeFileSync(fPdf, JSON.stringify(constat, null, 2) + '\n')
    }
    assert.ok(existsSync(fTypst), `référence absente pour ${id} : la générer (MAJ_REFERENCE=1)`)
    assert.equal(source, readFileSync(fTypst, 'utf8'), 'la source Typst a changé')
    assert.deepEqual(constat, JSON.parse(readFileSync(fPdf, 'utf8')), 'le PDF a changé (pages, format)')
    assert.ok(Buffer.from(pdf).toString('latin1').startsWith('%PDF-'))
  })
