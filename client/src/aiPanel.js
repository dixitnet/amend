import { TextSelection } from 'prosemirror-state'
import {
  insertAISuggestion,
  insertAIParagraphSuggestions,
  getTextBlocksInRange,
  porteDesModifications,
} from './trackChanges.js'
import { AI_USER } from './user.js'
import { rapport, signes } from '../../shared/signes.js'
import { CONSIGNES_IA } from '../../shared/consignesIa.js'

const PASSAGE_CHANGE =
  'Le passage a été modifié pendant la demande : la suggestion n’a pas été appliquée. Relance la demande.'

/** Appelle le service Corrections IA pour **une demande** : un ou plusieurs
 * passages (les paragraphes d'une sélection) partent ensemble, comptent pour
 * une seule demande et pour la somme de leurs signes. Renvoie
 * `{ok: true, suggestions}` (dans l'ordre des passages) ou `{ok: false, error}`. */
async function requestSuggestions(fetcher, docId, textes, instruction, action) {
  const res = await fetcher('/api/ai/suggest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ docId, textes, instruction, action }),
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

// Les consignes toutes faites (13/10/2026) : **c'est tout le panneau**. On avait
// un champ libre, un bouton « Demander une correction » et un compteur ; Notion,
// Google Docs (« Affiner »), Apple (Outils d'écriture), Grammarly et Word n'ont
// aucun de ces trois-là à côté de leurs verbes : un petit nombre d'actions
// nommées par un verbe, appliquées d'un clic au passage choisi, résultat à
// accepter ou refuser. Une demande libre se fait avec Margo (le dialogue).
// La liste elle-même est dans shared/consignesIa.js (le serveur y compte aussi
// les clics par bouton) : pour en ajouter une, une entrée là-bas, rien ici.
export const PRESETS = CONSIGNES_IA

/**
 * Le panneau « Corrections IA » : on sélectionne un passage, on clique une
 * consigne, et la réécriture de l'IA est insérée en suivi de
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

  // Le mode d'emploi, en une phrase, puis des boutons — rien d'autre.
  const aide = document.createElement('p')
  aide.className = 'ai-hint'
  aide.textContent = 'Sélectionnez un passage, puis donnez une consigne.'
  container.appendChild(aide)

  const presetsRow = document.createElement('div')
  presetsRow.className = 'ai-presets'
  const boutons = []
  for (const preset of PRESETS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = preset.label
    btn.className = 'btn-preset'
    btn.onclick = () => run(preset)
    presetsRow.appendChild(btn)
    boutons.push(btn)
  }
  container.appendChild(presetsRow)

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
    // Un seul paragraphe, **vraiment** : « Tout sélectionner » (Ctrl+A) a ses deux
    // bouts dans le document lui-même, qui n'est pas un paragraphe — il passait
    // pour « un seul parent » et seul le premier paragraphe partait (trouvé le
    // 13/10/2026, en essayant les boutons sur un document de trois paragraphes).
    if ($from.parent.isTextblock && $from.sameParent($to)) {
      const [bloc] = getTextBlocksInRange(view.state.doc, from, to)
      return {
        blocs: bloc ? [bloc] : null,
        textes: [bloc ? bloc.text : view.state.doc.textBetween(from, to, '\n')],
        unique: true,
      }
    }
    // Un bloc sans texte (une note seule, une image) n'a rien à corriger : il ne part pas.
    const blocs = getTextBlocksInRange(view.state.doc, from, to)
    return { blocs, textes: blocs.filter((b) => b.texteDiff.trim()).map((b) => b.text), unique: false }
  }

  // Les limites ne s'affichent que quand elles comptent (une sélection trop
  // grosse, un mois bientôt épuisé) : le reste du temps, le panneau ne porte
  // que ses boutons. Le détail de la consommation est au back-office.
  function majQuota() {
    const view = getView()
    const p = view ? passagesDeLaSelection(view) : null
    const lignes = []
    let alerte = false
    if (p) {
      const taille = p.textes.reduce((n, t) => n + t.length, 0)
      if (taille > limites.signesParDemande) {
        lignes.push(`Sélection : ${rapport(taille, limites.signesParDemande)} par demande.`)
        alerte = true
      }
    }
    if (limites.mois && limites.mois.max && limites.mois.utilises >= 0.8 * limites.mois.max) {
      lignes.push(`Ce mois-ci : ${rapport(limites.mois.utilises, limites.mois.max)}.`)
    }
    quota.classList.toggle('ai-alerte', alerte)
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

  async function run(preset) {
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

    for (const b of boutons) b.disabled = true
    status.textContent = passages.unique
      ? 'Demande en cours…'
      : `Demande en cours… (${passages.blocs.length} paragraphes)`
    try {
      // Une seule demande, même pour plusieurs paragraphes : elle compte pour
      // une dans l'heure et pour la somme de leurs signes dans le mois. Chaque
      // paragraphe est corrigé séparément côté serveur, pour qu'il se compare
      // à son propre équivalent — pas de risque que toute la sélection se
      // réduise à un seul gros remplacement.
      const result = passages.textes.length
        ? await requestSuggestions(fetcher, docId, passages.textes, preset.instruction, preset.cle)
        : { ok: true, suggestions: [] }
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
        if (
          (blocMaintenant ? blocMaintenant.text : view.state.doc.textBetween(from, to, '\n')) !== passages.textes[0]
        ) {
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
      for (const b of boutons) b.disabled = false
      rafraichir()
    }
  }

  return () => document.removeEventListener('selectionchange', majQuota)
}
