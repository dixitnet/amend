// La suppression du compte de la personne connectée.
import { useEffect, useState } from 'react'
import { EcranMessage, EcranSuppressionCompte, montrerMessage } from '../../design/index.js'
import { messageErreur } from '../../i18n/index.js'
import { t, envoyerJson } from './commun.js'

/** Supprimer mon compte (lots du 11/11/2026, lot D ; règle de la v1) :
 * l'aperçu du serveur, groupé, puis la confirmation par l'adresse. */
export function SupprimerCompte() {
  const [plan, setPlan] = useState(null)
  useEffect(() => {
    envoyerJson('GET', '/api/moi/suppression')
      .then(setPlan)
      .catch((e) => montrerMessage(messageErreur(t, e.code || 'reseau'), { erreur: true }))
  }, [])
  if (!plan) return <EcranMessage texte={t('application.chargement')} />
  const liste = (xs) => new Intl.ListFormat(t.langue, { type: 'conjunction' }).format(xs)
  const titre = (d) => d.titre || t('documents.sansTitre')
  const docs = (sort) => plan.documents.filter((d) => d.sort === sort)
  const equipes = (sort) => plan.equipes.filter((e) => e.sort === sort)
  const groupes = [
    { cle: 'supprime', titre: t('compte.supprimes'), elements: docs('supprime').map(titre) },
    {
      cle: 'confie',
      titre: t('compte.confies'),
      elements: docs('confie').map((d) => t('compte.confie', { titre: titre(d), nom: d.aNom ?? '' })),
    },
    { cle: 'quitte', titre: t('compte.quittes'), elements: docs('quitte').map(titre) },
    { cle: 'equipesQuittees', titre: t('compte.equipesQuittees'), elements: equipes('quitte').map((e) => e.nom) },
    {
      cle: 'equipesSupprimees',
      titre: t('compte.equipesSupprimees'),
      elements: equipes('supprime').map((e) => e.nom),
    },
  ].filter((g) => g.elements.length)
  const refus = [
    docs('refus').length ? t('compte.refusDocuments', { liste: liste(docs('refus').map(titre)) }) : null,
    equipes('refus').length ? t('compte.refusEquipes', { liste: liste(equipes('refus').map((e) => e.nom)) }) : null,
  ].filter(Boolean)
  return (
    <EcranSuppressionCompte
      titre={t('compte.supprimer')}
      explication={groupes.length ? t('compte.explication') : t('compte.rien')}
      groupes={groupes}
      refus={refus.length ? refus.join(' ') : null}
      libelleCourriel={t('compte.courriel')}
      libelleBouton={t('compte.bouton')}
      libelleRetour={t('compte.retour')}
      surRetour={() => history.back()}
      surConfirmer={async (courriel) => {
        try {
          await envoyerJson('DELETE', '/api/moi', { courriel })
          location.replace('/')
        } catch (e) {
          montrerMessage(messageErreur(t, e.code || 'reseau'), { erreur: true })
        }
      }}
    />
  )
}
