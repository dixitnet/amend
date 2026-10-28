// Le stockage des modèles en CSS (28/10/2026, server/modeles.js) : un modèle
// stocké est un fichier `.css` (sa mise en page) et un `.json` (nom,
// catégorie, portée…) ; les modèles d'avant, tout en JSON, sont convertis au
// démarrage sans changer d'aspect. Le registre est testé seul, sans serveur.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Modeles } from '../modeles.js'
import { fusionner, reduire, assainir, appliquerCatalogue } from '../../shared/style.js'
import { ID_DEFAUT, MODELES_LIVRES } from '../../shared/modeles.js'

const racines = []
function registre(avant = () => {}) {
  const racine = mkdtempSync(join(tmpdir(), 'collabtext-test-modeles-css-'))
  racines.push(racine)
  const dossier = join(racine, 'modeles')
  avant(dossier)
  let instance = {}
  const modeles = new Modeles(dossier, {
    lireInstance: () => instance,
    ecrireInstance: (s) => {
      instance = s
      return fusionner(s)
    },
    enUsage: () => 0,
  })
  return { modeles, dossier }
}
const fichiers = (dossier) => readdirSync(dossier).sort()
const ecrireAncien = (dossier, id, extra) => {
  writeFileSync(
    join(dossier, `${id}.json`),
    JSON.stringify(
      { id, nom: 'Ancien', portee: 'instance', proprietaire: null, creeLe: 1, modifieLe: 2, ...extra },
      null,
      2
    )
  )
}
import { mkdirSync } from 'node:fs'

test('créer écrit deux fichiers : le CSS de la mise en page, le JSON du reste', () => {
  const { modeles, dossier } = registre()
  const m = modeles.creer({
    nom: 'Livre poche',
    categorie: 'BOD',
    depuis: 'texte-brut',
    portee: 'perso',
    email: 'a@x.fr',
  })
  assert.deepEqual(fichiers(dossier), [`${m.id}.css`, `${m.id}.json`])
  const meta = JSON.parse(readFileSync(join(dossier, `${m.id}.json`), 'utf8'))
  assert.deepEqual(Object.keys(meta).sort(), [
    'categorie',
    'creeLe',
    'id',
    'modifieLe',
    'nom',
    'portee',
    'proprietaire',
  ])
  const css = readFileSync(join(dossier, `${m.id}.css`), 'utf8')
  assert.match(css, /^\/\* amend\.ink — profil de mise en page/)
  assert.match(css, /font-family: "DejaVu Sans", sans-serif;/)
  // Ce que l'on relit est ce que la source disait.
  assert.deepEqual(
    m.style,
    modeles.obtenir('texte-brut').style && reduire(assainir(fusionner(modeles.obtenir('texte-brut').style)))
  )
})

test('un modèle d’avant le CSS est converti au démarrage, sans changer d’aspect', () => {
  const style = reduire(
    assainir({
      page: {
        size: 'A5',
        orientation: 'paysage',
        marginTop: 17.5,
        pageNumbers: { enabled: true, startAt: 3 },
        langue: 'en',
      },
      blocs: { body: { font: 'serif', size: 10, align: 'justify' }, h1: { uppercase: true, bold: false } },
    })
  )
  const { modeles, dossier } = registre((d) => {
    mkdirSync(d, { recursive: true })
    ecrireAncien(d, 'm-0a0a0a0a', { style })
  })
  assert.deepEqual(fichiers(dossier), ['m-0a0a0a0a.css', 'm-0a0a0a0a.json'])
  const meta = JSON.parse(readFileSync(join(dossier, 'm-0a0a0a0a.json'), 'utf8'))
  assert.equal(meta.style, undefined)
  assert.equal(meta.nom, 'Ancien')
  assert.deepEqual(modeles.obtenir('m-0a0a0a0a').style, style)
  assert.equal(modeles.obtenir('m-0a0a0a0a').categorie, '')
  // Répéter ne change rien.
  assert.equal(modeles.migrer(), 0)
})

test('une migration qui ne redonnerait pas la même mise en page laisse le modèle tel quel', () => {
  // Un style au-delà de ce que le profil sait écrire n'existe pas ; on simule
  // l'écart par un CSS déjà là mais différent : il fait foi, le JSON perd son style.
  const { modeles, dossier } = registre((d) => {
    mkdirSync(d, { recursive: true })
    ecrireAncien(d, 'm-0b0b0b0b', { style: { blocs: { body: { size: 14 } } } })
    writeFileSync(join(d, 'm-0b0b0b0b.css'), 'p { font-size: 9pt }')
  })
  assert.equal(modeles.obtenir('m-0b0b0b0b').style.blocs.body.size, 9, 'le CSS fait foi')
  assert.equal(JSON.parse(readFileSync(join(dossier, 'm-0b0b0b0b.json'), 'utf8')).style, undefined)
})

