// Suivi des modifications — les suggestions de l'IA : traduire une réécriture (mot à mot ou paragraphe entier) en marques de suivi.
// (Découpé de l'ancien `trackChanges.js`, 1 630 lignes — audit du 10/10/2026, C11.
// `../trackChanges.js` réexporte tout : aucun import à changer.)

import { diffWords } from '../diff.js'
import { idDeGroupe } from './etat.js'
import { MARQUES_MISE_EN_FORME } from './reecriture.js'

/**
 * Above this fraction of a (fully-selected) paragraph's characters being
 * touched, a word/letter-level diff stops helping and starts reading as a
 * patchwork of unrelated marks. Past this point we switch strategy: mark
 * the whole old paragraph as one deletion and add the new text as a whole
 * new paragraph right below it — "swap this paragraph for this one",
 * clearly readable, instead of "here are thirty scattered edits". 0.3 is a
 * starting point (a straight reformulation of a sentence or two tends to
 * land well past it, a handful of word-level corrections stays well under
 * it) — easy to tune if it feels off in practice.
 */
const BIG_REWRITE_RATIO = 0.3
/** …et au moins autant de mots touchés (ajoutés ou retirés). */
const BIG_REWRITE_MIN_MOTS = 4

/** Le nombre de mots que les opérations d'un diff ajoutent ou retirent. */
function motsChanges(ops) {
  let n = 0
  for (const op of ops) {
    if (op.type === 'equal') continue
    n += op.text.split(/\s+/).filter(Boolean).length
  }
  return n
}

/** Rejoue un diff mot à mot dans `tr` sous forme de marques d'insertion
 * et de suppression. Les positions viennent de la **table du bloc**
 * (`block.posDe`, `block.plagesDe` — voir getTextBlocksInRange) et non d'un
 * simple décompte de caractères : un saut de ligne ou une note dans le
 * paragraphe occupe des positions que le texte ne compte pas, et avant le
 * 30/09/2026 toutes les marques qui suivaient étaient décalées d'autant.
 * Les atomes (sauts de ligne, notes, images) ne sont jamais touchés : une
 * suppression qui les enjambe est posée de part et d'autre. Modifie `tr` ;
 * renvoie vrai si quelque chose a changé. */
function replayDiffOps(tr, schema, block, ops, insMark, delMark, authorMark) {
  let index = 0
  let changed = false
  const insererTexte = (pos, texte, marque) => {
    // Un nœud texte ProseMirror ne contient pas de saut de ligne : au
    // niveau d'un diff fin (quelques mots), un saut venu de la
    // suggestion se lit comme une espace. Le mot inséré prend la mise en
    // forme du texte qu'il remplace ou qui le précède (29/09/2026).
    const propre = texte.replace(/[\r\n]+/g, ' ')
    if (!propre) return
    const miseEnForme = marquesDuDebut(tr.doc, pos).length ? marquesDuDebut(tr.doc, pos) : marquesAvant(tr.doc, pos)
    tr.insert(pos, schema.text(propre, miseEnForme))
    tr.addMark(pos, pos + propre.length, marque)
    if (authorMark) tr.addMark(pos, pos + propre.length, authorMark)
  }
  const barrer = (a, b, marque) => {
    for (const [de, a_] of block.plagesDe(a, b)) {
      tr.addMark(tr.mapping.map(de), tr.mapping.map(a_), marque)
      changed = true
    }
  }
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    if (!op.text) continue
    if (op.type === 'equal') {
      index += op.text.length
      continue
    }
    const suivant = ops[i + 1]
    if (op.type === 'delete' && /^\s+$/.test(op.text) && op.text.includes('\n') && suivant && suivant.type === 'insert' && /^\s+$/.test(suivant.text)) {
      // Le modèle a remplacé un saut de ligne par une espace : le saut
      // reste, et il n'y a rien à marquer.
      index += op.text.length
      i++
      continue
    }
    if (op.type === 'delete' && suivant && suivant.type === 'insert' && suivant.text) {
      // Un mot remplacé par un autre : les deux moitiés partagent un
      // groupe, et le nouveau texte vient **après** l'ancien barré — comme
      // une frappe par-dessus une sélection (rewriteForTracking, ordre
      // « ancien barré, puis nouveau » depuis le 09/10/2026), et ce que
      // pairReplacements réunit en une seule carte « remplacement ». Signalé
      // par Sylvain le 28/09/2026 : une correction de l'IA faisait toujours
      // deux cartes.
      const groupe = idDeGroupe(insMark.attrs.ts)
      barrer(index, index + op.text.length, delMark.type.create({ ...delMark.attrs, groupe }))
      const debut = tr.mapping.map(block.posDe(index + op.text.length))
      insererTexte(debut, suivant.text, insMark.type.create({ ...insMark.attrs, groupe }))
      index += op.text.length
      changed = true
      i++ // l'insertion est consommée avec la suppression
    } else if (op.type === 'delete') {
      barrer(index, index + op.text.length, delMark)
      index += op.text.length
    } else if (op.type === 'insert') {
      insererTexte(tr.mapping.map(block.posDe(index)), op.text, insMark)
      changed = true
    }
  }
  return changed
}

