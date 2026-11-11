// La corbeille, la copie et le tri (domaine/corbeille.js), lots du 11/11/2026.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DUREE_CORBEILLE_MS,
  dansLaCorbeille,
  joursRestants,
  titreDeCopie,
  lieuDeLaCopie,
  trierDocuments,
  ORDRES_TRI,
} from '../../domaine/index.js'

const JOUR = 24 * 3600 * 1000

test('corbeille : 30 jours, comme Docs', () => {
  assert.equal(DUREE_CORBEILLE_MS, 30 * JOUR)
  const t0 = Date.UTC(2026, 10, 11)
  assert.equal(dansLaCorbeille(t0, t0 + 29 * JOUR), true)
  assert.equal(dansLaCorbeille(t0, t0 + 30 * JOUR), false)
  assert.equal(dansLaCorbeille(null, t0), false)
  assert.equal(joursRestants(t0, t0), 30)
  assert.equal(joursRestants(t0, t0 + 29.5 * JOUR), 1)
  assert.equal(joursRestants(t0, t0 + 40 * JOUR), 0)
})

test('titre de copie : la marque reste, l’original est raccourci au besoin', () => {
  const gabarit = (titre) => `${titre} (copie)`
  assert.equal(titreDeCopie('Essai', gabarit, 'Sans titre'), 'Essai (copie)')
  assert.equal(titreDeCopie(null, gabarit, 'Sans titre'), 'Sans titre (copie)')
  const long = titreDeCopie('é'.repeat(200), gabarit, 'Sans titre')
  assert.equal([...long].length, 200)
  assert.ok(long.endsWith('… (copie)'))
  // Un emoji n’est jamais coupé en deux.
  const emoji = titreDeCopie('😀'.repeat(200), gabarit, 'x')
  assert.equal([...emoji].length, 200)
  assert.ok([...emoji].slice(0, -9).every((c) => c === '😀' || c === '…'))
})

test('lieu de la copie : à côté de l’original si l’on peut y écrire', () => {
  assert.deepEqual(lieuDeLaCopie({ section: 'mes-documents', equipe: null, dossier: 'd1' }, false), {
    equipe: null,
    dossier: 'd1',
  })
  assert.deepEqual(lieuDeLaCopie({ section: 'partage', equipe: null, dossier: 'x' }, false), {
    equipe: null,
    dossier: null,
  })
  assert.deepEqual(lieuDeLaCopie({ section: 'equipe', equipe: 'e', dossier: 'd' }, true), { equipe: 'e', dossier: 'd' })
  assert.deepEqual(lieuDeLaCopie({ section: 'equipe', equipe: 'e', dossier: 'd' }, false), {
    equipe: null,
    dossier: null,
  })
})

test('tri : modifiés récemment, titre, créés récemment', () => {
  const docs = [
    { id: 'a', titre: 'Zèbre', creeLe: 1, modifieLe: 50 },
    { id: 'b', titre: 'abeille', creeLe: 3, modifieLe: 10 },
    { id: 'c', titre: null, creeLe: 2 },
    { id: 'd', titre: 'Écureuil', creeLe: 4, modifieLe: 4 },
  ]
  const ids = (l) => l.map((d) => d.id).join('')
  assert.equal(ids(trierDocuments(docs, 'modifies')), 'abdc')
  assert.equal(ids(trierDocuments(docs, 'titre')), 'bdac')
  assert.equal(ids(trierDocuments(docs, 'crees')), 'dbca')
  assert.equal(ids(docs), 'abcd', 'la liste reçue n’est pas modifiée')
})

test('titreDeCopie borne le résultat à 200 signes, même avec un gabarit très long', () => {
  const r = titreDeCopie('Titre', (t) => `${'x'.repeat(250)}${t}`, 'Sans titre')
  assert.equal([...r].length, 200)
  const emoji = titreDeCopie('Titre', (t) => `${'😀'.repeat(250)}${t}`, 'Sans titre')
  assert.equal([...emoji].length, 200)
})

test('trierDocuments : un ordre inconnu vaut le premier de ORDRES_TRI', () => {
  const docs = [
    { titre: 'A', creeLe: 1, modifieLe: 5 },
    { titre: 'B', creeLe: 2, modifieLe: 9 },
  ]
  assert.deepEqual(trierDocuments(docs, 'inconnu'), trierDocuments(docs, ORDRES_TRI[0]))
  assert.deepEqual(trierDocuments(docs, undefined), trierDocuments(docs, 'modifies'))
})
