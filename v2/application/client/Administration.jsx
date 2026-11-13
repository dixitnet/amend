// Le back-office de l'instance (administrateurs).
import { useEffect, useState } from 'react'
import { EcranMessage, PageAdministration, Bouton, PanneauConnecteur } from '../../design/index.js'
import { messageErreur } from '../../i18n/index.js'
import { t, envoyerJson, nomDuModele } from './commun.js'
import { courbeDeMemoire } from './suivi.js'
import { ModelesInstance, PolicesInstance } from './Modeles.jsx'
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
  // Le connecteur Claude (12/11/2026) : son état, et l'adresse juste après sa création.
  const [connecteur, setConnecteur] = useState(null)
  const [adresseConnecteur, setAdresseConnecteur] = useState(null)
  const chargerConnecteur = () =>
    envoyerJson('GET', '/api/admin/connecteur')
      .then(setConnecteur)
      .catch((e) => setMessage(messageErreur(t, e.code || 'reseau')))
  useEffect(() => {
    chargerConnecteur()
  }, [])
  const creerConnecteur = () =>
    envoyerJson('POST', '/api/admin/connecteur')
      .then((r) => (setAdresseConnecteur(r.adresse), chargerConnecteur()))
      .catch((e) => setMessage(messageErreur(t, e.code || 'reseau')))
  const revoquerConnecteur = async () => {
    const ok = await confirmer({
      titre: t('admin.connecteur.revoquer'),
      texte: t('admin.connecteur.confirmerRevocation'),
      libelle: t('admin.connecteur.revoquer'),
      danger: true,
    })
    if (!ok) return
    await envoyerJson('DELETE', '/api/admin/connecteur').catch((e) => setMessage(messageErreur(t, e.code || 'reseau')))
    setAdresseConnecteur(null)
    chargerConnecteur()
  }
  // Les modèles de mise en page de l'instance (12/11/2026).
  const [modeles, setModeles] = useState(null)
  const [erreurModeles, setErreurModeles] = useState(null)
  const [fenetreConfirmation, confirmer] = useConfirmation()
  const chargerModeles = () =>
    envoyerJson('GET', '/api/admin/modeles')
      .then((d) => (setModeles(d), setErreurModeles(null)))
      .catch((e) => setErreurModeles(e.code || 'reseau'))
  // Les polices de l'instance (13/11/2026) ; une police envoyée ou retirée
  // change aussi le catalogue des modèles.
  const [polices, setPolices] = useState(null)
  const [erreurPolices, setErreurPolices] = useState(null)
  const chargerPolices = () =>
    envoyerJson('GET', '/api/admin/polices')
      .then((d) => (setPolices(d), setErreurPolices(null)))
      .catch((e) => setErreurPolices(e.code || 'reseau'))
  useEffect(() => {
    chargerModeles()
    chargerPolices()
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
          // La synthèse : les chiffres de l'instance en cartes (Sylvain, 12/11/2026).
          titre: t('admin.synthese'),
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
          // Le système (Sylvain, 12/11/2026) : la mémoire des processus, puis le
          // journal, réunis ; une ligne dit ce qui manque encore.
          titre: t('admin.systeme'),
          courbes,
          vide: erreurSuivi ? messageErreur(t, erreurSuivi) : t('application.chargement'),
          lignes: suivi
            ? [
                ...(courbes.length ? [] : [{ libelle: t('admin.suivi'), valeur: t('admin.memoireAucune') }]),
                ...(lignesDuJournal.length
                  ? lignesDuJournal
                  : [{ libelle: t('admin.journal'), valeur: t('admin.journalVide') }]),
              ]
            : [],
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
          titre: t('admin.polices.titre'),
          lignes: [],
          vide: erreurPolices ? messageErreur(t, erreurPolices) : t('application.chargement'),
          contenu: polices ? (
            <PolicesInstance
              donnees={polices}
              confirmer={confirmer}
              surChangement={() => (chargerPolices(), chargerModeles())}
            />
          ) : null,
        },
        {
          titre: t('admin.connecteur.titre'),
          lignes: [],
          vide: t('application.chargement'),
          contenu: connecteur ? (
            <>
              <PanneauConnecteur
                explication={t('admin.connecteur.explication')}
                etat={
                  connecteur.actif
                    ? t('admin.connecteur.actif', { date: date.format(connecteur.creeLe) })
                    : t('admin.connecteur.inactif')
                }
                actif={connecteur.actif}
                adresse={adresseConnecteur}
                avertissement={t('admin.connecteur.avertissement')}
                libelles={{
                  creer: t('admin.connecteur.creer'),
                  renouveler: t('admin.connecteur.renouveler'),
                  revoquer: t('admin.connecteur.revoquer'),
                  copier: t('admin.connecteur.copier'),
                  copie: t('admin.connecteur.copie'),
                  adresse: t('admin.connecteur.adresse'),
                }}
                surCreer={creerConnecteur}
                surRevoquer={revoquerConnecteur}
              />
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
