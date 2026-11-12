// Le modèle de mise en page d'un livre (domaine/miseEnPage.js) et le nom des
// fichiers exportés (domaine/document.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { grille, gabaritTypst, chaineTypst, nomDeFichier, titreDocument, resoudreModele } from '../../domaine/index.js'

const MODELE = {
  page: { largeur: 120, hauteur: 180 },
  marges: { haut: 18, interieure: 13, exterieure: 13 },
  grille: { corps: 10.5, interligne: 12.4, lignes: 31 },
  police: 'EB Garamond',
  alinea: 4.5,
  folio: { bas: 18 },
  chapitre: { bellePage: true, ligneTitre: 7, ligneTexte: 12, corps: 13, interligne: 14, graisse: 600 },
  intertitres: { italique: true, lignesAvant: 1, lignesApres: 0 },
  citation: { retrait: 5 },
}
const proche = (a, b) => Math.abs(a - b) < 1e-6

test('la grille : 31 lignes de 12,4 pt, la marge de pied et la descente du folio en découlent', () => {
  const { pas, hauteurTexte, margeBas, descenteFolio } = grille(MODELE)
  assert.equal(pas, 12.4)
  // 30 pas, une boîte de ligne de 10,5 pt et la moitié du blanc entre deux lignes.
  assert.ok(proche(hauteurTexte, 30 * 12.4 + 10.5 + 0.95))
  assert.ok(proche(margeBas, 180 - 18 - (hauteurTexte * 25.4) / 72))
  assert.ok(proche(descenteFolio, margeBas - 18))
})

