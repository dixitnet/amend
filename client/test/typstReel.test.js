// L'export PDF compilé par le **vrai** Typst (28/09/2026).
//
// Deux bugs de production la même semaine — `calc.min(100%, …)` refusé pour
// toute image, puis « expected comma » sur un texte collé — avaient la même
// cause : aucun test n'avait jamais compilé la source engendrée. Les tests
// d'exportPdf.test.js lisent la source comme du texte ; ils ne savent pas
// ce que Typst en fera. Celui-ci la compile, par le même chemin que le
// serveur (server/typst.js : --root isolé, plafond mémoire, délai).
//
// Deux choses sont vérifiées :
//   1. un document qui contient tout (chaque bloc, chaque marque, chaque
//      réglage de page qui change le gabarit) et des textes pièges
//      **compile** ;
//   2. le texte des pièges **ressort tel quel** dans le PDF — une erreur
//      silencieuse (un `//` qui ouvrirait un commentaire, un caractère
//      avalé) ne fait pas échouer Typst, elle fait disparaître du texte.
//      Vérifié par pdftotext quand il est installé.
//
// Plus un document tiré au hasard, à graine fixe (donc rejouable), fait de
// ces mêmes pièges combinés avec des marques et des retours à la ligne.
//
// Typst n'est installé ni sur le Mac ni dans aucun outil de test : le test
// **s'ignore** s'il ne le trouve pas, en le disant. TYPST_BIN désigne le
// binaire ; à défaut, `typst` dans le PATH (c'est le cas sur le VPS).

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { schema } from '../src/schema.js'
import { docToTypst } from '../src/typstExport.js'
import { fusionner } from '../../shared/style.js'
import { Typst } from '../../server/typst.js'

const typst = new Typst({ binaire: process.env.TYPST_BIN || 'typst', delaiMs: 60_000 })
const version = await typst.disponible()
const pdftotext = spawnSync('pdftotext', ['-v']).error ? null : 'pdftotext'
const SANS_TYPST = version ? false : 'Typst introuvable (TYPST_BIN ou `typst` dans le PATH) — test ignoré'

// Une image PNG d'un pixel, pour que les blocs image aient un vrai fichier.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

/** Des textes qui ont un sens pour Typst en mode contenu, ou qui en
 * prennent un quand ils suivent une expression (une mise en forme, un
 * retour à la ligne). Chacun doit ressortir tel quel. */
const PIEGES = [
  '#', '#let x = 1', '#emph[x]', '$x^2$', '*gras*', '_souligné_', '`code`',
  '<label>', '@ref', '~', '[', ']', '[crochets]', '{accolades}', '"guillemets"',
  "l'apostrophe", '\\', '\\n', '=', '= Titre', '- tiret', '+ plus', '/ barre',
  '1. un', 'a//b', '/* pas un commentaire */', '// ni celui-ci', 'https://exemple.fr/a_b*c(d)',
  '(parenthèse)', '.Point', '.5', '...', 'fin.', ':', ';', '%', '&', '^', '|', '100 %',
  'é à ç œ Æ', '« chevrons »', '— tiret long —', 'emoji 😀', 'ANRU(Agence)', 'Note.Voir',
  'a -- b', 'a --- b', 'x-?', '-?', 'http://a.b/c', 'C:\\dossier', 'a\u00a0b', 'tab\there', '1/2', 'a*b',
]

/** Normalisation pour comparer le texte du PDF à celui du document :
 * pdftotext recompose les blancs à sa façon, et Typst change « ... » en
 * « … » (voulu). */
function normaliser(s) {
  return s.replace(/\.\.\./g, '…').replace(/\s+/g, '')
}

// ProseMirror refuse les nœuds texte vides.
const texte = (t, marks) => (t ? [schema.text(t, marks)] : [])
const m = (nom) => schema.marks[nom].create()
const par = (...enfants) => schema.node('paragraph', null, enfants.flat())

/** Deux paragraphes témoins par piège, entre deux marqueurs uniques : on
 * retrouvera ce qui est entre les deux dans le PDF. Le piège suit une mise
 * en forme (le cas des parenthèses collées), puis **ouvre** un paragraphe
 * (le cas des structures de ligne : `= `, `- `, `/ `, `1. `, qui doivent
 * rester du texte — une puce ou un titre en plus, c'est du texte altéré). */