test('modifier un modèle d’avant le CSS le convertit du même coup', () => {
  const { modeles, dossier } = registre((d) => {
    mkdirSync(d, { recursive: true })
    ecrireAncien(d, 'm-0c0c0c0c', { style: { blocs: { body: { size: 14 } } } })
  })
  modeles.ecrireStyle('m-0c0c0c0c', { blocs: { body: { size: 15 } } })
  assert.equal(modeles.obtenir('m-0c0c0c0c').style.blocs.body.size, 15)
  assert.ok(existsSync(join(dossier, 'm-0c0c0c0c.css')))
})

test('un CSS illisible ne fait pas tomber le registre : le modèle retombe sur le code et le dit', () => {
  const { modeles } = registre((d) => {
    mkdirSync(d, { recursive: true })
    ecrireAncien(d, 'm-0d0d0d0d', { style: {} })
    writeFileSync(join(d, 'm-0d0d0d0d.css'), '{'.repeat(100))
  })
  const m = modeles.obtenir('m-0d0d0d0d')
  assert.deepEqual(m.style, {})
  assert.match(m.avertissements[0], /n’a pas pu être lu/)
  assert.ok(modeles.lister('a@x.fr').some((x) => x.id === 'm-0d0d0d0d'))
})

test('un modèle fait mention d’une police de l’instance : son retrait est signalé, pas silencieux', (t) => {
  t.after(() => appliquerCatalogue([]))
  appliquerCatalogue([{ id: 'i-garamond', famille: 'Garamond Premier', generique: 'serif' }])
  const { modeles, dossier } = registre()
  const m = modeles.creer({ nom: 'Maison', categorie: 'Test', depuis: 'texte-brut', portee: 'instance' })
  modeles.ecrireStyle(m.id, { blocs: { body: { font: 'i-garamond' } } })
  assert.equal(modeles.obtenir(m.id).style.blocs.body.font, 'i-garamond')
  assert.deepEqual(modeles.obtenir(m.id).avertissements, [])
  assert.match(readFileSync(join(dossier, `${m.id}.css`), 'utf8'), /font-family: "Garamond Premier", serif;/)

  appliquerCatalogue([])
  const apres = modeles.obtenir(m.id)
  assert.equal(apres.style.blocs.body.font, 'serif', 'repli sur le générique, le document s’exporte')
  assert.match(apres.avertissements.join(' '), /Garamond Premier/)

  // La police revient : le modèle retrouve sa police sans que personne y touche.
  appliquerCatalogue([{ id: 'i-garamond', famille: 'Garamond Premier', generique: 'serif' }])
  assert.equal(modeles.obtenir(m.id).style.blocs.body.font, 'i-garamond')
})

test('catégories : obligatoires, nettoyées, réservées ; l’ordre de la liste', () => {
  const { modeles } = registre((d) => {
    mkdirSync(d, { recursive: true })
    ecrireAncien(d, 'm-0e0e0e0e', { nom: 'Ancien sans catégorie', style: {} })
  })
  const nouveau = (nom, categorie) => modeles.creer({ nom, categorie, depuis: 'texte-brut', portee: 'instance' })
  const un = nouveau('Rapport A4 paysage', 'dixit')
  const deux = nouveau('Petit format', 'Aube')
  const trois = nouveau('Livre poche', 'Éditeur')
  const quatre = nouveau('Livre poche', 'éditeur')
  const mien = nouveau('Brouillon', 'Test')

  // La liste : « Par défaut », ce qui n'a pas de catégorie, puis les catégories dans l'ordre
  // (sans égard à la casse ni aux accents), chacune par nom.
  const libelles = modeles.lister().map((m) => (m.categorie ? `${m.categorie} - ${m.nom}` : m.nom))
  const ids = [un, deux, trois, quatre, mien].map((m) => `${m.categorie} - ${m.nom}`)
  assert.deepEqual(libelles.slice(0, 3), ['amend.ink - Par défaut', 'Ancien sans catégorie', 'amend.ink - Texte brut'])
  assert.deepEqual(
    libelles.filter((l) => ids.includes(l)),
    [
      'Aube - Petit format',
      'dixit - Rapport A4 paysage',
      'Éditeur - Livre poche',
      'éditeur - Livre poche',
      'Test - Brouillon',
    ]
  )

  assert.equal(modeles.classer(mien.id, '  Aube   ').categorie, 'Aube')
  assert.equal(modeles.classer('m-0e0e0e0e', 'Archives').categorie, 'Archives', 'un ancien modèle se range')
  for (const [categorie, message] of [
    ['', /obligatoire/],
    ['   ', /obligatoire/],
    [null, /obligatoire/],
    ['x'.repeat(41), /invalide/],
    [12, /invalide/],
    ['amend.ink', /réservée/],
    [' AMEND.INK ', /réservée/],
  ]) {
    assert.throws(() => modeles.classer(mien.id, categorie), message, JSON.stringify(categorie))
    assert.throws(() => nouveau('N', categorie), message, JSON.stringify(categorie))
  }
  assert.throws(() => modeles.classer('m-ffffffff', 'A'), /introuvable/)
  assert.equal(modeles.obtenir(mien.id).categorie, 'Aube', 'un refus ne change rien')
})

