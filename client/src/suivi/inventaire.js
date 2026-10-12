// Suivi des modifications — l'inventaire : parcourir le document pour dresser la liste des modifications en attente (fusionnées, appariées, groupées en lots).
// (Découpé de l'ancien `trackChanges.js`, 1 630 lignes — audit du 10/10/2026, C11.
// `../trackChanges.js` réexporte tout : aucun import à changer.)

import { touchedBlockRange } from '../incrementalScan.js'
import { estNoeudSuivi, libelleDuNoeud, suiviDuNoeud } from './etat.js'

/** `true` si [from, to] porte au moins une modification en attente —
 * marque d'insertion ou de suppression, nœud suivi entier, saut de
 * paragraphe (S3 du rapport du 28/09/2026 : l'IA ne travaille jamais sur
 * des marques en attente, elle recevrait le texte barré). */
export function porteDesModifications(doc, from, to) {
  return scanChangesInRange(doc, from, to).length > 0
}

/** Every raw (unmerged) tracked change touching doc positions in
 * [from, to) — insertions/deletions (via marks) and pending paragraph
 * breaks (via the trackedBreak attr). Used both for a full-document scan
 * (listChanges below) and, incrementally, for just the portion of the
 * document an edit actually touched (see updateChangeList below and
 * changesPanel.js) — see rapport-test-charge-1.md, constat 2.2. */
export function scanChangesInRange(doc, from, to) {
  const raw = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock && node.attrs.trackedBreak && pos >= from && pos < to) {
      const { user, userColor, ts } = node.attrs.trackedBreak
      raw.push({ type: 'break', from: pos, to: pos, user, userColor, ts, text: 'Saut de paragraphe' })
    }
    // Une note proposée (insérée ou supprimée) entière : une entrée à part,
    // qui ne se fond jamais avec le texte voisin (`noeud`). Le texte
    // **dans** une note qui n'est pas elle-même en attente est parcouru
    // comme celui d'un paragraphe.
    if (estNoeudSuivi(node)) {
      const suivi = suiviDuNoeud(node)
      if (!suivi || pos < from || pos >= to) return !suivi
      raw.push({
        type: suivi.type,
        noeud: node.type.name,
        from: pos,
        to: pos + node.nodeSize,
        user: suivi.user,
        userColor: suivi.userColor,
        ts: suivi.ts,
        groupe: null,
        text: libelleDuNoeud(node),
      })
      return false
    }
    if (!node.isText) return
    if (pos < from || pos >= to) return
    for (const type of ['insertion', 'deletion']) {
      const mark = node.marks.find((m) => m.type.name === type)
      if (mark) {
        raw.push({
          type,
          from: pos,
          to: pos + node.nodeSize,
          user: mark.attrs.user,
          userColor: mark.attrs.userColor,
          ts: mark.attrs.ts,
          groupe: mark.attrs.groupe || null,
          text: node.text,
        })
      }
    }
  })
  return raw
}

/** Merges adjacent same-type/same-author spans in a raw change list (as
 * produced by scanChangesInRange) into the single logical "changes" shown
 * in the panel. Cheap — proportional to the number of changes, not the
 * size of the document — so it's fine to redo on every transaction even
 * though scanChangesInRange itself only needs to touch the edited part of
 * the document. Requires `raw` sorted by `from`, which every caller here
 * guarantees. */
export function mergeAdjacentChanges(raw) {
  const merged = []
  // La dernière entrée de chaque type et auteur : un texte qui porte à la
  // fois une insertion (d'Alice) et une suppression (de Bob) produit des
  // entrées entrelacées — ins, del, ins, del — et chaque moitié doit
  // quand même se recoller à la sienne (29/09/2026).
  const dernieres = new Map()
  for (const c of raw) {
    const cle = `${c.type}|${c.user}`
    const last = dernieres.get(cle)
    if (last && !last.noeud && !c.noeud && last.to === c.from) {
      last.to = c.to
      last.text += c.text
      // Le groupe survit à la fusion : un mot tapé à la suite d'un
      // remplacement en fait partie, il ne le casse pas.
      if (!last.groupe && c.groupe) last.groupe = c.groupe
    } else {
      const copie = { ...c }
      merged.push(copie)
      dernieres.set(cle, copie)
    }
  }
  return merged
}

/** Pairs a merged insertion immediately followed by a merged deletion that
 * share the same non-null `groupe` into one display "remplacement" entry —
 * the panel equivalent of what typing over a selection actually is:
 * swapping one passage for another, not two unrelated changes (see
 * claude/etude-suivi-remplacement.md, projet Amend). Deliberately only
 * pairs adjacent entries: a replacement's insertion always sits
 * immediately next to its matching deletion (after it since 09/10/2026 for
 * typing; after it for an AI rewrite too), by
 * construction (see rewriteForTracking/effacementMultiBloc) — no need to
 * search further, and safer not to (two same-`groupe` spans that end up
 * apart, e.g. after other edits nearby, are exactly the case where forcing
 * a pairing would confuse more than it'd help).
 *
 * Underlying document state is untouched by this — it only reshapes the
 * *list* handed to the panel. `change.insertion`/`change.deletion` on the
 * resulting entry keep the two original sub-changes, so acceptChange/
 * rejectChange can still act on each mark independently (whole-group
 * accept/reject, or "traiter séparément" in the panel). A groupe that has
 * lost its other half (that half already accepted/rejected on its own)
 * simply stops pairing — no special-casing needed, the condition below
 * just never matches. */
