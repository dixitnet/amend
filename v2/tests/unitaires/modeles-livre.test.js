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

test('les modèles du code et les modèles repris (TàT - Poche, A5, livre de poche) respectent les règles', () => {
  assert.deepEqual(
    REPRISE_MODELES.map((r) => r.id),
    ['tat-poche', 'a5', 'livre-de-poche'],
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
