// Batterie de l'éditeur (17/09/2026) — le comportement ressenti à la
// frappe, et ce que produisent les suggestions de l'IA.
//
// Deux symptômes signalés par Sylvain sont à l'origine de ce fichier :
// des sauts de ligne en trop après une proposition de l'IA, et un texte
// sélectionné qui « ne s'efface pas proprement » quand on tape par-dessus.
// Les deux se reproduisent ici sans navigateur, et les tests qui suivent
// sont écrits pour qu'ils ne reviennent pas.
//
// Trois invariants guident l'ensemble :
//
//   1. **Ce qu'on tape se comporte comme ce qu'on taperait sans suivi.**
//      Le suivi change la forme du texte, jamais le geste : le curseur
//      finit après ce qu'on vient d'écrire, et rien ne reste sélectionné
//      derrière.
//   2. **Accepter, c'est obtenir le texte proposé — exactement.** Pas un
//      paragraphe vide de plus, pas un saut de ligne en rab.
//   3. **Rejeter, c'est revenir au texte de départ — exactement.**
//
// Ce que ce banc ne couvre pas : le rendu à l'écran, la composition (IME,
// dictée vocale), le collage réel (évènement du navigateur) et la
// synchronisation Yjs entre deux clients.

import test from 'node:test'
import assert from 'node:assert/strict'
import { editeur, doc, IA } from './harness.js'
import {
  insertAISuggestion,
  insertAIParagraphSuggestions,
  acceptAllChanges,
  rejectAllChanges,
  listChanges,
  getTextBlocksInRange,
} from '../src/trackChanges.js'

/** Le document est-il structurellement valide ? `check()` lève si un nœud
 * texte contient un saut de ligne, si un bloc a un contenu interdit, etc. */
function valide(e) {
  e.doc.check()
}

/** Toute l'étendue du texte d'un document à un seul bloc. */
const finDoc = (e) => e.doc.content.size - 1

// ======================================================= frappe et sélection

test('taper par-dessus une sélection : le curseur suit ce qu’on écrit', () => {
  const e = editeur(doc('Le chat dort.'))
  e.selection(4, 8).taper('chien')

  // Le texte remplacé est barré, pas retiré — c'est le suivi.
  assert.equal(e.texte(), 'Le chienchat dort.')
  // Mais ce qu'on lira une fois accepté est bien ce qu'on a tapé.
  assert.equal(e.texteAccepte(), 'Le chien dort.')
  // Et surtout : plus rien n'est sélectionné, le curseur est après « chien ».
  assert.ok(e.state.selection.empty, 'le mot remplacé est resté sélectionné')
  assert.equal(e.state.selection.from, 9)
  valide(e)
})

test('continuer à taper poursuit le mot au lieu de l’entrelacer', () => {
  // Le vrai symptôme : sans curseur repositionné, chaque frappe repartait
  // du texte barré et les lettres s'intercalaient (« cchhiaetn »).
  const e = editeur(doc('Le chat dort.'))
  e.selection(4, 8).taper('chien').taper(' noir')
  assert.equal(e.texteAccepte(), 'Le chien noir dort.')
  valide(e)
})

test('remplacer d’un coup (collage simple) donne le même résultat que frapper', () => {
  const frappe = editeur(doc('Le chat dort.')).selection(4, 8).taper('chien')
  const colle = editeur(doc('Le chat dort.')).selection(4, 8).remplacer('chien')
  assert.equal(colle.texteAccepte(), frappe.texteAccepte())
  assert.ok(colle.state.selection.empty)
})

test('effacer une sélection la barre et pose le curseur avant', () => {
  const e = editeur(doc('Le chat dort.'))
  e.selection(4, 8).effacerAvant()
  assert.equal(e.texte(), 'Le chat dort.', 'le texte barré doit rester en place')
  assert.equal(e.texteAccepte(), 'Le  dort.')
  assert.ok(e.state.selection.empty)
  assert.equal(e.state.selection.from, 4)
})