/** Les marques de mise en forme du texte qui finit à `pos`. */
function marquesAvant(doc, pos) {
  const noeud = doc.resolve(pos).nodeBefore
  if (!noeud || !noeud.isText) return []
  return noeud.marks.filter((m) => MARQUES_MISE_EN_FORME.has(m.type.name))
}

/** Les marques de mise en forme du texte qui commence à `pos`. */
function marquesDuDebut(doc, pos) {
  const $pos = doc.resolve(pos)
  const noeud = $pos.nodeAfter
  if (!noeud || !noeud.isText) return []
  return noeud.marks.filter((m) => MARQUES_MISE_EN_FORME.has(m.type.name))
}

/** Fraction of `oldText`/`newText` that a diff's insert+delete ops touch,
 * out of the longer of the two texts. */
function diffChangeRatio(oldText, newText, ops) {
  let changedLen = 0
  for (const op of ops) {
    if (op.type !== 'equal') changedLen += op.text.length
  }
  return changedLen / Math.max(oldText.length, newText.length, 1)
}

/**
 * Diffs `block.text` against `newText` and replays the result into `tr` as
 * tracked changes. For a small-to-moderate edit, that's the usual
 * word/letter-level insert+delete marks in place. For a heavy rewrite of a
 * fully-selected paragraph (see BIG_REWRITE_RATIO), it instead marks the
 * whole paragraph deleted and inserts a brand-new paragraph (same node
 * type — heading stays a heading) right after it, carrying the new text as
 * one clean insertion. Mutates `tr`. Returns true if anything changed.
 */
/** Le texte d'une suggestion, découpé en blocs.
 *
 * L'IA répond parfois en plusieurs paragraphes là où il n'y en avait qu'un.
 * Ce texte était jusqu'ici inséré tel quel dans **un seul nœud texte**,
 * sauts de ligne compris — or un nœud texte ProseMirror n'a pas de sauts de
 * ligne : le document devenait invalide et la coupure n'apparaissait nulle
 * part. Une ligne, un bloc. */
function blocsDepuisTexte(schema, nodeType, nodeAttrs, texte, insMark, authorMark, miseEnForme = []) {
  const marks = [...miseEnForme, insMark, ...(authorMark ? [authorMark] : [])]
  return String(texte)
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    // `trackedBreak: null` : les blocs ajoutés par l'IA portent déjà leur
    // marque d'insertion, le saut qui les sépare n'est pas une
    // modification de plus à relire.
    .map((ligne) => nodeType.create({ ...nodeAttrs, trackedBreak: null }, schema.text(ligne, marks)))
}

