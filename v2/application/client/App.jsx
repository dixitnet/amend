// L'écran d'un document (couche application technique) : état, appels au
// serveur, ouverture du document. Tout l'affichage est délégué à la couche
// design ; tous les textes viennent de v2/i18n/.
import { useEffect, useMemo, useState } from 'react'
import { PageEdition, EcranMessage, EcranConnexion, PanneauSuggestions, couleurAuteur } from '../../design/index.js'
import { creerTraducteur, choisirLangue, messageErreur, LANGUE_PSEUDO } from '../../i18n/index.js'
import { identifiantDocument, LANGUE_DOCUMENT_PAR_DEFAUT } from '../../domaine/index.js'
import { ouvrirDocument } from '../../adaptateurs/yjs/index.js'
import { EditeurCollaboratif } from '../../adaptateurs/blocknote/index.jsx'
import { serviceCommentaires, nomsDe } from './commentaires.js'

// La langue : celle demandée dans l'adresse (?langue=fr|en|pseudo, pour les
// essais et les captures), sinon celle du navigateur.
const demandee = new URLSearchParams(location.search).get('langue')
const t = creerTraducteur(
  demandee === LANGUE_PSEUDO ? LANGUE_PSEUDO : choisirLangue([demandee, ...navigator.languages]),
)
document.documentElement.lang = t.langue
document.title = t('application.nom')

const lireJson = (r) => r.json().catch(() => ({}))

/** Le nom du document dans l'adresse (#nom), `essai` par défaut ; `null` si
 * l'adresse est mal encodée (`#%`), au lieu de faire planter l'écran. */
function nomDansAdresse() {
  try {
    return decodeURIComponent(location.hash.slice(1)) || 'essai'
  } catch {
    return null
  }
}

export function App() {
  const [etat, setEtat] = useState({ phase: 'chargement' })

  async function charger() {
    try {
      const config = await lireJson(await fetch('/api/config'))
      const r = await fetch('/api/moi')
      if (r.status === 401) return setEtat({ phase: 'connexion', config })
      if (!r.ok) return setEtat({ phase: 'erreur', code: (await lireJson(r)).code || `http-${r.status}` })
      setEtat({ phase: 'document', config, personne: await r.json() })
    } catch {
      setEtat({ phase: 'erreur', code: 'reseau' })
    }
  }

  async function entrer(nom) {
    try {
      const r = await fetch('/api/dev/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nom }),
      })
      if (!r.ok) return setEtat({ phase: 'erreur', code: (await lireJson(r)).code || `http-${r.status}` })
      charger()
    } catch {
      setEtat({ phase: 'erreur', code: 'reseau' })
    }
  }

  useEffect(() => {
    charger()
  }, [])

  if (etat.phase === 'chargement') return <EcranMessage texte={t('application.chargement')} />
  if (etat.phase === 'erreur') return <EcranMessage texte={messageErreur(t, etat.code)} />
  if (etat.phase === 'connexion')
    return (
      <EcranConnexion
        titre={t('connexion.titre')}
        explication={t('connexion.explication')}
        libelleNom={t('connexion.nom')}
        libelleBouton={t('connexion.bouton')}
        surEntrer={entrer}
      />
    )
  const nom = nomDansAdresse()
  // Une adresse illisible a le même message qu'un nom refusé, sans dépendre du domaine.
  const doc = nom === null ? { ok: false, code: 'document-caracteres' } : identifiantDocument(nom)
  if (!doc.ok) return <EcranMessage texte={messageErreur(t, doc.code)} />
  return <Document config={etat.config} personne={etat.personne} docId={doc.id} />
}

/** Mes droits sur un document, décidés par le serveur. En développement, un
 * document qui n'existe pas encore est créé : j'en deviens propriétaire. */
async function obtenirDroits(docId, dev) {
  try {
    const r = await fetch(`/api/droits?document=${encodeURIComponent(docId)}`)
    if (r.ok) return r.json()
    if (r.status === 404 && dev) {
      const creation = await fetch('/api/dev/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ document: docId }),
      })
      if (creation.ok) return creation.json()
    }
    return { code: (await lireJson(r)).code || `http-${r.status}` }
  } catch {
    return { code: 'reseau' }
  }
}