test('effacer puis taper donne exactement ce que taper par-dessus donne', () => {
  // Deux chemins pour le même geste : ils doivent produire le même
  // document, dans le même ordre à l'écran. Sinon l'un des deux passe pour
  // un bug — et c'est celui qu'on a sous les yeux.
  const efface = editeur(doc('Le chat dort.')).selection(4, 8).effacerAvant().taper('chien')
  const remplace = editeur(doc('Le chat dort.')).selection(4, 8).taper('chien')
  assert.equal(efface.texte(), remplace.texte())
  assert.equal(efface.texteAccepte(), 'Le chien dort.')
})

// ============================================== retour arrière, à répétition

test('appuyer plusieurs fois sur retour arrière efface plusieurs caractères', () => {
  // Le vrai défaut, et le plus grave de la journée : le curseur restait
  // contre le passage barré, chaque frappe visait le même caractère, la
  // transaction réécrite était vide — et l'appelant appliquait alors la
  // suppression d'origine. **Un retour arrière sur deux supprimait le
  // texte barré pour de bon**, sans laisser de trace, y compris pour un
  // correcteur qui n'est censé rien pouvoir retirer.
  const e = editeur(doc('Le chat dort.'))
  e.selection(9)
  for (let i = 0; i < 5; i++) e.effacerAvant()
  assert.equal(e.texte(), 'Le chat dort.', 'aucun caractère ne doit disparaître du document')
  assert.equal(e.texteAccepte(), 'Le dort.', 'cinq frappes doivent barrer cinq caractères')
  // Volontairement pas `marques().length === 1` : chaque marque porte son
  // horodatage, donc deux frappes séparées par un changement de
  // milliseconde produisent deux marques distinctes plutôt qu'une. Le test
  // échouait une fois sur trois — une **assertion** fausse, pas un
  // comportement faux. Ce qui compte est qu'aucune ne soit une insertion.
  assert.ok(
    e.marques().every((m) => m.startsWith('-')),
    'effacer ne doit produire que des suppressions'
  )
})

test('la suppression avant saute elle aussi ce qui est déjà barré', () => {
  const e = editeur(doc('Le chat dort.'))
  e.selection(4)
  for (let i = 0; i < 4; i++) e.effacerApres()
  assert.equal(e.texte(), 'Le chat dort.')
  assert.equal(e.texteAccepte(), 'Le  dort.')
})

test('retour arrière puis suppression avant se suivent sans se marcher dessus', () => {
  const e = editeur(doc('Le chat dort.'))
  e.selection(9).effacerAvant().effacerApres()
  assert.equal(e.texte(), 'Le chat dort.')
  assert.equal(e.texteAccepte(), 'Le chatort.', 'chacune doit mordre sur un caractère vivant')
})

test('effacer tout un bloc ne supprime jamais rien pour de bon', () => {
  const e = editeur(doc('abc'))
  e.selection(4)
  // Plus de frappes que de caractères : les deux dernières n'ont plus rien
  // à barrer, et ne doivent surtout pas se rabattre sur la suppression
  // d'origine.
  for (let i = 0; i < 6; i++) e.effacerAvant()
  assert.equal(e.texte(), 'abc')
  assert.equal(e.texteAccepte(), '')
  valide(e)
})

test('en début de paragraphe, le retour arrière fusionne les deux blocs', () => {
  // Ce n'est pas un effacement de texte mais une opération de structure :
  // elle reste hors suivi, et c'est baseKeymap qui la fait. Le réécrivain
  // s'en était emparé un temps — il ne trouvait rien à barrer dans le bloc
  // précédent et se contentait de déplacer le curseur : la touche n'avait
  // plus aucun effet (signalé le 17/09).
  const e = editeur(doc('Un.', 'Deux.'))
  e.selection(6).effacerAvant()
  assert.equal(e.nbBlocs(), 1)
  assert.equal(e.texte(), 'Un.Deux.')
  valide(e)
})

