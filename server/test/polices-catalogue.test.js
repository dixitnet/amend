// Le catalogue de polices de l'instance (24/10/2026) : ce qu'on lit dans un
// fichier de police, ce qu'on refuse, comment une famille se complète, et
// comment le catalogue entre dans la liste partagée.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Polices, PoliceInvalide, lirePolice, FICHIER_MAX_OCTETS, FAMILLES_MAX } from '../polices.js'
import { POLICES, POLICES_BASE, appliquerCatalogue, police, assainir, famillesTypst } from '../../shared/style.js'
import { fabriquerPolice } from './aides-polices.js'

const nouveau = () => new Polices(mkdtempSync(join(tmpdir(), 'amend-polices-')))

test('lirePolice : famille, graisse, italique, licence et droit d’embarquement', () => {
  const lue = lirePolice(
    fabriquerPolice({ famille: 'Libre Caslon Text', poids: 700, italique: true, sousFamille: 'Bold Italic' })
  )
  assert.equal(lue.format, 'ttf')
  assert.equal(lue.famille, 'Libre Caslon Text')
  assert.equal(lue.poids, 700)
  assert.equal(lue.italique, true)
  assert.equal(lue.sousFamille, 'Bold Italic')
  assert.match(lue.licence, /Open Font License/)
  assert.equal(lue.droitEmbarquement, 'installable')
})

test('lirePolice : la famille typographique (identifiant 16) l’emporte sur « Famille Style »', () => {
  const lue = lirePolice(fabriquerPolice({ famille: 'Inter Display', sousFamille: 'Medium', typographique: true }))
  assert.equal(lue.famille, 'Inter Display')
})

test('lirePolice : le dessin peut être OpenType (CFF) ; le genre vient de l’en-tête', () => {
  assert.equal(lirePolice(fabriquerPolice({ cff: true })).format, 'otf')
  assert.equal(lirePolice(fabriquerPolice({ monospace: true })).generique, 'monospace')
  assert.equal(lirePolice(fabriquerPolice({ serifStyle: 2 })).generique, 'serif')
  assert.equal(lirePolice(fabriquerPolice({ serifStyle: 11 })).generique, 'sans-serif')
})

test('lirePolice : refuse ce qui n’est pas une police utilisable', () => {
  const refus = (octets, motif) =>
    assert.throws(
      () => lirePolice(octets),
      (e) => e instanceof PoliceInvalide && motif.test(e.message),
      String(motif)
    )
  refus(Buffer.from('<html>pas une police</html>'.repeat(10)), /pas une police/)
  refus(fabriquerPolice({ signature: 'wOF2' }), /WOFF/)
  refus(fabriquerPolice({ signature: 'ttcf' }), /collections/)
  refus(fabriquerPolice({ variable: true }), /variables/)
  refus(fabriquerPolice({ fsType: 2 }), /interdit son embarquement/)
  // Les bits « aperçu » (4) et « modifiable » (8) autorisent l’embarquement.
  assert.equal(lirePolice(fabriquerPolice({ fsType: 8 })).droitEmbarquement, 'modifiable')
  refus(Buffer.alloc(10), /pas une police/)
})

test('lirePolice : un fichier tronqué est refusé sans lecture hors limites', () => {
  const entiere = fabriquerPolice()
  for (const coupe of [20, 100, entiere.length - 5]) {
    assert.throws(() => lirePolice(entiere.subarray(0, coupe)), PoliceInvalide)
  }
})

test('lirePolice : le nom de famille est nettoyé (rien qui s’échapperait d’une chaîne CSS ou Typst)', () => {
  const lue = lirePolice(fabriquerPolice({ famille: 'Mon "Beau" <Nom>\; {x}' }))
  assert.equal(lue.famille, 'Mon Beau Nom x')
})

test('ajouter : crée l’entrée, écrit le fichier sous un nom à nous, complète la famille', () => {
  const p = nouveau()
  const normal = fabriquerPolice({ famille: 'Garamond Test' })
  const gras = fabriquerPolice({ famille: 'Garamond Test', poids: 700, sousFamille: 'Bold' })
  const a = p.ajouter(normal, { par: 'chef@example.com' })
  assert.equal(a.cree, true)
  assert.equal(a.police.id, 'i-garamond-test')
  assert.match(a.fichier.nom, /^i-garamond-test-[0-9a-f]{12}\.ttf$/)
  assert.ok(existsSync(join(p.dossier, a.fichier.nom)))
  const b = p.ajouter(gras, { par: 'chef@example.com' })
  assert.equal(b.cree, false)
  assert.deepEqual(
    p.catalogue()[0].fichiers.map((f) => [f.poids, f.italique]),
    [
      [400, false],
      [700, false],
    ]
  )
  assert.equal(p.lister().length, 1)
  assert.ok(p.nonVide())
})

