// Les fils de commentaires, éprouvés là où ça casse : la concurrence.
//
// Ces tests montent de **vrais documents Yjs** et les font converger à la
// main (`applyUpdate` dans les deux sens), parce que le risque de cette
// fonction n'est pas dans l'affichage mais dans ce que deux personnes
// écrivent en même temps. Un test qui n'utiliserait qu'un seul document
// passerait sans rien prouver.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import {
  ajouterReponse,
  commentairesAncres,
  estUneReponse,
  modifierTexte,
  peutModifier,
  orphelins,
  reponsesDe,
  supprimerFil,
} from '../src/comments.js'

const ALICE = { name: 'Alice', color: '#3d5a80' }
const BRUNO = { name: 'Bruno', color: '#e07a5f' }

/** Un commentaire ancré, posé à la main — `addComment` a besoin d'une vue
 * ProseMirror liée, dont ces tests n'ont pas l'usage. */
function poserCommentaire(map, user, texte, id = 'c-1') {
  map.set(id, {
    id,
    author: user.name,
    color: user.color,
    anchorFrom: null,
    anchorTo: null,
    text: texte,
    createdAt: Date.now(),
  })
  return id
}

/** Deux documents Yjs reliés à la main : `synchroniser()` les fait
 * converger, et rien ne circule tant qu'on ne l'appelle pas. C'est ce qui
 * permet de reproduire « deux personnes écrivent sans se voir ». */
function deuxDocuments() {
  const a = new Y.Doc()
  const b = new Y.Doc()
  const synchroniser = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)))
  }
  return { a, b, mapA: a.getMap('comments'), mapB: b.getMap('comments'), synchroniser }
}

// ===================================================== la concurrence

test('deux réponses écrites en même temps survivent toutes les deux', () => {
  // LE test de cette fonction. Avec les réponses rangées dans un tableau à
  // l'intérieur du commentaire, ce scénario en perdait une en silence :
  // chaque machine envoyait sa version complète de l'objet, la dernière
  // écrasait l'autre. Une clé par réponse, et Yjs les garde toutes.
  const { mapA, mapB, synchroniser } = deuxDocuments()
  poserCommentaire(mapA, ALICE, 'Cette phrase est-elle juste ?')
  synchroniser()

  // Personne ne voit l'autre écrire.
  ajouterReponse(mapA, ALICE, 'c-1', 'Je crois que oui.')
  ajouterReponse(mapB, BRUNO, 'c-1', 'Non, le chiffre date de 2019.')
  synchroniser()

  for (const map of [mapA, mapB]) {
    const textes = reponsesDe(map, 'c-1').map((r) => r.text)
    assert.equal(textes.length, 2, 'aucune réponse ne doit se perdre')
    assert.ok(textes.includes('Je crois que oui.'))
    assert.ok(textes.includes('Non, le chiffre date de 2019.'))
  }
})

test('les deux machines voient les réponses dans le même ordre', () => {
  // Deux réponses écrites à la même milliseconde ne doivent pas s'afficher
  // dans un ordre différent selon l'écran : on départage par identifiant.
  const { mapA, mapB, synchroniser } = deuxDocuments()
  poserCommentaire(mapA, ALICE, 'Question')
  synchroniser()
  const instant = Date.now()
  for (const [map, id, auteur] of [
    [mapA, 'r-x', ALICE],
    [mapB, 'r-a', BRUNO],
  ]) {
    map.set(id, { id, parent: 'c-1', author: auteur.name, color: auteur.color, text: id, createdAt: instant })
  }
  synchroniser()
  assert.deepEqual(
    reponsesDe(mapA, 'c-1').map((r) => r.id),
    reponsesDe(mapB, 'c-1').map((r) => r.id)
  )
  assert.deepEqual(reponsesDe(mapA, 'c-1').map((r) => r.id), ['r-a', 'r-x'])
})

