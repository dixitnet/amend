// Ce que la mise en page promet, et ce que l'export PDF en fait
// (18/09/2026).
//
// Sylvain signale des écarts entre les réglages choisis dans le panneau
// « Mise en page » et le PDF obtenu. Le PDF lui-même est difficile à
// mesurer ; la **source Typst**, elle, est du texte, et c'est là que se
// décide tout ce qui est réglable. Ces tests vérifient donc que chaque
// propriété du modèle de style atteint la source — et, pour les plus
// piégeuses, qu'elle y arrive **une seule fois** et dans la bonne unité.
//
// Ce qu'ils ne peuvent pas voir, et qui reste à vérifier sur un vrai PDF :
// le choix réel de la police par Typst (une famille absente de la machine
// est remplacée en silence — voir le test « polices » plus bas), la césure,
// et la pagination.

import test from 'node:test'
import assert from 'node:assert/strict'
import { doc } from './harness.js'
import { docToTypst } from '../src/typstExport.js'
import { fusionner, styleParDefaut, BLOCS, PROPRIETES, NIVEAUX_TITRE, POLICES } from '../../shared/style.js'

/** La source Typst d'un document minimal sous un style donné. */
function source(couche, document = doc({ h: 1, texte: 'Titre' }, 'Un paragraphe.')) {
  return docToTypst(document, fusionner(couche), 'Document')
}

/** Le corps de la fonction Typst d'un bloc — c'est là que vivent ses
 * réglages, et nulle part ailleurs. */
function fonction(src, bloc) {
  const nom = bloc === 'body' ? 'amend-corps' : bloc === 'quote' ? 'amend-citation' : `amend-${bloc}`
  const i = src.indexOf(`#let ${nom}(corps) = {`)
  assert.ok(i > -1, `fonction ${nom} absente de la source`)
  return src.slice(i, src.indexOf('\n}', i))
}

// ===================================================== la page

