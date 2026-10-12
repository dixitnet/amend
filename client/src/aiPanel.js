import { TextSelection } from 'prosemirror-state'
import { insertAISuggestion, insertAIParagraphSuggestions, getTextBlocksInRange, porteDesModifications } from './trackChanges.js'
import { AI_USER } from './user.js'
import { rapport, signes } from '../../shared/signes.js'

const PASSAGE_CHANGE = 'Le passage a été modifié pendant la demande : la suggestion n’a pas été appliquée. Relance la demande.'

/** Appelle le service Corrections IA pour **une demande** : un ou plusieurs
 * passages (les paragraphes d'une sélection) partent ensemble, comptent pour
 * une seule demande et pour la somme de leurs signes. Renvoie
 * `{ok: true, suggestions}` (dans l'ordre des passages) ou `{ok: false, error}`. */
async function requestSuggestions(fetcher, docId, textes, instruction) {
  const res = await fetcher('/api/ai/suggest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ docId, textes, instruction }),
  })
  let data = {}
  try {
    data = await res.json()
  } catch {
    // corps illisible : le message par défaut suffit
  }
  if (!res.ok) return { ok: false, error: data.error || 'Erreur lors de l’appel à Corrections IA.' }
  return { ok: true, suggestions: data.suggestions }
}

const PRESETS = [
  { label: 'Plus concis', instruction: 'Rends ce passage plus concis, sans en changer le sens.' },
  // « Corriger » remplace « Plus formel » (19/09) : changer de registre est
  // une demande rare et qu'on formule mieux soi-même ; corriger est ce
  // qu'on demande dix fois par jour. L'instruction dit explicitement de ne
  // pas réécrire — sans quoi le modèle en profite pour reformuler, et la
  // proposition devient illisible à relire.
  {
    label: 'Corriger',
    instruction:
      "Corrige l'orthographe, la grammaire, la conjugaison et la typographie de ce passage. " +
      'Ne reformule pas, ne change pas le style, ne coupe rien : seules les fautes sont corrigées.',
  },
  { label: 'Clarifier', instruction: 'Clarifie ce passage pour le rendre plus facile à comprendre.' },
]

/**
 * Le panneau « Corrections IA » : on sélectionne un passage, on choisit (ou on
 * tape) une consigne, et la réécriture de l'IA est insérée en suivi de
 * modifications (au nom de « Margo (IA) »), que n'importe qui accepte ou
 * rejette — exactement comme la suggestion d'un collègue.
 *
 * Qui y a droit, le modèle et les limites sont des réglages d'instance
 * (back-office) : le panneau les lit sur le serveur (`/api/docs/:id/ia`) et
 * affiche la taille de la sélection et la consommation du mois, **en signes,
 * espaces compris**. Le serveur reste seul juge.
 *
 * Renvoie `{ prete, destroy }` : `prete` se résout quand l'état est lu.
 */
export function mountAIPanel(container, getView, { docId, fetcher = (...a) => fetch(...a) } = {}) {
  container.innerHTML = ''
  const title = document.createElement('h3')
  title.textContent = 'Corrections IA'
  container.appendChild(title)

  const corps = document.createElement('div')
  container.appendChild(corps)
  let retirer = () => {}
  const prete = (async () => {
    let etat = null
    try {
      const r = await fetcher(`/api/docs/${encodeURIComponent(docId)}/ia`, { credentials: 'same-origin' })
      if (r.ok) etat = (await r.json()).corrections
    } catch {
      // réseau coupé : on le dit ci-dessous
    }
    if (!etat) {
      const hint = document.createElement('p')
      hint.className = 'ai-hint'
      hint.textContent = 'Corrections IA n’est pas joignable pour le moment.'
      corps.appendChild(hint)
      return
    }
    // Un rôle sans accès (selon le niveau réglé dans le back-office) : on le dit
    // plutôt que de laisser un panneau qui répondrait 403 au premier clic.
    if (!etat.autorise) {
      const refus = document.createElement('p')
      refus.className = 'ai-hint'
      refus.textContent = 'Corrections IA n’est pas ouverte à votre rôle sur ce document.'
      corps.appendChild(refus)
      return
    }
    retirer = monterCorps(corps, getView, { docId, fetcher, etat })
  })()
  return { prete, destroy: () => retirer() }
}