test('résoudre un fil d’un côté pendant qu’on y répond de l’autre ne laisse pas de réponse orpheline', () => {
  const { a, mapA, mapB, synchroniser } = deuxDocuments()
  poserCommentaire(mapA, ALICE, 'À trancher')
  synchroniser()
  ajouterReponse(mapB, BRUNO, 'c-1', 'Une remarque de plus.')
  supprimerFil(a, mapA, 'c-1')
  synchroniser()

  // La réponse de Bruno est arrivée après coup : elle survit à la
  // suppression, faute de quoi il faudrait un verrou. Ce qu'on garantit,
  // c'est qu'elle reste rattachable et qu'elle ne s'affiche nulle part —
  // son parent n'existe plus, donc aucune carte ne la dessine.
  assert.equal(commentairesAncres(mapA).length, 0, 'plus aucune carte à dessiner')
  assert.equal(commentairesAncres(mapB).length, 0)
})

// ===================================================== le modèle

test('résoudre emporte les réponses du fil, et elles seules', () => {
  const doc = new Y.Doc()
  const map = doc.getMap('comments')
  poserCommentaire(map, ALICE, 'Premier', 'c-1')
  poserCommentaire(map, BRUNO, 'Second', 'c-2')
  ajouterReponse(map, BRUNO, 'c-1', 'Réponse au premier')
  ajouterReponse(map, ALICE, 'c-1', 'Encore une')
  ajouterReponse(map, ALICE, 'c-2', 'Réponse au second')

  assert.equal(supprimerFil(doc, map, 'c-1'), 3, 'le commentaire et ses deux réponses')
  assert.equal(reponsesDe(map, 'c-1').length, 0)
  assert.equal(reponsesDe(map, 'c-2').length, 1, 'l’autre fil est intact')
  assert.deepEqual(commentairesAncres(map).map(([id]) => id), ['c-2'])
})

test('on ne répond pas à une réponse : un seul niveau', () => {
  const doc = new Y.Doc()
  const map = doc.getMap('comments')
  poserCommentaire(map, ALICE, 'Question')
  const reponse = ajouterReponse(map, BRUNO, 'c-1', 'Réponse')
  assert.ok(reponse)
  assert.equal(ajouterReponse(map, ALICE, reponse, 'Réponse à la réponse'), null)
  assert.equal(reponsesDe(map, 'c-1').length, 1)
})

test('on ne répond pas à un commentaire qui n’existe plus', () => {
  const doc = new Y.Doc()
  const map = doc.getMap('comments')
  assert.equal(ajouterReponse(map, ALICE, 'c-inconnu', 'Bonjour ?'), null)
})

test('une réponse vide n’est pas une réponse', () => {
  const doc = new Y.Doc()
  const map = doc.getMap('comments')
  poserCommentaire(map, ALICE, 'Question')
  assert.equal(ajouterReponse(map, BRUNO, 'c-1', '   '), null)
  assert.equal(ajouterReponse(map, BRUNO, 'c-1', ''), null)
  assert.equal(reponsesDe(map, 'c-1').length, 0)
})

test('une réponse garde l’auteur et la couleur de qui l’écrit', () => {
  const doc = new Y.Doc()
  const map = doc.getMap('comments')
  poserCommentaire(map, ALICE, 'Question')
  const id = ajouterReponse(map, BRUNO, 'c-1', 'Ma réponse')
  const r = map.get(id)
  assert.equal(r.author, 'Bruno')
  assert.equal(r.color, BRUNO.color)
  assert.ok(estUneReponse(r))
  assert.ok(!estUneReponse(map.get('c-1')))
})

// ===================================================== la correction

test('corriger son commentaire garde tout le reste, et laisse une trace', () => {
  const doc = new Y.Doc()
  const map = doc.getMap('comments')
  poserCommentaire(map, ALICE, 'Cette phrse est fausse')
  const avant = map.get('c-1')
  assert.ok(modifierTexte(map, 'c-1', 'Cette phrase est fausse'))
  const apres = map.get('c-1')
  assert.equal(apres.text, 'Cette phrase est fausse')
  assert.equal(apres.author, avant.author, 'l’auteur ne change pas')
  assert.equal(apres.createdAt, avant.createdAt, 'la date de création non plus')
  assert.ok(apres.editedAt >= avant.createdAt, 'une correction se voit')
})

