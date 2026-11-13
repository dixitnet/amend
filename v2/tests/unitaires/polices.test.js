// Les polices de l'instance (domaine/polices.js) : lecture d'un fichier,
// règles d'envoi, familles.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  lirePolice,
  POLICE_MAX_OCTETS,
  nomFichierPolice,
  stylesManquants,
  famillesDePolices,
} from '../../domaine/index.js'

const fichier = (nom) => new Uint8Array(readFileSync(new URL(`../../design/polices/${nom}`, import.meta.url)))

test('lire une police : la famille écrite dans le fichier, et son style', () => {
  for (const [nom, style] of [
    ['EBGaramond-Regular.ttf', 'romain'],
    ['EBGaramond-Italic.ttf', 'italique'],
    ['EBGaramond-SemiBold.ttf', 'gras'],
    ['EBGaramond-SemiBoldItalic.ttf', 'gras-italique'],
  ]) {
    const r = lirePolice(fichier(nom))
    assert.equal(r.ok, true, nom)
    assert.equal(r.famille, 'EB Garamond', nom)
    assert.equal(r.style, style, nom)
  }
  assert.equal(lirePolice(fichier('EBGaramond-SemiBold.ttf')).graisse, 600)
})

test('lire une police : ce qui n’en est pas une est refusé, par un code', () => {
  assert.deepEqual(lirePolice(new Uint8Array(4)), { ok: false, code: 'police-illisible' })
  assert.deepEqual(lirePolice(fichier('SourceSerif4-latin.woff2')), { ok: false, code: 'police-format' }, 'un woff2')
  assert.deepEqual(lirePolice(new TextEncoder().encode('ttcf' + 'x'.repeat(40))), { ok: false, code: 'police-format' })
  const tronque = fichier('EBGaramond-Regular.ttf').slice(0, 200)
  assert.equal(lirePolice(tronque).ok, false, 'un fichier tronqué')
  assert.deepEqual(lirePolice(new Uint8Array(POLICE_MAX_OCTETS + 1)), { ok: false, code: 'police-trop-lourde' })
  assert.deepEqual(lirePolice('pas des octets'), { ok: false, code: 'police-illisible' })
})

test('nom de fichier : sans chemin ni caractère de commande', () => {
  assert.equal(nomFichierPolice('C:\\Polices\\Ma Police.ttf'), 'Ma Police.ttf')
  assert.equal(nomFichierPolice('/tmp/x/Garamond\u0007.otf'), 'Garamond.otf')
  assert.equal(nomFichierPolice(null), '')
})

test('familles : regroupées, fichiers dans l’ordre des styles, styles manquants', () => {
  assert.deepEqual(stylesManquants(['romain', 'gras']), ['italique', 'gras-italique'])
  const f = famillesDePolices([
    { id: '2', famille: 'Zed', style: 'italique', graisse: 400, fichier: 'z-i.ttf' },
    { id: '1', famille: 'Zed', style: 'romain', graisse: 400, fichier: 'z.ttf' },
    { id: '3', famille: 'Abc', style: 'romain', graisse: 400, fichier: 'a.ttf' },
  ])
  assert.deepEqual(
    f.map((x) => [x.famille, x.fichiers.map((y) => y.id), x.manquants]),
    [
      ['Abc', ['3'], ['italique', 'gras', 'gras-italique']],
      ['Zed', ['1', '2'], ['gras', 'gras-italique']],
    ],
  )
})
