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
    { cle: 'styles.titre2.espaceAvant', type: 'nombre', min: 0, max: 200 },
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
  assert.deepEqual(code({ 'styles.titre2.espaceAvant': 201 }), ['reglage-hors-bornes', 'styles.titre2.espaceAvant'])
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

test('espaces en points et retraits pour tous les styles (Sylvain, 15/11/2026)', () => {
  const m = structuredClone(MODELE)
  m.styles.titre2.espaceAvant = 20
  m.styles.titre2.espaceApres = 6.5
  m.styles.titre2.alinea = 3
  m.styles.titre2.retrait = 7
  m.styles.legende.retrait = 4
  m.styles.titre1.alinea = 2
  m.styles.titre1.retrait = 9
  const g = gabaritTypst(m)
  assert.match(g, /show heading\.where\(level: 2\): it => block\(width: 100%, above: 20pt, below: 6\.5pt, sticky: true/)
  assert.match(g, /first-line-indent: \(amount: 3mm, all: true\)\); pad\(left: 7mm, align\(left, it\.body\)\)/)
  assert.match(g, /amend-legende\(corps\) = block\(.*pad\(left: 4mm, align\(center, corps\)\)/)
  assert.match(g, /first-line-indent: 2mm, leading: .*pad\(left: 9mm, align\(center, it\.body\)\)/)
})

test('un modèle enregistré avec des lignes blanches (avant le 15/11/2026) reçoit les points qu’elles valaient', () => {
  const ancien = {
    styles: { titre: { lignesAvant: 0, lignesApres: 1, corps: 13 }, titre2: { lignesAvant: 1, lignesApres: 0 } },
  }
  const c = completerModele(ancien, MODELE)
  // Une ligne de la grille 12,4 pt, au corps du bloc ; sans espace voulu, l'espace ordinaire entre deux paragraphes.
  assert.equal(c.styles.titre2.espaceAvant, 14.3)
  assert.equal(c.styles.titre2.espaceApres, 1.9)
  assert.equal(c.styles.titre.espaceApres, 13.8)
  assert.equal(c.styles.titre.lignesApres, undefined, 'plus de lignes blanches')
  // Un modèle qui a déjà ses points ne bouge pas.
  const deja = completerModele({ styles: { titre2: { lignesAvant: 3, espaceAvant: 5 } } }, MODELE)
  assert.equal(deja.styles.titre2.espaceAvant, 5)
})

test('nom de fichier : pas de point en tête, noms réservés de Windows précédés d’un tiret bas (audit du 16/11/2026)', () => {
  assert.equal(nomDeFichier('.secret', 'pdf'), 'secret.pdf')
  assert.equal(nomDeFichier('... et après', 'md'), 'et après.md')
  assert.equal(nomDeFichier('CON', 'pdf'), '_CON.pdf')
  assert.equal(nomDeFichier('nul', 'md'), '_nul.md')
  assert.equal(nomDeFichier('Console', 'pdf'), 'Console.pdf')
  assert.equal(nomDeFichier('con.final', 'pdf'), '_con.final.pdf', 'réservé quelle que soit la suite')
  assert.equal(nomDeFichier('Nom. ', 'pdf'), 'Nom.pdf', 'ni point ni espace en fin')
})

test('gabarit Typst : un modèle sans chapitre est refusé avec un code, pas un gabarit faux (audit du 16/11/2026)', () => {
  const sans = { ...MODELE }
  delete sans.chapitre
  assert.throws(
    () => gabaritTypst(sans),
    (e) => e.code === 'modele-impossible',
  )
})

test('réglages : une clé qui toucherait au prototype est ignorée (audit du 16/11/2026)', () => {
  const m = completerModele(JSON.parse('{"__proto__": {"pollue": true}, "constructor": {"x": 1}}'), MODELE)
  assert.equal({}.pollue, undefined)
  assert.equal(Object.hasOwn(m, 'constructor'), false)
})

// --- Parties, en-têtes, bibliographie (Sylvain, 19/11/2026, docs/v2-modeles-140x220-plan.md) ---

const AVEC_TITRE_2 = {
  ...MODELE,
  ouverture2: { debut: 'belle-page', ligneTitre: 4, ligneTexte: 8, interligne: 14 },
  enTete: { ...MODELE.enTete, gauche: 'titreDocument', droite: 'chapitre' },
}

test('le titre 2 ouvre une page comme le titre 1 : saut, bloc de hauteur fixe, marques des pages blanches', () => {
  const g = gabaritTypst(AVEC_TITRE_2, { titre: 'Le livre' })
  const regle = g.split('\n').find((l) => l.startsWith('#show heading.where(level: 2)'))
  assert.match(regle, /<amend-fin>\]; pagebreak\(to: "odd", weak: true\); \[#metadata\(none\) <amend-debut>\]/)
  // Le texte reprend à la ligne 8 : sept lignes de 12,4 pt.
  assert.match(regle, /block\(height: 86\.8pt, width: 100%, above: 0pt, below: 0pt, sticky: true/)
  assert.match(regle, /leading: 14pt - 1em/)
  assert.match(
    gabaritTypst({ ...AVEC_TITRE_2, ouverture2: { ...AVEC_TITRE_2.ouverture2, debut: 'page' } }),
    /#show heading\.where\(level: 2\): it => \{.*pagebreak\(weak: true\)/,
  )
  // Par défaut, et pour un modèle enregistré avant ce jour : dans le texte, avec les espaces de son style.
  const flux = gabaritTypst(MODELE)
    .split('\n')
    .find((l) => l.startsWith('#show heading.where(level: 2)'))
  assert.doesNotMatch(flux, /pagebreak/)
  assert.match(flux, /above: 14\.3pt, below: 1\.9pt, sticky: true/)
})

test('pages ouvertes par un titre : pas d’en-tête, et le numéro de page par niveau', () => {
  const avec = (folio) => gabaritTypst({ ...AVEC_TITRE_2, folio: { ...MODELE.folio, ...folio } }, { titre: 'Le livre' })
  const g = avec({ ouverture: false, ouverture2: true })
  assert.match(g, /let ouverture2 = query\(heading\.where\(level: 2, outlined: true\)\)\.any\(/)
  assert.match(g, /if not blanche and not ouverture \{ align\(center \+ top/, 'pas de numéro sur un titre 1 seulement')
  assert.match(g, /if not \(ouverture or ouverture2\) \{ let c = /, 'pas d’en-tête sur l’une ni l’autre')
  assert.match(avec({ ouverture: true, ouverture2: false }), /if not blanche and not ouverture2 \{/)
  assert.match(avec({ ouverture: false, ouverture2: false }), /if not blanche and not \(ouverture or ouverture2\) \{/)
  assert.match(avec({ ouverture: true, ouverture2: true }), /if not blanche and true \{/)
  // Un titre 2 qui reste dans le texte n'ouvre rien : son réglage de numéro est sans effet.
  const flux = gabaritTypst({ ...MODELE, folio: { ...MODELE.folio, ouverture2: false } })
  assert.doesNotMatch(flux, /ouverture2/)
})

test('en-tête « chapitre en cours » : le dernier titre d’un niveau qui ouvre une page', () => {
  const g = gabaritTypst(AVEC_TITRE_2, { titre: 'Le livre' })
  assert.ok(
    g.includes(
      'query(selector(heading.where(level: 1, outlined: true)).or(heading.where(level: 2, outlined: true)).before(here()))',
    ),
  )
  const sans = gabaritTypst({ ...AVEC_TITRE_2, ouverture2: { ...AVEC_TITRE_2.ouverture2, debut: 'continuer' } })
  assert.ok(sans.includes('query(heading.where(level: 1, outlined: true).before(here()))'))
})

test('style des en-têtes : italique centré au corps du texte par défaut ; police, corps, petites capitales, côté', () => {
  const avec = (style) =>
    gabaritTypst({ ...MODELE, enTete: { gauche: 'titreDocument', droite: 'chapitre', ...style } }, { titre: 'T' })
  // Un modèle d'avant le 19/11/2026 (sans style) : comme avant.
  assert.match(avec({}), /align\(center, text\(size: 10\.5pt, style: "italic", c\)\)/)
  assert.match(
    avec({ police: 'Inter', corps: 8, italique: false, petitesCapitales: true, alignement: 'exterieur' }),
    /align\(if calc\.odd\(p\) \{ right \} else \{ left \}, text\(font: \("Inter",\), size: 8pt, style: "normal", smallcaps\(c\)\)\)/,
  )
  assert.match(avec({ alignement: 'interieur' }), /align\(if calc\.odd\(p\) \{ left \} else \{ right \}, text\(/)
  // La police des en-têtes est de celles que le modèle emploie.
  assert.deepEqual(famillesDuModele({ ...MODELE, enTete: { police: 'Inter' } }), ['EB Garamond', 'Inter'])
})

test('petites capitales, retrait suspendu et style « Bibliographie »', () => {
  const m = structuredClone(MODELE)
  m.styles.titre1.petitesCapitales = true
  m.styles.titre3.petitesCapitales = true
  m.styles.bibliographie = { ...m.styles.bibliographie, corps: 9, retraitSuspendu: 4 }
  const g = gabaritTypst(m)
  assert.match(g, /#show heading\.where\(level: 1\): it => .*align\(center, smallcaps\(it\.body\)\)/)
  assert.match(g, /#show heading\.where\(level: 3\): it => .*smallcaps\(it\.body\)/)
  // Le texte d'une entrée devient un paragraphe : le retrait suspendu ne vaut que pour un paragraphe.
  assert.match(
    g,
    /#let amend-bibliographie\(corps\) = block\(.*size: 9pt.*hanging-indent: 4mm\); align\(left, par\(corps\)\)\}\)/,
  )
  // Les majuscules l'emportent ; sans retrait suspendu, rien n'est écrit.
  m.styles.titre3.capitales = true
  assert.match(gabaritTypst(m), /#show heading\.where\(level: 3\): it => .*align\(left, upper\(it\.body\)\)/)
  assert.doesNotMatch(gabaritTypst(MODELE).replace(/#let amend-bibliographie.*/, ''), /hanging-indent|smallcaps/)
})

test('premier paragraphe après un titre 2 : sans alinéa seulement s’il ouvre une page', () => {
  assert.match(gabaritTypst(MODELE), /#let amend-sans-alinea-2\(corps\) = corps/)
  assert.match(gabaritTypst(AVEC_TITRE_2), /#let amend-sans-alinea-2\(corps\) = par\(first-line-indent: 0pt, corps\)/)
  const avecAlinea = { ...AVEC_TITRE_2, chapitre: { ...MODELE.chapitre, premierSansAlinea: false } }
  assert.match(gabaritTypst(avecAlinea), /#let amend-sans-alinea-2\(corps\) = corps/)
})

test('un titre 2 dont le texte reprendrait avant son titre, ou hors de la page, est impossible', () => {
  for (const ouverture2 of [
    { ...AVEC_TITRE_2.ouverture2, ligneTexte: 4 },
    { ...AVEC_TITRE_2.ouverture2, ligneTexte: 40 },
  ])
    assert.throws(() => grille({ ...MODELE, ouverture2 }), { code: 'modele-impossible', raison: 'ouverture2' })
  // Tant qu'il reste dans le texte, ses lignes (cachées par le formulaire) ne bloquent rien.
  assert.doesNotThrow(() => grille({ ...MODELE, ouverture2: { debut: 'continuer', ligneTitre: 4, ligneTexte: 40 } }))
})

test('un modèle enregistré avant le 19/11/2026 garde son rendu : ce qui lui manque se déduit de lui', () => {
  const ancien = structuredClone(MODELE)
  delete ancien.ouverture2
  delete ancien.folio.ouverture2
  delete ancien.styles.bibliographie
  for (const cle of ['police', 'corps', 'italique', 'petitesCapitales', 'alignement']) delete ancien.enTete[cle]
  for (const st of Object.values(ancien.styles)) {
    delete st.petitesCapitales
    delete st.retraitSuspendu
  }
  // Complété par un modèle d'une autre grille (11/14 pt), comme le serveur le fait avec le modèle du code.
  const defaut = structuredClone(MODELE)
  defaut.grille = { corps: 11, interligne: 14 }
  defaut.enTete.corps = 11
  defaut.ouverture2 = { debut: 'continuer', ligneTitre: 3, ligneTexte: 45, interligne: 19 }
  defaut.styles.bibliographie = { ...defaut.styles.bibliographie, corps: 11, espaceAvant: 3, retraitSuspendu: 5 }
  const c = completerModele(ancien, defaut)
  assert.deepEqual(c.ouverture2, { debut: 'continuer', ligneTitre: 7, ligneTexte: 12, interligne: 14 })
  assert.equal(c.enTete.corps, 10.5, 'les en-têtes restent au corps du texte')
  assert.deepEqual(
    [c.styles.bibliographie.corps, c.styles.bibliographie.espaceAvant, c.styles.bibliographie.retraitSuspendu],
    [10.5, 1.9, 4.5],
    'la bibliographie : corps, espace ordinaire et alinéa du texte',
  )
  assert.equal(c.folio.ouverture2, true)
  assert.equal(c.styles.titre3.petitesCapitales, false)
  assert.doesNotThrow(() => grille(c))
  // Le gabarit d'un modèle complété est celui du modèle d'avant, à la bibliographie près.
  const sansBiblio = (g) => g.replace(/#let amend-bibliographie.*\n/, '')
  assert.equal(sansBiblio(gabaritTypst(c)), sansBiblio(gabaritTypst(ancien)))
  // Un modèle qui porte déjà ces réglages les garde.
  const regle = completerModele({ ...ancien, enTete: { ...ancien.enTete, corps: 8 } }, defaut)
  assert.equal(regle.enTete.corps, 8)
})