test('après la fusion, le retour arrière suivant barre normalement', () => {
  const e = editeur(doc('Un.', 'Deux.'))
  e.selection(6).effacerAvant().effacerAvant()
  assert.equal(e.nbBlocs(), 1)
  assert.equal(e.texte(), 'Un.Deux.', 'rien ne doit disparaître')
  assert.equal(e.texteAccepte(), 'UnDeux.')
})

test('la touche maintenue enfoncée n’insère rien', () => {
  // Vingt frappes d'affilée : c'est le cas qui faisait apparaître une
  // espace parasite avant le mot, quand le navigateur effaçait lui-même et
  // qu'on réécrivait après coup la transaction qu'il en déduisait. Depuis
  // que la touche est interceptée, rien n'est déduit du DOM.
  const e = editeur(doc('Le chat dort.'))
  e.selection(9)
  for (let i = 0; i < 20; i++) e.effacerAvant()
  assert.equal(e.texte(), 'Le chat dort.', 'aucun caractère ajouté ni retiré')
  assert.equal(e.texteAccepte(), 'dort.')
  assert.ok(
    !e.marques().some((m) => m.startsWith('+')),
    'effacer ne doit jamais produire d’insertion'
  )
})

test('sans suivi, le retour arrière efface pour de bon', () => {
  const e = editeur(doc('Le chat dort.'), { suivi: false })
  e.selection(9).effacerAvant().effacerAvant()
  assert.equal(e.texte(), 'Le chadort.')
  assert.equal(e.marques().length, 0)
})

test('effacer ce qu’on vient de taper le retire vraiment', () => {
  const e = editeur(doc('Le chat dort.'))
  e.selection(9).taper('XYZ')
  assert.equal(e.texteAccepte(), 'Le chat XYZdort.')
  e.effacerAvant().effacerAvant()
  assert.equal(e.texteAccepte(), 'Le chat Xdort.', 'une insertion en attente disparaît, elle ne se barre pas')
  assert.ok(!e.marques().some((m) => m.startsWith('-')))
  // Une frappe de plus mord sur le texte d'origine, qui lui se barre.
  e.effacerAvant().effacerAvant()
  assert.equal(e.texte(), 'Le chat dort.')
  assert.equal(e.texteAccepte(), 'Le chatdort.')
})

test('sans suivi, remplacer efface vraiment', () => {
  const e = editeur(doc('Le chat dort.'), { suivi: false })
  e.selection(4, 8).taper('chien')
  assert.equal(e.texte(), 'Le chien dort.')
  assert.equal(e.marques().length, 0, 'aucune marque ne doit apparaître sans suivi')
  assert.ok(e.state.selection.empty)
})

test('réécrire ce qu’on vient d’écrire ne laisse pas de barré', () => {
  // Une insertion encore en attente n'est pas « supprimée » quand on
  // repasse dessus : elle disparaît réellement, sinon on accumulerait du
  // texte barré que personne n'a jamais lu.
  const e = editeur(doc('Le  dort.'))
  e.selection(4).taper('chien')
  assert.equal(e.texteAccepte(), 'Le chien dort.')
  const avant = e.marques().length
  e.selection(4, 9).taper('chat')
  assert.equal(e.texteAccepte(), 'Le chat dort.')
  assert.ok(
    !e.marques().some((m) => m.startsWith('-')),
    'du texte jamais accepté ne doit pas ressortir barré'
  )
  assert.ok(avant > 0)
  valide(e)
})

test('taper au milieu, en début et en fin de paragraphe', () => {
  for (const [pos, attendu] of [
    [1, 'XLe chat dort.'],
    [8, 'Le chatX dort.'],
    [14, 'Le chat dort.X'],
  ]) {
    const e = editeur(doc('Le chat dort.'))
    e.selection(pos).taper('X')
    assert.equal(e.texteAccepte(), attendu, `frappe à la position ${pos}`)
    assert.ok(e.state.selection.empty)
  }
})

