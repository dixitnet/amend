// Margo dans le navigateur (couche application, étape 8) : la demande au
// serveur, lue en flux, et le fil de la conversation. Le fil reste dans le
// navigateur, le temps de l'onglet (stockage de session) : le serveur ne le
// garde pas ; il lui est renvoyé à chaque demande. Aucun texte ici : codes et
// nombres, que l'interface traduit.
import { useCallback, useEffect, useRef, useState } from 'react'

const cleDuFil = (docId) => `amend2.margo.${docId}`
/** Échanges renvoyés au serveur, au plus (les plus récents). */
const HISTORIQUE_MAX = 40

function chargerFil(docId) {
  try {
    const v = JSON.parse(sessionStorage.getItem(cleDuFil(docId)) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function garderFil(docId, fil) {
  try {
    sessionStorage.setItem(cleDuFil(docId), JSON.stringify(fil))
  } catch {
    // Stockage plein ou refusé : le fil vit le temps de la page.
  }
}

/** Les numéros de blocs cités (`[12]`) dans un texte. */
const citations = (texte) => [...String(texte).matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]))

/**
 * Une demande à Margo : rappelle `surEvenement` pour chaque ligne du flux.
 * Lève une erreur de code (`droit-insuffisant`, `margo-indisponible`, `reseau`…)
 * si la demande n'aboutit pas.
 */
async function demanderMargo(docId, corps, surEvenement, signal) {
  let r
  try {
    r = await fetch(`/api/documents/${encodeURIComponent(docId)}/margo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps),
      signal,
    })
  } catch (cause) {
    throw Object.assign(new Error('reseau', { cause }), { code: signal?.aborted ? 'annulee' : 'reseau' })
  }
  if (!r.ok) {
    const { code } = await r.json().catch(() => ({}))
    throw Object.assign(new Error(code || 'reseau'), { code: code || 'reseau' })
  }
  const lecteur = r.body.getReader()
  const decodeur = new TextDecoder()
  let reste = ''
  try {
    for (;;) {
      const { value, done } = await lecteur.read()
      reste += decodeur.decode(value ?? new Uint8Array(), { stream: !done })
      const lignes = reste.split('\n')
      reste = done ? '' : lignes.pop()
      for (const l of lignes) {
        if (!l.trim()) continue
        let evenement
        try {
          evenement = JSON.parse(l)
        } catch {
          continue // une ligne illisible est ignorée
        }
        surEvenement(evenement)
      }
      if (done) return
    }
  } finally {
    lecteur.cancel().catch(() => {})
  }
}

/**
 * L'état de l'onglet Margo d'un document : le fil, la demande en cours, la
 * dernière erreur, et les gestes (envoyer une demande, « Corriger » une
 * sélection, nouvelle conversation).
 * Un message du fil : `{ cle, auteur: 'personne' | 'margo', texte, corriger?,
 * blocs?: { [n]: id }, bilan?: { corrections, commentaires, refus, arret } }`.
 */
export function useMargo(docId) {
  const [fil, setFil] = useState(() => chargerFil(docId))
  const [enCours, setEnCours] = useState(null)
  const [erreur, setErreur] = useState(null)
  const abandon = useRef(null)
  useEffect(() => garderFil(docId, fil), [docId, fil])
  useEffect(() => () => abandon.current?.abort(), [])

  const demander = useCallback(
    async ({ demande = '', corriger = false, selection = null }) => {
      if (abandon.current) return
      const controleur = new AbortController()
      abandon.current = controleur
      setErreur(null)
      setEnCours('reflexion')
      const historique = fil
        .filter((m) => m.texte)
        .slice(-HISTORIQUE_MAX)
        .map((m) => ({ auteur: m.auteur, texte: m.texte }))
      const cle = `${Date.now()}`
      const reponse = { cle: `${cle}-m`, auteur: 'margo', texte: '', blocs: {}, bilan: null }
      setFil((f) => [...f, { cle, auteur: 'personne', texte: demande, corriger }])
      let ids = []
      const majReponse = () => setFil((f) => [...f.filter((m) => m.cle !== reponse.cle), { ...reponse }])
      try {
        await demanderMargo(
          docId,
          { demande, corriger, historique, selection },
          (e) => {
            if (e.type === 'debut') ids = e.blocs
            else if (e.type === 'etape') setEnCours(e.outil)
            else if (e.type === 'repli') setEnCours('repli')
            else if (e.type === 'texte') {
              reponse.texte = reponse.texte ? `${reponse.texte}\n\n${e.texte}` : e.texte
              for (const n of citations(e.texte)) if (ids[n - 1]) reponse.blocs[n] = ids[n - 1]
              majReponse()
            } else if (e.type === 'fin') {
              const { corrections, commentaires, refus, arret } = e
              reponse.bilan = { corrections, commentaires, refus, arret }
              majReponse()
            }
          },
          controleur.signal,
        )
      } catch (e) {
        if (e.code !== 'annulee') setErreur(e.code || 'reseau')
      } finally {
        abandon.current = null
        setEnCours(null)
      }
    },
    [docId, fil],
  )
  const nouvelle = useCallback(() => {
    abandon.current?.abort()
    setFil([])
    setErreur(null)
  }, [])
  return { fil, enCours, erreur, demander, nouvelle }
}
