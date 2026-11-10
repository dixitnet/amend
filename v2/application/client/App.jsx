// Les écrans (couche application technique) : connexion, mes documents,
// l'écran d'un document et son partage ; état et appels au serveur. Tout
// l'affichage est délégué à la couche design ; tous les textes viennent de
// v2/i18n/.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  EcranMessage,
  EcranConnexion,
  EcranCourriel,
  ListeDocuments,
  PageAdministration,
  PanneauPartage,
  PanneauSuggestions,
  BoutonBascule,
  Bouton,
  Choix,
  couleurAuteur,
  Coquille,
  ColonneTexte,
  Bandeau,
  VoletPlanDocuments,
  NavigationListe,
  VoletRelecture,
  TexteDeVolet,
  AlerteHorsLigne,
  Fenetre,
  FenetreSaisie,
  FenetreConfirmation,
  montrerMessage,
  useFormat,
  PageEditionS,
  PlanDocument,
  ListeLiens,
  useFormatS,
} from '../../design/index.js'
import {
  creerTraducteur,
  choisirLangue,
  messageErreur,
  libelleDuRole,
  libelleDuRoleEquipe,
  LANGUE_PSEUDO,
} from '../../i18n/index.js'
import { identifiantDocument, capacites, LANGUE_DOCUMENT_PAR_DEFAUT } from '../../domaine/index.js'
import { ouvrirDocument } from '../../adaptateurs/yjs/index.js'
import { EditeurCollaboratif } from '../../adaptateurs/blocknote/index.jsx'
import { serviceCommentaires, nomsDe, appel } from './commentaires.js'
import { useVolets } from './volets.js'
import { exporterDocument } from './exports.js'

// La langue : celle demandée dans l'adresse (?langue=fr|en|pseudo, pour les
// essais et les captures), sinon celle du navigateur.
const demandee = new URLSearchParams(location.search).get('langue')
const t = creerTraducteur(
  demandee === LANGUE_PSEUDO ? LANGUE_PSEUDO : choisirLangue([demandee, ...navigator.languages]),
)
document.documentElement.lang = t.langue
document.title = t('application.nom')

const lireJson = (r) => r.json().catch(() => ({}))

/** Ce que vise l'adresse : `#` vide, mes documents ; `#/dossiers/id`, l'un
 * de mes dossiers ; `#/partages`, Partagé avec moi ; `#/equipes/id` et
 * `#/equipes/id/dossiers/id`, une équipe et ses dossiers ; `#/admin`, le
 * back-office (administrateurs de l'instance) ; `#!code`, un message ;
 * `#id`, un document (jamais de `/` dans son identifiant) ; `null` si
 * l'adresse est mal encodée (`#%`). */
function viseeDansAdresse() {
  let h
  try {
    h = decodeURIComponent(location.hash.slice(1))
  } catch {
    return null
  }
  if (!h) return { liste: 'mes', dossier: null }
  if (h === '/partages') return { liste: 'partages' }
  if (h === '/admin') return { admin: true }
  if (h.startsWith('/dossiers/')) return { liste: 'mes', dossier: h.slice('/dossiers/'.length) }
  const e = h.match(/^\/equipes\/([^/]+)(?:\/dossiers\/([^/]+))?$/)
  if (e) return { liste: `equipe:${e[1]}`, dossier: e[2] ?? null }
  if (h.startsWith('!')) return { message: h.slice(1) }
  return { document: h }
}

const envoyerJson = appel