// ============================================================ sauts de ligne

test('Entrée coupe le paragraphe et marque le saut comme proposition', () => {
  const e = editeur(doc('Le chat dort.'))
  const { view } = e
  view.dispatch(view.state.tr.split(8))
  assert.equal(e.nbBlocs(), 2)
  assert.equal(e.sautsEnAttente(), 1)
  valide(e)
})

test('rejeter un saut de paragraphe recolle les deux blocs', () => {
  const e = editeur(doc('Le chat dort.'))
  e.view.dispatch(e.view.state.tr.split(8))
  rejectAllChanges(e.view)
  assert.equal(e.nbBlocs(), 1)
  assert.equal(e.texte(), 'Le chat dort.')
  assert.equal(e.sautsEnAttente(), 0)
})

test('accepter un saut de paragraphe le garde, sans marqueur', () => {
  const e = editeur(doc('Le chat dort.'))
  e.view.dispatch(e.view.state.tr.split(8))
  acceptAllChanges(e.view)
  assert.equal(e.nbBlocs(), 2)
  assert.equal(e.sautsEnAttente(), 0)
})

// ==================================================== suggestions de l’IA

test('une petite correction ne marque que ce qui change', () => {
  const e = editeur(doc('Le chomage est stable.'))
  insertAISuggestion(e.view, 1, finDoc(e), 'Le chômage est stable.', IA)
  assert.equal(e.nbBlocs(), 1, 'une correction de lettre ne crée pas de paragraphe')
  acceptAllChanges(e.view)
  assert.equal(e.texte(), 'Le chômage est stable.')
  valide(e)
})

test('une réécriture complète ne laisse aucun paragraphe vide', () => {
  // Le symptôme signalé : à l'acceptation, l'ancien paragraphe vidé restait
  // là en tant que bloc vide — un saut de ligne en trop par paragraphe
  // réécrit.
  const e = editeur(doc('Le chat dort sur le tapis rouge.'))
  insertAISuggestion(e.view, 1, finDoc(e), 'Un félin sommeille sur le tapis écarlate.', IA)
  assert.equal(e.nbBlocs(), 2, 'la proposition s’affiche sous l’ancien paragraphe')
  acceptAllChanges(e.view)
  assert.equal(e.nbBlocs(), 1)
  assert.equal(e.texte(), 'Un félin sommeille sur le tapis écarlate.')
  valide(e)
})

test('rejeter une réécriture complète rend le texte d’origine intact', () => {
  const origine = 'Le chat dort sur le tapis rouge.'
  const e = editeur(doc(origine))
  insertAISuggestion(e.view, 1, finDoc(e), 'Un félin sommeille sur le tapis écarlate.', IA)
  rejectAllChanges(e.view)
  assert.equal(e.nbBlocs(), 1)
  assert.equal(e.texte(), origine)
  assert.equal(listChanges(e.doc).length, 0)
})

test('deux paragraphes réécrits restent deux paragraphes', () => {
  const e = editeur(doc('Le chat dort sur le tapis rouge.', 'Le chien court dans le jardin.'))
  insertAISuggestion(
    e.view,
    1,
    e.doc.content.size - 1,
    'Un félin sommeille sur le tapis écarlate.\nUn canidé galope dans le jardin.',
    IA
  )
  acceptAllChanges(e.view)
  assert.equal(e.nbBlocs(), 2)
  assert.equal(e.texte(), 'Un félin sommeille sur le tapis écarlate.\nUn canidé galope dans le jardin.')
  valide(e)
})

