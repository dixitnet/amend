// T1 : les règles du partage (domaine/partage.js), arbitrage de l'étape 6a.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  capacites,
  rolesDonnables,
  refusAcces,
  invitationValable,
  roleDuLienValide,
  peutRecevoirLienDeConnexion,
  adresseCourriel,
  DUREE_INVITATION_MS,
  INVITATIONS_MAX,
  FENETRE_INVITATIONS_MS,
  plafondInvitationsAtteint,
  extraitPourObjet,
  nomAvecAdresse,
} from '../../domaine/index.js'

const c = (role) => capacites(role)

test('rôles donnables : l’éditeur donne jusqu’à éditeur ; seul un propriétaire nomme un propriétaire', () => {
  assert.deepEqual(rolesDonnables(c('lecteur')), [])
  assert.deepEqual(rolesDonnables(c('correcteur')), [])
  assert.deepEqual(rolesDonnables(c('editeur')), ['lecteur', 'correcteur', 'editeur'])
  assert.deepEqual(rolesDonnables(c('proprietaire')), ['lecteur', 'correcteur', 'editeur', 'proprietaire'])
})

test('changer ou retirer un accès : qui invite, sauf les propriétaires, réservés aux propriétaires', () => {
  assert.equal(refusAcces(c('correcteur'), 'lecteur', 'editeur', 1), 'droit-insuffisant')
  assert.equal(refusAcces(c('editeur'), 'lecteur', 'editeur', 1), null)
  assert.equal(refusAcces(c('editeur'), 'editeur', null, 1), null, 'un éditeur retire un autre éditeur')
  assert.equal(refusAcces(c('editeur'), null, 'proprietaire', 1), 'droit-insuffisant')
  assert.equal(refusAcces(c('editeur'), 'proprietaire', null, 2), 'droit-insuffisant')
  assert.equal(refusAcces(c('proprietaire'), null, 'proprietaire', 1), null, 'un propriétaire en nomme un autre')
  assert.equal(refusAcces(c('proprietaire'), 'proprietaire', 'editeur', 2), null)
})

test('jamais aucun propriétaire : le dernier ne se retire ni ne se rétrograde', () => {
  assert.equal(refusAcces(c('proprietaire'), 'proprietaire', null, 1), 'dernier-proprietaire')
  assert.equal(refusAcces(c('proprietaire'), 'proprietaire', 'editeur', 1), 'dernier-proprietaire')
  assert.equal(refusAcces(c('proprietaire'), 'proprietaire', null, 2), null)
  assert.equal(refusAcces(c('proprietaire'), 'proprietaire', 'proprietaire', 1), null)
})

test('rôles piégés refusés', () => {
  for (const r of ['administrateur', '', '__proto__', 'toString', ['editeur'], 1])
    assert.equal(refusAcces(c('proprietaire'), null, r, 1), 'role-invalide', String(r))
})

test('invitation valable 7 jours, ni plus, ni dans le futur', () => {
  const t = Date.UTC(2026, 10, 9)
  assert.ok(invitationValable(t, t))
  assert.ok(invitationValable(t, t + DUREE_INVITATION_MS - 1))
  assert.ok(!invitationValable(t, t + DUREE_INVITATION_MS))
  assert.ok(!invitationValable(t + 1000, t))
  for (const v of [null, undefined, NaN, '2026-11-09']) assert.ok(!invitationValable(v, t), String(v))
})

test('lien de partage : lecteur, correcteur ou éditeur, jamais propriétaire ; null le ferme', () => {
  for (const r of ['lecteur', 'correcteur', 'editeur', null]) assert.ok(roleDuLienValide(r), String(r))
  for (const r of ['proprietaire', '', undefined, 'admin']) assert.ok(!roleDuLienValide(r), String(r))
})

test('service fermé : un lien de connexion seulement pour une adresse connue, invitée, ou venue par un lien', () => {
  assert.ok(!peutRecevoirLienDeConnexion({}))
  assert.ok(!peutRecevoirLienDeConnexion({ compte: 'oui' }))
  for (const k of ['compte', 'invitation', 'lienDeDocument']) assert.ok(peutRecevoirLienDeConnexion({ [k]: true }), k)
})

test('adresse de courriel : normalisée ; refusée avec un code', () => {
  assert.deepEqual(adresseCourriel('  Alice@Exemple.FR '), { ok: true, courriel: 'alice@exemple.fr' })
  assert.deepEqual(adresseCourriel('élise@exemple.fr'), { ok: true, courriel: 'élise@exemple.fr' })
  assert.equal(adresseCourriel('').code, 'courriel-vide')
  assert.equal(adresseCourriel('a'.repeat(250) + '@b.fr').code, 'courriel-trop-long')
  for (const m of ['alice', 'alice@', '@exemple.fr', 'a b@c.fr', 'a@b', 'a@b.c', '<a@b.fr>', 'a@b.fr\nBcc:x@y.fr'])
    assert.equal(adresseCourriel(m).code, 'courriel-invalide', JSON.stringify(m))
})

test('une adresse refuse les points mal placés', () => {
  for (const c of ['a..b@x.fr', '.a@x.fr', 'a.@x.fr', 'a@x..fr', 'a@.x.fr'])
    assert.deepEqual(adresseCourriel(c), { ok: false, code: 'courriel-invalide' }, c)
  assert.equal(adresseCourriel('a.b@x.fr').ok, true)
})

test('plafond des courriers : atteint à la limite dans l’heure, plus après (18/11/2026)', () => {
  const maintenant = 10 * 3600_000
  const recents = Array.from({ length: INVITATIONS_MAX }, (_, i) => maintenant - i * 1000)
  assert.equal(plafondInvitationsAtteint(recents.slice(1), maintenant), false)
  assert.equal(plafondInvitationsAtteint(recents, maintenant), true)
  // Les envois de plus d'une heure ne comptent plus.
  assert.equal(
    plafondInvitationsAtteint(
      recents.map((d) => d - FENETRE_INVITATIONS_MS),
      maintenant,
    ),
    false,
  )
})

test('objet d’un courrier : extrait sans retour à la ligne, coupé par « … » ; « Nom (adresse) »', () => {
  assert.equal(extraitPourObjet('  Un  titre\n sur deux lignes ', 60), 'Un titre sur deux lignes')
  assert.equal(extraitPourObjet('abcdefghij', 5), 'abcd…')
  assert.equal(extraitPourObjet('😀😀😀😀😀😀', 4), '😀😀😀…')
  assert.equal(nomAvecAdresse('Ada', 'ada@exemple.fr'), 'Ada (ada@exemple.fr)')
  assert.equal(nomAvecAdresse('', 'ada@exemple.fr'), 'ada@exemple.fr')
})
