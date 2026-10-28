// Le profil CSS d'un modèle (28/10/2026, shared/profilCss.js) : une feuille
// de style interne s'écrit en CSS d'impression et se relit à l'identique ;
// une pile de polices se résout contre le catalogue de l'instance ; et rien
// qui ne soit dans la liste fermée ne traverse (url(), @import, @font-face,
// sélecteurs ou propriétés inconnus).

import test from 'node:test'
import assert from 'node:assert/strict'
import { ecrireProfil, lireProfil, PROFIL_MAX, VERSION_PROFIL } from '../../shared/profilCss.js'
import { assainir, fusionner, reduire, appliquerCatalogue, dimensionsPage } from '../../shared/style.js'
import { MODELES_LIVRES } from '../../shared/modeles.js'

/** Écrire puis relire, et comparer à ce que `Modeles` stocke : l'écart réduit. */
const allerRetour = (style) => reduire(assainir(lireProfil(ecrireProfil(style)).style))
const reduit = (style) => reduire(assainir(style))

const STYLES = {
  'valeurs du code': {},
  'texte brut livré': MODELES_LIVRES[0].style,
  'A5 paysage, marges, numéros': {
    page: {
      size: 'A5',
      orientation: 'paysage',
      marginTop: 18.5,
      marginLeft: 22,
      langue: 'en',
      pageNumbers: { enabled: true, startAt: 7 },
    },
  },
  'format libre': { page: { size: 'personnalise', largeur: 120, hauteur: 190.5 } },
  Letter: { page: { size: 'Letter' } },
  'en-têtes de toutes sortes': {
    page: {
      entete: {
        gauche: { type: 'texte', texte: 'Le « livre » \\ "cité" ; { } /* x */ — é' },
        droite: { type: 'titre', texte: '' },
        sautOuverture: false,
      },
      debutChapitre: 'droite',
      titresSolidaires: false,
      imagesPleinePage: true,
    },
  },
  'en-tête titre du document': { page: { entete: { gauche: { type: 'titreDocument', texte: '' } } } },
  'mise en page de livre': {
    page: {
      size: 'personnalise',
      largeur: 140,
      hauteur: 210,
      marginLeft: 25,
      marginRight: 15,
      margesMiroir: true,
      cesure: false,
      veuvesOrphelines: false,
      premierSansRetrait: true,
      debutChapitre: 'page',
      descente: 32.5,
      notesReduction: 3.5,
      notesInterligne: 1.15,
      separateur: 'asterisme',
      pageNumbers: { enabled: true, startAt: 1, position: 'haut-exterieur', sautOuverture: true },
    },
    blocs: { caption: { size: 8, italic: false, align: 'left' } },
  },
  'deux colonnes': { page: { colonnes: 2, gouttiere: 9 } },
  'chapitre en nouvelle page à droite': { page: { debutChapitre: 'droite', separateur: 'blanc' } },
  'blocs réglés': {
    blocs: {
      body: { font: 'serif', size: 10.5, align: 'justify', firstLineIndent: 5, spaceAfter: 0, lineHeight: 1.5 },
      quote: { italic: true, indent: 15 },
      h1: { font: 'roboto', size: 28, uppercase: true, align: 'center', bold: false, spaceBefore: 40 },
      title: { font: 'times', size: 36, align: 'center' },
      subtitle: { italic: true, spaceAfter: 20 },
    },
  },
}

for (const [nom, style] of Object.entries(STYLES)) {
  test(`aller-retour CSS : ${nom}`, () => {
    assert.deepEqual(allerRetour(style), reduit(style))
  })
}