test('un paragraphe coupé en deux par l’IA donne deux vrais paragraphes', () => {
  // Un nœud texte ProseMirror ne contient pas de saut de ligne : la
  // suggestion était insérée telle quelle, « \n » compris, et la coupure
  // n'apparaissait nulle part.
  const e = editeur(doc('Le chat dort. Le chien court.'))
  insertAISuggestion(e.view, 1, finDoc(e), 'Le chat sommeille.\nLe chien galope.', IA)
  valide(e)
  acceptAllChanges(e.view)
  assert.equal(e.nbBlocs(), 2)
  assert.equal(e.texte(), 'Le chat sommeille.\nLe chien galope.')
})

test('deux paragraphes fondus en un ne laissent pas de bloc vide', () => {
  const e = editeur(doc('Le chat dort.', 'Le chien court.'))
  insertAISuggestion(e.view, 1, e.doc.content.size - 1, 'Le chat dort et le chien court.', IA)
  acceptAllChanges(e.view)
  assert.equal(e.nbBlocs(), 1)
  assert.equal(e.texte(), 'Le chat dort et le chien court.')
  valide(e)
})

test('un titre réécrit reste un titre', () => {
  const e = editeur(doc({ h: 2, texte: 'Les chiffres du chomage' }))
  insertAISuggestion(e.view, 1, finDoc(e), 'Les chiffres du chômage en 2026', IA)
  acceptAllChanges(e.view)
  assert.equal(e.nbBlocs(), 1)
  assert.equal(e.doc.child(0).type.name, 'heading')
  assert.equal(e.doc.child(0).attrs.level, 2)
  assert.equal(e.texte(), 'Les chiffres du chômage en 2026')
})

test('un paragraphe par requête : celui qui échoue reste intact', () => {
  const e = editeur(doc('Le chat dort sur le tapis rouge.', 'Le chien court dans le jardin.'))
  const blocs = getTextBlocksInRange(e.doc, 1, e.doc.content.size - 1)
  insertAIParagraphSuggestions(e.view, blocs, ['Un félin sommeille sur le tapis écarlate.', null], IA)
  acceptAllChanges(e.view)
  assert.equal(e.nbBlocs(), 2)
  assert.equal(e.texte(), 'Un félin sommeille sur le tapis écarlate.\nLe chien court dans le jardin.')
})

test('une suggestion identique au texte ne change rien', () => {
  const e = editeur(doc('Le chat dort.'))
  insertAISuggestion(e.view, 1, finDoc(e), 'Le chat dort.', IA)
  assert.equal(e.nbBlocs(), 1)
  assert.equal(listChanges(e.doc).length, 0)
})

test('une suggestion vide ne fabrique pas de paragraphe vide', () => {
  const e = editeur(doc('Le chat dort.', 'Le chien court.'))
  insertAISuggestion(e.view, 1, e.doc.content.size - 1, '', IA)
  acceptAllChanges(e.view)
  assert.ok(e.nbBlocs() >= 1)
  assert.ok(
    !e.texte().split('\n').some((l, i, t) => l === '' && t.length > 1),
    'aucun bloc vide ne doit subsister'
  )
  valide(e)
})

// ================================================= l’un après l’autre

test('une suggestion sur du texte déjà retouché à la main tient debout', () => {
  const e = editeur(doc('Le chat dort sur le tapis rouge.'))
  e.selection(4, 8).taper('félin') // correction manuelle, en attente
  insertAISuggestion(e.view, 1, finDoc(e), 'Le félin sommeille sur le tapis écarlate.', IA)
  valide(e)
  acceptAllChanges(e.view)
  assert.ok(e.doc.childCount >= 1)
  assert.ok(!e.texte().includes('\n\n'))
  valide(e)
})

test('tout accepter puis tout rejeter ne laisse aucune trace', () => {
  const e = editeur(doc('Le chat dort.', 'Le chien court.'))
  e.selection(4, 8).taper('félin')
  e.view.dispatch(e.view.state.tr.split(10))
  acceptAllChanges(e.view)
  assert.equal(listChanges(e.doc).length, 0)
  assert.equal(e.marques().length, 0)
  assert.equal(e.sautsEnAttente(), 0)
  valide(e)
})
