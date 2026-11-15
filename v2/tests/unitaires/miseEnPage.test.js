// Le modèle de mise en page d'un livre (domaine/miseEnPage.js) et le nom des
// fichiers exportés (domaine/document.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  grille,
  lignesQuiTiennent,
  margeBasPourLignes,
  gabaritTypst,
  chaineTypst,
  nomDeFichier,
  titreDocument,
} from '../../domaine/index.js'
import { REPRISE_MODELES } from '../../design/livre.js'

// « TàT - Poche » : un modèle complet, 120 × 180 mm, grille de 31 lignes de 12,4 pt.
const MODELE = structuredClone(REPRISE_MODELES.find((r) => r.id === 'tat-poche').valeurs)
const proche = (a, b) => Math.abs(a - b) < 1e-6

test('la grille : la marge basse donne 31 lignes de 12,4 pt, la marge de pied et la descente du folio en découlent', () => {
  const { pas, lignes, hauteurTexte, margeBas, descenteFolio } = grille(MODELE)
  assert.equal(pas, 12.4)
  assert.equal(lignes, 31, 'le nombre de lignes se déduit de la marge basse (26,7 mm)')
  // 30 pas, une boîte de ligne de 10,5 pt et la moitié du blanc entre deux lignes.
  assert.ok(proche(hauteurTexte, 30 * 12.4 + 10.5 + 0.95))
  assert.ok(proche(margeBas, 180 - 18 - (hauteurTexte * 25.4) / 72))
  assert.ok(proche(descenteFolio, margeBas - 18))
})

test('un modèle impossible est refusé avec un code', () => {
  const avec = (champ, valeur) => ({ ...MODELE, [champ]: { ...MODELE[champ], ...valeur } })
  for (const [modele, raison] of [
    [avec('grille', { interligne: 9 }), 'interligne'],
    [avec('marges', { bas: 170 }), 'lignes'],
    [avec('folio', { bas: 40 }), 'folio'],
  ])
    assert.throws(() => grille(modele), { code: 'modele-impossible', raison })
})