function Document({ config, personne, docId }) {
  const [droits, setDroits] = useState(null)
  useEffect(() => {
    let actif = true
    obtenirDroits(docId, config.dev).then((d) => actif && setDroits(d))
    return () => {
      actif = false
    }
  }, [config, docId])
  useEffect(() => {
    const f = () => location.reload()
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  if (!droits) return <EcranMessage texte={t('application.chargement')} />
  if (droits.code) return <EcranMessage texte={messageErreur(t, droits.code)} />
  return <Edition config={config} personne={personne} docId={docId} droits={droits} />
}

function Edition({ config, personne, docId, droits }) {
  // L'interface suit les capacités, jamais le nom du rôle.
  const caps = droits.capacites
  const mode = caps.includes('ecrire') ? 'ecrire' : caps.includes('suggerer') ? 'suggerer' : 'lire'
  const moi = useMemo(() => ({ ...personne, couleur: couleurAuteur(personne.id) }), [personne])
  const session = useMemo(
    () => ouvrirDocument({ url: config.collaboration, docId, personne: moi, suggestions: mode !== 'lire' }),
    [config, docId, moi, mode],
  )
  const commentaires = useMemo(
    () => (caps.includes('commenter') ? { service: serviceCommentaires(docId), capacites: caps } : null),
    [caps, docId],
  )
  const [connexion, setConnexion] = useState('connexion')
  const [autres, setAutres] = useState(0)
  const [suggestions, setSuggestions] = useState(null)
  const [noms, setNoms] = useState({})
  useEffect(() => session.surEtat(setConnexion), [session])
  useEffect(() => session.surParticipants(setAutres), [session])
  useEffect(() => () => session.fermer(), [session])
  // Les noms des auteurs des suggestions, demandés une fois chacun.
  useEffect(() => {
    const manquants = [...new Set((suggestions?.liste ?? []).map((s) => s.auteur))].filter((id) => id && !(id in noms))
    if (manquants.length)
      nomsDe(manquants).then((l) => setNoms((n) => ({ ...n, ...Object.fromEntries(l.map((p) => [p.id, p.username])) })))
  }, [suggestions, noms])

  const ligne = (s) => {
    const auteur = noms[s.auteur] ?? t('suggestions.auteurInconnu')
    const v = { auteur, avant: s.avant.trim(), apres: s.apres.trim() }
    if (s.type === 'ajout') return t('suggestions.ajout', v)
    if (s.type === 'suppression') return t('suggestions.suppression', v)
    return t('suggestions.remplacement', v)
  }
  return (
    <PageEdition
      titre={t('document.titre', { id: docId })}
      etat={t('document.etat', { etat: connexion })}
      participants={t('document.participants', { n: autres })}
      mention={{ ecrire: null, suggerer: t('document.modeSuggestion'), lire: t('document.lectureSeule') }[mode]}
      cote={
        suggestions ? (
          <PanneauSuggestions
            titre={t('suggestions.titre', { n: suggestions.liste.length })}
            lignes={suggestions.liste.map((s) => ({ cle: `${s.debut}-${s.type}`, texte: ligne(s) }))}
            libelles={{
              accepter: t('suggestions.accepter'),
              refuser: t('suggestions.refuser'),
              toutAccepter: t('suggestions.toutAccepter'),
              toutRefuser: t('suggestions.toutRefuser'),
            }}
            surAccepter={(i) => suggestions.accepter(suggestions.liste[i])}
            surRefuser={(i) => suggestions.refuser(suggestions.liste[i])}
            surToutAccepter={suggestions.toutAccepter}
            surToutRefuser={suggestions.toutRefuser}
          />
        ) : null
      }
      editeur={
        <EditeurCollaboratif
          contexte={session.contexte}
          personne={moi}
          langue={t.langue}
          langueDocument={LANGUE_DOCUMENT_PAR_DEFAUT}
          nomAccessible={t('document.zoneEdition', { id: docId })}
          mode={mode}
          nomsDe={nomsDe}
          commentaires={commentaires}
          surSuggestions={caps.includes('arbitrer') ? setSuggestions : undefined}
        />
      }
    />
  )
}