function applyParagraphDiff(tr, schema, block, newText, insMark, delMark, authorMark) {
  // Le diff se fait sur le texte **sans repères** : ce que le modèle a fait
  // des ⟦n⟧ ne compte pas — la note reste où elle est, quoi qu'il arrive.
  const oldText = block.texteDiff
  newText = sansReperes(newText)
  if (oldText === newText) return false
  const ops = diffWords(oldText, newText)

  // Une réécriture entière demande **et** une part suffisante du texte
  // **et** un nombre de mots suffisant (D8 du rapport du 28/09/2026) :
  // « tapis rouge. » → « tapis bleu. » dans une phrase courte touchait 35 %
  // des signes et basculait tout le paragraphe en barré + nouveau.
  // Jamais quand le paragraphe porte un atome (note, image, saut de
  // ligne) : le barrer d'un bloc marquerait le nœud lui-même — une marque
  // que Yjs ne transporte pas — et l'accepter emporterait la note. Le diff
  // fin, lui, ne touche jamais aux atomes.
  const bigRewrite =
    block.fullyCovered &&
    block.atomes === 0 &&
    oldText &&
    newText &&
    diffChangeRatio(oldText, newText, ops) >= BIG_REWRITE_RATIO &&
    motsChanges(ops) >= BIG_REWRITE_MIN_MOTS

  if (bigRewrite) {
    // Le nouveau paragraphe reprend la mise en forme du **premier** mot de
    // l'ancien (D5 du rapport du 28/09/2026) : un paragraphe entièrement
    // en gras le reste. Imparfait pour un paragraphe mêlé — le diff mot à
    // mot, lui, garde tout sur les mots inchangés.
    const miseEnForme = marquesDuDebut(tr.doc, block.textFrom)
    let noeuds = blocsDepuisTexte(schema, block.nodeType, block.nodeAttrs, newText, insMark, authorMark, miseEnForme)
    // Un paragraphe réécrit en un paragraphe : un remplacement, une carte
    // (28/09/2026). En plusieurs, on garde une suppression et des
    // insertions séparées — un groupe ne réunit que deux moitiés.
    let marqueSuppression = delMark
    if (noeuds.length === 1 && block.textTo > block.textFrom) {
      const groupe = idDeGroupe(insMark.attrs.ts)
      marqueSuppression = delMark.type.create({ ...delMark.attrs, groupe })
      noeuds = blocsDepuisTexte(
        schema,
        block.nodeType,
        block.nodeAttrs,
        newText,
        insMark.type.create({ ...insMark.attrs, groupe }),
        authorMark,
        miseEnForme
      )
    }
    if (block.textTo > block.textFrom) {
      tr.addMark(tr.mapping.map(block.textFrom), tr.mapping.map(block.textTo), marqueSuppression)
    }
    const insertAt = tr.mapping.map(block.nodeEnd)
    if (!noeuds.length) return block.textTo > block.textFrom
    tr.insert(insertAt, noeuds)
    return true
  }

  return replayDiffOps(tr, schema, block, ops, insMark, delMark, authorMark)
}

/** Les repères ⟦n⟧ qu'on met à la place des notes et des images dans le
 * texte envoyé à l'IA (voir getTextBlocksInRange). */
const REPERE = /⟦\d+⟧/gu
export function sansReperes(texte) {
  return String(texte || '').replace(REPERE, '')
}

/** Every text block (paragraph/heading) that [from, to) touches, clipped to
 * the selection, as :
 *
 *   { textFrom, textTo, nodeStart, nodeEnd, fullyCovered, nodeType,
 *     nodeAttrs,
 *     text,       // ce qu'on envoie à l'IA : le texte, `\n` pour un saut
 *                 // de ligne, ⟦1⟧, ⟦2⟧… à la place des notes et des images
 *     texteDiff,  // ce sur quoi le diff travaille : pareil, sans les ⟦n⟧
 *     atomes,     // nombre de nœuds non textuels dans la tranche
 *     posDe(i),   // position dans le document du i-ème caractère de
 *                 // texteDiff (i = longueur : la fin)
 *     plagesDe(a, b) } // les plages de positions couvertes par
 *                      // texteDiff[a, b), sans les atomes
 *
 * Avant le 30/09/2026 `text` était un `textBetween` nu : une note dans un
 * paragraphe partait vers l'IA collée au milieu de la phrase, sans repère
 * — le modèle la « corrigeait » et le paragraphe entier basculait en
 * réécriture, sans la note ; deux lignes séparées par un saut partaient
 * soudées (« paragrapheseconde ») ; et chaque atome décalait d'un cran les
 * marques qui le suivaient. Used to send a multi-paragraph AI request one
 * paragraph at a time (see aiPanel.js), to diff each paragraph
 * independently, and (via `fullyCovered`/`nodeEnd`/`nodeType`) to add a
 * whole new paragraph node for a heavy rewrite — see applyParagraphDiff. */