export function pairReplacements(changes) {
  const out = []
  for (let i = 0; i < changes.length; i++) {
    const a = changes[i]
    const b = changes[i + 1]
    // Deux moitiés d'un même groupe, qui se suivent dans la liste : une
    // insertion et une suppression, dans un ordre ou dans l'autre (des
    // documents plus anciens ont le nouveau avant l'ancien barré ; la frappe
    // met désormais le nouveau après ; une réécriture entière
    // par l'IA met le nouveau paragraphe **après** l'ancien (28/09/2026).
    const paire =
      b &&
      a.groupe &&
      a.groupe === b.groupe &&
      a.type !== b.type &&
      ['insertion', 'deletion'].includes(a.type) &&
      ['insertion', 'deletion'].includes(b.type)
    if (paire) {
      const insertion = a.type === 'insertion' ? a : b
      const deletion = a.type === 'deletion' ? a : b
      out.push({
        type: 'remplacement',
        groupe: a.groupe,
        from: a.from,
        to: b.to,
        user: a.user,
        userColor: a.userColor,
        ts: a.ts,
        ancien: deletion.text,
        nouveau: insertion.text,
        insertion,
        deletion,
      })
      i++ // b est consommée avec a
    } else {
      out.push(a)
    }
  }
  return out
}

/** Regroupe en **lots** les modifications d'un même geste (S2 du rapport
 * du 28/09/2026) : une correction de l'IA sur un paragraphe, un collage de
 * plusieurs lignes, produisent des marques qui partagent un auteur et un
 * même `ts`. Deux entrées ou plus qui se suivent avec ce même couple
 * deviennent une seule carte « n changements », à accepter ou rejeter
 * d'un geste — le détail reste accessible (« traiter séparément »), comme
 * pour un remplacement. Une frappe humaine, un caractère à la fois, a un
 * `ts` par caractère fusionné par mergeAdjacentChanges : elle n'est pas
 * concernée. */
export function regrouperEnLots(changes) {
  const out = []
  for (let i = 0; i < changes.length; i++) {
    const a = changes[i]
    const membres = [a]
    while (i + 1 < changes.length && a.ts != null && changes[i + 1].user === a.user && changes[i + 1].ts === a.ts) {
      membres.push(changes[++i])
    }
    if (membres.length < 2) {
      out.push(a)
      continue
    }
    out.push({
      type: 'lot',
      user: a.user,
      userColor: a.userColor,
      ts: a.ts,
      from: membres[0].from,
      to: membres[membres.length - 1].to,
      membres,
      text: membres.map((m) => (m.type === 'remplacement' ? `${m.ancien} → ${m.nouveau}` : m.text)).join(' · '),
    })
  }
  return out
}

/** Les membres d'un lot **tels qu'ils sont maintenant** dans le document :
 * après chaque décision les positions bougent, on relit. */
export function membresDuLot(doc, lot) {
  return listChanges(doc).filter((c) => c.user === lot.user && c.ts === lot.ts)
}

/** Lists every tracked change currently in the document, merging adjacent
 * spans from the same author/type for a cleaner "changes" panel, and
 * pairing replacement insertion/deletion pairs into one entry (see
 * pairReplacements). */
export function listChanges(doc) {
  return pairReplacements(mergeAdjacentChanges(scanChangesInRange(doc, 0, doc.content.size)))
}

/** Incrementally updates a raw (unmerged) change list — as returned by
 * scanChangesInRange or by a previous call to this function — for one
 * transaction, without rescanning the whole document: entries outside the
 * edited part of the document are kept (their `from`/`to` remapped
 * through the transaction); only the touched range (see
 * incrementalScan.js) is rescanned fresh. Used by changesPanel.js, which
 * runs mergeAdjacentChanges on the result before displaying it — merging
 * is cheap (proportional to the number of changes) so it's fine to redo
 * on every transaction even though this rescan itself is bounded to the
 * edited range. */
export function updateChangeList(raw, tr) {
  if (!tr.docChanged) return raw
  const range = touchedBlockRange(tr)
  if (!range) return raw
  const inv = tr.mapping.invert()
  const oldFrom = inv.map(range.from, -1)
  const oldTo = inv.map(range.to, 1)
  const kept = []
  for (const c of raw) {
    // A change entirely outside the touched range survives untouched
    // (just remapped); anything that even partially overlaps it is
    // dropped and picked back up by the fresh rescan below, so a change
    // whose span was widened/narrowed by this edit is never left stale.
    if (c.to > oldFrom && c.from < oldTo) continue
    kept.push({ ...c, from: tr.mapping.map(c.from), to: tr.mapping.map(c.to) })
  }
  const rescanned = scanChangesInRange(tr.doc, range.from, range.to)
  return kept.concat(rescanned).sort((a, b) => a.from - b.from)
}