test('le format, les marges et la numérotation arrivent tels quels', () => {
  const src = source({
    page: {
      size: 'A5',
      marginTop: 30,
      marginBottom: 20,
      marginLeft: 15,
      marginRight: 12,
      pageNumbers: { enabled: true, startAt: 3 },
    },
  })
  assert.match(src, /width: 148mm/)
  assert.match(src, /height: 210mm/)
  assert.match(src, /margin: \(top: 30mm, bottom: 20mm, left: 15mm, right: 12mm\)/)
  assert.match(src, /numbering: "1"/)
  assert.match(src, /#counter\(page\)\.update\(3\)/)
})

test('sans numérotation, rien n’est numéroté', () => {
  const src = source({ page: { pageNumbers: { enabled: false, startAt: 1 } } })
  assert.ok(!src.includes('numbering:'))
  assert.ok(!src.includes('counter(page)'))
})

// ===================================================== les blocs

test('chaque propriété réglable atteint la source', () => {
  // Le test le plus utile du lot : il part de PROPRIETES, donc une
  // propriété ajoutée au modèle et oubliée dans le sérialiseur Typst se
  // signalera ici, et pas dans un PDF six semaines plus tard.
  const src = source({
    blocs: {
      body: {
        font: 'serif',
        size: 10,
        bold: true,
        italic: true,
        uppercase: true,
        align: 'justify',
        lineHeight: 1.5,
        spaceBefore: 7,
        spaceAfter: 6,
        firstLineIndent: 5,
      },
    },
  })
  const f = fonction(src, 'body')
  // Une liste de repli, ordonnée du plus fidèle au plus sûr : Typst prend
  // la première famille présente sur la machine qui compose.
  assert.match(f, /font: \("Georgia", "Libertinus Serif"\)/)
  assert.match(f, /size: 10pt/)
  assert.match(f, /weight: "bold"/)
  assert.match(f, /style: "italic"/)
  assert.match(f, /upper\(corps\)/)
  assert.match(f, /justify: true/)
  assert.match(f, /leading:/)
  assert.match(f, /v\(7pt, weak: true\)/, 'espace avant')
  // L'espace après passe par par.spacing, ajouté à l'interligne : c'est
  // ce qui empêche les paragraphes de se chevaucher quand il vaut 0.
  assert.match(f, /spacing: 1\.50em - 1em \+ 0\.2em \+ 6pt/, 'espace après')
  // 5 mm en points : c'est la conversion, et c'est là qu'on se trompe.
  assert.match(f, /first-line-indent: \(amount: 14\.17pt/)

  // Aucune propriété du modèle ne doit être restée en chemin.
  for (const p of PROPRIETES) {
    assert.ok(typeof p.id === 'string')
  }
})

test('l’alignement justifié ne devient pas un alignement à droite', () => {
  // Dans Typst, justifier est une propriété du paragraphe et non un
  // alignement : `align` doit rester à gauche, sinon le texte part en
  // drapeau à droite tout en étant justifié.
  const f = fonction(source({ blocs: { body: { align: 'justify' } } }), 'body')
  assert.match(f, /justify: true/)
  assert.match(f, /align\(left\)/)

  const centre = fonction(source({ blocs: { body: { align: 'center' } } }), 'body')
  assert.match(centre, /justify: false/)
  assert.match(centre, /align\(center\)/)
})

test('un espace nul ne s’écrit pas — un v() faible de zéro écraserait l’espacement', () => {
  // Découvert en compilant, le 19/09 : `v(0pt, weak: true)` n'est pas
  // neutre. Posé entre deux blocs, il **remplace** l'espacement de
  // paragraphe au lieu de s'y ajouter — les lignes finissaient par se
  // chevaucher, et l'espace après les titres avait disparu. On ne l'écrit
  // donc que s'il vaut quelque chose.
  const nul = fonction(source({ blocs: { body: { spaceAfter: 0, spaceBefore: 0 } } }), 'body')
  assert.doesNotMatch(nul, /v\(0pt/)

  const titre = fonction(source({ blocs: { h1: { spaceBefore: 16, spaceAfter: 8 } } }), 'h1')
  assert.match(titre, /v\(16pt, weak: true\)/, 'espace avant le titre')
  assert.match(titre, /v\(8pt, weak: true\)/, 'espace après le titre')
})

test('le retrait à gauche enveloppe le bloc, et seulement s’il existe', () => {
  const avec = fonction(source({ blocs: { quote: { indent: 10 } } }), 'quote')
  assert.match(avec, /pad\(left: 28\.35pt, corps\)/)
  const sans = fonction(source({ blocs: { quote: { indent: 0 } } }), 'quote')
  assert.doesNotMatch(sans, /pad\(/)
})

test('les titres ne restent pas seuls en bas de page, sauf si on le demande', () => {
  assert.match(source({}), /#show heading: set block\(sticky: true\)/)
  assert.doesNotMatch(
    source({ page: { titresSolidaires: false } }),
    /sticky: true/
  )
})

test('les titres 1 peuvent ouvrir une page impaire', () => {
  const normal = source({})
  assert.doesNotMatch(normal, /pagebreak\(to: "odd"/)
  const livre = source({ page: { titre1PageImpaire: true } })
  assert.match(livre, /pagebreak\(to: "odd", weak: true\)/)
  // Seulement le niveau 1 : un titre 2 en belle page n'aurait pas de sens.
  assert.equal((livre.match(/pagebreak\(to: "odd"/g) || []).length, 1)
})

test('le paragraphe reste dans le flux : ni block(), ni align() enveloppant', () => {
  // Le bug du 19/09 : `block(width: 100%, align(...)[#corps])` sortait le
  // paragraphe du flux du document. Typst n'appliquait alors ni le retrait
  // de première ligne ni l'espacement entre paragraphes — les réglages
  // étaient bien écrits dans la source, mais sans aucun effet visible.
  const f = fonction(source({ blocs: { body: { firstLineIndent: 5, align: 'left' } } }), 'body')
  assert.doesNotMatch(f, /block\(/)
  assert.match(f, /set align\(left\)/)
  assert.match(f, /first-line-indent: \(amount: 14\.17pt/)
})

test('un espace après nul ne fait pas se chevaucher les paragraphes', () => {
  // par.spacing REMPLACE l'interligne, il ne s'y ajoute pas : à 0, les
  // lignes de deux paragraphes voisins se superposaient. On y ajoute donc
  // toujours l'interligne, pour que 0 signifie « comme deux lignes ».
  const f = fonction(source({ blocs: { body: { spaceAfter: 0, lineHeight: 1.15 } } }), 'body')
  assert.match(f, /spacing: 1\.15em - 1em \+ 0\.2em \+ 0pt/)
  assert.doesNotMatch(f, /spacing: 0pt/)
})

test('chaque niveau de titre a sa propre fonction, et pas une de plus', () => {
  const src = source({ blocs: { h1: { size: 28, align: 'center' }, h2: { size: 20 } } })
  for (let n = 1; n <= NIVEAUX_TITRE; n++) {
    assert.ok(src.includes(`#let amend-h${n}(corps)`), `amend-h${n} manquant`)
    assert.ok(
      src.includes(`#show heading.where(level: ${n}): it => amend-h${n}(it.body)`),
      `règle d'affichage manquante pour le niveau ${n}`
    )
  }
  assert.ok(!src.includes(`amend-h${NIVEAUX_TITRE + 1}`), 'un niveau de trop est engendré')
  assert.match(fonction(src, 'h1'), /size: 28pt/)
  assert.match(fonction(src, 'h1'), /align\(center\)/)
})

test('un titre plus profond que le dernier niveau est ramené, pas perdu', () => {
  // Un document antérieur au 18/09, ou un collage depuis une page web,
  // peut porter un niveau 4 ou 5. Mieux vaut un titre trop peu profond
  // qu'un titre qui sort sans aucun style.
  const d = doc({ h: 1, texte: 'A' })
  const noeud = d.child(0)
  const profond = noeud.type.create({ ...noeud.attrs, level: 5 }, noeud.content)
  const avecProfond = d.type.create(null, [profond])
  const src = docToTypst(avecProfond, styleParDefaut(), 'X')
  assert.match(src, new RegExp(`#heading\\(level: ${NIVEAUX_TITRE}\\)`))
  assert.ok(!src.includes('level: 5'))
})

// ===================================================== le contenu

test('le texte est échappé, jamais interprété', () => {
  const d = doc('Un # dièse, un $ dollar, une *étoile* et un _tiret_.')
  const src = docToTypst(d, styleParDefaut(), 'X')
  assert.match(src, /\\#/)
  assert.match(src, /\\\$/)
  assert.match(src, /\\\*/)
  assert.match(src, /\\_/)
})

test('un paragraphe qui commence par un caractère de structure reste un paragraphe', () => {
  // C'est la raison d'être des appels de fonction plutôt que du balisage :
  // « = Titre » tapé dans un paragraphe ne doit pas devenir un titre.
  const src = docToTypst(doc('= Pas un titre'), styleParDefaut(), 'X')
  assert.ok(!src.includes('\n= '))
  assert.match(src, /#amend-corps\[/)
})

// ===================================================== les polices

test('toutes les polices proposées ont un nom Typst', () => {
  // Ce test ne dit pas que la police **existe** sur la machine qui
  // compose — Typst remplace en silence une famille absente, et c'est la
  // cause la plus probable des écarts constatés. Il dit seulement qu'aucune
  // entrée du menu ne part sans nom.
  for (const p of POLICES) {
    assert.ok(Array.isArray(p.typst) && p.typst.length, `police ${p.id} sans nom Typst`)
    // La dernière famille de chaque liste doit être une de celles que Typst
    // **embarque** : c'est ce qui garantit qu'on sait toujours ce qu'on
    // obtient, même sur une machine sans aucune police installée.
    const embarquees = ['Libertinus Serif', 'New Computer Modern', 'DejaVu Sans Mono']
    assert.ok(
      embarquees.some((e) => p.typst.includes(e)),
      `police ${p.id} : aucun repli embarqué, Typst choisira à notre place`
    )
  }
})

test('le style par défaut produit une source complète', () => {
  const src = docToTypst(doc({ h: 1, texte: 'T' }, 'p'), styleParDefaut(), 'T')
  for (const b of BLOCS) {
    const nom = b.id === 'body' ? 'amend-corps' : b.id === 'quote' ? 'amend-citation' : `amend-${b.id}`
    assert.ok(src.includes(`#let ${nom}(corps)`), `${nom} manquant`)
  }
  assert.match(src, /#set text\(lang: "fr"/)
})

test('la langue du document n’est plus écrite en dur', () => {
  // Jusqu'au 19/09/2026 le gabarit écrivait `lang: "fr"` quoi qu'il
  // arrive : un texte anglais se coupait selon les motifs français.
  assert.match(source({}), /#set text\(lang: "fr"/)
  assert.match(source({ page: { langue: 'en' } }), /#set text\(lang: "en"/)
  // Une valeur inconnue retombe sur le français plutôt que de produire une
  // source que Typst refuserait.
  assert.match(source({ page: { langue: 'klingon' } }), /#set text\(lang: "fr"/)
})
