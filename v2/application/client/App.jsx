// L'aiguillage des écrans d'après l'adresse (couche application technique ;
// tout l'affichage est délégué à la couche design, tous les textes à v2/i18n/).
import { useEffect, useState } from 'react'
import { EcranMessage, EcranConnexion } from '../../design/index.js'
import { messageErreur } from '../../i18n/index.js'
import { identifiantDocument } from '../../domaine/index.js'
import { sessionRetrouvee } from './commentaires.js'
import { t, lireJson, envoyerJson } from './commun.js'
import { Connexion } from './Connexion.jsx'
import { SupprimerCompte } from './Compte.jsx'
import { Accueil } from './Accueil.jsx'
import { Administration } from './Administration.jsx'
import { Document } from './Document.jsx'

/** Ce que vise l'adresse : `#` vide, mes documents ; `#/dossiers/id`, l'un
 * de mes dossiers ; `#/partages`, Partagé avec moi ; `#/equipes/id` et
 * `#/equipes/id/dossiers/id`, une équipe et ses dossiers ; `#/admin`, le
 * back-office (administrateurs de l'instance) ; `#!code`, un message ;
 * `#/connexion/jeton`, un lien de connexion reçu par courriel ;
 * `#id`, un document (jamais de `/` dans son identifiant) ; `null` si
 * l'adresse est mal encodée (`#%`). */
function viseeDansAdresse() {
  let h
  try {
    h = decodeURIComponent(location.hash.slice(1))
  } catch {
    return null
  }
  if (!h) return { liste: 'mes', dossier: null }
  if (h === '/partages') return { liste: 'partages' }
  if (h === '/admin') return { admin: true }
  if (h === '/compte') return { compte: true }
  const c = h.match(/^\/connexion\/([A-Za-z0-9_-]+)$/)
  if (c) return { connexion: c[1] }
  if (h.startsWith('/dossiers/')) return { liste: 'mes', dossier: h.slice('/dossiers/'.length) }
  const e = h.match(/^\/equipes\/([^/]+)(?:\/dossiers\/([^/]+))?$/)
  if (e) return { liste: `equipe:${e[1]}`, dossier: e[2] ?? null }
  if (h.startsWith('!')) return { message: h.slice(1) }
  return { document: h }
}

export function App() {
  const [etat, setEtat] = useState({ phase: 'chargement' })
  const [visee, setVisee] = useState(viseeDansAdresse)
  useEffect(() => {
    const f = () => setVisee(viseeDansAdresse())
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  async function charger() {
    try {
      const config = await lireJson(await fetch('/api/config'))
      const r = await fetch('/api/moi')
      if (r.status === 401) return setEtat({ phase: 'connexion', config })
      if (!r.ok) return setEtat({ phase: 'erreur', code: (await lireJson(r)).code || `http-${r.status}` })
      const personne = await lireJson(r)
      if (!personne.id) return setEtat({ phase: 'erreur', code: `http-${r.status}` })
      sessionRetrouvee()
      setEtat({ phase: personne.nom ? 'pret' : 'nom', config, personne })
    } catch {
      setEtat({ phase: 'erreur', code: 'reseau' })
    }
  }
  const essayer =
    (f) =>
    async (...a) => {
      try {
        await f(...a)
      } catch (err) {
        setEtat({ phase: 'erreur', code: err.code || 'reseau' })
      }
    }
  const entrerEnDev = essayer(async (nom) => (await envoyerJson('POST', '/api/dev/session', { nom }), charger()))
  const nommer = essayer(async (nom) => (await envoyerJson('PUT', '/api/moi', { nom }), charger()))

  /** Un lien de connexion : la page envoie le jeton (le lien du courrier ne
   * consomme rien, une passerelle qui le visite ne le brûle pas), puis ouvre
   * le document visé. */
  async function entrerParLien(jeton) {
    try {
      const r = await fetch(`/api/connexion/${encodeURIComponent(jeton)}`, { method: 'POST' })
      const corps = await lireJson(r)
      if (!r.ok) return setEtat({ phase: 'erreur', code: corps.code || `http-${r.status}` })
      location.replace(corps.document ? `#${encodeURIComponent(corps.document)}` : '#')
      await charger()
    } catch {
      setEtat({ phase: 'erreur', code: 'reseau' })
    }
  }

  useEffect(() => {
    const v = viseeDansAdresse()
    if (v?.connexion) entrerParLien(v.connexion)
    else charger()
  }, [])

  if (etat.phase === 'chargement') return <EcranMessage texte={t('application.chargement')} />
  if (etat.phase === 'erreur') return <EcranMessage texte={messageErreur(t, etat.code)} />
  if (etat.phase === 'connexion') return <Connexion config={etat.config} visee={visee} surEntrerEnDev={entrerEnDev} />
  if (etat.phase === 'nom')
    return (
      <EcranConnexion
        nomApplication={t('application.nom')}
        titre={t('nom.titre')}
        explication={t('nom.explication')}
        libelleNom={t('nom.nom')}
        libelleBouton={t('nom.bouton')}
        surEntrer={nommer}
      />
    )
  if (visee === null) return <EcranMessage texte={messageErreur(t, 'document-caracteres')} />
  if (visee.message) return <EcranMessage texte={messageErreur(t, visee.message)} />
  if (visee.admin) return <Administration />
  if (visee.compte) return <SupprimerCompte />
  if (visee.liste) return <Accueil config={etat.config} personne={etat.personne} />
  // Une adresse illisible a le même message qu'un nom refusé, sans dépendre du domaine.
  const doc = identifiantDocument(visee.document)
  if (!doc.ok) return <EcranMessage texte={messageErreur(t, doc.code)} />
  return <Document key={doc.id} config={etat.config} personne={etat.personne} docId={doc.id} />
}
