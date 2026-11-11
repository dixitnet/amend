// L'écran de connexion (lien par courriel, nom en développement).
import { useState } from 'react'
import { EcranConnexion, EcranCourriel } from '../../design/index.js'
import { messageErreur } from '../../i18n/index.js'
import { t, envoyerJson } from './commun.js'

/** La connexion : un lien par courriel (le document visé l'accompagne, pour
 * l'accès par lien) ; en développement, aussi un simple nom. */
export function Connexion({ config, visee, surEntrerEnDev }) {
  const [message, setMessage] = useState(null)
  async function envoyer(courriel) {
    try {
      await envoyerJson('POST', '/api/connexion', { courriel, document: visee?.document ?? null })
      setMessage(t('connexion.envoye'))
    } catch (err) {
      setMessage(messageErreur(t, err.code || 'reseau'))
    }
  }
  const dev = config.dev ? (
    <EcranConnexion
      nomApplication={t('application.nom')}
      titre={t('connexion.dev.titre')}
      explication={t('connexion.dev.explication')}
      libelleNom={t('connexion.dev.nom')}
      libelleBouton={t('connexion.dev.bouton')}
      surEntrer={surEntrerEnDev}
    />
  ) : null
  return (
    <>
      {dev}
      <EcranCourriel
        nomApplication={config.dev ? null : t('application.nom')}
        titre={t('connexion.titre')}
        explication={t('connexion.explication')}
        libelleCourriel={t('connexion.courriel')}
        libelleBouton={t('connexion.envoyer')}
        message={message}
        surEnvoyer={envoyer}
      />
    </>
  )
}
