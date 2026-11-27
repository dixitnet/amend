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
  valeursEnLignes,
} from '../../domaine/index.js'
// Les modèles en points d'avant la grille stricte : des données de test, pour ce qui sert encore à leur conversion.
import { REPRISE_EN_POINTS as REPRISE_MODELES } from '../donnees/modeles-en-points.js'

// « TàT - Poche » : un modèle complet, 120 × 180 mm, grille de 31 lignes de 12,4 pt.
const MODELE = structuredClone(REPRISE_MODELES.find((r) => r.id === 'tat-poche').valeurs)

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
import { completerModele, modeleRetenu, peutChoisirModele, peutGererModeles, capacites } from '../../domaine/index.js'

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

// --- La reprise des modèles enregistrés en points : ce que `completerModele` déduit, avant leur conversion en
// lignes (tests rétablis après l'audit partiel du 27/11/2026 : ces règles servent toujours la conversion).

test('un modèle enregistré en lignes par page (avant le 15/11/2026) reçoit la marge basse qui laisse ces lignes', () => {
  const ancien = { page: { largeur: 120, hauteur: 180 }, grille: { corps: 10.5, interligne: 12.4, lignes: 31 } }
  const c = completerModele(ancien, MODELE)
  assert.equal(c.marges.bas, 26.7)
  assert.equal(c.grille.lignes, undefined, 'plus de grille.lignes')
  assert.equal(lignesQuiTiennent(c), 31)
  // Un modèle qui a déjà sa marge basse ne bouge pas.
  assert.equal(completerModele({ marges: { bas: 20 } }, MODELE).marges.bas, 20)
  // Les deux à la fois : la marge basse fait foi, `grille.lignes` ne reste pas.
  const double = completerModele({ marges: { bas: 20 }, grille: { corps: 10.5, interligne: 12.4, lignes: 31 } }, MODELE)
  assert.equal(double.marges.bas, 20)
  assert.equal(double.grille.lignes, undefined)
})

test('un modèle enregistré avant le 19/11/2026 : ce qui lui manque se déduit de lui, non du modèle de référence', () => {
  const ancien = structuredClone(MODELE)
  delete ancien.ouverture2
  delete ancien.folio.ouverture2
  delete ancien.styles.bibliographie
  for (const cle of ['police', 'corps', 'italique', 'petitesCapitales', 'alignement']) delete ancien.enTete[cle]
  for (const st of Object.values(ancien.styles)) {
    delete st.petitesCapitales
    delete st.retraitSuspendu
  }
  // Complété par un modèle d'une autre grille (11/14 pt).
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
  // Un modèle qui porte déjà ces réglages les garde.
  assert.equal(completerModele({ ...ancien, enTete: { ...ancien.enTete, corps: 8 } }, defaut).enTete.corps, 8)
  // Complété ainsi, il se convertit en un modèle en lignes valide, aux lignes par page d'alors.
  const enLignes = valeursEnLignes(c, 1.15)
  assert.equal(enLignes.grille.lignes, lignesQuiTiennent(c))
  assert.doesNotThrow(() => grille(enLignes))
})