test('supprimer et supprimerPersonnels retirent le CSS avec le JSON, sans rien laisser', () => {
  const { modeles, dossier } = registre()
  const a = modeles.creer({ nom: 'A', categorie: 'Test', depuis: 'texte-brut', portee: 'perso', email: 'a@x.fr' })
  const b = modeles.creer({ nom: 'B', categorie: 'Test', depuis: 'texte-brut', portee: 'perso', email: 'a@x.fr' })
  const c = modeles.creer({ nom: 'C', categorie: 'Test', depuis: 'texte-brut', portee: 'perso', email: 'b@x.fr' })
  modeles.supprimer(a.id)
  assert.ok(!existsSync(join(dossier, `${a.id}.css`)) && !existsSync(join(dossier, `${a.id}.json`)))
  assert.deepEqual(modeles.supprimerPersonnels('a@x.fr'), [b.id])
  assert.deepEqual(fichiers(dossier), [`${c.id}.css`, `${c.id}.json`])
})

test('« Par défaut » et « Texte brut » sont dans amend.ink ; KDP, BOD et dixit sont livrés', () => {
  const { modeles } = registre()
  assert.equal(modeles.obtenir(ID_DEFAUT).categorie, 'amend.ink')
  assert.equal(modeles.obtenir('texte-brut').categorie, 'amend.ink')
  assert.equal(modeles.obtenir('kdp-15-6x23-39').categorie, 'KDP')
  assert.equal(modeles.obtenir('bod-12x19').categorie, 'BOD')
  assert.equal(modeles.obtenir('dixit-ptit-papier').categorie, 'dixit')
})

test('semer copie les livrés (sauf « Texte brut ») une fois chacun ; supprimer ne les fait pas revenir', () => {
  const { modeles, dossier } = registre()
  const copiables = MODELES_LIVRES.filter((l) => !l.fixe).map((l) => l.id)
  // Avant la copie, ils sont dans le code, tels quels.
  assert.equal(modeles.obtenir('tat-grand').portee, 'livre')
  assert.equal(modeles.semer(), copiables.length)
  assert.equal(modeles.semer(), 0, 'rien à refaire')
  assert.ok(!existsSync(join(dossier, 'texte-brut.json')), '« Texte brut » reste dans le code')
  assert.equal(modeles.obtenir('texte-brut').portee, 'livre')
  const tat = modeles.obtenir('tat-grand')
  assert.deepEqual([tat.portee, tat.origine, tat.ecartLivre], ['instance', 'tat-grand', false])
  assert.equal(modeles.lister().filter((m) => m.id === 'tat-grand').length, 1)

  // Réglé, il s'écarte ; rétabli, il redevient celui du code.
  modeles.ecrireStyle('tat-grand', { page: { size: 'personnalise', largeur: 150, hauteur: 230 } })
  modeles.renommer('tat-grand', 'Mon grand')
  assert.equal(modeles.obtenir('tat-grand').ecartLivre, true)
  const retabli = modeles.retablir('tat-grand')
  assert.equal(retabli.nom, 'TàT grand')
  assert.equal(retabli.ecartLivre, false)
  assert.equal(retabli.style.page.largeur, 140)
  assert.throws(() => modeles.retablir('texte-brut'), /introuvable/)
  const perso = modeles.creer({ nom: 'Mien', categorie: 'Test', depuis: 'tat-grand', portee: 'perso', email: 'a@x.fr' })
  assert.throws(() => modeles.retablir(perso.id), /ne vient pas/)

  // Supprimé : plus de modèle, ni dans la liste ni dans le code, ni après une nouvelle copie.
  modeles.supprimer('tat-grand')
  assert.equal(modeles.obtenir('tat-grand'), null)
  assert.equal(modeles.semer(), 0)
  assert.ok(!modeles.lister().some((m) => m.id === 'tat-grand'))
  assert.equal(
    modeles.couche('tat-grand'),
    modeles.couche(ID_DEFAUT),
    'un document qui l’avait retombe sur « Par défaut »'
  )
})

test('fin : nettoyage', () => {
  for (const r of racines) rmSync(r, { recursive: true, force: true })
})