function monterCorps(container, getView, { docId, fetcher, etat }) {
  const limites = { signesParDemande: etat.signesParDemande, mois: etat.mois }

  // Le mode d'emploi tient dans le repère du champ et dans l'état du
  // panneau (19/09) : une phrase d'explication permanente prenait deux
  // lignes dans une colonne étroite, pour une information qu'on ne lit
  // qu'une fois.

  const presetsRow = document.createElement('div')
  presetsRow.className = 'ai-presets'
  const textarea = document.createElement('textarea')
  textarea.placeholder = 'Sélectionnez un passage, puis dites quoi en faire…'
  textarea.rows = 2
  textarea.name = 'consigne'
  textarea.setAttribute('aria-label', 'Que faire du passage sélectionné ?')

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
  runBtn.textContent = 'Demander une correction'
  runBtn.className = 'btn-primary'
  container.appendChild(runBtn)

  const status = document.createElement('p')
  status.className = 'ai-status'
  container.appendChild(status)

  // La taille de la sélection et la consommation du mois, en signes (espaces
  // compris) : on voit venir la limite avant de la heurter.
  const quota = document.createElement('p')
  quota.className = 'ai-quota'
  container.appendChild(quota)

  /** Les passages que la sélection enverrait : un seul pour un paragraphe, un
   * par paragraphe non vide pour plusieurs. `null` si rien n'est sélectionné. */
  function passagesDeLaSelection(view) {
    const { from, to, $from, $to } = view.state.selection
    if (from === to) return null
    if ($from.sameParent($to)) {
      const [bloc] = getTextBlocksInRange(view.state.doc, from, to)
      return { blocs: bloc ? [bloc] : null, textes: [bloc ? bloc.text : view.state.doc.textBetween(from, to, '\n')], unique: true }
    }
    // Un bloc sans texte (une note seule, une image) n'a rien à corriger : il ne part pas.
    const blocs = getTextBlocksInRange(view.state.doc, from, to)
    return { blocs, textes: blocs.filter((b) => b.texteDiff.trim()).map((b) => b.text), unique: false }
  }

  function majQuota() {
    const view = getView()
    const p = view ? passagesDeLaSelection(view) : null
    const lignes = []
    if (p) {
      const taille = p.textes.reduce((n, t) => n + t.length, 0)
      lignes.push(`Sélection : ${rapport(taille, limites.signesParDemande)} par demande.`)
      quota.classList.toggle('ai-alerte', taille > limites.signesParDemande)
    } else {
      quota.classList.remove('ai-alerte')
    }
    if (limites.mois) lignes.push(`Ce mois-ci : ${rapport(limites.mois.utilises, limites.mois.max)}.`)
    quota.textContent = lignes.join(' ')
  }
  async function rafraichir() {
    try {
      const r = await fetcher(`/api/docs/${encodeURIComponent(docId)}/ia`, { credentials: 'same-origin' })
      if (!r.ok) return
      const c = (await r.json()).corrections
      if (c && c.autorise) {
        limites.signesParDemande = c.signesParDemande
        limites.mois = c.mois
      }
    } catch {
      // l'affichage reste celui d'avant
    }
    majQuota()
  }
  document.addEventListener('selectionchange', majQuota)
  majQuota()

  async function run() {
    const view = getView()
    if (!view) return
    const { from, to } = view.state.selection
    if (from === to) {
      status.textContent = "Sélectionnez d'abord un passage dans le texte."
      return
    }
    // L'IA travaille sur le texte tel qu'il se lit, jamais sur des
    // modifications en attente (S3 du rapport du 28/09/2026) : elle
    // recevrait les mots barrés mêlés aux nouveaux, et son diff se
    // rejouerait par-dessus des marques existantes.
    if (porteDesModifications(view.state.doc, from, to)) {
      status.textContent = 'Ce passage porte des modifications en attente : acceptez-les ou rejetez-les d’abord.'
      return
    }
    const instruction = textarea.value.trim()
    const passages = passagesDeLaSelection(view)
    // Trop gros ? On le dit avant d'envoyer, en signes : le serveur refuserait de toute façon.
    const taille = passages.textes.reduce((n, t) => n + t.length, 0)
    if (taille > limites.signesParDemande) {
      status.textContent = `Cette sélection compte ${signes(taille)} ; la limite est de ${signes(limites.signesParDemande)} par demande. Sélectionnez un passage plus court.`
      majQuota()
      return
    }

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
    status.textContent = passages.unique ? 'Demande en cours…' : `Demande en cours… (${passages.blocs.length} paragraphes)`
    try {
      // Une seule demande, même pour plusieurs paragraphes : elle compte pour
      // une dans l'heure et pour la somme de leurs signes dans le mois. Chaque
      // paragraphe est corrigé séparément côté serveur, pour qu'il se compare
      // à son propre équivalent — pas de risque que toute la sélection se
      // réduise à un seul gros remplacement.
      const result = passages.textes.length ? await requestSuggestions(fetcher, docId, passages.textes, instruction) : { ok: true, suggestions: [] }
      if (!result.ok) {
        status.textContent = result.error
        return
      }
      if (passages.unique) {
        // Pendant l'attente, un autre onglet a pu écrire dans le passage ou
        // avant lui : `from` et `to` ne désignent alors plus le même texte, et
        // la suggestion serait comparée à autre chose que ce que l'IA a lu
        // (elle « supprimait » le texte du collègue — test du 09/10/2026).
        const [blocMaintenant] = getTextBlocksInRange(view.state.doc, from, to)
        if ((blocMaintenant ? blocMaintenant.text : view.state.doc.textBetween(from, to, '\n')) !== passages.textes[0]) {
          status.textContent = PASSAGE_CHANGE
          return
        }
        insertAISuggestion(view, from, to, result.suggestions[0], AI_USER)
      } else {
        const blocks = passages.blocs
        const blocsMaintenant = getTextBlocksInRange(view.state.doc, from, to)
        if (
          blocsMaintenant.length !== blocks.length ||
          blocsMaintenant.some((b, i) => b.text !== blocks[i].text || b.textFrom !== blocks[i].textFrom)
        ) {
          status.textContent = PASSAGE_CHANGE
          return
        }
        // Les réponses reviennent dans l'ordre des paragraphes non vides ; les
        // autres gardent leur texte.
        let suivante = 0
        const suggestions = blocks.map((b) => (b.texteDiff.trim() ? result.suggestions[suivante++] : b.text))
        insertAIParagraphSuggestions(view, blocks, suggestions, AI_USER)
      }
      status.textContent = 'Suggestion ajoutée — à accepter ou rejeter dans le panneau des modifications.'
      view.focus()
    } catch (err) {
      status.textContent = `Erreur réseau : ${err.message}`
    } finally {
      runBtn.disabled = false
      rafraichir()
    }
  }

  runBtn.onclick = run
  return () => document.removeEventListener('selectionchange', majQuota)
}
