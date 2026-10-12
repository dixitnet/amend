import test from 'node:test'
import assert from 'node:assert/strict'
import { libelleVersion, phraseRestauration, pluriel, resumeComparaison, segmentsDeDiff } from '../src/versionsAffichage.js'

test('une version nommée met son nom en titre, une automatique dit d’où elle vient', () => {
  const nommee = libelleVersion({ ts: 1_700_000_000_000, origine: 'nommee', nom: 'Envoi au comité', par: 'Marie' })
  assert.equal(nommee.titre, 'Envoi au comité')
  assert.equal(nommee.nommee, true)
  assert.match(nommee.detail, /par Marie/)
  const auto = libelleVersion({ ts: 1_700_000_000_000, origine: 'session', nom: null, par: null })
  assert.equal(auto.titre, 'Fin d’une session de travail')
  assert.equal(auto.nommee, false)
  assert.equal(libelleVersion({ ts: 1, origine: 'inconnue', nom: null }).titre, 'Version enregistrée')
})

test('les pluriels s’accordent', () => {
  assert.equal(pluriel(0, 'mot', 'mots'), '0 mot')
  assert.equal(pluriel(1, 'mot', 'mots'), '1 mot')
  assert.equal(pluriel(2, 'mot', 'mots'), '2 mots')
})

test('le résumé d’une comparaison compte chaque sorte de changement', () => {
  const c = { identiques: 120, changements: [{ type: 'modifie' }, { type: 'modifie' }, { type: 'ajoute' }, { type: 'supprime' }] }
  assert.equal(resumeComparaison(c), '2 paragraphes modifiés, 1 ajouté, 1 supprimé — 120 paragraphes identiques.')
  assert.equal(resumeComparaison({ identiques: 3, changements: [] }), 'Aucune différence de texte.')
})

test('un bloc modifié se lit mot à mot', () => {
  const runs = segmentsDeDiff('Le chômage augmente.', 'Le chômage augmente nettement.')
  assert.ok(runs.some((r) => r.type === 'insert' && r.text.includes('nettement')))
  assert.ok(runs.some((r) => r.type === 'equal'))
})

test('la phrase de restauration dit ce qui sera proposé, ou qu’il n’y a rien à faire', () => {
  const r = { stats: { modifies: 1, ajoutes: 2, supprimes: 0 } }
  assert.equal(phraseRestauration(r), 'Seront proposés en suivi de modifications : 1 paragraphe retouché, 2 paragraphes rétablis.')
  assert.match(phraseRestauration(r, { auFutur: false }), /^Ont été proposés/)
  assert.match(phraseRestauration({ stats: { modifies: 0, ajoutes: 0, supprimes: 0 } }), /rien à restaurer/)
})
