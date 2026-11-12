// Le back-office de l'instance (administrateurs).
import { useEffect, useState } from 'react'
import { EcranMessage, PageAdministration, Bouton } from '../../design/index.js'
import { messageErreur } from '../../i18n/index.js'
import { t, envoyerJson, nomDuModele } from './commun.js'
import { courbeDeMemoire } from './suivi.js'
import { ModelesInstance } from './Modeles.jsx'
import { useConfirmation } from './fenetres.jsx'

/** La période du suivi (le serveur garde sept jours de relevés). */
const SEPT_JOURS_MS = 7 * 24 * 3600 * 1000

// Les noms des modèles d'interface et des couleurs (design/apparence.js).
const NOMS_INTERFACES = {
  atelier: () => t('admin.interfaces.atelier'),
  origine: () => t('admin.interfaces.origine'),
}
const nomDuModeleInterface = (n) => NOMS_INTERFACES[n]?.() ?? n
const NOMS_COULEURS = {
  vermillon: () => t('admin.couleurs.vermillon'),
  vert: () => t('admin.couleurs.vert'),
  encre: () => t('admin.couleurs.encre'),
  indigo: () => t('admin.couleurs.indigo'),
  bleu: () => t('admin.couleurs.bleu'),
  violet: () => t('admin.couleurs.violet'),
  petrole: () => t('admin.couleurs.petrole'),
  sepia: () => t('admin.couleurs.sepia'),
}
const nomDeLaCouleur = (n) => NOMS_COULEURS[n]?.() ?? n

/** Le back-office de l'instance (administrateurs) : les rubriques Système
 * (version 2.NNN, serveur, nombres), Apparence (modèle d'interface et couleur
 * de l'instance, 11/11/2026) et IA (le modèle de Margo, étape 8) ; le serveur
 * refuse les autres. `surApparence` : l'apparence choisie, appliquée tout de
 * suite à l'écran. */
