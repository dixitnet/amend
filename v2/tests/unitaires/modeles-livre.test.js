// Les modèles du design (12 et 13/11/2026, docs/v2-modeles-pdf-plan.md) :
// l'A4 simple tient sur sa grille, chaque modèle du code se valide avec les
// règles, et chaque réglage ouvert a un groupe pour le formulaire.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { grille, verifierModele, gabaritTypst, NOMS_STYLES } from '../../domaine/index.js'
import { MODELES_LIVRE, REGLES_MODELES, REPRISE_MODELES } from '../../design/livre.js'

const a4 = MODELES_LIVRE[0]

test('un seul modèle dans le code, l’A4 simple, et sa grille tient', () => {
  assert.deepEqual(
    MODELES_LIVRE.map((m) => m.id),
    ['a4'],
  )
  assert.doesNotThrow(() => grille(a4))
  assert.match(gabaritTypst(a4), /width: 210mm, height: 297mm/)
})

test('les réglages ouverts : sans doublon, chacun dans un groupe, un par propriété de chaque style', () => {
  const cles = REGLES_MODELES.reglables.map((r) => r.cle)
  assert.equal(new Set(cles).size, cles.length, 'pas de doublon')
  for (const r of REGLES_MODELES.reglables) assert.ok(r.groupe, `groupe de ${r.cle}`)
  for (const style of NOMS_STYLES)
    assert.ok(
      cles.some((c) => c.startsWith(`styles.${style}.`)),
      style,
    )
})

test('les modèles du code et les modèles repris (TàT - Poche, A5, livre de poche, TàT 140 × 220) respectent les règles', () => {
  assert.deepEqual(
    REPRISE_MODELES.map((r) => r.id),
    ['tat-poche', 'a5', 'livre-de-poche', 'tat-140x220'],
  )
  for (const modele of [a4, ...REPRISE_MODELES.map((r) => r.valeurs)]) {
    const r = verifierModele(modele, REGLES_MODELES)
    assert.equal(r.ok, true, JSON.stringify(r))
    assert.doesNotThrow(() => grille(modele))
  }
})

test('formats de base (Sylvain, 15/11/2026) : A5 et livre de poche, au format et à la grille standards', () => {
  const [, a5, poche] = REPRISE_MODELES.map((r) => r.valeurs)
  assert.deepEqual([a5.page.largeur, a5.page.hauteur], [148, 210])
  assert.deepEqual([poche.page.largeur, poche.page.hauteur], [108, 178])
  // Le chapitre tient dans la page, le folio sous le texte, des marges de lecture.
  for (const m of [a5, poche]) {
    const g = grille(m)
    assert.ok(g.lignes >= m.chapitre.ligneTexte, 'le chapitre tient dans la page')
    assert.ok(g.descenteFolio > 0, 'le folio est sous le texte')
    assert.ok(m.marges.interieure > m.marges.exterieure, 'une marge intérieure plus large (la reliure)')
    assert.equal(m.chapitre.debut, 'belle-page')
  }
  // Le corps baisse avec le format.
  assert.ok(poche.grille.corps < a5.grille.corps && a5.grille.corps <= a4.grille.corps)
})

test('« TàT 140 × 220 » (Sylvain, 19/11/2026) : 33 lignes, parties en titre 1 et chapitres en titre 2, en belle page', () => {
  const m = REPRISE_MODELES.find((r) => r.id === 'tat-140x220').valeurs
  assert.deepEqual([m.page.largeur, m.page.hauteur], [140, 220])
  assert.equal(grille(m).lignes, 33, 'la marge basse de 32 mm laisse 33 lignes de 14 pt')
  assert.deepEqual([m.chapitre.debut, m.ouverture2.debut], ['belle-page', 'belle-page'])
  assert.deepEqual([m.chapitre.ligneTitre, m.ouverture2.ligneTitre, m.ouverture2.ligneTexte], [14, 6, 11])
  // Le numéro de page : pas sur l'ouverture d'une partie, oui sur celle d'un chapitre.
  assert.deepEqual([m.folio.ouverture, m.folio.ouverture2, m.folio.bas], [false, true, 20])
  // Les en-têtes : petites capitales de 10,5 pt, le titre du document à gauche, le chapitre à droite.
  assert.deepEqual(
    [m.enTete.gauche, m.enTete.droite, m.enTete.corps, m.enTete.petitesCapitales, m.enTete.italique],
    ['titreDocument', 'chapitre', 10.5, true, false],
  )
  assert.equal(m.styles.titre1.petitesCapitales, true)
  assert.deepEqual([m.styles.bibliographie.corps, m.styles.bibliographie.retraitSuspendu], [10, 5])
  assert.equal(m.chapitre.premierSansAlinea, false, 'le premier paragraphe d’un chapitre garde son alinéa')
})

test('les autres modèles gardent leur rendu (19/11/2026) : titre 2 dans le texte, en-têtes en italique au corps du texte', () => {
  for (const m of [a4, ...REPRISE_MODELES.filter((r) => r.id !== 'tat-140x220').map((r) => r.valeurs)]) {
    assert.equal(m.ouverture2.debut, 'continuer')
    assert.deepEqual(
      [m.enTete.police, m.enTete.corps, m.enTete.italique, m.enTete.petitesCapitales, m.enTete.alignement],
      ['', m.grille.corps, true, false, 'centre'],
    )
    for (const st of Object.values(m.styles)) assert.ok(!st.petitesCapitales && !st.capitales)
    assert.equal(m.styles.bibliographie.corps, m.grille.corps, 'la bibliographie au corps du texte')
  }
})

test('séparateur de scène « trois points » (Sylvain, 22/11/2026) : un réglage permis, trois puces centrées dans le gabarit', () => {
  const m = { ...a4, separateur: 'points' }
  assert.equal(verifierModele(m, REGLES_MODELES).ok, true)
  assert.match(gabaritTypst(m), /#let amend-separateur = align\(center, par\(.*"• • •"\)\)/)
  assert.equal(
    verifierModele({ ...a4, separateur: 'pointilles' }, REGLES_MODELES).ok,
    false,
    'un signe inconnu est refusé',
  )
})