export function getTextBlocksInRange(doc, from, to) {
  const blocks = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true
    const nodeStart = pos
    const nodeEnd = pos + node.nodeSize
    const contentStart = pos + 1
    const contentEnd = pos + node.nodeSize - 1
    const textFrom = Math.max(contentStart, from)
    const textTo = Math.min(contentEnd, to)
    blocks.push({
      textFrom,
      textTo,
      ...analyserTranche(doc, textFrom, textTo),
      nodeStart,
      nodeEnd,
      fullyCovered: textFrom === contentStart && textTo === contentEnd,
      nodeType: node.type,
      nodeAttrs: node.attrs,
    })
    return false
  })
  return blocks
}

/** Le texte de [textFrom, textTo) — à l'intérieur d'un seul bloc — et sa
 * table de positions. Voir getTextBlocksInRange. */
function analyserTranche(doc, textFrom, textTo) {
  let text = ''
  let texteDiff = ''
  /** Tranches de texteDiff qui correspondent à des positions contiguës :
   * { debut (index dans texteDiff), longueur, pos }. */
  const carte = []
  let reperes = 0
  let atomes = 0
  doc.nodesBetween(textFrom, textTo, (node, pos) => {
    if (node.isText) {
      const debut = Math.max(pos, textFrom)
      const fin = Math.min(pos + node.nodeSize, textTo)
      const t = node.text.slice(debut - pos, fin - pos)
      if (t) carte.push({ debut: texteDiff.length, longueur: t.length, pos: debut })
      text += t
      texteDiff += t
      return false
    }
    if (node.isInline) {
      atomes++
      if (node.type.name === 'hard_break') {
        // Un caractère, une position : le saut de ligne se lit comme tel
        // par l'IA et par le diff, et ne se barre jamais (voir replayDiffOps).
        carte.push({ debut: texteDiff.length, longueur: 1, pos, atome: true })
        text += '\n'
        texteDiff += '\n'
      } else {
        reperes++
        text += `⟦${reperes}⟧`
      }
      return false // ne pas descendre dans une note
    }
    return true
  })
  const posDe = (index) => {
    // Une borne partagée par deux tranches (un atome entre elles) va à la
    // première : ce qu'on insère avant une note reste avant la note.
    for (const t of carte) {
      if (index >= t.debut && index <= t.debut + t.longueur) return t.pos + (index - t.debut)
    }
    return carte.length ? carte[carte.length - 1].pos + carte[carte.length - 1].longueur : textFrom
  }
  const plagesDe = (a, b) => {
    const plages = []
    for (const t of carte) {
      if (t.atome) continue
      const de = Math.max(a, t.debut)
      const jusqua = Math.min(b, t.debut + t.longueur)
      if (jusqua > de) plages.push([t.pos + (de - t.debut), t.pos + (jusqua - t.debut)])
    }
    return plages
  }
  return { text, texteDiff, atomes, posDe, plagesDe }
}

/**
 * Inserts `suggestion` as a tracked replacement for the text in [from, to),
 * attributed to the AI. Used by the AI panel.
 *
 * Rather than blanket-marking the whole selection as "deleted" and the
 * whole suggestion as "added" (which makes even a one-letter accent fix
 * read as "the AI rewrote this entire paragraph"), this diffs the original
 * text against the suggestion and only marks the spans that actually
 * changed — down to individual letters for a single-word tweak like
 * "chomage" -> "chômage". When the selection covers several paragraphs,
 * each original paragraph is diffed against its counterpart in the
 * suggestion (matched by position), so an untouched paragraph stays
 * completely unmarked and only the paragraphs that actually changed show
 * any tracked change at all.
 */