export function Administration({ surApparence }) {
  const [systeme, setSysteme] = useState(null)
  const [ia, setIa] = useState(null)
  const [message, setMessage] = useState(null)
  const [erreur, setErreur] = useState(null)
  // Deux chargements indépendants : une panne de la rubrique IA ne cache pas
  // la rubrique Système (audit du 11/11/2026, 3).
  const [erreurIa, setErreurIa] = useState(null)
  // Le suivi (mémoire, journal) : indépendant lui aussi ; `maintenant` est
  // l'heure du chargement, la fin de la période tracée.
  const [suivi, setSuivi] = useState(null)
  const [erreurSuivi, setErreurSuivi] = useState(null)
  const [maintenant] = useState(() => Date.now())
  // Les modèles de mise en page de l'instance (12/11/2026).
  const [modeles, setModeles] = useState(null)
  const [erreurModeles, setErreurModeles] = useState(null)
  const [fenetreConfirmation, confirmer] = useConfirmation()
  const chargerModeles = () =>
    envoyerJson('GET', '/api/admin/modeles')
      .then((d) => (setModeles(d), setErreurModeles(null)))
      .catch((e) => setErreurModeles(e.code || 'reseau'))
  useEffect(() => {
    chargerModeles()
  }, [])
  const [apparence, setApparence] = useState(null)
  const [erreurApparence, setErreurApparence] = useState(null)
  useEffect(() => {
    envoyerJson('GET', '/api/admin/suivi')
      .then(setSuivi)
      .catch((e) => setErreurSuivi(e.code || 'reseau'))
    envoyerJson('GET', '/api/admin/apparence')
      .then(setApparence)
      .catch((e) => setErreurApparence(e.code || 'reseau'))
    envoyerJson('GET', '/api/admin/systeme')
      .then(setSysteme)
      .catch((e) => setErreur(e.code || 'reseau'))
    envoyerJson('GET', '/api/admin/ia')
      .then(setIa)
      .catch((e) => setErreurIa(e.code || 'reseau'))
  }, [])
  if (erreur) return <EcranMessage texte={messageErreur(t, erreur)} />
  if (!systeme || (!ia && !erreurIa) || (!apparence && !erreurApparence))
    return <EcranMessage texte={t('application.chargement')} />
  const date = new Intl.DateTimeFormat(t.langue, { dateStyle: 'medium', timeStyle: 'short' })
  const nombre = new Intl.NumberFormat(t.langue)
  const mo = new Intl.NumberFormat(t.langue, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 0 })
  const { version: v, comptes: c } = systeme
  const periode = { debut: maintenant - SEPT_JOURS_MS, fin: maintenant }
  const courbes = [
    ['serveur', t('admin.memoireServeur'), t('admin.processusServeur')],
    ['collaboration', t('admin.memoireCollaboration'), t('admin.processusCollaboration')],
  ].flatMap(([processus, libelle, nom]) => {
    const courbe = courbeDeMemoire(suivi?.mesures ?? [], processus, periode)
    return courbe
      ? [
          {
            libelle,
            legende: t('admin.memoireLegende', {
              processus: nom,
              min: mo.format(courbe.min / 1e6),
              max: mo.format(courbe.max / 1e6),
              dernier: mo.format(courbe.dernier / 1e6),
            }),
            points: courbe.points,
          },
        ]
      : []
  })
  const dateCourte = new Intl.DateTimeFormat(t.langue, { dateStyle: 'short', timeStyle: 'medium' })
  const lignesDuJournal = (suivi?.journal ?? []).map((j) => {
    const v = { code: j.code, methode: j.detail?.methode ?? '', chemin: j.detail?.chemin ?? '' }
    return {
      libelle: dateCourte.format(j.le),
      valeur: j.type === 'erreur' ? t('admin.journalErreur', v) : t('admin.journalRefus', v),
    }
  })
  const choisirModele = (modele) =>
    envoyerJson('PUT', '/api/admin/ia', { modele })
      .then(
        () => (setIa((i) => ({ ...i, modele })), setMessage(t('admin.modeleEnregistre', { nom: nomDuModele(modele) }))),
      )
      .catch((e) => setMessage(messageErreur(t, e.code || 'reseau')))
  // L'apparence s'applique tout de suite à l'écran, et à toute l'instance.
  const choisirApparence = (champ) => (valeur) => {
    const nouvelle = { ...apparence.apparence, [champ]: valeur }
    envoyerJson('PUT', '/api/admin/apparence', nouvelle)
      .then(() => {
        setApparence((a) => ({ ...a, apparence: nouvelle }))
        surApparence?.(nouvelle)
        setMessage(t('admin.apparenceEnregistree'))
      })
      .catch((e) => setMessage(messageErreur(t, e.code || 'reseau')))
  }
  // `apparence` est nul quand la rubrique n'a pas pu se lire : la ligne
  // affiche alors l'erreur, sans faire tomber la page.
  const ligneApparence = (champ, libelle, noms, nomDe) =>
    erreurApparence
      ? { libelle, valeur: messageErreur(t, erreurApparence) }
      : {
          libelle,
          choix: {
            valeur: apparence.apparence[champ],
            surChange: choisirApparence(champ),
            options: noms.map((n) => ({ valeur: n, libelle: nomDe(n) })),
          },
        }
  return (
    <PageAdministration
      nomApplication={t('application.nom')}
      titre={t('admin.titre')}
      actions={<Bouton libelle={t('document.mesDocuments')} surClic={() => (location.hash = '#')} />}
      message={message}
      rubriques={[
        {
          titre: t('admin.systeme'),
          // Les chiffres de l'instance en cartes (12/11/2026).
          chiffres: true,
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
          titre: t('admin.apparence'),
          lignes: [
            ligneApparence('modele', t('admin.modeleInterface'), apparence?.modeles ?? [], nomDuModeleInterface),
            ligneApparence('couleur', t('admin.couleur'), apparence?.couleurs ?? [], nomDeLaCouleur),
          ],
        },
        {
          titre: t('admin.suivi'),
          courbes,
          vide: erreurSuivi
            ? messageErreur(t, erreurSuivi)
            : suivi
              ? t('admin.memoireAucune')
              : t('application.chargement'),
          lignes: [],
        },
        {
          titre: t('admin.journal'),
          vide: erreurSuivi
            ? messageErreur(t, erreurSuivi)
            : suivi
              ? t('admin.journalVide')
              : t('application.chargement'),
          lignes: lignesDuJournal,
        },
        {
          titre: t('admin.modelesPdf.titre'),
          lignes: [],
          vide: erreurModeles ? messageErreur(t, erreurModeles) : t('application.chargement'),
          contenu: modeles ? (
            <>
              <ModelesInstance donnees={modeles} confirmer={confirmer} surChangement={chargerModeles} />
              {fenetreConfirmation}
            </>
          ) : null,
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
