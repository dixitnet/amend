// L'écran de l'étape 1 (couche application technique) : état, appels au
// serveur, ouverture du document. Tout l'affichage est délégué à la couche
// design ; tous les textes viennent de v2/i18n/.
import { useEffect, useMemo, useState } from 'react'
import { PageEdition, EcranMessage, EcranConnexion, themeEditeur, couleurAuteur } from '../../design/index.js'
import { creerTraducteur, choisirLangue } from '../../i18n/index.js'
import { ouvrirDocument } from '../../adaptateurs/yjs/index.js'
import { EditeurCollaboratif } from '../../adaptateurs/blocknote/index.jsx'

const t = creerTraducteur(choisirLangue(navigator.languages))
document.documentElement.lang = t.langue

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
  if (etat.phase === 'erreur') return <EcranMessage texte={t('application.erreur', { code: etat.code })} />
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
  return <Document config={etat.config} personne={etat.personne} />
}

function Document({ config, personne }) {
  const docId = decodeURIComponent(location.hash.slice(1)) || 'essai'
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
  useEffect(() => {
    const f = () => location.reload()
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  return (
    <PageEdition
      titre={t('document.titre', { id: docId })}
      etat={t('document.etat', { etat: connexion })}
      participants={t('document.participants', { n: autres })}
      editeur={
        <EditeurCollaboratif contexte={session.contexte} personne={moi} langue={t.langue} theme={themeEditeur} />
      }
    />
  )
}