test('le gabarit : page, texte sur la grille, titres comptés en lignes', () => {
  const g = gabaritTypst(MODELE, { titre: 'Un « titre »', langue: 'fr' })
  assert.match(g, /^#set document\(title: "Un « titre »"\)\n/)
  assert.match(g, /width: 120mm, height: 180mm/)
  assert.match(g, /margin: \(top: 18mm, bottom: 26\.727mm, inside: 13mm, outside: 13mm\)/)
  assert.match(g, /footer-descent: 8\.727mm/)
  // Boîte de ligne de 1 em : le pas vaut exactement l'interligne.
  assert.match(g, /top-edge: 0\.8em, bottom-edge: -0\.2em, fill: cmyk\(0%, 0%, 0%, 100%\)/)
  assert.match(g, /leading: 12\.4pt - 1em, spacing: 12\.4pt - 1em, first-line-indent: \(amount: 4\.5mm, all: true\)/)
  assert.match(g, /lang: "fr"/)
  // Intertitre : une ligne blanche avant (2 pas moins une boîte), aucune après.
  assert.match(g, /above: 14\.3pt, below: 1\.9pt/)
  // Chapitre : belle page, bloc de 11 lignes, première ligne du titre à la 7e.
  assert.match(g, /pagebreak\(to: "odd", weak: true\)/)
  assert.match(g, /block\(height: 136\.4pt/)
  assert.match(g, /v\(72\.4pt\)/)
  assert.match(g, /weight: "bold"/)
})

test('sans belle page ni langue', () => {
  const g = gabaritTypst({ ...MODELE, chapitre: { ...MODELE.chapitre, debut: 'page' } })
  assert.doesNotMatch(g, /#set document/)
  assert.doesNotMatch(g, /lang:/)
  assert.doesNotMatch(g, /to: "odd"/)
  assert.match(g, /pagebreak\(weak: true\)/)
})

test('les chaînes Typst sont échappées', () => {
  assert.equal(chaineTypst('a "b" \\ c\nd\te\r\nf'), '"a \\"b\\" \\\\ c\\nd\\te\\nf"')
  assert.equal(chaineTypst(undefined), '""')
})

test('le nom du fichier exporté', () => {
  assert.equal(nomDeFichier('Petit conte : « immoral » ?', 'pdf'), 'Petit conte « immoral ».pdf')
  assert.equal(nomDeFichier('a/b\\c\u0007d', 'md'), 'a b c d.md')
  assert.equal(nomDeFichier('  ', 'md'), 'document.md')
  assert.equal(nomDeFichier(null, 'pdf'), 'document.pdf')
  assert.equal(nomDeFichier('été', 'md'), 'été.md')
})

test('nom de fichier : 120 signes comptés en points de code, jamais un emoji coupé en deux (audit du 10/11/2026)', () => {
  const nom = nomDeFichier('😀'.repeat(130), 'pdf')
  assert.equal([...nom.replace(/\.pdf$/, '')].length, 120)
  assert.ok(
    !/[\uD800-\uDFFF](?![\uDC00-\uDFFF])/.test(nom.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')),
    'aucune demi-paire',
  )
})

test('titre : les espaces insécables restent, les blancs ordinaires sont resserrés (audit du 10/11/2026)', () => {
  assert.equal(titreDocument('  Le\u00A0titre\u202F:   une\t\nsuite ').titre, 'Le\u00A0titre\u202F: une suite')
  assert.equal(titreDocument('   ').titre, null)
})

// --- Modèles : copies complètes dont on règle les valeurs (ADR 0011, 13/11/2026) ---
import {
  appliquerReglages,
  verifierModele,
  completerModele,
  famillesDuModele,
  modeleRetenu,
  peutChoisirModele,
  peutGererModeles,
  capacites,
} from '../../domaine/index.js'

const REGLES = {
  reglables: [
    { cle: 'page.largeur', type: 'nombre', min: 80, max: 450 },
    { cle: 'marges.bas', type: 'nombre', min: 0, max: 175 },
    { cle: 'marges.interieure', type: 'nombre', min: 0, max: 100 },
    { cle: 'cesure', type: 'booleen' },
    { cle: 'styles.texte.police', type: 'police' },
    { cle: 'styles.titre1.corps', type: 'nombre', min: 5, max: 96 },
    { cle: 'styles.titre1.capitales', type: 'booleen' },
    { cle: 'styles.titre2.lignesAvant', type: 'entier', min: 0, max: 10 },
  ],
  polices: [
    { famille: 'EB Garamond', fichiers: ['eb.ttf'] },
    { famille: 'Autre', fichiers: ['a.ttf', 'b.ttf'] },
  ],
  largeurUtileMin: 40,
}

test('réglages : ils s’appliquent à une copie, qui ne bouge pas, style par style', () => {
  const r = appliquerReglages(
    MODELE,
    {
      'page.largeur': 135,
      cesure: false,
      'styles.titre1.corps': 20,
      'styles.titre1.capitales': true,
      'styles.texte.police': 'Autre',
    },
    REGLES,
  )
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(r.modele.page.largeur, 135)
  assert.equal(r.modele.page.hauteur, 180, 'le reste est conservé')
  assert.equal(r.modele.cesure, false)
  assert.equal(r.modele.styles.titre1.corps, 20)
  assert.equal(r.modele.styles.titre1.capitales, true)
  assert.equal(r.modele.styles.titre2.corps, MODELE.styles.titre2.corps, 'les autres styles ne bougent pas')
  assert.equal(r.modele.styles.texte.police, 'Autre')
  assert.equal(MODELE.page.largeur, 120)
  assert.notEqual(MODELE.styles.titre1.corps, 20)
  assert.ok(famillesDuModele(r.modele).includes('Autre'))
})

test('réglages : inconnu, hors bornes, de mauvais type, ou modèle impossible : refusés avec un code', () => {
  const code = (reglages) => {
    const r = appliquerReglages(MODELE, reglages, REGLES)
    return r.ok ? 'ok' : [r.code, r.reglage ?? r.raison]
  }
  assert.deepEqual(code({ 'folio.bas': 10 }), ['reglage-inconnu', 'folio.bas'])
  assert.deepEqual(code({ __proto__: null, 'page.largeur': 79 }), ['reglage-hors-bornes', 'page.largeur'])
  assert.deepEqual(code({ 'page.largeur': 79 }), ['reglage-hors-bornes', 'page.largeur'])
  assert.deepEqual(code({ 'page.largeur': '135' }), ['reglage-hors-bornes', 'page.largeur'])
  assert.deepEqual(code({ 'page.largeur': Number.NaN }), ['reglage-hors-bornes', 'page.largeur'])
  assert.deepEqual(code({ 'marges.bas': -1 }), ['reglage-hors-bornes', 'marges.bas'])
  assert.deepEqual(code({ 'marges.bas': 176 }), ['reglage-hors-bornes', 'marges.bas'])
  assert.deepEqual(code({ 'styles.texte.police': 'Comic Sans' }), ['reglage-hors-bornes', 'styles.texte.police'])
  assert.deepEqual(code({ 'styles.titre1.capitales': 'oui' }), ['reglage-hors-bornes', 'styles.titre1.capitales'])
  assert.deepEqual(code({ 'styles.titre2.lignesAvant': 11 }), ['reglage-hors-bornes', 'styles.titre2.lignesAvant'])
  assert.deepEqual(code({ 'marges.bas': 170 }), ['modele-impossible', 'lignes'])
  assert.deepEqual(code({ 'page.largeur': 80, 'marges.interieure': 30 }), ['modele-impossible', 'largeur'])
  for (const pas of [null, [], 'x', 3]) assert.equal(appliquerReglages(MODELE, pas, REGLES).code, 'reglages-invalides')
})

test('un modèle complet se vérifie ; un modèle enregistré plus tôt est complété par le défaut', () => {
  assert.equal(verifierModele(MODELE, REGLES).ok, true)
  const cassé = structuredClone(MODELE)
  cassé.styles.titre1.corps = 500
  assert.equal(verifierModele(cassé, REGLES).ok, false)
  const partiel = { page: { largeur: 100, hauteur: 150 } }
  const c = completerModele(partiel, MODELE)
  assert.equal(c.page.largeur, 100)
  assert.equal(c.marges.bas, MODELE.marges.bas)
  assert.deepEqual(c.styles, MODELE.styles)
})

test('modèle retenu : celui du document s’il est permis, sinon le défaut de l’équipe, sinon le premier d’amend.ink', () => {
  const permis = ['tat-poche', 'autre-maison', 'm-equipe']
  assert.equal(modeleRetenu({ choisi: 'm-equipe', defautEquipe: 'autre-maison', permis }), 'm-equipe')
  assert.equal(modeleRetenu({ choisi: 'supprime', defautEquipe: 'autre-maison', permis }), 'autre-maison')
  assert.equal(modeleRetenu({ choisi: null, defautEquipe: 'supprime', permis }), 'tat-poche')
  assert.equal(modeleRetenu({ permis }), 'tat-poche')
})

test('droits des modèles : le gestionnaire gère ceux de l’équipe ; qui écrit choisit celui du document', () => {
  assert.equal(peutGererModeles(capacites('proprietaire')), true)
  assert.equal(peutGererModeles(capacites('editeur')), false)
  assert.equal(peutChoisirModele(capacites('editeur')), true)
  assert.equal(peutChoisirModele(capacites('correcteur')), false)
})

test('un titre refuse les invisibles et les marques de sens d’écriture, mais garde les insécables', () => {
  for (const c of ['\u200B', '\u200E', '\u202E', '\u2066', '\u00AD', '\u0000'])
    assert.deepEqual(
      titreDocument(`Le${c}titre`),
      { ok: false, code: 'titre-invalide' },
      `U+${c.codePointAt(0).toString(16)}`,
    )
  assert.equal(titreDocument('Le\u00A0titre\u202F!').ok, true)
})

test('la grille refuse une valeur non numérique avec le code modele-impossible', () => {
  const avec = (chemin, valeur) => {
    const m = structuredClone(MODELE)
    const [a, b] = chemin.split('.')
    m[a][b] = valeur
    return m
  }
  for (const chemin of ['page.hauteur', 'marges.haut', 'folio.bas', 'grille.corps', 'grille.interligne', 'marges.bas'])
    for (const valeur of [NaN, '12', undefined])
      assert.throws(() => grille(avec(chemin, valeur)), { code: 'modele-impossible' }, `${chemin} = ${String(valeur)}`)
})

test('mise en page (12/11/2026) : en-têtes, numéro de page, début de chapitre, séparateur, césure, auteur', () => {
  const g = gabaritTypst(
    {
      ...MODELE,
      folio: { bas: 18, position: 'haut-exterieur', depart: 3, ouverture: false },
      enTete: { gauche: 'titreDocument', droite: 'chapitre' },
      chapitre: { ...MODELE.chapitre, debut: 'continuer' },
      separateur: 'asterisme',
      cesure: false,
    },
    { titre: 'Le livre', auteur: 'Paule' },
  )
  assert.match(g, /#set document\(title: "Le livre", author: "Paule"\)/)
  assert.match(g, /footer: none/)
  assert.match(g, /header: context \{.*place\(if calc\.odd\(p\) \{ right \} else \{ left \}, counter\(page\)/)
  assert.match(
    g,
    /if not ouverture \{ let c = if calc\.odd\(p\) \{ \{ show linebreak: \[ \]; show parbreak: \[ \]; show regex/,
  )
  assert.match(g, /let hs = query\(heading\.where\(level: 1, outlined: true\)\.before\(here\(\)\)\)/)
  assert.match(g, /\[#"Le livre"\]/)
  assert.match(g, /hyphenate: false/)
  assert.match(g, /#let amend-separateur = align\(center, par\(.*"⁂"/)
  assert.match(g, /#counter\(page\)\.update\(3\)/)
  assert.doesNotMatch(g, /pagebreak/, 'le chapitre continue sur la page')
  // Par défaut : folio centré en bas, chapitre en belle page, séparateur blanc.
  const d = gabaritTypst(MODELE)
  assert.match(d, /align\(center \+ top/)
  assert.match(d, /header: none/)
  assert.match(d, /pagebreak\(to: "odd"/)
  assert.match(d, /#let amend-separateur = v\(12\.4pt\)/)
  assert.doesNotMatch(d, /counter\(page\)\.update/)
  assert.match(gabaritTypst({ ...MODELE, chapitre: { ...MODELE.chapitre, debut: 'page' } }), /pagebreak\(weak: true\)/)
})

test('un chapitre dont le texte reprendrait avant son titre, ou hors de la page, est impossible', () => {
  for (const chapitre of [
    { ...MODELE.chapitre, ligneTexte: MODELE.chapitre.ligneTitre },
    { ...MODELE.chapitre, ligneTexte: 40 },
    { ...MODELE.chapitre, ligneTitre: 0 },
  ])
    assert.throws(() => grille({ ...MODELE, chapitre }), { code: 'modele-impossible', raison: 'chapitre' })
})

test('réglage à choix : seules ses options passent', () => {
  const regles = {
    reglables: [{ cle: 'separateur', type: 'choix', options: ['blanc', 'asterisme'] }],
    polices: [],
  }
  assert.equal(appliquerReglages(MODELE, { separateur: 'asterisme' }, regles).ok, true)
  assert.equal(appliquerReglages(MODELE, { separateur: 'licorne' }, regles).code, 'reglage-hors-bornes')
})

test('modèle retenu : document, équipe, instance, puis le premier permis', () => {
  const permis = ['a4', 'i1', 'e1']
  assert.equal(modeleRetenu({ choisi: 'e1', defautEquipe: 'i1', defautInstance: 'i1', permis }), 'e1')
  assert.equal(modeleRetenu({ choisi: null, defautEquipe: 'e1', defautInstance: 'i1', permis }), 'e1')
  assert.equal(modeleRetenu({ choisi: 'parti', defautEquipe: null, defautInstance: 'i1', permis }), 'i1')
  assert.equal(modeleRetenu({ permis }), 'a4')
})

test('marge basse (Sylvain, 15/11/2026) : le nombre de lignes s’en déduit, et la marge obtenue est celle de n lignes entières', () => {
  const base = { page: { hauteur: 180 }, marges: { haut: 18, bas: 26.7 }, grille: { corps: 10.5, interligne: 12.4 } }
  assert.equal(lignesQuiTiennent(base), 31)
  // Un peu plus de marge fait perdre une ligne, un peu moins la laisse (le reste est de moins d'une ligne).
  assert.equal(lignesQuiTiennent({ ...base, marges: { haut: 18, bas: 26.7 + 4.4 } }), 30)
  assert.equal(lignesQuiTiennent({ ...base, marges: { haut: 18, bas: 26.7 - 0.1 } }), 31)
  // L'aller-retour : la marge qui laisse n lignes redonne n lignes.
  for (const n of [1, 10, 31, 50]) {
    const bas = margeBasPourLignes(base, n)
    assert.equal(lignesQuiTiennent({ ...base, marges: { haut: 18, bas } }), n, `${n} lignes`)
  }
})

test('un modèle enregistré en lignes par page (avant le 15/11/2026) reçoit la marge basse qui laisse ces lignes', () => {
  const ancien = { page: { largeur: 120, hauteur: 180 }, grille: { corps: 10.5, interligne: 12.4, lignes: 31 } }
  const c = completerModele(ancien, MODELE)
  assert.equal(c.marges.bas, 26.7)
  assert.equal(c.grille.lignes, undefined, 'plus de grille.lignes')
  assert.equal(grille(c).lignes, 31)
  // Un modèle qui a déjà sa marge basse ne bouge pas.
  assert.equal(completerModele({ marges: { bas: 20 } }, MODELE).marges.bas, 20)
  // Les deux à la fois : la marge basse fait foi, `grille.lignes` ne reste pas.
  const double = completerModele({ marges: { bas: 20 }, grille: { corps: 10.5, interligne: 12.4, lignes: 31 } }, MODELE)
  assert.equal(double.marges.bas, 20)
  assert.equal(double.grille.lignes, undefined)
})

test('premier paragraphe du chapitre : sans retrait par défaut, avec retrait au choix du modèle (Sylvain, 15/11/2026)', () => {
  assert.match(gabaritTypst(MODELE), /#let amend-sans-alinea\(corps\) = par\(first-line-indent: 0pt, corps\)/)
  const avec = gabaritTypst({ ...MODELE, chapitre: { ...MODELE.chapitre, premierSansAlinea: false } })
  assert.match(avec, /#let amend-sans-alinea\(corps\) = corps\n/)
})

test('police d’un style : vide, c’est celle du texte courant (sauf pour le texte lui-même) (Sylvain, 15/11/2026)', () => {
  const polices = [{ famille: 'EB Garamond', fichiers: ['eb.ttf'] }]
  const regles = {
    reglables: [
      { cle: 'styles.texte.police', type: 'police' },
      { cle: 'styles.titre2.police', type: 'police', herite: true },
    ],
    polices,
  }
  assert.equal(appliquerReglages(MODELE, { 'styles.titre2.police': '' }, regles).ok, true)
  const refus = appliquerReglages(MODELE, { 'styles.texte.police': '' }, regles)
  assert.equal(refus.ok, false, 'le texte courant a toujours une police')
  const m = appliquerReglages(MODELE, { 'styles.titre2.police': '' }, regles).modele
  const g = gabaritTypst(m)
  const police = MODELE.styles.texte.police
  assert.ok(g.includes(`font: ("${police}",)`))
  assert.doesNotMatch(g, /font: \(""/)
})
