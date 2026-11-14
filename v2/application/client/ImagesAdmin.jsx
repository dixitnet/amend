// L'analyse des images orphelines, dans le back-office (14/11/2026) : un bouton
// qui lit `GET /api/admin/images-orphelines` et en montre le rapport.
import { useState } from 'react'
import { PanneauImages } from '../../design/index.js'
import { messageErreur } from '../../i18n/index.js'
import { t, envoyerJson } from './commun.js'

const mo = (octets) => t('admin.images.poids', { mo: Math.round((octets / (1024 * 1024)) * 10) / 10 })

/** Le rapport tel que le serveur l'envoie, en lignes de texte pour le panneau. */
function rapportAffiche(r) {
  const ligne = (cle, libelle, c) => ({ cle, libelle, nombre: String(c.n), poids: mo(c.octets) })
  return {
    lignes: [
      ligne('total', t('admin.images.total'), r.total),
      ligne('utilisees', t('admin.images.utilisees'), r.utilisees),
      ligne('orphelines', t('admin.images.orphelines'), r.orphelines),
      ligne('recentes', t('admin.images.recentes'), r.recentes),
      ligne('corbeille', t('admin.images.corbeille'), r.corbeille),
    ],
    avertissement: r.documentsIllisibles ? t('admin.images.illisibles', { n: r.documentsIllisibles }) : null,
    note: t('admin.images.note'),
    documents: r.documents.map((d) => ({ cle: d.document, nombre: String(d.n), poids: mo(d.octets) })),
  }
}

export function ImagesInstance() {
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState(null)
  const [rapport, setRapport] = useState(null)
  const analyser = async () => {
    setEnCours(true)
    setMessage(null)
    try {
      setRapport(rapportAffiche(await envoyerJson('GET', '/api/admin/images-orphelines')))
    } catch (e) {
      setRapport(null)
      setMessage(messageErreur(t, e.code || 'reseau'))
    } finally {
      setEnCours(false)
    }
  }
  return (
    <PanneauImages
      libelles={{
        intro: t('admin.images.intro'),
        analyser: t('admin.images.analyser'),
        titreRapport: t('admin.images.titreRapport'),
        colonnes: {
          rubrique: t('admin.images.colonnes.rubrique'),
          nombre: t('admin.images.colonnes.nombre'),
          poids: t('admin.images.colonnes.poids'),
        },
        titreDocuments: t('admin.images.titreDocuments'),
        colonnesDocuments: {
          document: t('admin.images.colonnesDocuments.document'),
          nombre: t('admin.images.colonnesDocuments.nombre'),
          poids: t('admin.images.colonnesDocuments.poids'),
        },
      }}
      enCours={enCours}
      message={message}
      surAnalyser={analyser}
      rapport={rapport}
    />
  )
}