test('la feuille écrite est complète, déterministe et porte sa version', () => {
  const css = ecrireProfil({})
  assert.equal(css, ecrireProfil({}))
  assert.match(css, new RegExp(`--amend-profil: ${VERSION_PROFIL};`))
  assert.match(css, /@page \{\n {2}size: A4;/)
  assert.match(css, /\np \{\n {2}font-family: "DejaVu Sans", sans-serif;/)
  assert.match(css, /p\.style-titre \{/)
  assert.match(css, /p\.style-sous-titre \{/)
  // Une feuille aux valeurs du code ne s'écarte de rien.
  assert.deepEqual(lireProfil(css).avertissements, [])
  assert.deepEqual(allerRetour({}), { version: 2 })
})

test('un format libre garde ses deux côtés ; deux longueurs d’un format nommé en reprennent le nom', () => {
  const libre = lireProfil('@page { size: 120mm 190mm }').style.page
  assert.deepEqual([libre.size, libre.largeur, libre.hauteur], ['personnalise', 120, 190])
  assert.deepEqual(dimensionsPage(assainir({ page: libre }).page), [120, 190])
  const a4 = lireProfil('@page { size: 210mm 297mm }').style.page
  assert.equal(a4.size, 'A4')
  assert.equal(a4.orientation, 'portrait')
  const a4p = lireProfil('@page { size: 297mm 210mm }').style.page
  assert.equal(a4p.size, 'A4')
  assert.equal(a4p.orientation, 'paysage')
  assert.equal(lireProfil('@page { size: A5 landscape }').style.page.orientation, 'paysage')
  assert.equal(lireProfil('@page { size: letter }').style.page.size, 'Letter')
})

test('les marges se lisent en 1 à 4 valeurs et en toutes unités de longueur', () => {
  assert.deepEqual(lireProfil('@page { margin: 2cm }').style.page, {
    marginTop: 20,
    marginRight: 20,
    marginBottom: 20,
    marginLeft: 20,
  })
  const p = lireProfil('@page { margin: 20mm 15mm 25mm }').style.page
  assert.deepEqual([p.marginTop, p.marginRight, p.marginBottom, p.marginLeft], [20, 15, 25, 15])
  const q = lireProfil('@page { margin-left: 0.5in }').style.page
  assert.equal(q.marginLeft, 12.7)
})

test('les unités des blocs sont converties en points et en millimètres', () => {
  const { blocs } = lireProfil('p { font-size: 4mm; margin-top: 1cm; text-indent: 0.5cm; margin-left: 12pt }').style
  assert.equal(blocs.body.size, 11.3)
  assert.equal(blocs.body.spaceBefore, 28.3)
  assert.equal(blocs.body.firstLineIndent, 5)
  assert.equal(blocs.body.indent, 4.2)
})

test('une pile de polices se résout contre le catalogue : la première famille connue gagne', () => {
  const connue = lireProfil('p { font-family: "Libertinus Serif", serif }')
  assert.equal(connue.style.blocs.body.font, 'serif')
  assert.deepEqual(connue.avertissements, [])

  const arial = lireProfil('p { font-family: Arial, Helvetica, sans-serif }')
  assert.equal(arial.style.blocs.body.font, 'arial')
  assert.deepEqual(arial.avertissements, [])

  // La première est absente : la suivante est utilisée, et on le dit.
  const suivante = lireProfil('p { font-family: "Garamond Premier", "Libertinus Serif", serif }')
  assert.equal(suivante.style.blocs.body.font, 'serif')
  assert.match(suivante.avertissements[0], /Garamond Premier/)

  // Aucune n'est connue : le générique donne le repli, avec avertissement.
  const repli = lireProfil('p { font-family: "Garamond Premier", serif }')
  assert.equal(repli.style.blocs.body.font, 'serif')
  assert.match(repli.avertissements[0], /Garamond Premier.*repli/)

  // Ni famille ni générique : le bloc garde sa police.
  const rien = lireProfil('p { font-family: "Garamond Premier" }')
  assert.equal(rien.style.blocs, undefined)
  assert.match(rien.avertissements[0], /Garamond Premier/)
})

test('une police du catalogue de l’instance s’écrit par sa famille et se relit par elle', (t) => {
  t.after(() => appliquerCatalogue([]))
  appliquerCatalogue([{ id: 'i-garamond', label: 'Garamond Premier', famille: 'Garamond Premier', generique: 'serif' }])
  const css = ecrireProfil({ blocs: { body: { font: 'i-garamond' } } })
  assert.match(css, /\np \{\n {2}font-family: "Garamond Premier", serif;/)
  assert.equal(lireProfil(css).style.blocs.body.font, 'i-garamond')
  assert.deepEqual(allerRetour({ blocs: { body: { font: 'i-garamond' } } }), {
    version: 2,
    blocs: { body: { font: 'i-garamond' } },
  })

  // La police quitte le catalogue : le CSS la nomme encore, la relecture replie et avertit.
  appliquerCatalogue([])
  const apres = lireProfil(css)
  assert.equal(apres.style.blocs.body.font, 'serif')
  assert.match(apres.avertissements.join(' '), /Garamond Premier/)
})

test('le profil est fermé : url(), @import, @font-face, sélecteurs et propriétés inconnus sont ignorés et signalés', () => {
  const hostile = `
    @import url("https://exemple.test/x.css");
    @font-face { font-family: X; src: url(https://exemple.test/x.ttf) }
    body { background: url(javascript:alert(1)) }
    script, .x { color: red }
    p { font-family: url(x.ttf); behavior: url(x.htc); color: red; font-size: 12pt }
    @media print { p { font-size: 99pt } }
    h2 { break-before: recto }
    :root { --perso: 1; --amend-inconnue: 2 }
  `
  const { style, avertissements } = lireProfil(hostile)
  assert.deepEqual(style.blocs, { body: { size: 12 } })
  assert.ok(avertissements.length >= 8, avertissements.join('\n'))
  assert.match(avertissements.join('\n'), /@import/)
  assert.match(avertissements.join('\n'), /@font-face/)
  // Ce qu'on réécrit vient des valeurs reconnues, pas du texte reçu.
  const css = ecrireProfil(style)
  for (const interdit of ['url(', '@import', '@font-face', 'javascript', 'behavior', 'script', 'color: red']) {
    assert.ok(!css.includes(interdit), `« ${interdit} » ne doit pas ressortir`)
  }
})

test('un en-tête texte ne peut pas sortir de sa chaîne', () => {
  const texte = 'a"; } @import url(x); p { font-size: 99pt } /*'
  const css = ecrireProfil({ page: { entete: { gauche: { type: 'texte', texte } } } })
  const relu = lireProfil(css)
  assert.equal(relu.style.page.entete.gauche.texte, texte)
  assert.deepEqual(relu.avertissements, [])
  assert.equal(relu.style.blocs.body.size, 11)
})

test('les colonnes : 1, 2 ou 3 et une gouttière, lues et réécrites', () => {
  const r = lireProfil(':root { --amend-colonnes: 2; --amend-gouttiere: 8mm }')
  assert.deepEqual(r.avertissements, [])
  assert.deepEqual(r.style, { version: 2, page: { colonnes: 2, gouttiere: 8 } })
  const css = ecrireProfil({ page: { colonnes: 3, gouttiere: 5.5 } })
  assert.match(css, /--amend-colonnes: 3;/)
  assert.match(css, /--amend-gouttiere: 5\.5mm;/)
  assert.match(ecrireProfil({}), /--amend-colonnes: 1;/)
  const mauvais = lireProfil(':root { --amend-colonnes: 4; --amend-gouttiere: large }')
  assert.equal(mauvais.avertissements.length, 2)
  assert.equal(mauvais.style.page, undefined)
  // Au-delà des listes fermées, l'assainissement ramène aux valeurs par défaut.
  const sain = assainir({ page: { colonnes: 7, gouttiere: 500 } }).page
  assert.deepEqual([sain.colonnes, sain.gouttiere], [1, 30])
})

test('valeurs invalides : signalées, ignorées', () => {
  const { style, avertissements } = lireProfil(
    'p { text-align: start; line-height: 1.3; font-weight: heavy; font-size: big } @page { size: nimportequoi; margin: -3mm }'
  )
  assert.equal(style.blocs, undefined)
  assert.equal(style.page, undefined)
  assert.ok(avertissements.length >= 5, avertissements.join('\n'))
})

test('un profil trop gros ou trop imbriqué est refusé', () => {
  assert.throws(() => lireProfil('a'.repeat(PROFIL_MAX + 1)), /volumineux/)
  assert.throws(() => lireProfil('{'.repeat(50)), /imbriqué/)
  assert.throws(() => lireProfil(null), /invalide/)
})

test('un profil d’une version plus récente est lu et signalé', () => {
  const r = lireProfil(`:root { --amend-profil: ${VERSION_PROFIL + 1} } p { font-size: 12pt }`)
  assert.equal(r.style.blocs.body.size, 12)
  assert.match(r.avertissements[0], /plus récente/)
})

test('un CSS déchiré (accolades ou guillemets manquants) ne lève pas', () => {
  for (const css of [
    'p { font-size: 12pt',
    'p { font-family: "Libertinus',
    '}}} p { font-size: 12pt }',
    '/* jamais fermé',
    '',
  ]) {
    assert.doesNotThrow(() => lireProfil(css))
  }
  assert.equal(lireProfil('}}} p { font-size: 12pt }').style.blocs.body.size, 12)
})

test('fusionner accepte le calque lu tel quel', () => {
  const { style } = lireProfil('p { font-size: 13pt } h1 { text-align: center }')
  const complet = fusionner(style)
  assert.equal(complet.blocs.body.size, 13)
  assert.equal(complet.blocs.h1.align, 'center')
  assert.equal(complet.blocs.h2.align, 'left')
})

test('les réglages de livre : variables --amend-*, et chaque valeur inconnue est signalée', () => {
  const css = ecrireProfil({
    page: { margesMiroir: true, descente: 30, separateur: 'asterisques', debutChapitre: 'droite' },
  })
  assert.match(css, /--amend-marges-miroir: oui;/)
  assert.match(css, /--amend-descente: 30mm;/)
  assert.match(css, /--amend-separateur: asterisques;/)
  assert.match(css, /--amend-numero-position: bas-centre;/)
  assert.match(css, /h1 \{[^}]*break-before: recto;/)
  assert.match(ecrireProfil({ page: { debutChapitre: 'page' } }), /h1 \{[^}]*break-before: page;/)
  assert.match(ecrireProfil({}), /h1 \{[^}]*break-before: auto;/)
  const { style, avertissements } = lireProfil(`:root {
    --amend-separateur: confettis; --amend-numero-position: au-milieu; --amend-descente: beaucoup;
    --amend-notes-interligne: 7; --amend-cesure: peut-être; --amend-notes-reduction: 3pt
  }`)
  assert.equal(avertissements.length, 5, avertissements.join('\n'))
  assert.deepEqual(style.page, { notesReduction: 3 })
  // Même une valeur qui passerait la lecture ne sort pas du schéma à l'assainissement.
  const sain = assainir({ page: { descente: 9999, notesReduction: -4, separateur: 'x', debutChapitre: 'ailleurs' } })
  assert.equal(sain.page.descente, 120)
  assert.equal(sain.page.notesReduction, 0)
  assert.equal(sain.page.separateur, 'trait')
  assert.equal(sain.page.debutChapitre, 'continuer')
})

test('« break-before » : page, recto et auto se lisent', () => {
  const lire = (v) => lireProfil(`h1 { break-before: ${v} }`).style.page.debutChapitre
  assert.equal(lire('recto'), 'droite')
  assert.equal(lire('right'), 'droite')
  assert.equal(lire('page'), 'page')
  assert.equal(lire('auto'), 'continuer')
})
