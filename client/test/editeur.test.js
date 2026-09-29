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
import { editeur, doc, IA, schema } from './harness.js'
import { toggleMark, setBlockType, splitBlock } from 'prosemirror-commands'
import {
  insertAISuggestion,
  insertAIParagraphSuggestions,
  acceptAllChanges,
  rejectAllChanges,
  listChanges,
  getTextBlocksInRange,
  porteDesModifications,
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

// ================================================ le plan du document

test('le plan sait sous quel titre se trouve le curseur', async () => {
  const { indexSectionCourante, cheminVers } = await import('../src/outline.js')
  const titres = [
    { pos: 0, level: 1, text: 'Un' },
    { pos: 10, level: 2, text: 'Un.a' },
    { pos: 20, level: 3, text: 'Un.a.i' },
    { pos: 30, level: 1, text: 'Deux' },
  ]
  // Avant le premier titre : un document commence souvent par un
  // paragraphe, et ce n'est pas une anomalie.
  assert.equal(indexSectionCourante(titres, 0), 0)
  assert.equal(indexSectionCourante([{ pos: 5, level: 1, text: 'T' }], 2), -1)
  assert.equal(indexSectionCourante(titres, 15), 1)
  assert.equal(indexSectionCourante(titres, 25), 2)
  assert.equal(indexSectionCourante(titres, 999), 3)
})

test('le plan connaît le chemin qui mène au titre courant', () => {
  // Dans un plan à trois niveaux, savoir qu'on écrit sous « Un.a.i » ne
  // sert à rien si on ne voit pas que c'est dans « Un ».
  return import('../src/outline.js').then(({ cheminVers }) => {
    const titres = [
      { pos: 0, level: 1, text: 'Un' },
      { pos: 10, level: 2, text: 'Un.a' },
      { pos: 20, level: 3, text: 'Un.a.i' },
      { pos: 30, level: 1, text: 'Deux' },
    ]
    assert.deepEqual([...cheminVers(titres, 2)].sort(), [0, 1])
    assert.deepEqual([...cheminVers(titres, 3)], [], 'un titre de niveau 1 n’a pas d’ascendant')
    assert.deepEqual([...cheminVers(titres, -1)], [])
  })
})

// ============================ supprimer plusieurs blocs à la fois

test('supprimer un paragraphe et une citation ensemble les barre, sans rien perdre', () => {
  // Bug signalé par Sylvain le 19/09/2026. Pris séparément, chacun de ces
  // blocs se barrait correctement ; sélectionnés et supprimés ensemble, ils
  // disparaissaient sans laisser de trace — ProseMirror ne sachant pas
  // fusionner un paragraphe avec une citation, il produisait une forme de
  // transaction que la réécriture ne reconnaissait pas, et la suppression
  // passait alors hors suivi.
  const e = editeur(doc('premier', { citation: 'citation' }, 'dernier'))
  e.selection(3, 18).effacerAvant()
  assert.equal(e.texte(), 'premier\ncitation\ndernier', 'aucun texte ne doit disparaître')
  assert.equal(e.nbBlocs(), 3, 'les blocs restent distincts tant que rien n’est accepté')
  assert.deepEqual(e.marques(), ['-emier', '-citatio'])
  assert.equal(e.texteAccepte(), 'pr\nn\ndernier')
})

test('taper par-dessus une sélection qui couvre un paragraphe et une citation', () => {
  // Variante plus traître du même défaut : ProseMirror produit ici un
  // `replaceAround`, une forme que la réécriture ignorait tout autant.
  const e = editeur(doc('premier', { citation: 'citation' }))
  e.selection(3, 14).taper('X')
  assert.equal(e.texteAccepte(), 'prX\nation')
  assert.ok(
    e.marques().includes('+X'),
    'la frappe doit être marquée comme une insertion'
  )
  assert.ok(
    e.marques().some((m) => m === '-emier'),
    'le texte remplacé reste barré'
  )
})

test('supprimer plusieurs paragraphes ordinaires reste barré, pas fusionné', () => {
  const e = editeur(doc('premier', 'second', 'troisième'))
  e.selection(3, 16).effacerAvant()
  assert.equal(e.texte(), 'premier\nsecond\ntroisième')
  assert.equal(e.texteAccepte(), 'pr\n\ntroisième')
})

test('suivi désactivé, la suppression de plusieurs blocs efface pour de bon', () => {
  const e = editeur(doc('premier', { citation: 'citation' }, 'dernier'), { suivi: false })
  e.selection(3, 18).effacerAvant()
  assert.equal(e.texteAccepte(), 'prn\ndernier')
})

// ======================================================= l'IA et les remplacements

test('une correction de l’IA fait une carte « remplacement », pas deux', () => {
  // Signalé par Sylvain le 28/09/2026 : les marques posées par le diff de
  // l'IA n'avaient pas de groupe, donc jamais de pairage.
  const e = editeur(doc('Le chat dort sur le tapis rouge, devant la cheminée, pendant que la pluie tombe.'))
  insertAISuggestion(e.view, 1, finDoc(e), 'Le chat dort sur le tapis bleu, devant la cheminée, pendant que la pluie tombe.', IA)
  const liste = listChanges(e.doc)
  assert.equal(liste.length, 1, JSON.stringify(liste.map((c) => [c.type, c.text])))
  assert.equal(liste[0].type, 'remplacement')
  assert.equal(liste[0].ancien, 'rouge,')
  assert.equal(liste[0].nouveau, 'bleu,')
  // Le nouveau précède l'ancien barré, comme à la frappe.
  assert.ok(liste[0].insertion.to === liste[0].deletion.from)
  acceptAllChanges(e.view)
  assert.equal(e.texte(), 'Le chat dort sur le tapis bleu, devant la cheminée, pendant que la pluie tombe.')
  valide(e)
})

test('plusieurs mots corrigés : un remplacement par mot, et un ajout seul reste un ajout', () => {
  const origine = 'Le chat dort sur le tapis, devant la cheminée, pendant que la pluie tombe sur le toit.'
  const e = editeur(doc(origine))
  insertAISuggestion(e.view, 1, finDoc(e), 'Le chien dort sur le grand tapis, devant la cheminée, pendant que la pluie tombe sur le toit.', IA)
  const types = listChanges(e.doc).map((c) => c.type)
  assert.deepEqual(types, ['remplacement', 'insertion'], JSON.stringify(types))
  rejectAllChanges(e.view)
  assert.equal(e.texte(), origine)
})

test('une réécriture complète en un paragraphe est un remplacement, même à distance', () => {
  const e = editeur(doc('Le chat dort sur le tapis rouge.'))
  insertAISuggestion(e.view, 1, finDoc(e), 'Un félin sommeille sur le tapis écarlate.', IA)
  const liste = listChanges(e.doc)
  assert.equal(liste.length, 1)
  assert.equal(liste[0].type, 'remplacement')
  assert.equal(liste[0].nouveau, 'Un félin sommeille sur le tapis écarlate.')
  rejectAllChanges(e.view)
  assert.equal(e.nbBlocs(), 1)
  assert.equal(e.texte(), 'Le chat dort sur le tapis rouge.')
})

// ======================================================= le rapport du 28/09/2026

const BOB = { name: 'Bob', color: '#8a5a2b' }
const enGras = (e, from, to) => {
  e.suivi(false).selection(from, to)
  toggleMark(schema.marks.strong)(e.state, e.view.dispatch)
  e.suivi(true)
  return e
}
const aGras = (e, pos) => {
  const n = e.doc.nodeAt(pos)
  return !!(n && n.marks.some((m) => m.type.name === 'strong'))
}

test('D1 — en suivi, taper au milieu d’un mot en gras reste en gras', () => {
  const e = enGras(editeur(doc('Un mot.')), 4, 7)
  e.selection(5).taper('X')
  assert.ok(aGras(e, 5), 'le X a perdu le gras')
  assert.deepEqual(e.marques(), ['+X'])
  // Et hors d'un mot en gras, rien n'est ajouté.
  e.selection(1).taper('Y')
  assert.ok(!aGras(e, 1))
})

test('D2 — effacer l’insertion en attente d’un autre la barre, la sienne s’efface', () => {
  const e = editeur(doc('Le  dort.'))
  e.selection(4).taper('chat')
  const b = editeur(e.doc, { user: BOB })
  b.selection(4, 8).effacerAvant()
  assert.equal(b.texte(), 'Le chat dort.', 'le texte d’Alice est encore là, barré')
  const types = listChanges(b.doc).map((c) => `${c.type}:${c.user}`).sort()
  assert.deepEqual(types, ['deletion:Bob', 'insertion:Alice'])
  // Accepter tout : le texte disparaît ; rejeter tout : il reste (proposé).
  const a = editeur(b.doc)
  acceptAllChanges(a.view)
  assert.equal(a.texte(), 'Le  dort.')
  // Alice efface sa propre proposition : elle s'en va pour de bon.
  const e2 = editeur(doc('Le  dort.'))
  e2.selection(4).taper('chat')
  e2.selection(4, 8).effacerAvant()
  assert.equal(e2.texte(), 'Le  dort.')
  assert.equal(listChanges(e2.doc).length, 0)
})

test('D5 — une réécriture entière par l’IA garde la mise en forme du paragraphe', () => {
  const e = enGras(editeur(doc('Le chat dort sur le tapis rouge.')), 1, 32)
  insertAISuggestion(e.view, 1, finDoc(e), 'Un félin sommeille sur un tapis écarlate, tranquille.', IA)
  acceptAllChanges(e.view)
  assert.equal(e.texte(), 'Un félin sommeille sur un tapis écarlate, tranquille.')
  assert.ok(aGras(e, 1), 'le gras a disparu')
  // Diff fin : un mot remplacé au milieu d'un passage en gras reste en gras.
  const f = enGras(editeur(doc('Le chat dort sur le tapis rouge, devant la cheminée, pendant que la pluie tombe.')), 4, 8)
  insertAISuggestion(f.view, 1, finDoc(f), 'Le chien dort sur le tapis rouge, devant la cheminée, pendant que la pluie tombe.', IA)
  acceptAllChanges(f.view)
  assert.ok(aGras(f, 4), 'le mot inséré a perdu le gras du mot remplacé')
})

test('D7 — une réponse vide de l’IA ne fait rien', () => {
  const e = editeur(doc('Le chat dort.'))
  insertAISuggestion(e.view, 1, finDoc(e), '   ', IA)
  assert.equal(listChanges(e.doc).length, 0)
  assert.equal(e.texte(), 'Le chat dort.')
})

test('D8 — un mot changé dans une phrase courte n’est pas une réécriture entière', () => {
  const e = editeur(doc('Le chat dort sur le tapis rouge.'))
  insertAISuggestion(e.view, 1, finDoc(e), 'Le chat dort sur le tapis bleu.', IA)
  assert.equal(e.nbBlocs(), 1, 'pas de second paragraphe')
  const l = listChanges(e.doc)
  assert.equal(l.length, 1)
  assert.equal(l[0].type, 'remplacement')
  assert.equal(l[0].ancien, 'rouge.')
  // Quatre mots changés sur cinq : là, oui.
  const f = editeur(doc('Le chat dort ici.'))
  insertAISuggestion(f.view, 1, finDoc(f), 'Un chien court ailleurs.', IA)
  assert.equal(f.nbBlocs(), 2)
})

test('S1 — ce que le suivi ne sait pas suivre est refusé à un correcteur, pas à un éditeur', () => {
  const refus = []
  const corr = editeur(doc('Un deux.'), { libre: false, surRefus: () => refus.push(1) })
  // Mettre en gras : hors suivi → refusé, le document ne bouge pas.
  corr.selection(1, 3)
  toggleMark(schema.marks.strong)(corr.state, corr.view.dispatch)
  assert.equal(refus.length, 1)
  assert.ok(!aGras(corr, 1))
  // Changer le paragraphe en titre : refusé aussi.
  corr.selection(2)
  setBlockType(schema.nodes.heading, { level: 1 })(corr.state, corr.view.dispatch)
  assert.equal(refus.length, 2)
  assert.equal(corr.doc.child(0).type.name, 'paragraph')
  // Mais taper, effacer, couper un paragraphe (Entrée) : suivis, donc permis.
  corr.selection(3).taper('X')
  splitBlock(corr.state, corr.view.dispatch)
  assert.equal(refus.length, 2)
  assert.equal(corr.nbBlocs(), 2)
  // Un éditeur en suivi : le gras passe, hors suivi, comme avant.
  const ed = editeur(doc('Un deux.'), { surRefus: () => refus.push(1) })
  ed.selection(1, 3)
  toggleMark(schema.marks.strong)(ed.state, ed.view.dispatch)
  assert.equal(refus.length, 2)
  assert.ok(aGras(ed, 1))
})

test('S3 — l’IA ne travaille pas sur un passage qui porte des modifications en attente', () => {
  const e = editeur(doc('Le chat dort sur le tapis rouge.'))
  assert.equal(porteDesModifications(e.doc, 1, finDoc(e)), false)
  e.selection(4, 8).taper('chien')
  assert.equal(porteDesModifications(e.doc, 1, finDoc(e)), true)
  assert.equal(porteDesModifications(e.doc, 15, finDoc(e)), false, 'ailleurs dans le paragraphe, rien')
  acceptAllChanges(e.view)
  assert.equal(porteDesModifications(e.doc, 1, finDoc(e)), false)
})

// ======================================================= S6 : les scénarios qui tenaient

/** Accepter tout doit donner `attendu`, rejeter tout doit rendre `origine`. */
function allerRetour(fabrique, attendu, origine) {
  const a = fabrique()
  acceptAllChanges(a.view)
  valide(a)
  assert.equal(a.texte(), attendu, 'après acceptation')
  const r = fabrique()
  rejectAllChanges(r.view)
  valide(r)
  assert.equal(r.texte(), origine, 'après rejet')
  assert.equal(listChanges(r.doc).length, 0)
}

test('S6 — effacer ou remplacer du texte déjà barré ne le fait jamais disparaître', () => {
  const e = editeur(doc('Le chat dort.'))
  e.selection(4, 8).effacerAvant()
  e.selection(4, 8).effacerAvant()
  assert.equal(e.texte(), 'Le chat dort.')
  assert.equal(e.texteAccepte(), 'Le  dort.')
  e.selection(4, 8).taper('chien')
  assert.ok(e.texte().includes('chat'))
  assert.equal(e.texteAccepte(), 'Le chien dort.')
  // Une sélection qui mêle du barré et du normal, puis une frappe.
  const f = editeur(doc('Le chat dort.'))
  f.selection(4, 8).effacerAvant()
  f.selection(4, 13).taper('X')
  assert.equal(f.texteAccepte(), 'Le X.')
  assert.ok(f.texte().includes('chat') && f.texte().includes('dort'))
})

test('S6 — deux auteurs se relaient sur le même mot, chacun garde sa trace', () => {
  const x = editeur(doc('Le chat dort.'))
  x.selection(4, 8).taper('chien')
  const b = editeur(x.doc, { user: BOB })
  b.selection(4, 9).taper('tigre')
  valide(b)
  assert.equal(b.texteAccepte(), 'Le tigre dort.')
  assert.ok(b.texte().includes('chat'), 'le premier mot est toujours là, barré')
})

test('S6 — hors suivi, taper juste après un passage barré n’hérite pas du barré', () => {
  const x = editeur(doc('Le chat dort.'))
  x.selection(4, 8).effacerAvant()
  x.suivi(false).selection(8).taper('X')
  const n = x.doc.nodeAt(8)
  assert.ok(n && !n.marks.some((m) => m.type.name === 'deletion'))
})

test('S6 — une sélection sur deux paragraphes, effacée ou remplacée, va et revient', () => {
  allerRetour(() => { const x = editeur(doc('Premier.', 'Second.')); x.selection(4, 15).effacerAvant(); return x }, 'Pre\nnd.', 'Premier.\nSecond.')
  allerRetour(() => { const x = editeur(doc('Premier.', 'Second.')); x.selection(4, 15).taper('X'); return x }, 'PreX\nnd.', 'Premier.\nSecond.')
})

test('S6 — l’IA : sélection partielle, deux paragraphes pour deux, titre, liste, insécables', () => {
  allerRetour(() => { const x = editeur(doc('Le chat dort sur le tapis.')); insertAISuggestion(x.view, 4, 13, 'chien court', IA); return x }, 'Le chien court sur le tapis.', 'Le chat dort sur le tapis.')
  allerRetour(() => { const x = editeur(doc('Le chat dort.', 'Le chien court.')); insertAISuggestion(x.view, 1, x.doc.content.size - 1, 'Le chat ronfle.\nLe chien galope.', IA); return x }, 'Le chat ronfle.\nLe chien galope.', 'Le chat dort.\nLe chien court.')
  allerRetour(() => { const x = editeur(doc({ h: 1, texte: 'Titre' }, 'Texte.')); insertAISuggestion(x.view, 1, x.doc.content.size - 1, 'Grand titre\nTexte long.', IA); return x }, 'Grand titre\nTexte long.', 'Titre\nTexte.')
  allerRetour(() => { const x = editeur(doc('Il a dit : bonjour.')); insertAISuggestion(x.view, 1, 20, 'Il a dit : « bonjour ».', IA); return x }, 'Il a dit : « bonjour ».', 'Il a dit : bonjour.')
  const liste = schema.node('doc', null, [schema.node('bullet_list', null, [schema.node('list_item', null, [schema.node('paragraph', null, [schema.text('Le chat dort sur le tapis rouge.')])])])])
  const x = editeur(liste)
  insertAISuggestion(x.view, 3, 35, 'Le chat dort sur le tapis bleu.', IA)
  valide(x)
  acceptAllChanges(x.view)
  assert.equal(x.doc.textContent, 'Le chat dort sur le tapis bleu.')
  // Une réponse identique ne fait rien.
  const y = editeur(doc('Le chat dort.'))
  insertAISuggestion(y.view, 1, 14, 'Le chat dort.', IA)
  assert.equal(listChanges(y.doc).length, 0)
})

// ================================ l’IA face aux notes et aux sauts de ligne
//
// 30/09/2026 (signalé par Sylvain : des paragraphes « remplacés par un
// paragraphe tronqué »). Une note ou un saut de ligne dans le paragraphe
// partait vers l'IA collé au texte, sans repère ; le modèle « corrigeait »
// ce bruit, le diff basculait en réécriture entière et la note disparaissait.
// Désormais : `\n` pour un saut, ⟦n⟧ pour une note ou une image, un diff qui
// ne touche jamais aux atomes, et des positions justes après eux.

const pNoeuds = (...contenu) => schema.node('paragraph', null, contenu)
const noteDe = (texte) => schema.node('footnote', { suivi: null }, [schema.text(texte)])
const sautDeLigne = () => schema.node('hard_break')
/** Le texte d'un paragraphe avec ⟦⟧ à la place de chaque note et `\n` pour
 * un saut de ligne — sans descendre dans les notes. */
function lecture(p) {
  let t = ''
  p.forEach((n) => {
    if (n.isText) t += n.text
    else if (n.type.name === 'footnote') t += '⟦⟧'
    else if (n.type.name === 'hard_break') t += '\n'
  })
  return t
}

test('l’IA reçoit un repère à la place d’une note, et un saut de ligne comme tel', () => {
  const d = schema.node('doc', null, [
    pNoeuds(schema.text('La ville se transforme'), noteDe('Voir Grisot, 2020.'), schema.text(' lentement.'), sautDeLigne(), schema.text('Seconde ligne.')),
  ])
  const e = editeur(d)
  const [bloc] = getTextBlocksInRange(e.view.state.doc, 1, d.content.size - 1)
  assert.equal(bloc.text, 'La ville se transforme⟦1⟧ lentement.\nSeconde ligne.')
  assert.equal(bloc.texteDiff, 'La ville se transforme lentement.\nSeconde ligne.')
  assert.equal(bloc.atomes, 2)
  // Les positions : après la note (20 positions pour 18 caractères + 2
  // bornes), « lentement » commence 20 positions plus loin que la fin de
  // « transforme », pas 0.
  assert.equal(bloc.posDe(0), 1)
  assert.equal(bloc.posDe('La ville se transforme'.length), 1 + 'La ville se transforme'.length, 'la borne va à la tranche d’avant la note')
  assert.equal(bloc.posDe('La ville se transforme'.length + 1), 1 + 'La ville se transforme'.length + 20 + 1)
})

test('une correction à côté d’une note ne touche que le mot fautif, et la note reste', () => {
  const d = schema.node('doc', null, [
    pNoeuds(schema.text('La ville se tranforme'), noteDe('Voir Grisot, 2020.'), schema.text(' lentement, et les habitans suivent.')),
  ])
  const e = editeur(d)
  // Le modèle a gardé le repère : deux corrections, de part et d'autre.
  insertAISuggestion(e.view, 1, d.content.size - 1, 'La ville se transforme⟦1⟧ lentement, et les habitants suivent.', IA)
  assert.equal(e.nbBlocs(), 1, 'pas de réécriture entière')
  const notes = []
  e.view.state.doc.descendants((n) => {
    if (n.type.name === 'footnote') notes.push(n)
  })
  assert.equal(notes.length, 1, 'la note est toujours là')
  assert.equal(notes[0].marks.length, 0, 'et ne porte aucune marque')
  acceptAllChanges(e.view)
  assert.equal(lecture(e.view.state.doc.firstChild), 'La ville se transforme⟦⟧ lentement, et les habitants suivent.')
  valide(e)
})

test('si le modèle perd le repère, la note reste où elle était', () => {
  const d = schema.node('doc', null, [pNoeuds(schema.text('Un texte'), noteDe('La note.'), schema.text(' avec une fote.'))])
  const e = editeur(d)
  insertAISuggestion(e.view, 1, d.content.size - 1, 'Un texte avec une faute.', IA)
  acceptAllChanges(e.view)
  assert.equal(lecture(e.view.state.doc.firstChild), 'Un texte⟦⟧ avec une faute.')
  valide(e)
})

test('un paragraphe avec une note n’est jamais barré d’un bloc, même très réécrit', () => {
  const d = schema.node('doc', null, [pNoeuds(schema.text('Le chat dort sur le tapis rouge.'), noteDe('Note.'))])
  const e = editeur(d)
  insertAISuggestion(e.view, 1, d.content.size - 1, 'Un félin sommeille sur le tapis écarlate.⟦1⟧', IA)
  assert.equal(e.nbBlocs(), 1)
  acceptAllChanges(e.view)
  assert.equal(lecture(e.view.state.doc.firstChild), 'Un félin sommeille sur le tapis écarlate.⟦⟧', 'la note a survécu à la réécriture')
  valide(e)
})

test('les mots de deux lignes ne sont plus soudés, et le saut de ligne n’est jamais marqué', () => {
  const d = schema.node('doc', null, [pNoeuds(schema.text('Première ligne'), sautDeLigne(), schema.text('seconde ligne avec chomage.'))])
  const e = editeur(d)
  const [bloc] = getTextBlocksInRange(e.view.state.doc, 1, d.content.size - 1)
  assert.equal(bloc.text, 'Première ligne\nseconde ligne avec chomage.')
  // Le modèle a remplacé le saut par une espace et corrigé l'accent : seul
  // l'accent est marqué.
  insertAISuggestion(e.view, 1, d.content.size - 1, 'Première ligne seconde ligne avec chômage.', IA)
  assert.equal(e.nbBlocs(), 1)
  const p = e.view.state.doc.firstChild
  assert.equal(p.child(1).type.name, 'hard_break')
  assert.equal(p.child(1).marks.length, 0)
  let marques = 0
  p.descendants((n) => {
    if (n.isText && n.marks.some((m) => m.type.name === 'insertion' || m.type.name === 'deletion')) marques += n.text.length
  })
  assert.equal(marques, 2, 'o barré, ô ajouté — rien d’autre')
  acceptAllChanges(e.view)
  assert.equal(lecture(e.view.state.doc.firstChild), 'Première ligne\nseconde ligne avec chômage.')
  valide(e)
})

test('plusieurs paragraphes, dont un avec note : chacun est corrigé chez lui', () => {
  const d = schema.node('doc', null, [
    pNoeuds(schema.text('Premier paragraphe avec une fote.')),
    pNoeuds(schema.text('Deuxième'), noteDe('N.'), schema.text(' paragraphe, sans faute.')),
    pNoeuds(schema.text('Troisieme paragraphe.')),
  ])
  const e = editeur(d)
  const blocs = getTextBlocksInRange(e.view.state.doc, 1, d.content.size - 1)
  assert.deepEqual(blocs.map((b) => b.text), ['Premier paragraphe avec une fote.', 'Deuxième⟦1⟧ paragraphe, sans faute.', 'Troisieme paragraphe.'])
  insertAIParagraphSuggestions(e.view, blocs, ['Premier paragraphe avec une faute.', 'Deuxième⟦1⟧ paragraphe, sans faute.', 'Troisième paragraphe.'], IA)
  acceptAllChanges(e.view)
  assert.equal(e.nbBlocs(), 3)
  assert.equal(e.view.state.doc.child(1).child(1).type.name, 'footnote')
  assert.equal(e.view.state.doc.child(2).textContent, 'Troisième paragraphe.')
  valide(e)
})