test('ajouter : un fichier de même graisse et de même style remplace le précédent', () => {
  const p = nouveau()
  const v1 = p.ajouter(fabriquerPolice({ famille: 'Remplacée', remplissage: 0 }))
  const v2 = p.ajouter(fabriquerPolice({ famille: 'Remplacée', remplissage: 64 }))
  assert.equal(v2.remplace, true)
  assert.equal(p.lister()[0].fichiers.length, 1)
  assert.ok(!existsSync(join(p.dossier, v1.fichier.nom)), 'l’ancien fichier est effacé')
  assert.ok(existsSync(join(p.dossier, v2.fichier.nom)))
})

test('ajouter : limites de taille et de nombre de familles', () => {
  const p = nouveau()
  assert.throws(
    () => p.ajouter(fabriquerPolice({ remplissage: FICHIER_MAX_OCTETS })),
    (e) => e instanceof PoliceInvalide && e.status === 413
  )
  for (let i = 0; i < FAMILLES_MAX; i++)
    p.ajouter(fabriquerPolice({ famille: `Famille ${String.fromCharCode(65 + (i % 26))}${i}` }))
  assert.throws(
    () => p.ajouter(fabriquerPolice({ famille: 'Une de trop' })),
    (e) => e instanceof PoliceInvalide && e.status === 409
  )
})

test('supprimer : la famille ou un seul fichier ; le dernier fichier emporte la famille', () => {
  const p = nouveau()
  const a = p.ajouter(fabriquerPolice({ famille: 'Duo' }))
  const b = p.ajouter(fabriquerPolice({ famille: 'Duo', poids: 700 }))
  assert.equal(p.supprimerFichier('i-duo', b.fichier.nom), true)
  assert.equal(p.lister()[0].fichiers.length, 1)
  assert.ok(!existsSync(join(p.dossier, b.fichier.nom)))
  assert.equal(p.supprimerFichier('i-duo', a.fichier.nom), true)
  assert.equal(p.lister().length, 0)
  assert.deepEqual(readdirSync(p.dossier), [])
  assert.equal(p.supprimer('i-duo'), false)
})

test('chemin : seulement un fichier du registre, jamais un chemin libre', () => {
  const p = nouveau()
  const a = p.ajouter(fabriquerPolice({ famille: 'Sûre' }))
  assert.ok(p.chemin('i-sure', a.fichier.nom))
  assert.equal(p.chemin('i-sure', '../polices.json'), null)
  assert.equal(p.chemin('i-sure', 'i-autre-aaaaaaaaaaaa.ttf'), null)
  assert.equal(p.chemin('i-inconnue', a.fichier.nom), null)
  writeFileSync(join(p.dossier, 'i-sure-bbbbbbbbbbbb.ttf'), 'x')
  assert.equal(p.chemin('i-sure', 'i-sure-bbbbbbbbbbbb.ttf'), null, 'présent sur le disque mais pas au registre')
})

test('un registre illisible ne fait pas tomber le serveur : aucune police d’instance', () => {
  const p = nouveau()
  p.ajouter(fabriquerPolice({ famille: 'Avant' }))
  writeFileSync(p.registre, '{ pas du json')
  assert.deepEqual(p.catalogue(), [])
})

// --- Le catalogue dans la liste partagée ----------------------------------

test('appliquerCatalogue : les polices d’instance suivent celles de base, et se retirent', () => {
  try {
    const n = appliquerCatalogue([{ id: 'i-garamond', famille: 'Garamond Test', generique: 'serif' }])
    assert.equal(n, 1)
    assert.equal(POLICES.length, POLICES_BASE.length + 1)
    const g = police('i-garamond')
    assert.deepEqual(g.typst, ['Garamond Test'])
    assert.equal(g.docx, 'Garamond Test')
    assert.equal(g.css, '"Garamond Test", serif')
    assert.ok(famillesTypst().includes('Garamond Test'))
    // Le menu des blocs lit la même liste.
    assert.equal(assainir({ blocs: { body: { font: 'i-garamond' } } }).blocs.body.font, 'i-garamond')
    appliquerCatalogue([])
    assert.equal(POLICES.length, POLICES_BASE.length)
    assert.equal(
      assainir({ blocs: { body: { font: 'i-garamond' } } }).blocs.body.font,
      'system',
      'retombe sur la police de base'
    )
  } finally {
    appliquerCatalogue([])
  }
})

test('appliquerCatalogue : écarte les entrées douteuses', () => {
  try {
    const n = appliquerCatalogue([
      { id: 'arial', famille: 'Pirate' }, // une police de base ne se masque pas
      { id: 'i-a"b', famille: 'X' },
      { id: 'i-ok', famille: 'Nom "piégé"' },
      { id: 'i-ok2', famille: 'x'.repeat(200) },
      { id: 'i-bon', famille: 'Bon Nom', generique: 'inconnu' },
      null,
      'texte',
    ])
    assert.equal(n, 1)
    assert.equal(police('arial').typst[0], 'Liberation Sans')
    assert.equal(police('i-bon').css, '"Bon Nom", sans-serif')
  } finally {
    appliquerCatalogue([])
  }
})
