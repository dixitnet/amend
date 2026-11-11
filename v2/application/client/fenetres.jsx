// Les crochets des fenêtres de saisie et de confirmation.
import { useState } from 'react'
import { FenetreSaisie, FenetreConfirmation } from '../../design/index.js'
import { t } from './commun.js'

/** La fenêtre de saisie d'un nom : `{ titre, libelle, valeur?, valider }` ou null. */
export function useSaisie() {
  const [saisie, setSaisie] = useState(null)
  const fenetre = (
    <FenetreSaisie
      key={saisie ? saisie.titre + (saisie.valeur ?? '') : 'fermee'}
      ouverte={!!saisie}
      titre={saisie?.titre}
      libelle={saisie?.libelle}
      valeur={saisie?.valeur}
      libelleValider={t('interface.valider')}
      libelleAnnuler={t('interface.annuler')}
      surValider={async (v) => {
        const f = saisie.valider
        setSaisie(null)
        await f(v)
      }}
      surFermer={() => setSaisie(null)}
    />
  )
  return [fenetre, setSaisie]
}

/** Une confirmation dans une fenêtre de Mantine, comme Docs (Sylvain,
 * 10/11/2026) : `confirmer({ titre, texte, libelle, danger })` rend une
 * promesse, vraie si la personne confirme. */
export function useConfirmation() {
  const [demande, setDemande] = useState(null)
  const repondre = (oui) => {
    demande?.repondre(oui)
    setDemande(null)
  }
  const fenetre = (
    <FenetreConfirmation
      ouverte={!!demande}
      titre={demande?.titre}
      texte={demande?.texte}
      libelleConfirmer={demande?.libelle}
      libelleAnnuler={t('interface.annuler')}
      danger={demande?.danger}
      surConfirmer={() => repondre(true)}
      surFermer={() => repondre(false)}
    />
  )
  // Une nouvelle demande répond « non » à celle qui attendait encore (audit du 10/11/2026).
  const confirmer = (o) =>
    new Promise((r) =>
      setDemande((avant) => {
        avant?.repondre(false)
        return { ...o, repondre: r }
      }),
    )
  return [fenetre, confirmer]
}
