// L'accueil : redirige vers le dernier document ouvert, sinon la coquille vide.
import { useEffect } from 'react'
import { EcranMessage, Coquille, Bandeau, TexteDeVolet, useFormat } from '../../design/index.js'
import { messageErreur } from '../../i18n/index.js'
import { trierDocuments } from '../../domaine/index.js'
import { useVolets } from './volets.js'
import { t, compteDe, boutonGauche } from './commun.js'
import { lireDernier, useVoletDocuments } from './voletDocuments.jsx'

/** À l'ouverture, et aux anciennes adresses de la page « Mes documents »
 * (supprimée le 10/11/2026, Sylvain) : le dernier document ouvert dans ce
 * navigateur, sinon le plus récent ; sans document, la coquille et le volet
 * « Documents ». */
export function Accueil({ config, personne }) {
  const voletDocs = useVoletDocuments(null)
  const { etroit } = useFormat()
  const volets = useVolets(etroit)
  const { donnees, erreur, tous } = voletDocs
  const ids = tous.map((d) => d.id)
  const dernier = lireDernier()
  // Sinon le dernier modifié (date donnée par y/hub, lots du 11/11/2026).
  const cible = ids.includes(dernier) ? dernier : trierDocuments(tous, 'modifies')[0]?.id
  useEffect(() => {
    if (donnees && cible) location.replace(`#${encodeURIComponent(cible)}`)
  }, [donnees, cible])
  if (erreur && !donnees) return <EcranMessage texte={messageErreur(t, erreur)} />
  if (!donnees || cible) return <EcranMessage texte={t('application.chargement')} />
  return (
    <Coquille
      gaucheOuvert={volets.gauche}
      libelleRedimension={t('interface.largeurVolet')}
      bandeau={
        <Bandeau voletGauche={boutonGauche(volets)} titre={t('application.nom')} compte={compteDe(personne, config)} />
      }
      voletGauche={voletDocs.contenu}
    >
      <TexteDeVolet texte={t('documents.aucun')} />
    </Coquille>
  )
}