test('un modèle impossible est refusé avec un code', () => {
  const avec = (champ, valeur) => ({ ...MODELE, [champ]: { ...MODELE[champ], ...valeur } })
  for (const [modele, raison] of [
    [avec('grille', { interligne: 9 }), 'interligne'],
    [avec('grille', { lignes: 45 }), 'lignes'],
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
  assert.match(g, /block\(above: 14\.3pt, below: 1\.9pt/)
  // Chapitre : belle page, bloc de 11 lignes, première ligne du titre à la 7e.
  assert.match(g, /pagebreak\(to: "odd", weak: true\)/)
  assert.match(g, /block\(height: 136\.4pt/)
  assert.match(g, /v\(72\.4pt\)/)
  assert.match(g, /weight: 600/)
})

test('sans belle page ni langue', () => {
  const g = gabaritTypst({ ...MODELE, chapitre: { ...MODELE.chapitre, bellePage: false } })
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

// --- Modèles d'équipe : une base et des écarts bornés (ADR 0011) ---
import { appliquerEcarts, modeleRetenu, peutChoisirModele, peutGererModeles, capacites } from '../../domaine/index.js'

const REGLES = {
  reglables: [
    { cle: 'page.largeur', type: 'nombre', min: 80, max: 450 },
    { cle: 'grille.corps', type: 'nombre', min: 5, max: 96 },
    { cle: 'grille.lignes', type: 'entier', min: 1 },
    { cle: 'marges.interieure', type: 'nombre', min: 0, max: 100 },
    { cle: 'police', type: 'police' },
    { cle: 'chapitre.bellePage', type: 'booleen' },
  ],
  polices: [
    { famille: 'EB Garamond', fichiers: ['eb.ttf'] },
    { famille: 'Autre', fichiers: ['a.ttf', 'b.ttf'] },
  ],
  largeurUtileMin: 40,
}
const BASE = { ...MODELE, polices: ['eb.ttf'] }

test('modèle d’équipe : les écarts s’appliquent à une copie de la base, qui ne bouge pas', () => {
  const r = appliquerEcarts(BASE, { 'page.largeur': 135, 'chapitre.bellePage': false, police: 'Autre' }, REGLES)
  assert.equal(r.ok, true)
  assert.equal(r.modele.page.largeur, 135)
  assert.equal(r.modele.page.hauteur, 180, 'le reste vient de la base')
  assert.equal(r.modele.chapitre.bellePage, false)
  assert.equal(r.modele.chapitre.ligneTitre, 7)
  assert.equal(r.modele.police, 'Autre')
  assert.deepEqual(r.modele.polices, ['a.ttf', 'b.ttf'], 'les fichiers de la police viennent du catalogue')
  assert.equal(BASE.page.largeur, 120)
  assert.equal(BASE.chapitre.bellePage, true)
})

test('modèle d’équipe : un écart égal à la base n’est pas gardé (la base reste maîtresse)', () => {
  const r = appliquerEcarts(BASE, { 'page.largeur': 120, 'grille.corps': 11 }, REGLES)
  assert.deepEqual(r.ecarts, { 'grille.corps': 11 })
  assert.deepEqual(appliquerEcarts(BASE, {}, REGLES).ecarts, {})
})

test('modèle d’équipe : réglage inconnu, hors bornes, de mauvais type, ou modèle impossible : refusés avec un code', () => {
  const code = (ecarts) => {
    const r = appliquerEcarts(BASE, ecarts, REGLES)
    return r.ok ? 'ok' : [r.code, r.reglage ?? r.raison]
  }
  assert.deepEqual(code({ 'folio.bas': 10 }), ['reglage-inconnu', 'folio.bas'])
  assert.deepEqual(code({ __proto__: null, 'page.largeur': 79 }), ['reglage-hors-bornes', 'page.largeur'])
  assert.deepEqual(code({ 'page.largeur': '135' }), ['reglage-hors-bornes', 'page.largeur'])
  assert.deepEqual(code({ 'page.largeur': Number.NaN }), ['reglage-hors-bornes', 'page.largeur'])
  assert.deepEqual(code({ 'grille.lignes': 30.5 }), ['reglage-hors-bornes', 'grille.lignes'])
  assert.deepEqual(code({ 'grille.lignes': 0 }), ['reglage-hors-bornes', 'grille.lignes'])
  assert.deepEqual(code({ police: 'Comic Sans' }), ['reglage-hors-bornes', 'police'])
  assert.deepEqual(code({ 'chapitre.bellePage': 'non' }), ['reglage-hors-bornes', 'chapitre.bellePage'])
  assert.deepEqual(code({ 'grille.lignes': 45 }), ['modele-impossible', 'lignes'])
  assert.deepEqual(code({ 'page.largeur': 80, 'marges.interieure': 30 }), ['modele-impossible', 'largeur'])
  for (const pas of [null, [], 'x', 3]) assert.equal(appliquerEcarts(BASE, pas, REGLES).code, 'ecarts-invalides')
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
  for (const chemin of [
    'page.hauteur',
    'marges.haut',
    'folio.bas',
    'grille.corps',
    'grille.interligne',
    'grille.lignes',
  ])
    for (const valeur of [NaN, '12', undefined])
      assert.throws(() => grille(avec(chemin, valeur)), { code: 'modele-impossible' }, `${chemin} = ${String(valeur)}`)
})

test('mise en page (12/11/2026) : titre courant, folio, début de chapitre, séparateur, césure, auteur', () => {
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
  assert.match(g, /if not ouverture \{ let c = if calc\.odd\(p\) \{ \{ let hs = query/)
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
  assert.match(
    gabaritTypst({ ...MODELE, chapitre: { ...MODELE.chapitre, bellePage: false } }),
    /pagebreak\(weak: true\)/,
  )
})

test('un chapitre dont le texte reprendrait avant son titre, ou hors de la page, est impossible', () => {
  for (const chapitre of [
    { ...MODELE.chapitre, ligneTexte: 7 },
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
  assert.equal(appliquerEcarts(MODELE, { separateur: 'asterisme' }, regles).ok, true)
  assert.equal(appliquerEcarts(MODELE, { separateur: 'licorne' }, regles).code, 'reglage-hors-bornes')
})

test('modèle retenu : document, équipe, instance, puis le premier permis', () => {
  const permis = ['a4', 'i1', 'e1']
  assert.equal(modeleRetenu({ choisi: 'e1', defautEquipe: 'i1', defautInstance: 'i1', permis }), 'e1')
  assert.equal(modeleRetenu({ choisi: null, defautEquipe: 'e1', defautInstance: 'i1', permis }), 'e1')
  assert.equal(modeleRetenu({ choisi: 'parti', defautEquipe: null, defautInstance: 'i1', permis }), 'i1')
  assert.equal(modeleRetenu({ permis }), 'a4')
})

test('résolution à deux étages : code, instance, équipe ; chaque étage par ses règles', () => {
  const polices = [{ famille: 'EB Garamond', fichiers: [] }]
  const regles = {
    instance: {
      reglables: [
        { cle: 'grille.corps', type: 'nombre', min: 5, max: 96 },
        { cle: 'separateur', type: 'choix', options: ['blanc', 'trait'] },
      ],
      polices,
    },
    equipe: { reglables: [{ cle: 'page.largeur', type: 'nombre', min: 80, max: 450 }], polices },
  }
  const code = (id) => (id === 'a4' ? MODELE : null)
  const instances = { i1: { base: 'a4', ecarts: { 'grille.corps': 11, separateur: 'trait' } } }
  const instance = (id) => instances[id] ?? null
  const sources = { code, instance, regles }
  const i = resoudreModele({ base: 'a4', ecarts: instances.i1.ecarts, equipe: null }, sources)
  assert.equal(i.modele.grille.corps, 11)
  const e = resoudreModele({ base: 'i1', ecarts: { 'page.largeur': 135 }, equipe: 'eq' }, sources)
  assert.deepEqual([e.modele.grille.corps, e.modele.separateur, e.modele.page.largeur], [11, 'trait', 135])
  // Une équipe ne règle pas ce que seule l'instance règle.
  assert.equal(
    resoudreModele({ base: 'i1', ecarts: { 'grille.corps': 12 }, equipe: 'eq' }, sources).code,
    'reglage-inconnu',
  )
  // Un modèle de l'instance disparu.
  assert.equal(resoudreModele({ base: 'i9', ecarts: {}, equipe: 'eq' }, sources).code, 'modele-introuvable')
})
