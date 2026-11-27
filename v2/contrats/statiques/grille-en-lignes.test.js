// Contrat de la grille stricte (27/11/2026, docs/v2-grille-plan.md) : avec un modèle compté en lignes, chaque
// paragraphe de texte courant commence sur une ligne de la grille, après un titre, une citation, une image,
// un tableau, une note, en haut comme en bas de page. La mesure est faite par Typst lui-même : le livre porte
// un repère en tête de chaque paragraphe, et sa dernière ligne refuse la compilation si l'un d'eux est hors
// grille. Le même livre avec un bloc de cinq points glissé dedans est refusé : le contrôle mord.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { BlockNoteEditor } from '@blocknote/core'
import { schemaLivre } from '../../adaptateurs/blocknote/schema.js'
import { versTypst, compilerPdf } from '../../adaptateurs/blocknote/export.js'
import { REGLES_MODELES, SURLIGNAGE_DU_LIVRE } from '../../design/livre.js'
import { famillesDuModele, gabaritTypst, grille } from '../../domaine/index.js'
import { MODELE_EN_LIGNES } from '../../tests/donnees/modele-en-lignes.js'

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

const phrase = 'Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. '
/** Un paragraphe repéré : le repère est posé en tête de sa première ligne. */
const p = (typst = `#"${phrase.repeat(2).trim()}"`) => `#metadata(none)<repere>${typst}\n\n`
/** Le livre : chaque sorte de bloc, puis des intertitres semés pour qu'il en tombe en haut et en bas de page. */
const LIVRE =
  `#amend-titre[#"Petit conte immoral"]\n\n#amend-sous-titre[#"Un essai"]\n\n#pagebreak()\n\n` +
  `#heading(level: 1)[#"Première partie"]\n\n#heading(level: 2)[#"Premier chapitre"]\n\n` +
  p() +
  p() +
  `#heading(level: 3)[#"Un intertitre long, qui passe sur deux lignes dans un format aussi étroit que celui-ci"]\n\n` +
  p() +
  `#quote(block: true)[#"Une citation détachée, sur plus d’une ligne quand le format est étroit comme celui d’un livre."]\n\n` +
  p(
    `#"${phrase}Une note"#footnote[#"Une note de bas de page, assez longue pour passer sur deux lignes dans la justification."]` +
      `#" et un "#amend-surligne("passage surligné")#super("e")#"."`,
  ) +
  `#amend-blanc\n\n` +
  p() +
  `#amend-separateur\n\n` +
  p() +
  `#list([#"un"], [#"deux"])\n\n#enum([#"premier"], [#"second"])\n\n` +
  p() +
  `#table(columns: (auto, auto), stroke: 0.5pt + luma(200), inset: 6pt, [#"Année"], [#"Titre"], [#"1967"], [#"Petit conte"])\n\n` +
  `#amend-legende[#"Tableau 1 : une légende."]\n\n` +
  p() +
  // Un bloc d'une hauteur quelconque, à la place d'une image (même traitement : `amend-entier`).
  `#amend-entier(rect(width: 100%, height: 83pt))\n\n` +
  p() +
  Array.from(
    { length: 18 },
    (_, i) =>
      p() +
      `#heading(level: ${3 + (i % 3)})[#"Intertitre ${i}"]\n\n` +
      p(`#"${phrase.repeat(2)}Fin"${i % 4 ? '' : '#footnote[#"Note."]'}#"."`),
  ).join('') +
  `#heading(level: 2)[#"Bibliographie"]\n\n` +
  `#amend-bibliographie[#"Ascher, François, "#emph("Les nouveaux principes de l’urbanisme")#", La Tour-d’Aigues, Éditions de l’Aube, 2001, une référence assez longue pour passer à la ligne."]\n\n` +
  p()
/** Le contrôle, écrit en Typst : la position de chaque repère, comptée en pas depuis le haut de la zone de texte. */
const controle = (m) =>
  `#context { let reperes = query(<repere>); assert(reperes.len() > 40, message: "repères absents"); ` +
  `for r in reperes { let n = (r.location().position().y - ${m.marges.haut}mm) / ${grille(m).pas}pt; ` +
  `assert(calc.abs(n - calc.round(n)) < 0.01, message: "hors grille, page " + str(r.location().page()) + ", ligne " + str(calc.round(n, digits: 2))) } }\n`
const compiler = (m) =>
  compilerPdf(gabaritTypst(m, { titre: 'Essai', langue: 'fr' }) + LIVRE + controle(m), {
    polices: polices(m),
    wasm: wasm(),
  })

test('modèle en lignes : tout paragraphe commence sur une ligne de la grille', async () => {
  const pdf = await compiler(MODELE_EN_LIGNES)
  assert.ok(Buffer.from(pdf).toString('latin1').startsWith('%PDF-'))
  assert.ok(pages(pdf) >= 8, 'assez de pages pour des titres en haut et en bas de page')
})