export function insertAISuggestion(view, from, to, suggestion, aiUser) {
  // Une réponse vide ne fait rien (D7 du rapport du 28/09/2026) : le
  // serveur la refuse déjà, mais barrer toute la sélection serait le pire
  // des deux comportements.
  if (!String(suggestion || '').trim()) return
  const schema = view.state.schema
  const ts = Date.now()
  const insMark = schema.marks.insertion.create({ user: aiUser.name, userColor: aiUser.color, ts })
  const delMark = schema.marks.deletion.create({ user: aiUser.name, userColor: aiUser.color, ts })
  const authorMark = schema.marks.authorColor?.create({ user: aiUser.name, userColor: aiUser.color })

  const tr = view.state.tr
  const $from = view.state.doc.resolve(from)
  const $to = view.state.doc.resolve(to)

  let changed = false

  if ($from.sameParent($to)) {
    // Single block (the common case: a sentence or paragraph selected
    // inside one paragraph/heading) — diff word-by-word so only the real
    // changes get marked (or, for a heavy rewrite, swap the whole
    // paragraph — see applyParagraphDiff).
    const [block] = getTextBlocksInRange(view.state.doc, from, to)
    if (block) changed = applyParagraphDiff(tr, schema, block, suggestion, insMark, delMark, authorMark)
  } else {
    const blocks = getTextBlocksInRange(view.state.doc, from, to)
    // The AI is asked to keep one line per paragraph (see ai.js), so in the
    // common case — reformulating N paragraphs into N paragraphs — the
    // split lines up 1:1 with the original blocks. Diff each pair
    // independently so an untouched paragraph among them stays untouched.
    const newParas = suggestion.trim().split(/\n+/)
    if (blocks.length > 0 && newParas.length === blocks.length) {
      for (let i = 0; i < blocks.length; i++) {
        const didChange = applyParagraphDiff(tr, schema, blocks[i], newParas[i], insMark, delMark, authorMark)
        changed = changed || didChange
      }
    } else {
      // Paragraph count changed (merge/split) — diffing across block
      // boundaries in that case is out of scope for v0.1. Fall back to
      // marking the whole selection as one delete + one insert.
      if (to > from) {
        tr.addMark(from, to, delMark)
        changed = true
      }
      // Les nouveaux paragraphes vont **après le dernier bloc touché**, pas
      // au milieu du texte barré : l'ancien se lit d'un bloc, le nouveau
      // aussi. Avant, la suggestion entière était injectée dans un seul
      // nœud texte, au milieu de la sélection, sauts de ligne compris.
      const dernier = blocks[blocks.length - 1]
      const modele = blocks[0]
      if (suggestion.trim() && dernier && modele) {
        const noeuds = blocsDepuisTexte(
          schema,
          modele.nodeType,
          modele.nodeAttrs,
          suggestion,
          insMark,
          authorMark
        )
        if (noeuds.length) {
          tr.insert(tr.mapping.map(dernier.nodeEnd), noeuds)
          changed = true
        }
      }
    }
  }

  if (!changed) return
  tr.setMeta('trackChangesInternal', true)
  view.dispatch(tr)
}

/**
 * Like insertAISuggestion, but for a selection that was split into several
 * independent per-paragraph AI requests (see aiPanel.js) instead of one
 * request for the whole selection. Since each block in `blocks` (from
 * getTextBlocksInRange) got its own dedicated suggestion, there's no
 * paragraph-count guessing here: `suggestions[i]` is diffed against
 * `blocks[i]` directly, one block at a time, in a single transaction.
 * `suggestions[i]` may be null for a block whose request failed — that
 * block is left untouched rather than aborting the whole thing.
 */
export function insertAIParagraphSuggestions(view, blocks, suggestions, aiUser) {
  const schema = view.state.schema
  const ts = Date.now()
  const insMark = schema.marks.insertion.create({ user: aiUser.name, userColor: aiUser.color, ts })
  const delMark = schema.marks.deletion.create({ user: aiUser.name, userColor: aiUser.color, ts })
  const authorMark = schema.marks.authorColor?.create({ user: aiUser.name, userColor: aiUser.color })

  const tr = view.state.tr
  let changed = false
  for (let i = 0; i < blocks.length; i++) {
    const suggestion = suggestions[i]
    if (suggestion == null || !String(suggestion).trim()) continue
    const didChange = applyParagraphDiff(tr, schema, blocks[i], suggestion, insMark, delMark, authorMark)
    changed = changed || didChange
  }

  if (!changed) return
  tr.setMeta('trackChangesInternal', true)
  view.dispatch(tr)
}
