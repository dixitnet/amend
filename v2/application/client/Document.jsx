// Un document : lecture des droits, puis l'écran d'édition.
import { useEffect, useState } from 'react'
import { EcranMessage } from '../../design/index.js'
import { messageErreur } from '../../i18n/index.js'
import { t, lireJson } from './commun.js'
import { Edition } from './Edition.jsx'

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

export function Document({ config, personne, docId }) {
  const [droits, setDroits] = useState(null)
  // Relu quand le serveur ferme la connexion parce que les droits ont changé
  // (comme Docs : relire les droits, puis rouvrir l'édition avec eux).
  const [lecture, setLecture] = useState(0)
  useEffect(() => {
    let actif = true
    obtenirDroits(docId, config.dev).then((d) => actif && setDroits(d))
    return () => {
      actif = false
    }
  }, [config, docId, lecture])
  if (!droits) return <EcranMessage texte={t('application.chargement')} />
  if (droits.code) return <EcranMessage texte={messageErreur(t, droits.code)} />
  return (
    <Edition
      key={lecture}
      config={config}
      personne={personne}
      docId={docId}
      droits={droits}
      surDroitsChanges={() => (setDroits(null), setLecture((n) => n + 1))}
    />
  )
}