test('le contrôle mord : un bloc de cinq points glissé dans le livre met la suite hors grille', async () => {
  const fausse =
    gabaritTypst(MODELE_EN_LIGNES, { titre: 'Essai', langue: 'fr' }) +
    LIVRE.replace('#quote(block: true)', '#block(height: 5pt)\n\n#quote(block: true)')
  await assert.rejects(
    compilerPdf(fausse + controle(MODELE_EN_LIGNES), { polices: polices(MODELE_EN_LIGNES), wasm: wasm() }),
    /hors grille/,
  )
})

test('modèle en lignes : les titres à la suite, un autre pas, des demi-lignes partout', async () => {
  const m = structuredClone(MODELE_EN_LIGNES)
  Object.assign(m.grille, { corps: 10, interligne: 12.5, lignes: 36 })
  m.chapitre.debut = 'continuer'
  m.ouverture2.debut = 'continuer'
  m.folio.position = 'haut-exterieur'
  for (const [nom, avant, apres] of [
    ['titre1', 2.5, 1],
    ['titre2', 1.5, 1.5],
    ['titre3', 0.5, 0],
    ['titre4', 0, 0.5],
    ['citation', 1, 0.5],
    ['legende', 0, 0],
  ])
    Object.assign(m.styles[nom], { blancAvant: avant, blancApres: apres })
  m.styles.titre3.corps = 18
  await compiler(m)
})

test('modèle en lignes : le livre exporté par BlockNote se compile', async () => {
  const t = (text, styles = {}) => ({ type: 'text', text, styles })
  const editeur = BlockNoteEditor.create({ schema: schemaLivre })
  editeur.replaceBlocks(editeur.document, [
    { type: 'titre', content: [t('Petit conte immoral')] },
    { type: 'sousTitre', content: [t('Un essai')] },
    { type: 'tableDesMatieres', props: { profondeur: 3 } },
    { type: 'heading', props: { level: 1 }, content: [t('Premier chapitre')] },
    {
      type: 'paragraph',
      content: [t('Un '), t('texte', { surligne: true }), { type: 'note', props: { texte: 'Une note.' } }, t('.')],
    },
    { type: 'quote', content: [t('Une citation.')] },
    { type: 'paragraph', content: [] },
    { type: 'divider' },
    { type: 'heading', props: { level: 2 }, content: [t('Un chapitre')] },
    { type: 'bulletListItem', content: [t('un')] },
    {
      type: 'table',
      content: { type: 'tableContent', rows: [{ cells: ['Année', 'Titre'] }, { cells: ['1967', 'Conte'] }] },
    },
    { type: 'legende', content: [t('Une légende.')] },
    { type: 'heading', props: { level: 4 }, content: [t('Un intertitre')] },
    { type: 'bibliographie', content: [t('Choay, Françoise, L’urbanisme, Paris, Seuil, 1965.')] },
  ])
  const { source, fichiers } = await versTypst(editeur, editeur.document, MODELE_EN_LIGNES, {
    titre: 'Essai',
    langue: 'fr',
    surlignage: SURLIGNAGE_DU_LIVRE,
  })
  assert.match(source, /^#set document\(title: "Essai"\)\n#let amend-pas = 14pt\n/)
  const pdf = await compilerPdf(source, { fichiers, polices: polices(MODELE_EN_LIGNES), wasm: wasm() })
  assert.ok(pages(pdf) >= 3)
})

test('une page est pleine : la dernière ligne de la grille est prise, que la page commence par du texte ou par un titre', async () => {
  // Remplace le « jeu en bas de page » du gabarit en points (22/11/2026) : avec la brique, une page qui commence
  // par un intertitre ne perd pas sa dernière ligne. Des paragraphes d'une ligne ; le titre 4 (une ligne de
  // blanc avant, que Typst retire en haut de page, et une ligne de titre) arrive après une page pleine.
  const m = MODELE_EN_LIGNES
  const n = m.grille.lignes
  const ligne = '#metadata(none)<repere>#"Une ligne."\n\n'
  const livre = ligne.repeat(n) + '#heading(level: 4)[#"Intertitre"]\n\n' + ligne.repeat(2 * n)
  // Sur la page 1 : n lignes de texte. Sur la page 2 : le titre puis n − 1 lignes, la dernière sur la ligne n.
  const pleines =
    `#context { let parPage(p) = query(<repere>).filter(r => r.location().page() == p); ` +
    `let derniere(p) = calc.round((parPage(p).last().location().position().y - ${m.marges.haut}mm) / ${grille(m).pas}pt); ` +
    `assert(parPage(1).len() == ${n}, message: "page 1 : " + str(parPage(1).len()) + " lignes"); ` +
    `assert(parPage(2).len() == ${n - 1}, message: "page 2 : " + str(parPage(2).len()) + " lignes sous le titre"); ` +
    `assert(derniere(1) == ${n - 1} and derniere(2) == ${n - 1}, message: "dernière ligne : " + str(derniere(1)) + ", " + str(derniere(2))) }\n`
  // Le titre 4 du modèle d'essai a une ligne de blanc avant et aucune après : en haut de page, il occupe une ligne.
  await compilerPdf(
    gabaritTypst(m, { titre: 'Essai', langue: 'fr' }) +
      livre +
      controle(m).replace('reperes.len() > 40', 'reperes.len() > 0') +
      pleines,
    {
      polices: polices(m),
      wasm: wasm(),
    },
  )
})