function paragraphesTemoins() {
  return PIEGES.flatMap((p, i) => [
    par(texte(`K${i}a`, [m('strong')]), texte(p), texte(`K${i}b`, [m('em')])),
    par(texte(`L${i}a`)),
    par(texte(p), texte(`L${i}b`, [m('em')])),
  ])
}

/** Le document qui contient tout. */
function documentComplet(temoins) {
  const n = (type, attrs, contenu) => schema.node(type, attrs, contenu)
  const cellule = (type, t) => n(type, null, [par(texte(t))])
  return n('doc', null, [
    n('heading', { level: 1 }, texte('Titre 1 (avec parenthèse)')),
    par(
      texte('Gras', [m('strong')]),
      texte('(collé) '),
      texte('italique', [m('em')]),
      texte('.suite '),
      texte('souligné', [m('underline')]),
      texte('barré', [m('strike')]),
      texte('tout', [m('strong'), m('em'), m('underline'), m('strike')]),
      [schema.node('hard_break')],
      texte('(après un retour)')
    ),
    n('heading', { level: 2 }, [...texte('Titre 2 '), ...texte('#gras', [m('strong')])]),
    n('blockquote', null, [par(texte('Citation (collée) [et crochets]'))]),
    n('bullet_list', null, [
      n('list_item', null, [par(texte('puce')), n('bullet_list', null, [n('list_item', null, [par(texte('imbriquée'))])])]),
      n('list_item', null, [par(texte('(seconde)'))]),
    ]),
    n('ordered_list', { order: 3 }, [n('list_item', null, [par(texte('numéro'))])]),
    n('task_list', null, [
      n('task_item', { checked: true }, [par(texte('fait'))]),
      n('task_item', { checked: false }, [par(texte('à faire'))]),
    ]),
    n('table', null, [
      n('table_row', null, [cellule('table_header', 'En-tête'), cellule('table_header', '(b)')]),
      n('table_row', null, [cellule('table_cell', 'a, b'), cellule('table_cell', '#c')]),
    ]),
    n('image', { src: '/api/docs/x/images/pixel.png', alt: 'Un "pixel"', largeur: 800, hauteur: 600 }),
    n('image', { src: '/api/docs/x/images/pixel.png', alt: '', largeur: null, hauteur: null }),
    n('table_of_contents', { profondeur: 3 }),
    n('horizontal_rule'),
    n('heading', { level: 3 }, texte('Titre 3')),
    // Deux notes (28/09/2026), dont une piégée et une avec marques et
    // retour à la ligne : elles ressortent en fin de document.
    par(
      texte('Un appel'),
      n('footnote', null, [...texte('Note #piégée [x] (y) // fin', [m('em')]), schema.node('hard_break'), ...texte('- suite')]),
      texte(' puis un autre'),
      n('footnote', null, texte('Seconde note.'))
    ),
    ...temoins,
  ])
}

/** Le gabarit a des branches : chaque réglage qui en ouvre une est posé. */
const STYLE_CHARGE = fusionner({
  page: {
    size: 'A5',
    langue: 'en',
    pageNumbers: { enabled: true, startAt: 3 },
    titre1PageImpaire: true,
    titresSolidaires: false,
    entete: {
      gauche: { type: 'texte', texte: 'En-tête "piégé" #[x] (y)' },
      droite: { type: 'titre' },
      sautOuverture: false,
    },
  },
  blocs: {
    body: { align: 'left', firstLineIndent: 5, indent: 3 },
    quote: { italic: true, indent: 10 },
    h1: { uppercase: true, align: 'center' },
    h2: { spaceBefore: 0, spaceAfter: 0 },
  },
})
// Aligné à gauche : du texte justifié se couperait en fin de ligne, et les
// césures fausseraient la comparaison du texte.
const STYLE_SIMPLE = fusionner({ blocs: { body: { align: 'left' } } })

async function compiler(source) {
  const dossier = mkdtempSync(join(tmpdir(), 'amend-typst-reel-'))
  try {
    const chemin = join(dossier, 'pixel.png')
    writeFileSync(chemin, PNG)
    const pdf = await typst.rendre(source, { images: [{ nom: 'pixel.png', chemin }] })
    assert.ok(pdf.length > 1000, 'PDF vide')
    return pdf
  } finally {
    rmSync(dossier, { recursive: true, force: true })
  }
}

