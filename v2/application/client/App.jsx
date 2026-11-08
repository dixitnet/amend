// L'écran d'un document (couche application technique) : état, appels au
// serveur, ouverture du document. Tout l'affichage est délégué à la couche
// design ; tous les textes viennent de v2/i18n/.
import { useEffect, useMemo, useState } from 'react'
import { PageEdition, EcranMessage, EcranConnexion, themeEditeur, couleurAuteur } from '../../design/index.js'
import { creerTraducteur, choisirLangue, messageErreur, LANGUE_PSEUDO } from '../../i18n/index.js'
import { identifiantDocument } from '../../domaine/index.js'
import { ouvrirDocument } from '../../adaptateurs/yjs/index.js'
import { EditeurCollaboratif } from '../../adaptateurs/blocknote/index.jsx'

// La langue : celle demandée dans l'adresse (?langue=fr|en|pseudo, pour les
// essais et les captures), sinon celle du navigateur.
const demandee = new URLSearchParams(location.search).get('langue')
const t = creerTraducteur(
  demandee === LANGUE_PSEUDO ? LANGUE_PSEUDO : choisirLangue([demandee, ...navigator.languages]),
)
document.documentElement.lang = t.langue
document.title = t('application.nom')

const lireJson = (r) => r.json().catch(() => ({}))

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
    const r = await fetch('/api/dev/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nom }),
    })
    if (!r.ok) return setEtat({ phase: 'erreur', code: (await lireJson(r)).code || `http-${r.status}` })
    charger()
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
  const doc = identifiantDocument(decodeURIComponent(location.hash.slice(1)) || 'essai')
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
  const modifiable = droits.capacites.includes('ecrire')
  const moi = useMemo(() => ({ ...personne, couleur: couleurAuteur(personne.id) }), [personne])
  const session = useMemo(
    () => ouvrirDocument({ url: config.collaboration, docId, personne: moi }),
    [config, docId, moi],
  )
  const [connexion, setConnexion] = useState('connexion')
  const [autres, setAutres] = useState(0)
  useEffect(() => session.surEtat(setConnexion), [session])
  useEffect(() => session.surParticipants(setAutres), [session])
  useEffect(() => () => session.fermer(), [session])

  return (
    <PageEdition
      titre={t('document.titre', { id: docId })}
      etat={t('document.etat', { etat: connexion })}
      participants={t('document.participants', { n: autres })}
      mention={modifiable ? null : t('document.lectureSeule')}
      editeur={
        <EditeurCollaboratif
          contexte={session.contexte}
          personne={moi}
          langue={t.langue}
          theme={themeEditeur}
          nomAccessible={t('document.zoneEdition', { id: docId })}
          modifiable={modifiable}
        />
      }
    />
  )
}
