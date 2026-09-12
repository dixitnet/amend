import { TextSelection } from 'prosemirror-state'
import { insertAISuggestion, insertAIParagraphSuggestions, getTextBlocksInRange } from './trackChanges.js'
import { AI_USER } from './user.js'

/** Calls the AI-suggest endpoint for one piece of text. Returns
 * {ok: true, suggestion} or {ok: false, error}. */
async function requestSuggestion(text, instruction) {
  const res = await fetch('/api/ai/suggest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, instruction }),
  })
  const data = await res.json()
  if (!res.ok) return { ok: false, error: data.error || "Erreur lors de l'appel à l'IA." }
  return { ok: true, suggestion: data.suggestion }
}

const PRESETS = [
  { label: 'Plus concis', instruction: 'Rends ce passage plus concis, sans en changer le sens.' },
  { label: 'Plus formel', instruction: 'Réécris ce passage dans un registre plus formel.' },
  { label: 'Clarifier', instruction: 'Clarifie ce passage pour le rendre plus facile à comprendre.' },
]

/**
 * A small "Assistance IA" panel: pick (or select) some text in the editor,
 * choose or type an instruction, and the AI's rewrite is inserted as a
 * tracked change (attributed to "IA") that anyone can accept or reject —
 * exactly like a human suggestion.
 */
export function mountAIPanel(container, getView) {
  container.innerHTML = ''
  const title = document.createElement('h3')
  title.textContent = 'Assistance IA'
  container.appendChild(title)

  const hint = document.createElement('p')
  hint.className = 'ai-hint'
  hint.textContent = 'Sélectionne un passage dans le texte, puis demande une reformulation.'
  container.appendChild(hint)

  const presetsRow = document.createElement('div')
  presetsRow.className = 'ai-presets'
  const textarea = document.createElement('textarea')
  textarea.placeholder = 'Instruction (ex. "plus percutant", "corrige les répétitions"...)'
  textarea.rows = 2

  for (const preset of PRESETS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = preset.label
    btn.className = 'btn-preset'
    btn.onclick = () => {
      textarea.value = preset.instruction
      run()
    }
    presetsRow.appendChild(btn)
  }
  container.appendChild(presetsRow)
  container.appendChild(textarea)

  // Entrée envoie la demande (comme un champ de recherche/chat) ; Maj+Entrée
  // garde le comportement normal d'une textarea pour une instruction sur
  // plusieurs lignes.
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      run()
    }
  })

  const runBtn = document.createElement('button')
  runBtn.textContent = 'Suggérer une reformulation'
  runBtn.className = 'btn-primary'
  container.appendChild(runBtn)

  const status = document.createElement('p')
  status.className = 'ai-status'
  container.appendChild(status)

  async function run() {
    const view = getView()
    if (!view) return
    const { from, to, $from, $to } = view.state.selection
    if (from === to) {
      status.textContent = "Sélectionne d'abord un passage dans le texte."
      return
    }
    const instruction = textarea.value.trim()

    // Collapse the selection right away, before the request even goes out:
    // selectionHighlightPlugin (trackChanges.js) washes the whole current
    // selection in green (.ai-selection-highlight) so it stays visible while
    // typing an instruction outside the editor — useful while choosing the
    // passage, but it must not linger over the entire original selection
    // once the request is sent. Collapsing it here means that once the
    // suggestion comes back, only the diff's own insertion/deletion marks
    // (already scoped to what actually changed) show any green at all.
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, to)))

    runBtn.disabled = true
    status.textContent = 'Demande en cours…'
    try {
      if ($from.sameParent($to)) {
        // Single paragraph/heading selected — one request, as before.
        const text = view.state.doc.textBetween(from, to, '\n')
        const result = await requestSuggestion(text, instruction)
        if (!result.ok) {
          status.textContent = result.error
          return
        }
        insertAISuggestion(view, from, to, result.suggestion, AI_USER)
      } else {
        // Selection spans several paragraphs: ask the AI about each
        // paragraph separately (rather than one request for the whole
        // block and hoping the reply still lines up paragraph-for-
        // paragraph) so each one is diffed against its own, guaranteed
        // counterpart — no risk of the whole selection collapsing into
        // one merged "replace everything" change.
        const blocks = getTextBlocksInRange(view.state.doc, from, to)
        status.textContent = `Demande en cours… (${blocks.length} paragraphes)`
        const results = await Promise.all(
          blocks.map((block) =>
            block.text.trim() ? requestSuggestion(block.text, instruction) : Promise.resolve({ ok: true, suggestion: block.text })
          )
        )
        const failed = results.find((r) => !r.ok)
        if (failed) {
          status.textContent = failed.error
          return
        }
        insertAIParagraphSuggestions(
          view,
          blocks,
          results.map((r) => r.suggestion),
          AI_USER
        )
      }
      status.textContent = 'Suggestion ajoutée — à accepter ou rejeter dans le panneau des modifications.'
      view.focus()
    } catch (err) {
      status.textContent = `Erreur réseau : ${err.message}`
    } finally {
      runBtn.disabled = false
    }
  }

  runBtn.onclick = run
}