function texteDuPdf(pdf) {
  const dossier = mkdtempSync(join(tmpdir(), 'amend-pdftotext-'))
  try {
    const f = join(dossier, 'x.pdf')
    writeFileSync(f, pdf)
    const r = spawnSync(pdftotext, ['-enc', 'UTF-8', f, '-'], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    return r.stdout
  } finally {
    rmSync(dossier, { recursive: true, force: true })
  }
}

test('le document complet compile, sous le style par défaut et sous un style chargé', { skip: SANS_TYPST }, async () => {
  const d = documentComplet(paragraphesTemoins())
  await compiler(docToTypst(d, STYLE_SIMPLE, 'Titre "avec" #guillemets'))
  await compiler(docToTypst(d, STYLE_CHARGE, 'Document'))
})

test('chaque texte piège ressort tel quel dans le PDF', { skip: SANS_TYPST || (!pdftotext && 'pdftotext absent — fidélité non vérifiée') }, async () => {
  const d = schema.node('doc', null, paragraphesTemoins())
  const lu = normaliser(texteDuPdf(await compiler(docToTypst(d, STYLE_SIMPLE, 'Pièges'))))
  const perdus = []
  PIEGES.forEach((p, i) => {
    for (const k of ['K', 'L']) {
      const debut = lu.indexOf(`${k}${i}a`)
      const fin = lu.indexOf(`${k}${i}b`, debut)
      const obtenu = debut > -1 && fin > -1 ? lu.slice(debut + `${k}${i}a`.length, fin) : '(marqueurs introuvables)'
      if (obtenu !== normaliser(p)) perdus.push(`${k === 'K' ? 'après une marque' : 'en tête de paragraphe'} ${JSON.stringify(p)} → ${JSON.stringify(obtenu)}`)
    }
  })
  assert.deepEqual(perdus, [], `texte altéré dans le PDF :\n${perdus.join('\n')}`)
})

test('les liens compilent, et l’adresse arrive dans le PDF comme une vraie annotation', { skip: SANS_TYPST }, async () => {
  const lien = (href) => schema.marks.link.create({ href })
  const d = schema.node('doc', null, [
    par(
      texte('Voir '),
      texte('la page', [lien('https://exemple.org/a_(b)?x=1&y="2"#f')]),
      texte(' et '),
      texte('gras', [lien('https://exemple.org/'), m('strong')]),
      texte(' puis '),
      texte('#let x = 1 // piège', [lien('mailto:moi@exemple.org')]),
      texte('.')
    ),
  ])
  const pdf = await compiler(docToTypst(d, STYLE_SIMPLE, 'Liens'))
  // Un lien Typst est une annotation PDF avec /URI : le texte brut du PDF,
  // avant compression des flux, la porte en clair.
  const brut = pdf.toString('latin1')
  assert.match(brut, /\/URI\s?\(https:\/\/exemple\.org\/a_\(b\)\?x=1&y=%222%22#f\)/)
  assert.match(brut, /\/URI\s?\(mailto:moi@exemple\.org\)/)
})

/** Générateur à graine fixe (mulberry32) : un échec se rejoue à
 * l'identique. */
function hasard(graine) {
  let a = graine >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Trois graines par défaut ; TYPST_GRAINES=20 pour une chasse plus large.
const GRAINES = Array.from({ length: Number(process.env.TYPST_GRAINES) || 3 }, (_, i) => i + 1)
for (const graine of GRAINES) {
  test(`un document tiré au hasard compile (graine ${graine})`, { skip: SANS_TYPST }, async () => {
    const r = hasard(graine)
    const un = (liste) => liste[Math.floor(r() * liste.length)]
    const MARQUES = ['strong', 'em', 'underline', 'strike']
    const paragraphes = []
    for (let i = 0; i < 120; i++) {
      const enfants = []
      const n = 1 + Math.floor(r() * 6)
      for (let j = 0; j < n; j++) {
        if (r() < 0.12) {
          enfants.push(schema.node('hard_break'))
          continue
        }
        const t = un(PIEGES) + (r() < 0.5 ? ' ' : '') + (r() < 0.3 ? un(PIEGES) : '')
        const marques = MARQUES.filter(() => r() < 0.25).map(m)
        enfants.push(...texte(t, marques))
      }
      const bloc = r() < 0.1 ? 'heading' : 'paragraph'
      paragraphes.push(schema.node(bloc, bloc === 'heading' ? { level: 1 + Math.floor(r() * 3) } : null, enfants))
    }
    const d = schema.node('doc', null, paragraphes)
    await compiler(docToTypst(d, graine % 2 ? STYLE_SIMPLE : STYLE_CHARGE, `Hasard ${graine}`))
  })
}