export function App() {
  const [etat, setEtat] = useState({ phase: 'chargement' })
  const [visee, setVisee] = useState(viseeDansAdresse)
  useEffect(() => {
    const f = () => setVisee(viseeDansAdresse())
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  async function charger() {
    try {
      const config = await lireJson(await fetch('/api/config'))
      const r = await fetch('/api/moi')
      if (r.status === 401) return setEtat({ phase: 'connexion', config })
      if (!r.ok) return setEtat({ phase: 'erreur', code: (await lireJson(r)).code || `http-${r.status}` })
      const personne = await r.json()
      setEtat({ phase: personne.nom ? 'pret' : 'nom', config, personne })
    } catch {
      setEtat({ phase: 'erreur', code: 'reseau' })
    }
  }
  const essayer =
    (f) =>
    async (...a) => {
      try {
        await f(...a)
      } catch (err) {
        setEtat({ phase: 'erreur', code: err.code || 'reseau' })
      }
    }
  const entrerEnDev = essayer(async (nom) => (await envoyerJson('POST', '/api/dev/session', { nom }), charger()))
  const nommer = essayer(async (nom) => (await envoyerJson('PUT', '/api/moi', { nom }), charger()))

  useEffect(() => {
    charger()
  }, [])

  if (etat.phase === 'chargement') return <EcranMessage texte={t('application.chargement')} />
  if (etat.phase === 'erreur') return <EcranMessage texte={messageErreur(t, etat.code)} />
  if (etat.phase === 'connexion') return <Connexion config={etat.config} visee={visee} surEntrerEnDev={entrerEnDev} />
  if (etat.phase === 'nom')
    return (
      <EcranConnexion
        nomApplication={t('application.nom')}
        titre={t('nom.titre')}
        explication={t('nom.explication')}
        libelleNom={t('nom.nom')}
        libelleBouton={t('nom.bouton')}
        surEntrer={nommer}
      />
    )
  if (visee === null) return <EcranMessage texte={messageErreur(t, 'document-caracteres')} />
  if (visee.message) return <EcranMessage texte={messageErreur(t, visee.message)} />
  if (visee.admin) return <Administration />
  if (visee.liste) return <MesDocuments personne={etat.personne} onglet={visee.liste} dossier={visee.dossier ?? null} />
  // Une adresse illisible a le même message qu'un nom refusé, sans dépendre du domaine.
  const doc = identifiantDocument(visee.document)
  if (!doc.ok) return <EcranMessage texte={messageErreur(t, doc.code)} />
  return <Document key={doc.id} config={etat.config} personne={etat.personne} docId={doc.id} />
}

/** La marque en tête du volet gauche : vers Mes documents. */
const marque = () => ({ nom: t('application.nom'), href: '#' })

/** Le compte, dans le bandeau : l'administration (administrateurs de
 * l'instance) et un seul « Se déconnecter » (Sylvain, 09/11/2026). */
function compteDe(personne) {
  const sortir = async () => {
    await envoyerJson('POST', '/api/deconnexion').catch(() => {})
    location.reload()
  }
  return {
    libelle: t('interface.compte'),
    nom: personne.nom,
    courriel: personne.courriel,
    actions: [
      ...(personne.admin === true
        ? [
            {
              cle: 'admin',
              libelle: t('admin.titre'),
              picto: 'administration',
              surClic: () => (location.hash = '#/admin'),
            },
          ]
        : []),
      { cle: 'sortir', libelle: t('documents.deconnexion'), picto: 'deconnexion', surClic: sortir },
    ],
  }
}

/** Le bouton du volet gauche, dans le bandeau. */
const boutonGauche = (volets) => ({
  libelle: t('telephone.planEtDocuments'),
  ouvert: volets.gauche,
  surClic: volets.basculerGauche,
})

/** La fenêtre de saisie d'un nom : `{ titre, libelle, valeur?, valider }` ou null. */
function useSaisie() {
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
function useConfirmation() {
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

/** La connexion : un lien par courriel (le document visé l'accompagne, pour
 * l'accès par lien) ; en développement, aussi un simple nom. */
function Connexion({ config, visee, surEntrerEnDev }) {
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

const nomDuRole = (role) => libelleDuRole(t, role)
const nomDuRoleEquipe = (role) => libelleDuRoleEquipe(t, role)

/** Valeurs spéciales des listes de déplacement (jamais un identifiant). */
const RACINE = 'racine'
const SORTIR = 'sortir'
const VERS_EQUIPE = 'equipe:'
/** L'adresse d'un espace (Mes documents, ou une équipe) et d'un de ses dossiers. */
const adresseEspace = (equipe, dossier = null) =>
  (equipe ? `#/equipes/${encodeURIComponent(equipe)}` : '#') +
  (dossier ? `/dossiers/${encodeURIComponent(dossier)}` : '')

/** Le chemin d'un dossier, de la racine à lui (`[]` pour la racine). */
function cheminDe(dossiers, id) {
  const parId = new Map(dossiers.map((d) => [d.id, d]))
  const chemin = []
  for (let d = parId.get(id); d && !chemin.includes(d); d = parId.get(d.parent)) chemin.unshift(d)
  return chemin
}

/** Les documents, comme sur un serveur de fichiers : Mes documents (avec mes
 * dossiers, étape 6c), Partagé avec moi, et un onglet par équipe (6d). */
function MesDocuments({ personne, onglet, dossier }) {
  const [fenetreConfirmation, confirmer] = useConfirmation()
  const { etroit } = useFormat()
  const volets = useVolets(etroit)
  const [fenetreSaisie, demanderNom] = useSaisie()
  const equipe = onglet.startsWith(VERS_EQUIPE) ? onglet.slice(VERS_EQUIPE.length) : null
  const [donnees, setDonnees] = useState(null)
  const [vueEquipe, setVueEquipe] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [message, setMessage] = useState(null)
  const messageEnAttente = useRef(null)
  const [membres, setMembres] = useState(false)
  const recharger = async () => {
    try {
      const d = await envoyerJson('GET', '/api/documents')
      // Une équipe qu'on ne peut plus ouvrir (supprimée, accès retiré) : retour à
      // Mes documents, navigation comprise, avec le message (audit du 10/11/2026).
      const e = equipe
        ? await envoyerJson('GET', `/api/equipes/${encodeURIComponent(equipe)}`).catch((err) => {
            messageEnAttente.current = messageErreur(t, err.code || 'reseau')
            location.hash = '#'
            return null
          })
        : null
      if (equipe && !e) return
      setDonnees(d)
      setVueEquipe(e)
      setErreur(null)
    } catch (e) {
      setErreur(e.code || 'reseau')
    }
  }
  // Rechargée à chaque changement d'onglet ou de dossier : un document
  // partagé entre-temps apparaît (essai sur v2.amend.ink, 09/11/2026).
  useEffect(() => {
    setMessage(messageEnAttente.current)
    messageEnAttente.current = null
    recharger()
  }, [onglet, dossier])
  if (erreur) return <EcranMessage texte={messageErreur(t, erreur)} />
  if (!donnees || (equipe && vueEquipe?.equipe.id !== equipe))
    return <EcranMessage texte={t('application.chargement')} />
  const date = new Intl.DateTimeFormat(t.langue, { dateStyle: 'medium' })
  const agir = (f) => async () => {
    try {
      await f()
      setMessage(null)
    } catch (e) {
      setMessage(messageErreur(t, e.code || 'reseau'))
    }
    recharger()
  }
  const titreDe = (d) => d.titre || t('documents.sansTitre')
  const nouvelleEquipe = () =>
    demanderNom({
      titre: t('documents.nouvelleEquipe'),
      libelle: t('documents.nomEquipe'),
      valider: (nom) =>
        agir(async () => {
          location.hash = adresseEspace((await envoyerJson('POST', '/api/equipes', { nom })).id)
        })(),
    })
  // Où « Nouveau document » (volet gauche) crée : l'espace et le dossier où
  // l'on est, s'il est modifiable ; sinon la racine de Mes documents.
  let lieuNouveau = { dossier: null, equipe: null }
  /** La coquille de la liste : bandeau, navigation (espaces), et la liste. */
  const coquille = (titre, liste) => (
    <Coquille
      gaucheOuvert={volets.gauche}
      libelleRedimension={t('interface.largeurVolet')}
      bandeau={<Bandeau voletGauche={boutonGauche(volets)} titre={titre} compte={compteDe(personne)} />}
      voletGauche={
        <NavigationListe
          marque={marque()}
          nouveau={{
            libelle: t('documents.nouveau'),
            surClic: agir(async () => {
              location.hash = (await envoyerJson('POST', '/api/documents', lieuNouveau)).id
            }),
          }}
          entrees={[
            { cle: 'mes', libelle: t('documents.mesDocuments'), picto: 'moi', href: '#', actif: onglet === 'mes' },
            {
              cle: 'partages',
              libelle: t('documents.partagesAvecMoi'),
              picto: 'partages',
              href: '#/partages',
              actif: onglet === 'partages',
            },
            ...donnees.equipes.map((e) => ({
              cle: e.id,
              libelle: e.nom,
              picto: 'equipe',
              href: adresseEspace(e.id),
              actif: onglet === `${VERS_EQUIPE}${e.id}`,
            })),
          ]}
        />
      }
    >
      {liste}
      {fenetreSaisie}
      {fenetreConfirmation}
    </Coquille>
  )
  const commun = { libelleChemin: t('documents.chemin'), message }

  if (onglet === 'partages')
    return coquille(
      t('documents.partagesAvecMoi'),
      <ListeDocuments
        {...commun}
        colonnes={[t('documents.colonneNom'), t('documents.colonneRole'), t('documents.colonnePartage')]}
        lignes={donnees.documents
          .filter((d) => d.section === 'partage')
          .map((d) => ({
            cle: d.id,
            nom: titreDe(d),
            href: `#${encodeURIComponent(d.id)}`,
            cellules: [
              nomDuRole(d.role),
              d.parLien
                ? t('documents.parLien', { date: date.format(d.partageLe) })
                : d.partagePar
                  ? t('documents.partagePar', {
                      nom: d.partagePar.nom || d.partagePar.courriel,
                      date: date.format(d.partageLe),
                    })
                  : t('documents.partageLe', { date: date.format(d.partageLe) }),
            ],
            actions: (
              <Bouton
                libelle={t('documents.meRetirer')}
                surClic={agir(async () => {
                  if (
                    await confirmer({
                      titre: t('documents.meRetirer'),
                      texte: t('documents.confirmerRetrait'),
                      libelle: t('documents.meRetirer'),
                      danger: true,
                    })
                  )
                    await envoyerJson('DELETE', `/api/documents/${encodeURIComponent(d.id)}/moi`)
                })}
              />
            ),
          }))}
        vide={t('documents.videPartages')}
      />,
    )

  // Un espace : Mes documents, ou une équipe.
  const capsEquipe = equipe ? capacites(vueEquipe.equipe.role) : null
  const modifiable = equipe ? capsEquipe.includes('ecrire') : true
  const gestionnaire = equipe ? capsEquipe.includes('transferer') : false
  const nomEspace = equipe ? vueEquipe.equipe.nom : t('documents.mesDocuments')
  const dossiers = equipe ? vueEquipe.dossiers : donnees.dossiers
  const documents = equipe ? vueEquipe.documents : donnees.documents.filter((d) => d.section === 'mes-documents')
  if (dossier && !dossiers.some((d) => d.id === dossier))
    return <EcranMessage texte={messageErreur(t, 'dossier-introuvable')} />
  const nomDuChemin = (id) => [nomEspace, ...cheminDe(dossiers, id).map((d) => d.nom)].join(' / ')
  /** Les dossiers de l'espace où l'on peut mettre quelque chose, sauf `exclus`. */
  const destinations = (exclus = () => false) =>
    [{ value: RACINE, label: nomEspace }].concat(
      dossiers
        .filter((d) => !exclus(d))
        .map((d) => ({ value: d.id, label: nomDuChemin(d.id) }))
        .sort((a, b) => a.label.localeCompare(b.label, t.langue)),
    )
  /** Hors de l'espace : vers une de mes équipes (depuis Mes documents), ou
   * vers Mes documents (depuis une équipe, pour son gestionnaire). */
  const ailleurs = equipe
    ? gestionnaire
      ? [{ value: SORTIR, label: t('documents.mesDocuments') }]
      : []
    : donnees.equipes
        .filter((e) => capacites(e.role).includes('ecrire'))
        .map((e) => ({ value: `${VERS_EQUIPE}${e.id}`, label: t('documents.equipeDestination', { nom: e.nom }) }))
  const deplacerDocument = (d) => async (v) => {
    let cible = { equipe, dossier: v === RACINE ? null : v }
    if (v === SORTIR) {
      if (
        !(await confirmer({
          titre: t('documents.deplacer', { nom: titreDe(d) }),
          texte: t('documents.confirmerSortie', { titre: titreDe(d) }),
          libelle: t('interface.continuer'),
        }))
      )
        return
      cible = { equipe: null, dossier: null }
    } else if (v.startsWith(VERS_EQUIPE)) {
      const id = v.slice(VERS_EQUIPE.length)
      const nom = donnees.equipes.find((e) => e.id === id)?.nom ?? ''
      if (
        !(await confirmer({
          titre: t('documents.deplacer', { nom: titreDe(d) }),
          texte: t('documents.confirmerEntree', { titre: titreDe(d), equipe: nom }),
          libelle: t('interface.continuer'),
        }))
      )
        return
      cible = { equipe: id, dossier: null }
    }
    await agir(() => envoyerJson('PUT', `/api/documents/${encodeURIComponent(d.id)}/dossier`, cible))()
  }
  /** Les sous-dossiers d'un dossier (pour ne pas y déplacer celui-ci). */
  const dansLeSousArbre = (racine) => (d) => d.id === racine || cheminDe(dossiers, d.id).some((p) => p.id === racine)
  const lignesDossiers = dossiers
    .filter((d) => d.parent === dossier)
    .map((d) => ({
      cle: d.id,
      nom: d.nom,
      href: adresseEspace(equipe, d.id),
      cellules: [t('documents.dossier'), ''],
      actions: modifiable ? (
        <>
          <Bouton
            libelle={t('documents.renommer')}
            surClic={() =>
              demanderNom({
                titre: t('documents.renommer'),
                libelle: t('documents.nomDuDossier'),
                valeur: d.nom,
                valider: (nom) => agir(() => envoyerJson('PUT', `/api/dossiers/${d.id}`, { nom }))(),
              })
            }
          />
          <Choix
            libelle={t('documents.deplacer', { nom: d.nom })}
            options={destinations(dansLeSousArbre(d.id))}
            surChoix={(v) =>
              agir(() => envoyerJson('PUT', `/api/dossiers/${d.id}`, { parent: v === RACINE ? null : v }))()
            }
          />
          <Bouton
            libelle={t('documents.supprimer')}
            surClic={agir(async () => {
              if (
                await confirmer({
                  titre: t('documents.supprimer'),
                  texte: t('documents.confirmerSuppressionDossier', { nom: d.nom }),
                  libelle: t('documents.supprimer'),
                  danger: true,
                })
              )
                await envoyerJson('DELETE', `/api/dossiers/${d.id}`)
            })}
          />
        </>
      ) : null,
    }))
  const lignesDocuments = documents
    .filter((d) => (d.dossier ?? null) === dossier)
    .map((d) => {
      const peutDeplacer = equipe ? modifiable : capacites(d.role).includes('ranger')
      return {
        cle: d.id,
        nom: titreDe(d),
        href: `#${encodeURIComponent(d.id)}`,
        cellules: [equipe ? nomDuRoleEquipe(d.role) : nomDuRole(d.role), date.format(d.creeLe)],
        actions: peutDeplacer ? (
          <Choix
            libelle={t('documents.deplacer', { nom: titreDe(d) })}
            options={[...destinations(), ...ailleurs]}
            surChoix={deplacerDocument(d)}
          />
        ) : null,
      }
    })
  if (modifiable) lieuNouveau = { dossier, equipe }
  const nouveauDossier = () =>
    demanderNom({
      titre: t('documents.nouveauDossier'),
      libelle: t('documents.nomDuDossier'),
      valider: (nom) => agir(() => envoyerJson('POST', '/api/dossiers', { nom, parent: dossier, equipe }))(),
    })
  const baseEquipe = equipe ? `/api/equipes/${encodeURIComponent(equipe)}` : null
  const boutonsEquipe = equipe ? (
    <>
      {gestionnaire ? (
        <>
          <BoutonBascule libelle={t('documents.membres')} actif={membres} surBasculer={() => setMembres((m) => !m)} />
          <Bouton
            libelle={t('documents.renommerEquipe')}
            surClic={() =>
              demanderNom({
                titre: t('documents.renommerEquipe'),
                libelle: t('documents.nomEquipe'),
                valeur: vueEquipe.equipe.nom,
                valider: (nom) => agir(() => envoyerJson('PUT', baseEquipe, { nom }))(),
              })
            }
          />
          <Bouton
            libelle={t('documents.supprimerEquipe')}
            surClic={agir(async () => {
              if (
                !(await confirmer({
                  titre: t('documents.supprimerEquipe'),
                  texte: t('documents.confirmerSuppressionEquipe', { nom: vueEquipe.equipe.nom }),
                  libelle: t('documents.supprimerEquipe'),
                  danger: true,
                }))
              )
                return
              await envoyerJson('DELETE', baseEquipe)
              location.hash = '#'
            })}
          />
        </>
      ) : null}
      <Bouton
        libelle={t('documents.quitterEquipe')}
        surClic={agir(async () => {
          if (
            !(await confirmer({
              titre: t('documents.quitterEquipe'),
              texte: t('documents.confirmerDepart', { nom: vueEquipe.equipe.nom }),
              libelle: t('documents.quitterEquipe'),
              danger: true,
            }))
          )
            return
          await envoyerJson('DELETE', `${baseEquipe}/moi`)
          location.hash = '#'
        })}
      />
    </>
  ) : null
  return coquille(
    nomEspace,
    <ListeDocuments
      {...commun}
      chemin={[
        { cle: 'racine', libelle: nomEspace, href: adresseEspace(equipe) },
        ...cheminDe(dossiers, dossier).map((d) => ({ cle: d.id, libelle: d.nom, href: adresseEspace(equipe, d.id) })),
      ]}
      boutons={
        <>
          {modifiable ? <Bouton libelle={t('documents.nouveauDossier')} surClic={nouveauDossier} /> : null}
          {equipe ? null : <Bouton libelle={t('documents.nouvelleEquipe')} surClic={nouvelleEquipe} />}
          {boutonsEquipe}
        </>
      }
      panneau={equipe && gestionnaire && membres ? <Membres vue={vueEquipe} surChangement={recharger} /> : null}
      colonnes={[t('documents.colonneNom'), t('documents.colonneRole'), t('documents.colonneDate')]}
      lignes={[...lignesDossiers, ...lignesDocuments]}
      vide={dossier ? t('documents.videDossier') : equipe ? t('documents.videEquipe') : t('documents.vide')}
    />,
  )
}

/** Les membres d'une équipe et ses invitations, pour son gestionnaire (6d) :
 * le panneau du partage, sans lien. */
function Membres({ vue, surChangement }) {
  const [message, setMessage] = useState(null)
  const base = `/api/equipes/${encodeURIComponent(vue.equipe.id)}`
  const agir =
    (f, succes) =>
    async (...a) => {
      try {
        const r = await f(...a)
        setMessage(succes ? succes(r, ...a) : null)
      } catch (e) {
        setMessage(messageErreur(t, e.code || 'reseau'))
      }
      surChangement()
    }
  const options = (roles) => roles.map((r) => ({ value: r, label: nomDuRoleEquipe(r) }))
  return (
    <PanneauPartage
      titre={t('documents.membres')}
      libelles={{
        courriel: t('partage.courriel'),
        role: t('partage.role'),
        inviter: t('partage.inviter'),
        retirer: t('partage.retirer'),
        annuler: t('partage.annuler'),
        roleDe: (nom) => t('partage.roleDe', { nom }),
        retirerDe: (nom) => t('partage.retirerDe', { nom }),
        annulerDe: (courriel) => t('partage.annulerDe', { courriel }),
      }}
      roles={options(vue.rolesDonnables)}
      acces={vue.membres.map((m) => ({
        cle: m.personne,
        nom: m.nom || m.courriel,
        role: m.role,
        roles: options(vue.rolesDonnables),
      }))}
      invitations={vue.invitations.map((i) => ({
        courriel: i.courriel,
        texte: t('partage.invite', { courriel: i.courriel, role: nomDuRoleEquipe(i.role) }),
      }))}
      message={message}
      surInviter={agir(
        (courriel, role) => envoyerJson('POST', `${base}/membres`, { courriel, role }),
        (r, courriel) =>
          r.invitation ? t('partage.invitationEnvoyee', { courriel }) : t('partage.accesDonne', { courriel }),
      )}
      surChangerRole={agir((cle, role) => envoyerJson('PUT', `${base}/membres/${cle}`, { role }))}
      surRetirer={agir((cle) => envoyerJson('DELETE', `${base}/membres/${cle}`))}
      surRetirerInvitation={agir((courriel) =>
        envoyerJson('DELETE', `${base}/invitations/${encodeURIComponent(courriel)}`),
      )}
    />
  )
}

/** Le back-office de l'instance (administrateurs) : la rubrique Système pour
 * commencer (version 2.NNN, serveur, nombres) ; le serveur refuse les autres. */
function Administration() {
  const [systeme, setSysteme] = useState(null)
  const [erreur, setErreur] = useState(null)
  useEffect(() => {
    envoyerJson('GET', '/api/admin/systeme')
      .then(setSysteme)
      .catch((e) => setErreur(e.code || 'reseau'))
  }, [])
  if (erreur) return <EcranMessage texte={messageErreur(t, erreur)} />
  if (!systeme) return <EcranMessage texte={t('application.chargement')} />
  const date = new Intl.DateTimeFormat(t.langue, { dateStyle: 'medium', timeStyle: 'short' })
  const nombre = new Intl.NumberFormat(t.langue)
  const mo = new Intl.NumberFormat(t.langue, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 0 })
  const { version: v, comptes: c } = systeme
  return (
    <PageAdministration
      nomApplication={t('application.nom')}
      titre={t('admin.titre')}
      actions={<Bouton libelle={t('document.mesDocuments')} surClic={() => (location.hash = '#')} />}
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
      ]}
    />
  )
}

/** Le partage d'un document : accès, invitations, lien (pour qui invite). */
function Partage({ docId }) {
  const [donnees, setDonnees] = useState(null)
  const [message, setMessage] = useState(null)
  const recharger = () =>
    envoyerJson('GET', `/api/documents/${encodeURIComponent(docId)}/acces`)
      .then(setDonnees)
      .catch((e) => setMessage(messageErreur(t, e.code || 'reseau')))
  useEffect(() => {
    recharger()
  }, [docId])
  if (!donnees) return message ? <EcranMessage texte={message} /> : null
  const base = `/api/documents/${encodeURIComponent(docId)}`
  const agir =
    (f, succes) =>
    async (...a) => {
      try {
        const r = await f(...a)
        setMessage(succes ? succes(r, ...a) : null)
      } catch (e) {
        setMessage(messageErreur(t, e.code || 'reseau'))
      }
      recharger()
    }
  const options = (roles) => roles.map((r) => ({ value: r, label: nomDuRole(r) }))
  return (
    <PanneauPartage
      enFenetre
      titre={t('partage.titre')}
      libelles={{
        courriel: t('partage.courriel'),
        role: t('partage.role'),
        inviter: t('partage.inviter'),
        retirer: t('partage.retirer'),
        annuler: t('partage.annuler'),
        lien: t('partage.lien'),
        adresseDuLien: t('partage.adresseDuLien'),
        roleDe: (nom) => t('partage.roleDe', { nom }),
        retirerDe: (nom) => t('partage.retirerDe', { nom }),
        annulerDe: (courriel) => t('partage.annulerDe', { courriel }),
      }}
      roles={options(donnees.rolesDonnables)}
      rolesDuLien={[
        { value: 'aucun', label: t('partage.lienFerme') },
        ...options(['lecteur', 'correcteur', 'editeur']),
      ]}
      acces={donnees.acces
        .filter((a) => a.personne)
        .map((a) => ({
          cle: a.personne,
          nom: a.nom || a.courriel,
          role: a.role,
          roles: options([...new Set([...donnees.rolesDonnables, a.role])]),
        }))}
      invitations={donnees.invitations.map((i) => ({
        courriel: i.courriel,
        texte: t('partage.invite', { courriel: i.courriel, role: nomDuRole(i.role) }),
      }))}
      lien={donnees.lien ?? 'aucun'}
      adresseDuLien={donnees.lien ? `${location.origin}/#${encodeURIComponent(docId)}` : null}
      message={message}
      surInviter={agir(
        (courriel, role) => envoyerJson('POST', `${base}/acces`, { courriel, role }),
        (r, courriel) =>
          r.invitation ? t('partage.invitationEnvoyee', { courriel }) : t('partage.accesDonne', { courriel }),
      )}
      surChangerRole={agir((cle, role) => envoyerJson('PUT', `${base}/acces/${cle}`, { role }))}
      surRetirer={agir((cle) => envoyerJson('DELETE', `${base}/acces/${cle}`))}
      surRetirerInvitation={agir((courriel) =>
        envoyerJson('DELETE', `${base}/invitations/${encodeURIComponent(courriel)}`),
      )}
      surChangerLien={agir((role) => envoyerJson('PUT', `${base}/lien`, { role: role === 'aucun' ? null : role }))}
    />
  )
}

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

function Document({ config, personne, docId }) {
  const [droits, setDroits] = useState(null)
  useEffect(() => {
    let actif = true
    obtenirDroits(docId, config.dev).then((d) => actif && setDroits(d))
    return () => {
      actif = false
    }
  }, [config, docId])
  if (!droits) return <EcranMessage texte={t('application.chargement')} />
  if (droits.code) return <EcranMessage texte={messageErreur(t, droits.code)} />
  return <Edition config={config} personne={personne} docId={docId} droits={droits} />
}

/** Le volet « Documents » : mes dossiers et documents, puis ceux partagés avec moi. */
function arbreDocuments(donnees, docId) {
  if (!donnees) return []
  const { dossiers, documents } = donnees
  const entreeDoc = (d) => ({
    cle: d.id,
    nom: d.titre || t('documents.sansTitre'),
    href: `#${encodeURIComponent(d.id)}`,
    actif: d.id === docId,
  })
  // Les dossiers qui mènent au document ouvert sont ouverts.
  const courant = documents.find((d) => d.id === docId && d.section === 'mes-documents')
  const ouverts = new Set()
  for (
    let id = courant?.dossier ?? null;
    id && !ouverts.has(id);
    id = dossiers.find((x) => x.id === id)?.parent ?? null
  )
    ouverts.add(id)
  const dans = (parent) => [
    ...dossiers
      .filter((d) => (d.parent ?? null) === parent)
      .map((d) => ({ cle: d.id, nom: d.nom, dossier: true, ouvert: ouverts.has(d.id), enfants: dans(d.id) })),
    ...documents.filter((d) => d.section === 'mes-documents' && (d.dossier ?? null) === parent).map(entreeDoc),
  ]
  const partages = documents.filter((d) => d.section === 'partage').map(entreeDoc)
  return [
    ...dans(null),
    ...(partages.length
      ? [{ cle: 'partages', nom: t('documents.partagesAvecMoi'), dossier: true, ouvert: true, enfants: partages }]
      : []),
  ]
}

function Edition({ config, personne, docId, droits }) {
  // L'interface suit les capacités, jamais le nom du rôle.
  const caps = droits.capacites
  // Le suivi des modifications : un interrupteur pour qui écrit, arrêté à
  // l'ouverture ; le correcteur est toujours en suivi (Sylvain, 10/11/2026,
  // comme l'interrupteur de la v1).
  const [suivi, setSuivi] = useState(false)
  const mode = caps.includes('ecrire')
    ? suivi
      ? 'suggerer'
      : 'ecrire'
    : caps.includes('suggerer')
      ? 'suggerer'
      : 'lire'
  const avecSuggestions = caps.includes('suggerer')
  const moi = useMemo(() => ({ ...personne, couleur: couleurAuteur(personne.id) }), [personne])
  const session = useMemo(
    () =>
      ouvrirDocument({
        url: config.collaboration,
        api: `${location.origin}/collaboration`,
        docId,
        personne: moi,
        suggestions: avecSuggestions,
      }),
    // Basculer le suivi ne rouvre pas la connexion : seul l'éditeur change de mode.
    [config, docId, moi, avecSuggestions],
  )
  const commentaires = useMemo(
    () =>
      caps.includes('commenter')
        ? {
            // Un commentaire qu'on n'a pas pu rattacher au texte : on dit pourquoi
            // (Sylvain, 10/11/2026, Q3 de l'audit) ; le texte saisi reste ouvert.
            service: {
              ...serviceCommentaires(docId),
              surEchecAncre: (code) => montrerMessage(messageErreur(t, code), { erreur: true }),
            },
            capacites: caps,
          }
        : null,
    [caps, docId],
  )
  const { etroit, tactile } = useFormat()
  const formatS = useFormatS()
  const volets = useVolets(etroit)
  const [fenetreSaisie, demanderNom] = useSaisie()
  const [fenetreConfirmation, confirmer] = useConfirmation()
  const [connexion, setConnexion] = useState('connexion')
  // Hors ligne : seulement après avoir été connecté une fois (pas à l'ouverture).
  const [aEteConnecte, setAEteConnecte] = useState(false)
  useEffect(() => {
    if (connexion === 'connecte') setAEteConnecte(true)
  }, [connexion])
  const [autres, setAutres] = useState([])
  const [suggestions, setSuggestions] = useState(null)
  const [plan, setPlan] = useState({ titres: [], courant: null, allerA: () => {} })
  const [titre, setTitre] = useState(droits.titre ?? null)
  const [volet, setVolet] = useState(null)
  const [enModification, setEnModification] = useState(false)
  const controle = useRef(null)
  const [noms, setNoms] = useState({})
  const [historique, setHistorique] = useState(false)
  const [partage, setPartage] = useState(false)
  // La liste des documents (volet « Documents ») : à l'ouverture en L et M ;
  // en S, à l'ouverture du volet gauche.
  const [documents, setDocuments] = useState(null)
  useEffect(() => {
    if (formatS && volet !== 'gauche') return
    envoyerJson('GET', '/api/documents')
      .then(setDocuments)
      .catch(() => setDocuments(null))
  }, [docId, formatS, volet])
  const enregistrerTitre = async (nom) => {
    try {
      setTitre((await envoyerJson('PUT', `/api/documents/${encodeURIComponent(docId)}/titre`, { titre: nom })).titre)
    } catch (e) {
      montrerMessage(messageErreur(t, e.code || 'reseau'), { erreur: true })
    }
  }
  const renommer = () =>
    demanderNom({
      titre: t('document.renommer'),
      libelle: t('document.nomDuDocument'),
      valeur: titre ?? '',
      valider: enregistrerTitre,
    })
  const supprimer = async () => {
    if (
      !(await confirmer({
        titre: t('document.supprimer'),
        texte: t('document.confirmerSuppression'),
        libelle: t('document.supprimer'),
        danger: true,
      }))
    )
      return
    try {
      await envoyerJson('DELETE', `/api/documents/${encodeURIComponent(docId)}`)
      location.hash = ''
    } catch (e) {
      montrerMessage(messageErreur(t, e.code || 'reseau'), { erreur: true })
    }
  }
  useEffect(() => session.surEtat(setConnexion), [session])
  useEffect(() => session.surParticipants(setAutres), [session])
  useEffect(() => () => session.fermer(), [session])
  // Le volet droit s'ouvre d'office, une fois, quand des suggestions attendent (5b).
  const ouvertDOffice = useRef(false)
  useEffect(() => {
    if (!ouvertDOffice.current && suggestions?.liste.length) {
      ouvertDOffice.current = true
      volets.ouvrirDroite()
    }
  }, [suggestions])
  // Les noms des auteurs des suggestions, demandés une fois chacun.
  const demandes = useRef(new Set())
  useEffect(() => {
    const manquants = [...new Set((suggestions?.liste ?? []).map((s) => s.auteur))].filter(
      (id) => id && !(id in noms) && !demandes.current.has(id),
    )
    manquants.forEach((id) => demandes.current.add(id))
    // Un nom introuvable (serveur injoignable) n'est pas retenu : « auteur
    // inconnu » s'affiche, et le nom sera redemandé (audit du 10/11/2026).
    if (manquants.length)
      nomsDe(manquants).then((l) => {
        const trouves = l.filter((p) => p.username !== p.id)
        for (const id of manquants) if (!trouves.some((p) => p.id === id)) demandes.current.delete(id)
        setNoms((n) => ({ ...n, ...Object.fromEntries(trouves.map((p) => [p.id, p.username])) }))
      })
  }, [suggestions, noms])

  const ligne = (s) => {
    const auteur = noms[s.auteur] ?? t('suggestions.auteurInconnu')
    const v = { auteur, avant: s.avant.trim(), apres: s.apres.trim() }
    if (s.type === 'ajout') return t('suggestions.ajout', v)
    if (s.type === 'suppression') return t('suggestions.suppression', v)
    return t('suggestions.remplacement', v)
  }
  const titreAffiche = titre || t('documents.sansTitre')
  const peutRenommer = caps.includes('ecrire')
  // Exports Markdown et PDF du texte de base (étape 7), préparés dans le
  // navigateur comme chez Docs.
  const exporter = (format) =>
    exporterDocument(controle, format, { titre: titreAffiche, langue: LANGUE_DOCUMENT_PAR_DEFAUT }).catch((e) =>
      montrerMessage(e?.code === 'modele-impossible' ? messageErreur(t, e.code) : t('document.exportEchoue'), {
        erreur: true,
      }),
    )
  const mention = { ecrire: null, suggerer: t('document.modeSuggestion'), lire: t('document.lectureSeule') }[mode]
  // « Copier le lien », le même dans tous les formats (audit du 10/11/2026) :
  // le lien du document, un retour, et le lien à recopier si le presse-papiers refuse.
  const lien = `${location.origin}/#${encodeURIComponent(docId)}`
  const copierLien = () =>
    Promise.resolve(navigator.clipboard?.writeText(lien) ?? Promise.reject(new Error('presse-papiers absent')))
      .then(() => montrerMessage(t('telephone.lienCopie')))
      .catch(() => montrerMessage(t('telephone.lienNonCopie', { lien }), { erreur: true }))
  const actions = [
    ...(caps.includes('ecrire') && etroit
      ? [
          {
            cle: 'suivi',
            libelle: suivi ? t('document.arreterSuivi') : t('document.activerSuivi'),
            picto: 'modifications',
            surClic: () => setSuivi((s) => !s),
          },
        ]
      : []),
    {
      cle: 'lien',
      libelle: t('telephone.copierLien'),
      picto: 'lien',
      surClic: copierLien,
    },
    ...(caps.includes('inviter')
      ? [{ cle: 'partager', libelle: t('document.partager'), picto: 'partager', surClic: () => setPartage(true) }]
      : []),
    ...(peutRenommer
      ? [{ cle: 'renommer', libelle: t('document.renommer'), picto: 'renommer', surClic: renommer }]
      : []),
    {
      cle: 'historique',
      libelle: t('document.historique'),
      picto: 'historique',
      surClic: () => setHistorique((h) => !h),
    },
    {
      cle: 'exporterMarkdown',
      libelle: t('document.exporterMarkdown'),
      picto: 'exporter',
      surClic: () => exporter('markdown'),
    },
    { cle: 'exporterPdf', libelle: t('document.exporterPdf'), picto: 'exporter', surClic: () => exporter('pdf') },
    ...(caps.includes('supprimer')
      ? [{ cle: 'supprimer', libelle: t('document.supprimer'), picto: 'supprimer', separe: true, surClic: supprimer }]
      : []),
  ]
  // Le lecteur ne voit pas les suggestions : pas de volet droit pour lui.
  const avecVoletDroit = mode !== 'lire'
  const modifications = suggestions ? (
    <PanneauSuggestions
      titre={t('suggestions.titre', { n: suggestions.liste.length })}
      lignes={suggestions.liste.map((s) => ({ cle: `${s.debut}-${s.type}`, texte: ligne(s) }))}
      libelles={{
        accepter: t('suggestions.accepter'),
        refuser: t('suggestions.refuser'),
        accepterDe: (texte) => t('suggestions.accepterDe', { texte }),
        refuserDe: (texte) => t('suggestions.refuserDe', { texte }),
        toutAccepter: t('suggestions.toutAccepter'),
        toutRefuser: t('suggestions.toutRefuser'),
      }}
      surAccepter={(i) => suggestions.accepter(suggestions.liste[i])}
      surRefuser={(i) => suggestions.refuser(suggestions.liste[i])}
      surToutAccepter={suggestions.toutAccepter}
      surToutRefuser={suggestions.toutRefuser}
    />
  ) : (
    <TexteDeVolet texte={t('interface.modificationsCorrecteur')} />
  )
  const editeur = (
    <EditeurCollaboratif
      contexte={session.contexte}
      personne={moi}
      langue={t.langue}
      langueDocument={LANGUE_DOCUMENT_PAR_DEFAUT}
      nomAccessible={t('document.zoneEdition', { id: docId })}
      mode={mode}
      nomsDe={nomsDe}
      commentaires={commentaires}
      surSuggestions={caps.includes('arbitrer') ? setSuggestions : undefined}
      historique={historique && !formatS}
      peutRestaurer={caps.includes('restaurer')}
      surFermerHistorique={() => setHistorique(false)}
      lectureAuDepart={formatS || tactile}
      controle={controle}
      surModification={setEnModification}
      surPlan={setPlan}
    />
  )

  // Format S (téléphone) : la maquette validée (docs/v2-format-S.md). Comme
  // Docs sur téléphone, pas d'historique dans le menu.
  if (formatS)
    return (
      <PageEditionS
        titre={titreAffiche}
        surTitre={peutRenommer ? renommer : undefined}
        libelles={{
          gauche: t('telephone.planEtDocuments'),
          droite: t('telephone.relecture'),
          actions: t('telephone.autresActions'),
          terminer: t('telephone.terminer'),
          titre: t('document.renommer'),
        }}
        etat={t('document.etat', { etat: connexion })}
        connexion={connexion}
        mention={mention}
        enModification={enModification}
        surTerminer={() => controle.current?.terminer()}
        menu={[
          {
            cle: 'lien',
            libelle: t('telephone.copierLien'),
            icone: 'lien',
            surClic: copierLien,
          },
          ...(caps.includes('ecrire')
            ? [
                {
                  cle: 'suivi',
                  libelle: suivi ? t('document.arreterSuivi') : t('document.activerSuivi'),
                  icone: 'modifications',
                  surClic: () => setSuivi((s) => !s),
                },
              ]
            : []),
          ...(caps.includes('inviter')
            ? [{ cle: 'partager', libelle: t('document.partager'), icone: 'partager', surClic: () => setPartage(true) }]
            : []),
          { cle: 'liste', libelle: t('document.mesDocuments'), icone: 'retour', surClic: () => (location.hash = '') },
          ...(caps.includes('supprimer')
            ? [{ cle: 'supprimer', libelle: t('document.supprimer'), icone: 'supprimer', surClic: supprimer }]
            : []),
        ]}
        voletGauche={{
          titre: titreAffiche,
          onglets: [
            {
              cle: 'plan',
              libelle: t('telephone.plan'),
              icone: 'plan',
              contenu: (
                <PlanDocument
                  titres={plan.titres}
                  vide={t('telephone.planVide')}
                  surChoix={(id) => (setVolet(null), plan.allerA(id))}
                />
              ),
            },
            {
              cle: 'documents',
              libelle: t('telephone.documents'),
              icone: 'documents',
              contenu: (
                <ListeLiens
                  liens={[
                    { cle: 'tous', libelle: t('document.mesDocuments'), href: '#', actif: false },
                    // Les documents partagés ne se mêlent pas aux siens (audit du
                    // 10/11/2026) : un lien vers « Partagé avec moi », comme en L et M.
                    { cle: 'partages', libelle: t('documents.partagesAvecMoi'), href: '#/partages', actif: false },
                    ...(documents?.documents ?? [])
                      .filter((d) => d.section === 'mes-documents')
                      .map((d) => ({
                        cle: d.id,
                        libelle: d.titre || t('documents.sansTitre'),
                        href: `#${encodeURIComponent(d.id)}`,
                        actif: d.id === docId,
                      })),
                  ]}
                />
              ),
            },
          ],
        }}
        voletDroit={
          suggestions
            ? {
                titre: t('telephone.relecture'),
                onglets: [
                  {
                    cle: 'modifications',
                    libelle: t('telephone.modifications'),
                    icone: 'modifications',
                    contenu: modifications,
                  },
                ],
              }
            : null
        }
        volet={volet}
        surVolet={setVolet}
        panneau={
          partage
            ? { titre: t('partage.titre'), contenu: <Partage docId={docId} />, surFermer: () => setPartage(false) }
            : null
        }
        editeur={
          <>
            {editeur}
            {fenetreSaisie}
            {fenetreConfirmation}
          </>
        }
      />
    )

  return (
    <Coquille
      connexion={connexion}
      gaucheOuvert={volets.gauche}
      droiteOuvert={volets.droite}
      libelleRedimension={t('interface.largeurVolet')}
      alerte={aEteConnecte && connexion !== 'connecte' ? <AlerteHorsLigne texte={t('interface.horsLigne')} /> : null}
      bandeau={
        <Bandeau
          voletGauche={boutonGauche(volets)}
          titre={titreAffiche}
          mention={mention}
          // L : dans le bandeau, comme la v1 ; M (iPad) : dans le menu « … »,
          // comme au téléphone, le bandeau étant trop étroit (10/11/2026).
          suivi={
            caps.includes('ecrire') && !etroit
              ? { libelle: t('document.suiviModifications'), actif: suivi, surChange: setSuivi }
              : null
          }
          terminer={
            enModification ? { libelle: t('telephone.terminer'), surClic: () => controle.current?.terminer() } : null
          }
          presence={{ libelle: t('interface.presence'), personnes: autres }}
          partager={
            caps.includes('inviter') ? { libelle: t('document.partager'), surClic: () => setPartage(true) } : null
          }
          actions={{ libelle: t('telephone.autresActions'), elements: actions }}
          compte={compteDe(personne)}
          voletDroit={
            avecVoletDroit
              ? {
                  libelle: t('interface.voletDroit'),
                  nombre: suggestions?.liste.length ?? 0,
                  ouvert: volets.droite,
                  surClic: volets.basculerDroite,
                }
              : null
          }
        />
      }
      voletGauche={
        <VoletPlanDocuments
          onglets={{ plan: t('telephone.plan'), documents: t('telephone.documents') }}
          plan={plan.titres.map((x) => ({
            cle: x.id,
            niveau: x.niveau,
            libelle: x.texte,
            actif: x.id === plan.courant,
          }))}
          surTitre={(cle) => plan.allerA(cle)}
          videPlan={t('telephone.planVide')}
          documents={arbreDocuments(documents, docId)}
        />
      }
      voletDroit={
        avecVoletDroit ? (
          <VoletRelecture
            titre={t('telephone.relecture')}
            onglets={{ modifications: t('telephone.modifications'), margo: t('interface.margo') }}
            modifications={modifications}
            margo={<TexteDeVolet texte={t('interface.margoBientot')} />}
          />
        ) : null
      }
    >
      <ColonneTexte>{editeur}</ColonneTexte>
      {fenetreSaisie}
      {fenetreConfirmation}
      {caps.includes('inviter') ? (
        <Fenetre
          ouverte={partage}
          titre={t('partage.titre')}
          libelleFermer={t('interface.fermer')}
          surFermer={() => setPartage(false)}
        >
          {partage ? <Partage docId={docId} /> : null}
        </Fenetre>
      ) : null}
    </Coquille>
  )
}
