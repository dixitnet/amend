// Le back-office de l'instance (administrateurs).
import { useEffect, useState } from 'react'
import { EcranMessage, PageAdministration, Bouton } from '../../design/index.js'
import { messageErreur } from '../../i18n/index.js'
import { t, envoyerJson, nomDuModele } from './commun.js'

/** Le back-office de l'instance (administrateurs) : la rubrique Système
 * (version 2.NNN, serveur, nombres) et la rubrique IA (le modèle de Margo,
 * étape 8) ; le serveur refuse les autres. */
export function Administration() {
  const [systeme, setSysteme] = useState(null)
  const [ia, setIa] = useState(null)
  const [message, setMessage] = useState(null)
  const [erreur, setErreur] = useState(null)
  // Deux chargements indépendants : une panne de la rubrique IA ne cache pas
  // la rubrique Système (audit du 11/11/2026, 3).
  const [erreurIa, setErreurIa] = useState(null)
  useEffect(() => {
    envoyerJson('GET', '/api/admin/systeme')
      .then(setSysteme)
      .catch((e) => setErreur(e.code || 'reseau'))
    envoyerJson('GET', '/api/admin/ia')
      .then(setIa)
      .catch((e) => setErreurIa(e.code || 'reseau'))
  }, [])
  if (erreur) return <EcranMessage texte={messageErreur(t, erreur)} />
  if (!systeme || (!ia && !erreurIa)) return <EcranMessage texte={t('application.chargement')} />
  const date = new Intl.DateTimeFormat(t.langue, { dateStyle: 'medium', timeStyle: 'short' })
  const nombre = new Intl.NumberFormat(t.langue)
  const mo = new Intl.NumberFormat(t.langue, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 0 })
  const { version: v, comptes: c } = systeme
  const choisirModele = (modele) =>
    envoyerJson('PUT', '/api/admin/ia', { modele })
      .then(
        () => (setIa((i) => ({ ...i, modele })), setMessage(t('admin.modeleEnregistre', { nom: nomDuModele(modele) }))),
      )
      .catch((e) => setMessage(messageErreur(t, e.code || 'reseau')))
  return (
    <PageAdministration
      nomApplication={t('application.nom')}
      titre={t('admin.titre')}
      actions={<Bouton libelle={t('document.mesDocuments')} surClic={() => (location.hash = '#')} />}
      message={message}
      rubriques={[
        {
          titre: t('admin.systeme'),
          lignes: [
            {
              libelle: t('admin.version'),
              valeur: v.numero
                ? t('admin.versionValeur', { numero: v.numero, commit: v.commit, date: date.format(v.date) })
                : t('admin.versionInconnue'),
            },
            { libelle: t('admin.demarrage'), valeur: date.format(systeme.demarrage) },
            { libelle: t('admin.memoire'), valeur: mo.format(systeme.memoire / 1e6) },
            { libelle: t('admin.node'), valeur: systeme.node },
            { libelle: t('admin.personnes'), valeur: nombre.format(c.personnes) },
            { libelle: t('admin.essai'), valeur: nombre.format(c.essai) },
            { libelle: t('admin.documents'), valeur: nombre.format(c.documents) },
            { libelle: t('admin.equipes'), valeur: nombre.format(c.equipes) },
          ],
        },
        {
          titre: t('admin.ia'),
          lignes: [
            erreurIa
              ? { libelle: t('admin.modeleMargo'), valeur: messageErreur(t, erreurIa) }
              : {
                  libelle: t('admin.modeleMargo'),
                  choix: {
                    valeur: ia.modele ?? ia.defaut,
                    surChange: choisirModele,
                    options: ia.modeles.map((m) => ({
                      valeur: m.id,
                      libelle: m.disponible ? nomDuModele(m.id) : t('admin.modeleSansCle', { nom: nomDuModele(m.id) }),
                      desactive: !m.disponible,
                    })),
                  },
                },
          ],
        },
      ]}
    />
  )
}
