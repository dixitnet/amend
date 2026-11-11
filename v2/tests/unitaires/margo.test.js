// Le domaine de Margo (étape 8) et ses consignes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GARDE_FOUS_MARGO,
  signes,
  texteNumerote,
  porteeMargo,
  situerRemplacement,
  situerCitation,
  suiviDesRefus,
  ESPACE_FINE,
} from '../../domaine/index.js'
import { consigne } from '../../i18n/consignes.js'

test('signes : espaces compris, un caractère composé compte pour un', () => {
  assert.equal(signes('Les enfants'), 11)
  assert.equal(signes('é'), 1)
  assert.equal(signes(''), 0)
  assert.equal(signes(null), 0)
})

test('texte numéroté : un bloc par ligne, numéro entre crochets, niveau des titres', () => {
  assert.equal(
    texteNumerote([
      { n: 1, texte: 'Chapitre', titre: 1 },
      { n: 2, texte: 'Il était une fois.' },
    ]),
    '[1] (titre 1) Chapitre\n[2] Il était une fois.',
  )
})

test('portée : une sélection valide, sinon tout le texte', () => {
  assert.deepEqual(porteeMargo({ type: 'selection', de: 2, a: 3 }, 5), { type: 'selection', de: 2, a: 3 })
  for (const p of [
    { type: 'selection', de: 3, a: 2 },
    { type: 'selection', de: 0, a: 2 },
    { type: 'selection', de: 2, a: 9 },
    { type: 'selection', de: '2', a: 'x' },
    null,
    { type: 'section' },
  ])
    assert.deepEqual(porteeMargo(p, 5), { type: 'document' }, JSON.stringify(p))
})

test('remplacement : trouvé une fois, aux espaces, apostrophes et tirets près ; nouveau texte typographié', () => {
  const texte = 'L’enfant joue ; il rit – beaucoup.'
  const r = situerRemplacement(texte, "L'enfant joue", 'L’enfant jouait')
  assert.deepEqual(r, { ok: true, debut: 0, fin: 13, apres: 'L’enfant jouait' })
  const r2 = situerRemplacement(texte, 'il rit - beaucoup', 'il rit beaucoup ; vraiment')
  assert.equal(r2.ok, true)
  assert.equal(texte.slice(r2.debut, r2.fin), 'il rit – beaucoup')
  assert.equal(r2.apres, `il rit beaucoup${ESPACE_FINE}; vraiment`, 'la typographie française s’applique')
})

test('remplacement : vide, introuvable, ambigu, identique sont refusés avec leur motif', () => {
  assert.deepEqual(situerRemplacement('abc', '', 'x'), { ok: false, motif: 'vide' })
  assert.deepEqual(situerRemplacement('abc', 'z', 'x'), { ok: false, motif: 'introuvable' })
  assert.deepEqual(situerRemplacement('le chat et le chien', 'le', 'la'), { ok: false, motif: 'ambigu' })
  assert.deepEqual(situerRemplacement('l’eau', "l'eau", "l'eau"), { ok: false, motif: 'identique' })
  assert.deepEqual(situerRemplacement('a\u00a0: b', 'a : b', 'a : b'), { ok: false, motif: 'identique' })
})

test('remplacement : un texte en NFD se retrouve et se compare en NFC', () => {
  const nfd = 'été'
  assert.equal(situerRemplacement('Un été chaud', nfd, 'hiver').ok, true)
  assert.deepEqual(situerRemplacement('été', 'été', nfd), { ok: false, motif: 'identique' })
})

test('refus en série : avertir au seuil, arrêter au double ; une écriture acceptée remet à zéro', () => {
  assert.equal(GARDE_FOUS_MARGO.refusEnSerie, 5)
  const s = suiviDesRefus(2)
  assert.equal(s.noter(false), 'continuer')
  assert.equal(s.noter(false), 'avertir')
  assert.equal(s.noter(false), 'continuer')
  assert.equal(s.noter(false), 'arreter')
  const s2 = suiviDesRefus(2)
  s2.noter(false)
  assert.equal(s2.noter(true), 'continuer')
  assert.equal(s2.noter(false), 'continuer')
})

test('consignes : en catalogue, avec paramètres ; une clé absente ne passe pas', () => {
  const c = consigne('margo', { prenom: 'Sylvain', titre: 'Livre', portee: 'selection', de: 2, a: 4 })
  assert.match(c, /Tu t’appelles Margo/)
  assert.match(c, /Sylvain/)
  assert.match(c, /les blocs 2 à 4/)
  assert.match(consigne('margo', { prenom: 'S', titre: 'T', portee: 'document' }), /tout le texte/)
  assert.match(consigne('service.refusEnSerie', { n: 5 }), /tes 5 dernières/)
  for (const cle of ['corriger', 'outils.lire', 'outils.chercher', 'outils.proposer', 'outils.commenter'])
    assert.ok(consigne(cle).length > 20, cle)
  for (const code of ['vide', 'introuvable', 'ambigu', 'identique', 'bloc', 'chevauche', 'posee'])
    assert.ok(consigne(`refus.${code}`), code)
  assert.throws(() => consigne('absente'), /consigne absente/)
})

test('citation : NFD dans un texte NFC, et un passage présent deux fois sous deux formes reste ambigu (audit du 11/11/2026, 4)', () => {
  const nfd = 'e\u0301te\u0301'
  assert.deepEqual(situerCitation('Un été chaud', `Un ${nfd}`), { ok: true, debut: 0, fin: 6 })
  assert.deepEqual(situerCitation(`été et ${nfd}`, 'été'), { ok: false, motif: 'ambigu' })
  assert.deepEqual(situerCitation('L’été', "L'été"), { ok: true, debut: 0, fin: 5 })
})
