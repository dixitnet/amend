/**
 * A small diff engine used to turn an AI rewrite into a minimal set of
 * tracked insert/delete spans instead of "replace the whole paragraph".
 *
 * Two levels, cheapest first:
 *  1. Word-level LCS diff — fast, and keeps untouched words untouched.
 *  2. Character-level refinement, but ONLY for a clean one-word-for-one-word
 *     substitution — so "chomage" -> "chômage" shows as just o -> ô, not the
 *     whole word struck through and retyped. A genuinely different word
 *     (not a near-miss substitution) stays a whole-word delete+insert; we
 *     don't want to shred unrelated words into a confetti of single-letter
 *     matches. Concretely: the refinement is only kept when it touches
 *     WORD_REWRITE_MAX_CHANGED_CHARS characters or fewer — past that, even a
 *     matched delete+insert pair falls back to a whole-word swap (see
 *     WORD_REWRITE_MAX_CHANGED_CHARS below — the same idea as
 *     BIG_REWRITE_RATIO in trackChanges.js, one scale down).
 */

// Generic LCS-based diff over an array of atomic items (tokens or chars).
// Returns a list of runs: {type: 'equal'|'delete'|'insert', items: string[]}.
function lcsDiff(a, b) {
  const n = a.length
  const m = b.length
  const dp = new Array(n + 1)
  for (let i = 0; i <= n; i++) dp[i] = new Int32Array(m + 1)
  for (let i = n - 1; i >= 0; i--) {
    const dpi = dp[i]
    const dpi1 = dp[i + 1]
    for (let j = m - 1; j >= 0; j--) {
      dpi[j] = a[i] === b[j] ? dpi1[j + 1] + 1 : Math.max(dpi1[j], dpi[j + 1])
    }
  }

  const raw = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      raw.push({ type: 'equal', item: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ type: 'delete', item: a[i] })
      i++
    } else {
      raw.push({ type: 'insert', item: b[j] })
      j++
    }
  }
  while (i < n) {
    raw.push({ type: 'delete', item: a[i] })
    i++
  }
  while (j < m) {
    raw.push({ type: 'insert', item: b[j] })
    j++
  }

  const runs = []
  for (const op of raw) {
    const last = runs[runs.length - 1]
    if (last && last.type === op.type) last.items.push(op.item)
    else runs.push({ type: op.type, items: [op.item] })
  }
  return runs
}

// Above this many (oldLength * newLength) cells, the O(n*m) DP gets too
// expensive to run on every keystroke-free "suggest" click — fall back to a
// coarse whole-text replace instead of hanging the tab.
const MAX_CELLS = 4_000_000

function tokenizeWords(text) {
  return text.match(/\s+|[^\s]+/g) || []
}

/** Character-level diff. Returns runs of {type, text}. */
export function diffChars(oldText, newText) {
  if (oldText === newText) return oldText ? [{ type: 'equal', text: oldText }] : []
  const a = Array.from(oldText)
  const b = Array.from(newText)
  if (a.length * b.length > MAX_CELLS) {
    const ops = []
    if (oldText) ops.push({ type: 'delete', text: oldText })
    if (newText) ops.push({ type: 'insert', text: newText })
    return ops
  }
  return lcsDiff(a, b).map((run) => ({ type: run.type, text: run.items.join('') }))
}

/**
 * Above this many changed characters within a single-word substitution
 * (counting only the insert/delete runs of its character-level diff, not
 * the letters that stayed the same), showing the fine letter-by-letter
 * refinement stops reading as "a correction" and starts reading as noise —
 * past this point the pair is shown as one clean whole-word delete+insert
 * instead. A one-letter accent fix or a short typo correction stays well
 * under it; a word replaced by an unrelated one tends to land well past
 * it. 3 is a starting point — easy to tune if it feels off in practice.
 */
const WORD_REWRITE_MAX_CHANGED_CHARS = 3

/** How many characters diffChars(oldWord, newWord) actually touches —
 * everything except its 'equal' runs. */
function changedCharCount(charRuns) {
  let n = 0
  for (const run of charRuns) {
    if (run.type !== 'equal') n += run.text.length
  }
  return n
}

/**
 * Word-level diff with character-level refinement for single-word
 * substitutions. Returns runs of {type: 'equal'|'delete'|'insert', text},
 * in document order, ready to be replayed as tracked-change edits.
 */
export function diffWords(oldText, newText) {
  if (oldText === newText) return oldText ? [{ type: 'equal', text: oldText }] : []
  const a = tokenizeWords(oldText)
  const b = tokenizeWords(newText)
  if (a.length * b.length > MAX_CELLS) {
    const ops = []
    if (oldText) ops.push({ type: 'delete', text: oldText })
    if (newText) ops.push({ type: 'insert', text: newText })
    return ops
  }
  const runs = lcsDiff(a, b)

  const out = []
  for (let k = 0; k < runs.length; k++) {
    const run = runs[k]
    const next = runs[k + 1]
    if (
      run.type === 'delete' &&
      run.items.length === 1 &&
      next &&
      next.type === 'insert' &&
      next.items.length === 1
    ) {
      const oldWord = run.items[0]
      const newWord = next.items[0]
      const charRuns = diffChars(oldWord, newWord)
      if (changedCharCount(charRuns) <= WORD_REWRITE_MAX_CHANGED_CHARS) {
        out.push(...charRuns)
      } else {
        out.push({ type: 'delete', text: oldWord })
        out.push({ type: 'insert', text: newWord })
      }
      k++ // also consumes `next`
    } else {
      out.push({ type: run.type, text: run.items.join('') })
    }
  }
  return out
}
