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
  const tailles = { blocs: 12, signes: 3456, signesSelection: 789 }
  const c = consigne('margo', { prenom: 'Sylvain', titre: 'Livre', portee: 'selection', de: 2, a: 4, ...tailles })
  assert.match(c, /Tu t’appelles Margo/)
  assert.match(c, /Sylvain/)
  assert.match(c, /les blocs 2 à 4/)
  // Les tailles données d'emblée, et la règle : compter avec l'outil, en signes (25/11/2026).
  assert.match(c, /12 blocs et 3[\s\u202f\u00a0]?456 signes/)
  assert.match(c, /sélectionnés par la personne \(789 signes\)/)
  assert.match(c, /N’estime jamais une longueur : utilise l’outil `compter`/)
  assert.match(c, /espaces compris/)
  assert.match(consigne('margo', { prenom: 'S', titre: 'T', portee: 'document', ...tailles }), /tout le texte/)
  assert.match(consigne('service.refusEnSerie', { n: 5 }), /tes 5 dernières/)
  for (const cle of [
    'corriger',
    'outils.plan',
    'outils.lire',
    'outils.chercher',
    'outils.compter',
    'outils.proposer',
    'outils.commenter',
  ])
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

test('remplacement : jamais deux espaces de suite dans le texte de Margo, la plus forte gardée (banc du 11/11/2026)', () => {
  const r = situerRemplacement('forestiers\u00a0: 52 et 27', '27', 'x\u00a0 : 31  et\u202f\u00a0;')
  assert.equal(r.apres, 'x\u00a0: 31 et\u202f;')
})

test('signes compte en NFC : une lettre décomposée vaut un signe', () => {
  assert.equal(signes('été'), 3)
  assert.equal(signes('été'), 3)
})

test('repères de note (27/11/2026) : montrés ⟦k⟧, ramenés au signe du bloc, jamais dans un texte proposé', async () => {
  const { ATOME, avecAppels, sansAppels, sansAtomes, porteUnAppel, texteNumerote } =
    await import('../../domaine/index.js')
  const texte = `Un fait${ATOME} établi${ATOME}.`
  assert.equal(
    avecAppels(texte, [
      { i: 7, k: 3 },
      { i: 15, k: 4 },
    ]),
    'Un fait⟦3⟧ établi⟦4⟧.',
  )
  // Un atome qui n'est pas une note reste tel quel.
  assert.equal(avecAppels(texte, [{ i: 7, k: 3 }]), `Un fait⟦3⟧ établi${ATOME}.`)
  assert.equal(sansAppels('fait⟦3⟧ établi⟦12⟧'), `fait${ATOME} établi${ATOME}`)
  assert.equal(sansAtomes(texte), 'Un fait établi.')
  assert.equal(porteUnAppel('voir ⟦2⟧'), true)
  assert.equal(porteUnAppel('voir [2]'), false)
  assert.equal(
    texteNumerote([
      { n: 5, texte: 'Un fait⟦3⟧.', notes: [{ k: 3, texte: 'Source.' }] },
      { n: 6, texte: 'Suite.', titre: 2 },
    ]),
    '[5] Un fait⟦3⟧.\n    ⟦3⟧ Source.\n[6] (titre 2) Suite.',
  )
})
