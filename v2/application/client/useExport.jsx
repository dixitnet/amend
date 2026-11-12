// La fenêtre « Exporter » d'un document.
import { useState } from 'react'
import { Fenetre, PanneauExport } from '../../design/index.js'
import { messageErreur } from '../../i18n/index.js'
import { LANGUE_DOCUMENT_PAR_DEFAUT } from '../../domaine/index.js'
import { exporterDocument, modeleComplet } from './exports.js'
import { t, envoyerJson } from './commun.js'
import { groupesDeModeles } from './Modeles.jsx'

/** La fenêtre « Exporter » d'un document, comme ModalExport de Docs : le
 * format, et pour le PDF le modèle de mise en page (celui retenu pour le
 * document, présélectionné). Le modèle d'un export réussi devient celui du
 * document pour qui peut le choisir : le dernier retenu (Sylvain, 12/11/2026). */
export function useExport({ docId, controle, titre, auteur }) {
  const [ouverte, setOuverte] = useState(false)
  const [format, setFormat] = useState('pdf')
  const [liste, setListe] = useState(null)
  const [modele, setModele] = useState(null)
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState(null)
  const ouvrir = async () => {
    setMessage(null)
    setOuverte(true)
    try {
      const l = await envoyerJson('GET', `/api/documents/${encodeURIComponent(docId)}/modeles`)
      setListe(l)
      setModele(l.retenu)
    } catch (e) {
      setMessage(messageErreur(t, e.code || 'reseau'))
    }
  }
  const exporter = async () => {
    setEnCours(true)
    setMessage(null)
    try {
      let leModele
      if (format === 'pdf') {
        // Un modèle qu'on ne trouve plus se dit, sans repli silencieux (audit du 11/11/2026).
        const entree = liste?.modeles.find((m) => m.id === modele)
        if (!entree) throw Object.assign(new Error('modele-introuvable'), { code: 'modele-introuvable' })
        leModele = modeleComplet(entree)
      }
      await exporterDocument(controle, format, { titre, langue: LANGUE_DOCUMENT_PAR_DEFAUT, modele: leModele, auteur })
      // Le modèle n'est retenu qu'une fois le fichier obtenu (audit du 11/11/2026) ;
      // s'il ne peut l'être, l'export reste réussi (audit du 12/11/2026).
      if (format === 'pdf' && liste?.peutChoisir && modele !== liste.choisi)
        await envoyerJson('PUT', `/api/documents/${encodeURIComponent(docId)}/modele`, { modele }).catch(() => {})
      setOuverte(false)
    } catch (e) {
      const code = e?.code
      setMessage(
        ['modele-impossible', 'modele-introuvable', 'droit-insuffisant', 'reseau'].includes(code)
          ? messageErreur(t, code)
          : t('document.exportEchoue'),
      )
    } finally {
      setEnCours(false)
    }
  }
  const fenetre = (
    <Fenetre
      ouverte={ouverte}
      titre={t('export.titre')}
      libelleFermer={t('interface.fermer')}
      surFermer={() => setOuverte(false)}
    >
      {ouverte ? (
        <PanneauExport
          libelles={{
            format: t('export.format'),
            modele: t('export.modele'),
            exporter: t('export.exporter'),
            annuler: t('interface.annuler'),
          }}
          formats={[
            { value: 'pdf', label: t('export.pdf') },
            { value: 'markdown', label: t('export.markdown') },
          ]}
          format={format}
          surFormat={setFormat}
          modeles={
            format === 'pdf' && liste
              ? groupesDeModeles(
                  liste.equipe,
                  liste.modeles.filter((m) => m.code || m.instance),
                  liste.modeles.filter((m) => !m.code && !m.instance),
                )
              : null
          }
          modele={modele}
          surModele={setModele}
          enCours={enCours}
          message={message}
          surExporter={exporter}
          surAnnuler={() => setOuverte(false)}
        />
      ) : null}
    </Fenetre>
  )
  return [fenetre, ouvrir]
}