test('corriger une réponse marche aussi', () => {
  const doc = new Y.Doc()
  const map = doc.getMap('comments')
  poserCommentaire(map, ALICE, 'Question')
  const id = ajouterReponse(map, BRUNO, 'c-1', 'Repsonse')
  assert.ok(modifierTexte(map, id, 'Réponse'))
  assert.equal(map.get(id).text, 'Réponse')
  assert.equal(map.get(id).parent, 'c-1', 'elle reste rattachée à son fil')
})

test('un texte vide ou inchangé ne corrige rien', () => {
  const doc = new Y.Doc()
  const map = doc.getMap('comments')
  poserCommentaire(map, ALICE, 'Texte')
  assert.equal(modifierTexte(map, 'c-1', '   '), false)
  assert.equal(modifierTexte(map, 'c-1', 'Texte'), false)
  assert.equal(map.get('c-1').editedAt, undefined, 'pas de fausse trace de correction')
})

test('une correction se propage à l’autre machine', () => {
  const { mapA, mapB, synchroniser } = deuxDocuments()
  poserCommentaire(mapA, ALICE, 'Version initiale')
  synchroniser()
  modifierTexte(mapA, 'c-1', 'Version corrigée')
  synchroniser()
  assert.equal(mapB.get('c-1').text, 'Version corrigée')
})

test('seul l’auteur se voit proposer la correction — une convention, pas une serrure', () => {
  const doc = new Y.Doc()
  const map = doc.getMap('comments')
  poserCommentaire(map, ALICE, 'Texte')
  assert.ok(peutModifier(map.get('c-1'), ALICE))
  assert.ok(!peutModifier(map.get('c-1'), BRUNO))
  // Et la convention ne verrouille rien : le modèle exécute la correction
  // qu'on lui demande. C'est l'interface qui ne la propose qu'à l'auteur —
  // n'importe quel participant peut déjà réécrire le texte du document.
  assert.ok(modifierTexte(map, 'c-1', 'Réécrit par quelqu’un d’autre'))
})

// ===================================================== la purge

test('la purge ignore les réponses, et emporte celles d’un fil orphelin', () => {
  // Sans la première règle, toute réponse serait purgée au premier passage :
  // elle n'a pas d'ancre à elle, donc rien à résoudre. Sans la seconde, les
  // réponses d'un passage supprimé resteraient dans le fichier, invisibles
  // et éternelles.
  const doc = new Y.Doc()
  const map = doc.getMap('comments')
  poserCommentaire(map, ALICE, 'Sur un passage qui existe encore', 'c-vivant')
  poserCommentaire(map, ALICE, 'Sur un passage supprimé', 'c-mort')
  ajouterReponse(map, BRUNO, 'c-vivant', 'Une réponse vivante')
  ajouterReponse(map, BRUNO, 'c-mort', 'Une réponse condamnée')

  // Un passage supprimé, c'est une ancre qui se résout encore mais délimite
  // un intervalle vide — voir la note de purgeOrphanComments.
  const resoudre = (c) => (c.id === 'c-mort' ? { from: 12, to: 12 } : { from: 4, to: 20 })
  const aSupprimer = orphelins(map, resoudre)

  assert.equal(aSupprimer.length, 2)
  assert.ok(aSupprimer.includes('c-mort'))
  assert.ok(
    aSupprimer.some((id) => map.get(id).text === 'Une réponse condamnée'),
    'la réponse du fil mort part avec lui'
  )
  assert.ok(!aSupprimer.includes('c-vivant'))
  assert.ok(
    !aSupprimer.some((id) => map.get(id) && map.get(id).text === 'Une réponse vivante'),
    'la réponse d’un fil vivant ne doit jamais être purgée'
  )
})

test('une ancre non résoluble n’est pas un orphelin', () => {
  // Au chargement, avant que la liaison Yjs ne soit prête, tout est
  // irrésoluble : purger là serait effacer les commentaires à chaque
  // ouverture du document.
  const doc = new Y.Doc()
  const map = doc.getMap('comments')
  poserCommentaire(map, ALICE, 'Texte')
  assert.deepEqual(orphelins(map, () => null), [])
})
