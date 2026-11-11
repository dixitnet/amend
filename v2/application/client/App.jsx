// Les écrans (couche application technique) : connexion, mes documents,
// l'écran d'un document et son partage ; état et appels au serveur. Tout
// l'affichage est délégué à la couche design ; tous les textes viennent de
// v2/i18n/.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  EcranMessage,
  EcranConnexion,
  EcranCourriel,
  PageAdministration,
  PanneauPartage,
  PanneauSuggestions,
  PanneauMargo,
  Bouton,
  couleurAuteur,
  Coquille,
  ColonneTexte,
  Bandeau,
  VoletPlanDocuments,
  VoletRelecture,
  TexteDeVolet,
  AlerteHorsLigne,
  Fenetre,
  FenetreSaisie,
  FenetreConfirmation,
  FenetreChoix,
  VoletDocuments,
  montrerMessage,
  useFormat,
  PageEditionS,
  PlanDocument,
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
import {
  identifiantDocument,
  capacites,
  LANGUE_DOCUMENT_PAR_DEFAUT,
  AUTEUR_MARGO,
  MARGO_DEMANDE_MAX_SIGNES,
} from '../../domaine/index.js'
import { ouvrirDocument } from '../../adaptateurs/yjs/index.js'
import { EditeurCollaboratif } from '../../adaptateurs/blocknote/index.jsx'
import { serviceCommentaires, nomsDe, appel } from './commentaires.js'
import { useVolets } from './volets.js'
import { exporterDocument } from './exports.js'
import { useMargo } from './margo.js'

// La langue : celle demandée dans l'adresse (?langue=fr|en|pseudo, pour les
// essais et les captures), sinon celle du navigateur.
const demandee = new URLSearchParams(location.search).get('langue')
const t = creerTraducteur(
  demandee === LANGUE_PSEUDO ? LANGUE_PSEUDO : choisirLangue([demandee, ...navigator.languages]),
)
document.documentElement.lang = t.langue
document.title = t('application.nom')

const lireJson = (r) => r.json().catch(() => ({}))

/** Les noms des personnes, et celui de Margo (le serveur rend un code). */
const nomsAvecMargo = (ids) =>
  nomsDe(ids).then((l) => l.map((p) => (p.id === AUTEUR_MARGO ? { ...p, username: t('interface.margo') } : p)))

/** Ce que fait Margo pendant une demande (événements du serveur). */
const MARGO_EN_COURS = {
  reflexion: () => t('margo.enCours.reflexion'),
  lire: () => t('margo.enCours.lire'),
  chercher: () => t('margo.enCours.chercher'),
  proposer: () => t('margo.enCours.proposer'),
  commenter: () => t('margo.enCours.commenter'),
  repli: () => t('margo.enCours.repli'),
}
/** Pourquoi une demande s'est arrêtée avant la fin (codes du serveur). */
const MARGO_ARRET = {
  etapes: () => t('margo.arret.etapes'),
  'refus-en-serie': () => t('margo.arret.refusEnSerie'),
  longueur: () => t('margo.arret.longueur'),
  refus: () => t('margo.arret.refus'),
  erreur: () => t('margo.arret.erreur'),
}

/** Le texte d'une réponse de Margo en morceaux : texte, et liens vers les
 * blocs qu'elle cite ([12]) ; les marques de gras du Markdown sont retirées. */
function morceauxDeMargo(m, allerAuBloc) {
  return String(m.texte)
    .replace(/\*\*|__/g, '')
    .split(/(\[\d+\])/)
    .filter(Boolean)
    .map((x) => {
      const n = /^\[(\d+)\]$/.exec(x)?.[1]
      const id = n ? m.blocs?.[n] : null
      return id
        ? { lien: x, libelle: t('margo.allerAuBloc', { n: Number(n) }), surClic: () => allerAuBloc(id) }
        : { texte: x }
    })
}

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
  if (visee.liste) return <Accueil personne={etat.personne} />
  // Une adresse illisible a le même message qu'un nom refusé, sans dépendre du domaine.
  const doc = identifiantDocument(visee.document)
  if (!doc.ok) return <EcranMessage texte={messageErreur(t, doc.code)} />
  return <Document key={doc.id} config={etat.config} personne={etat.personne} docId={doc.id} />
}

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

/** Le chemin d'un dossier, de la racine à lui (`[]` pour la racine). */
function cheminDe(dossiers, id) {
  const parId = new Map(dossiers.map((d) => [d.id, d]))
  const chemin = []
  for (let d = parId.get(id); d && !chemin.includes(d); d = parId.get(d.parent)) chemin.unshift(d)
  return chemin
}

/** À l'ouverture, et aux anciennes adresses de la page « Mes documents »
 * (supprimée le 10/11/2026, Sylvain) : le dernier document ouvert dans ce
 * navigateur, sinon le plus récent ; sans document, la coquille et le volet
 * « Documents ». */
function Accueil({ personne }) {
  const voletDocs = useVoletDocuments(null)
  const { etroit } = useFormat()
  const volets = useVolets(etroit)
  const { donnees, tous } = voletDocs
  const ids = tous.map((d) => d.id)
  const dernier = lireDernier()
  const cible = ids.includes(dernier) ? dernier : [...tous].sort((a, b) => b.creeLe - a.creeLe)[0]?.id
  useEffect(() => {
    if (donnees && cible) location.replace(`#${encodeURIComponent(cible)}`)
  }, [donnees, cible])
  if (!donnees || cible) return <EcranMessage texte={t('application.chargement')} />
  return (
    <Coquille
      gaucheOuvert={volets.gauche}
      libelleRedimension={t('interface.largeurVolet')}
      bandeau={<Bandeau voletGauche={boutonGauche(volets)} titre={t('application.nom')} compte={compteDe(personne)} />}
      voletGauche={voletDocs.contenu}
    >
      <TexteDeVolet texte={t('documents.aucun')} />
    </Coquille>
  )
}

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
/** Le dernier document ouvert dans ce navigateur (une commodité, perdue sans
 * conséquence : on retombe sur le plus récent). */
const CLE_DERNIER = 'amend.dernierDocument'
function lireDernier() {
  try {
    return localStorage.getItem(CLE_DERNIER)
  } catch {
    return null
  }
}
function noterDernier(id) {
  try {
    localStorage.setItem(CLE_DERNIER, id)
  } catch {
    // stockage refusé (navigation privée) : sans conséquence
  }
}
/** Pour la recherche : sans casse ni accents. */
const sansAccents = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

/**
 * Le volet « Documents », qui remplace la page « Mes documents » (Sylvain,
 * 10/11/2026 ; écart avec Docs) : l'arbre (Favoris, Mes documents et ses
 * dossiers, une entrée par équipe, Partagé avec moi), la recherche par titre,
 * la création, et les actions de chaque entrée. Rend le contenu de l'onglet,
 * ses fenêtres, et les favoris (pour l'étoile du bandeau).
 */
function useVoletDocuments(docId, { actif = true } = {}) {
  const [donnees, setDonnees] = useState(null)
  const [equipes, setEquipes] = useState({})
  const [recherche, setRecherche] = useState('')
  const [fenetreSaisie, demanderNom] = useSaisie()
  const [fenetreConfirmation, confirmer] = useConfirmation()
  const [choix, setChoix] = useState(null)
  const [membresDe, setMembresDe] = useState(null)
  const [partageDe, setPartageDe] = useState(null)
  const recharger = async () => {
    try {
      const d = await envoyerJson('GET', '/api/documents')
      const vues = await Promise.all(
        d.equipes.map((e) => envoyerJson('GET', `/api/equipes/${encodeURIComponent(e.id)}`).catch(() => null)),
      )
      setDonnees(d)
      setEquipes(Object.fromEntries(vues.filter(Boolean).map((v) => [v.equipe.id, v])))
    } catch (e) {
      montrerMessage(messageErreur(t, e.code || 'reseau'), { erreur: true })
    }
  }
  useEffect(() => {
    if (actif) recharger()
  }, [docId, actif])
  const agir = (f) => async () => {
    try {
      await f()
    } catch (e) {
      montrerMessage(messageErreur(t, e.code || 'reseau'), { erreur: true })
    }
    recharger()
  }
  const titreDe = (d) => d.titre || t('documents.sansTitre')
  const tous = donnees
    ? [
        ...donnees.documents.map((d) => ({ ...d, equipe: null })),
        ...Object.values(equipes).flatMap((v) =>
          v.documents.map((d) => ({ ...d, section: 'equipe', equipe: v.equipe.id })),
        ),
      ]
    : []
  const estFavori = (id) => tous.find((d) => d.id === id)?.favori ?? false
  const basculerFavori = (id) =>
    agir(() => envoyerJson(estFavori(id) ? 'DELETE' : 'PUT', `/api/documents/${encodeURIComponent(id)}/favori`))()

  // Un espace : Mes documents (`null`) ou une équipe.
  const dossiersDe = (equipe) => (equipe ? (equipes[equipe]?.dossiers ?? []) : (donnees?.dossiers ?? []))
  const modifiable = (equipe) => (equipe ? capacites(equipes[equipe]?.equipe.role).includes('ecrire') : true)
  const gestionnaire = (equipe) => capacites(equipes[equipe]?.equipe.role).includes('transferer')
  const nomEspace = (equipe) => (equipe ? (equipes[equipe]?.equipe.nom ?? '') : t('documents.mesDocuments'))
  const nomDuChemin = (equipe, id) =>
    [nomEspace(equipe), ...cheminDe(dossiersDe(equipe), id).map((d) => d.nom)].join(' / ')
  const destinations = (equipe, exclus = () => false) =>
    [{ value: RACINE, label: nomEspace(equipe) }].concat(
      dossiersDe(equipe)
        .filter((d) => !exclus(d))
        .map((d) => ({ value: d.id, label: nomDuChemin(equipe, d.id) }))
        .sort((a, b) => a.label.localeCompare(b.label, t.langue)),
    )
  const choisir = (titre, options, valider) => setChoix({ titre, options, valider, cle: `${titre}-${Date.now()}` })

  const creerDocument = (lieu) =>
    agir(async () => {
      location.hash = (await envoyerJson('POST', '/api/documents', lieu)).id
    })()
  const creerDossier = (equipe, parent = null) =>
    demanderNom({
      titre: t('documents.nouveauDossier'),
      libelle: t('documents.nomDuDossier'),
      valider: (nom) => agir(() => envoyerJson('POST', '/api/dossiers', { nom, parent, equipe }))(),
    })
  const creerEquipe = () =>
    demanderNom({
      titre: t('documents.nouvelleEquipe'),
      libelle: t('documents.nomEquipe'),
      valider: (nom) => agir(() => envoyerJson('POST', '/api/equipes', { nom }))(),
    })
  // « Nouveau document » : à côté du document ouvert, si l'on peut y écrire ;
  // sinon à la racine de Mes documents.
  const courant = tous.find((d) => d.id === docId)
  const lieuCourant =
    courant && courant.section !== 'partage' && modifiable(courant.equipe)
      ? { equipe: courant.equipe, dossier: courant.dossier ?? null }
      : { equipe: null, dossier: null }

  const deplacerDocument = (d) => {
    const equipe = d.equipe
    const ailleurs = equipe
      ? gestionnaire(equipe)
        ? [{ value: SORTIR, label: t('documents.mesDocuments') }]
        : []
      : (donnees?.equipes ?? [])
          .filter((e) => capacites(e.role).includes('ecrire'))
          .map((e) => ({ value: `${VERS_EQUIPE}${e.id}`, label: t('documents.equipeDestination', { nom: e.nom }) }))
    choisir(t('documents.deplacer', { nom: titreDe(d) }), [...destinations(equipe), ...ailleurs], async (v) => {
      let cible = { equipe, dossier: v === RACINE ? null : v }
      if (v === SORTIR) {
        const ok = await confirmer({
          titre: t('documents.deplacer', { nom: titreDe(d) }),
          texte: t('documents.confirmerSortie', { titre: titreDe(d) }),
          libelle: t('interface.continuer'),
        })
        if (!ok) return
        cible = { equipe: null, dossier: null }
      } else if (v.startsWith(VERS_EQUIPE)) {
        const id = v.slice(VERS_EQUIPE.length)
        const nom = donnees.equipes.find((e) => e.id === id)?.nom ?? ''
        const ok = await confirmer({
          titre: t('documents.deplacer', { nom: titreDe(d) }),
          texte: t('documents.confirmerEntree', { titre: titreDe(d), equipe: nom }),
          libelle: t('interface.continuer'),
        })
        if (!ok) return
        cible = { equipe: id, dossier: null }
      }
      await agir(() => envoyerJson('PUT', `/api/documents/${encodeURIComponent(d.id)}/dossier`, cible))()
    })
  }

  /** Les actions d'un document, selon mes capacités sur lui. */
  const actionsDocument = (d) => {
    const caps = capacites(d.role)
    const id = encodeURIComponent(d.id)
    const peutDeplacer = d.section === 'partage' ? false : d.equipe ? modifiable(d.equipe) : caps.includes('ranger')
    return [
      {
        cle: 'favori',
        libelle: d.favori ? t('documents.retirerFavori') : t('documents.ajouterFavori'),
        picto: d.favori ? 'favoriActif' : 'favori',
        surClic: () => basculerFavori(d.id),
      },
      ...(caps.includes('ecrire')
        ? [
            {
              cle: 'renommer',
              libelle: t('documents.renommer'),
              picto: 'renommer',
              surClic: () =>
                demanderNom({
                  titre: t('documents.renommer'),
                  libelle: t('document.nomDuDocument'),
                  valeur: d.titre ?? '',
                  valider: (titre) => agir(() => envoyerJson('PUT', `/api/documents/${id}/titre`, { titre }))(),
                }),
            },
          ]
        : []),
      ...(peutDeplacer
        ? [
            {
              cle: 'deplacer',
              libelle: t('documents.deplacerVers'),
              picto: 'dossier',
              surClic: () => deplacerDocument(d),
            },
          ]
        : []),
      ...(caps.includes('inviter')
        ? [{ cle: 'partager', libelle: t('document.partager'), picto: 'partager', surClic: () => setPartageDe(d.id) }]
        : []),
      ...(d.section === 'partage'
        ? [
            {
              cle: 'retrait',
              libelle: t('documents.meRetirer'),
              picto: 'deconnexion',
              danger: true,
              surClic: agir(async () => {
                const ok = await confirmer({
                  titre: t('documents.meRetirer'),
                  texte: t('documents.confirmerRetrait'),
                  libelle: t('documents.meRetirer'),
                  danger: true,
                })
                if (!ok) return
                await envoyerJson('DELETE', `/api/documents/${id}/moi`)
                if (d.id === docId) location.hash = '#'
              }),
            },
          ]
        : []),
      ...(caps.includes('supprimer')
        ? [
            {
              cle: 'supprimer',
              libelle: t('documents.supprimer'),
              picto: 'supprimer',
              danger: true,
              surClic: agir(async () => {
                const ok = await confirmer({
                  titre: t('document.supprimer'),
                  texte: t('document.confirmerSuppression'),
                  libelle: t('document.supprimer'),
                  danger: true,
                })
                if (!ok) return
                await envoyerJson('DELETE', `/api/documents/${id}`)
                if (d.id === docId) location.hash = '#'
              }),
            },
          ]
        : []),
    ]
  }
  const entreeDoc = (d) => ({
    cle: `${d.section}-${d.id}`,
    nom: titreDe(d),
    picto: 'document',
    href: `#${encodeURIComponent(d.id)}`,
    actif: d.id === docId,
    actions: actionsDocument(d),
  })

  /** Les actions d'un dossier d'un espace. */
  const actionsDossier = (equipe, x) => {
    if (!modifiable(equipe)) return []
    const dossiers = dossiersDe(equipe)
    const dansLeSousArbre = (d) => d.id === x.id || cheminDe(dossiers, d.id).some((p) => p.id === x.id)
    return [
      {
        cle: 'nouveau',
        libelle: t('documents.nouveau'),
        picto: 'nouveau',
        surClic: () => creerDocument({ equipe, dossier: x.id }),
      },
      {
        cle: 'dossier',
        libelle: t('documents.nouveauDossier'),
        picto: 'dossier',
        surClic: () => creerDossier(equipe, x.id),
      },
      {
        cle: 'renommer',
        libelle: t('documents.renommer'),
        picto: 'renommer',
        surClic: () =>
          demanderNom({
            titre: t('documents.renommer'),
            libelle: t('documents.nomDuDossier'),
            valeur: x.nom,
            valider: (nom) => agir(() => envoyerJson('PUT', `/api/dossiers/${x.id}`, { nom }))(),
          }),
      },
      {
        cle: 'deplacer',
        libelle: t('documents.deplacerVers'),
        picto: 'dossier',
        surClic: () =>
          choisir(t('documents.deplacer', { nom: x.nom }), destinations(equipe, dansLeSousArbre), (v) =>
            agir(() => envoyerJson('PUT', `/api/dossiers/${x.id}`, { parent: v === RACINE ? null : v }))(),
          ),
      },
      {
        cle: 'supprimer',
        libelle: t('documents.supprimer'),
        picto: 'supprimer',
        danger: true,
        surClic: agir(async () => {
          const ok = await confirmer({
            titre: t('documents.supprimer'),
            texte: t('documents.confirmerSuppressionDossier', { nom: x.nom }),
            libelle: t('documents.supprimer'),
            danger: true,
          })
          if (ok) await envoyerJson('DELETE', `/api/dossiers/${x.id}`)
        }),
      },
    ]
  }
  /** L'arbre d'un espace ; les dossiers qui mènent au document ouvert sont ouverts. */
  const arbreEspace = (equipe, documents) => {
    const dossiers = dossiersDe(equipe)
    const ouverts = new Set()
    const ici = documents.find((d) => d.id === docId)
    for (let id = ici?.dossier ?? null; id && !ouverts.has(id); id = dossiers.find((x) => x.id === id)?.parent ?? null)
      ouverts.add(id)
    const dans = (parent) => [
      ...dossiers
        .filter((d) => (d.parent ?? null) === parent)
        .map((d) => ({
          cle: d.id,
          nom: d.nom,
          picto: 'dossier',
          ouvert: ouverts.has(d.id),
          enfants: dans(d.id),
          actions: actionsDossier(equipe, d),
        })),
      ...documents.filter((d) => (d.dossier ?? null) === parent).map(entreeDoc),
    ]
    return { enfants: dans(null), ouvert: Boolean(ici) }
  }
  /** Les actions d'une équipe. */
  const actionsEquipe = (v) => {
    const id = v.equipe.id
    const base = `/api/equipes/${encodeURIComponent(id)}`
    return [
      ...(modifiable(id)
        ? [
            {
              cle: 'nouveau',
              libelle: t('documents.nouveau'),
              picto: 'nouveau',
              surClic: () => creerDocument({ equipe: id, dossier: null }),
            },
            {
              cle: 'dossier',
              libelle: t('documents.nouveauDossier'),
              picto: 'dossier',
              surClic: () => creerDossier(id),
            },
          ]
        : []),
      ...(gestionnaire(id)
        ? [
            { cle: 'membres', libelle: t('documents.membres'), picto: 'equipe', surClic: () => setMembresDe(id) },
            {
              cle: 'renommer',
              libelle: t('documents.renommerEquipe'),
              picto: 'renommer',
              surClic: () =>
                demanderNom({
                  titre: t('documents.renommerEquipe'),
                  libelle: t('documents.nomEquipe'),
                  valeur: v.equipe.nom,
                  valider: (nom) => agir(() => envoyerJson('PUT', base, { nom }))(),
                }),
            },
            {
              cle: 'supprimer',
              libelle: t('documents.supprimerEquipe'),
              picto: 'supprimer',
              danger: true,
              surClic: agir(async () => {
                const ok = await confirmer({
                  titre: t('documents.supprimerEquipe'),
                  texte: t('documents.confirmerSuppressionEquipe', { nom: v.equipe.nom }),
                  libelle: t('documents.supprimerEquipe'),
                  danger: true,
                })
                if (ok) await envoyerJson('DELETE', base)
              }),
            },
          ]
        : []),
      {
        cle: 'quitter',
        libelle: t('documents.quitterEquipe'),
        picto: 'deconnexion',
        danger: true,
        surClic: agir(async () => {
          const ok = await confirmer({
            titre: t('documents.quitterEquipe'),
            texte: t('documents.confirmerDepart', { nom: v.equipe.nom }),
            libelle: t('documents.quitterEquipe'),
            danger: true,
          })
          if (ok) await envoyerJson('DELETE', `${base}/moi`)
        }),
      },
    ]
  }

  let entrees = []
  if (donnees && recherche.trim()) {
    const q = sansAccents(recherche.trim())
    entrees = tous.filter((d) => sansAccents(titreDe(d)).includes(q)).map(entreeDoc)
  } else if (donnees) {
    const favoris = tous.filter((d) => d.favori)
    const mes = arbreEspace(
      null,
      donnees.documents.filter((d) => d.section === 'mes-documents'),
    )
    const partages = donnees.documents.filter((d) => d.section === 'partage')
    entrees = [
      ...(favoris.length
        ? [
            {
              cle: 'favoris',
              nom: t('documents.favoris'),
              picto: 'favoriActif',
              ouvert: true,
              enfants: favoris.map((d) => ({ ...entreeDoc(d), cle: `favori-${d.id}` })),
            },
          ]
        : []),
      { cle: 'mes', nom: t('documents.mesDocuments'), picto: 'moi', ouvert: true, enfants: mes.enfants },
      ...Object.values(equipes)
        .sort((a, b) => a.equipe.nom.localeCompare(b.equipe.nom, t.langue))
        .map((v) => {
          const a = arbreEspace(
            v.equipe.id,
            tous.filter((d) => d.equipe === v.equipe.id),
          )
          return {
            cle: `equipe-${v.equipe.id}`,
            nom: v.equipe.nom,
            picto: 'equipe',
            ouvert: a.ouvert,
            enfants: a.enfants,
            actions: actionsEquipe(v),
          }
        }),
      ...(partages.length
        ? [
            {
              cle: 'partages',
              nom: t('documents.partagesAvecMoi'),
              picto: 'partages',
              ouvert: partages.some((d) => d.id === docId),
              enfants: partages.map(entreeDoc),
            },
          ]
        : []),
    ]
  }

  const contenu = (
    <>
      <VoletDocuments
        recherche={{ libelle: t('documents.rechercher'), valeur: recherche, surChange: setRecherche }}
        boutons={[
          {
            cle: 'nouveau',
            libelle: t('documents.nouveau'),
            picto: 'nouveau',
            surClic: () => creerDocument(lieuCourant),
          },
          {
            cle: 'dossier',
            libelle: t('documents.nouveauDossier'),
            picto: 'dossier',
            surClic: () => creerDossier(null),
          },
          { cle: 'equipe', libelle: t('documents.nouvelleEquipe'), picto: 'equipe', surClic: creerEquipe },
        ]}
        entrees={entrees}
        vide={
          donnees ? (recherche.trim() ? t('documents.rienTrouve') : t('documents.aucun')) : t('application.chargement')
        }
        libelleActions={(nom) => t('documents.actionsDe', { nom })}
      />
      {fenetreSaisie}
      {fenetreConfirmation}
      <FenetreChoix
        key={choix?.cle ?? 'fermee'}
        ouverte={!!choix}
        titre={choix?.titre}
        libelle={t('documents.destination')}
        options={choix?.options ?? []}
        libelleValider={t('interface.valider')}
        libelleAnnuler={t('interface.annuler')}
        surValider={(v) => {
          const f = choix.valider
          setChoix(null)
          f(v)
        }}
        surFermer={() => setChoix(null)}
      />
      <Fenetre
        ouverte={!!membresDe && !!equipes[membresDe]}
        titre={t('documents.membres')}
        surFermer={() => setMembresDe(null)}
        libelleFermer={t('interface.fermer')}
      >
        {membresDe && equipes[membresDe] ? <Membres vue={equipes[membresDe]} surChangement={recharger} /> : null}
      </Fenetre>
      <Fenetre
        ouverte={!!partageDe}
        titre={t('partage.titre')}
        surFermer={() => setPartageDe(null)}
        libelleFermer={t('interface.fermer')}
      >
        {partageDe ? <Partage docId={partageDe} /> : null}
      </Fenetre>
    </>
  )
  return { contenu, donnees, tous, estFavori, basculerFavori, recharger }
}

function Edition({ config, personne, docId, droits }) {
  // L'interface suit les capacités, jamais le nom du rôle.
  const caps = droits.capacites
  // Les trois modes d'un éditeur, comme l'exemple de BlockNote (Sylvain,
  // 10/11/2026) : Modifier à l'ouverture, Suggérer, Relire ; le correcteur
  // suggère toujours, le lecteur lit.
  const [modeEditeur, setModeEditeur] = useState('ecrire')
  const mode = caps.includes('ecrire') ? modeEditeur : caps.includes('suggerer') ? 'suggerer' : 'lire'
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
    // Changer de mode ne rouvre pas la connexion : seul l'éditeur change de mode.
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
  // Margo (étape 8) : l'onglet du volet droit et le bouton « Corriger ».
  const peutMargo = caps.includes('utiliserMargo')
  const margo = useMargo(docId)
  const [selection, setSelection] = useState(null)
  const [demandeMargo, setDemandeMargo] = useState('')
  const [ongletRelecture, setOngletRelecture] = useState('modifications')
  const [historique, setHistorique] = useState(false)
  const [partage, setPartage] = useState(false)
  // Le volet « Documents », chargé à l'ouverture dans tous les formats : l'étoile
  // du bandeau en dépend (audit du 10/11/2026).
  const voletDocs = useVoletDocuments(docId)
  // Le dernier document ouvert, pour la prochaine ouverture (Sylvain, 10/11/2026).
  useEffect(() => noterDernier(docId), [docId])
  const enregistrerTitre = async (nom) => {
    try {
      setTitre((await envoyerJson('PUT', `/api/documents/${encodeURIComponent(docId)}/titre`, { titre: nom })).titre)
      voletDocs.recharger()
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
    if (!ouvertDOffice.current && (suggestions?.liste.length || suggestions?.enAttente)) {
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
      nomsAvecMargo(manquants).then((l) => {
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
  // Le titre du document est le nom de l'onglet du navigateur (Sylvain, 10/11/2026).
  useEffect(() => {
    document.title = `${titreAffiche} – ${t('application.nom')}`
    return () => {
      document.title = t('application.nom')
    }
  }, [titreAffiche])
  const favori = {
    actif: voletDocs.estFavori(docId),
    libelle: voletDocs.estFavori(docId) ? t('documents.retirerFavori') : t('documents.ajouterFavori'),
    surBasculer: () => voletDocs.basculerFavori(docId),
  }
  const peutRenommer = caps.includes('ecrire')
  // Exports Markdown et PDF du texte de base (étape 7), préparés dans le
  // navigateur comme chez Docs.
  const exporter = (format) =>
    exporterDocument(controle, format, { titre: titreAffiche, langue: LANGUE_DOCUMENT_PAR_DEFAUT }).catch((e) =>
      montrerMessage(e?.code === 'modele-impossible' ? messageErreur(t, e.code) : t('document.exportEchoue'), {
        erreur: true,
      }),
    )
  // La mention du mode, pour qui n'a pas le choix (l'éditeur voit le sélecteur).
  const mention = caps.includes('ecrire')
    ? null
    : { suggerer: t('document.modeSuggestion'), lire: t('document.lectureSeule') }[mode]
  const MODES = [
    ['ecrire', t('document.modeEcrire'), t('document.passerEcrire')],
    ['suggerer', t('document.modeSuggerer'), t('document.passerSuggerer')],
    ['relire', t('document.modeRelire'), t('document.passerRelire')],
  ]
  // Dans les menus (formats M et S) : passer à l'un des deux autres modes.
  const autresModes = (champ) =>
    caps.includes('ecrire')
      ? MODES.filter(([m]) => m !== modeEditeur).map(([m, , passer]) => ({
          cle: `mode-${m}`,
          libelle: passer,
          [champ]: 'modifications',
          surClic: () => setModeEditeur(m),
        }))
      : []
  // « Copier le lien », le même dans tous les formats (audit du 10/11/2026) :
  // le lien du document, un retour, et le lien à recopier si le presse-papiers refuse.
  const lien = `${location.origin}/#${encodeURIComponent(docId)}`
  const copierLien = () =>
    Promise.resolve(navigator.clipboard?.writeText(lien) ?? Promise.reject(new Error('presse-papiers absent')))
      .then(() => montrerMessage(t('telephone.lienCopie')))
      .catch(() => montrerMessage(t('telephone.lienNonCopie', { lien }), { erreur: true }))
  const actions = [
    ...(etroit ? autresModes('picto') : []),
    {
      cle: 'lien',
      libelle: t('telephone.copierLien'),
      picto: 'lien',
      surClic: copierLien,
    },
    ...(caps.includes('inviter')
      ? [{ cle: 'partager', libelle: t('document.partager'), picto: 'partager', surClic: () => setPartage(true) }]
      : []),
    // (« Renommer » : en L et M, d'un clic sur le titre du bandeau ; Sylvain, 10/11/2026.)
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
      titre={
        mode === 'relire' || !suggestions.enAttente
          ? t('suggestions.titre', { n: suggestions.liste.length })
          : t('suggestions.enCours')
      }
      // Hors relecture, l'éditeur ne voit pas les suggestions : une invitation à relire.
      invitation={
        mode !== 'relire' && suggestions.enAttente
          ? {
              texte: t('suggestions.enAttente'),
              bouton: t('document.passerRelire'),
              surClic: () => setModeEditeur('relire'),
            }
          : null
      }
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
  const { demander: demanderMargo } = margo
  // Le geste de « Corriger » change à chaque rendu ; le bouton, lui, reste le
  // même (la palette de l'éditeur ne se reconstruit pas).
  const surCorriger = useRef(null)
  surCorriger.current = (choisie) => {
    setOngletRelecture('margo')
    if (formatS) setVolet('droite')
    else volets.ouvrirDroite()
    demanderMargo({ corriger: true, selection: choisie })
  }
  const corriger = useMemo(
    () => (peutMargo ? { libelle: t('margo.corriger'), surClic: (choisie) => surCorriger.current(choisie) } : null),
    [peutMargo],
  )
  const allerAuBloc = (id) => {
    if (formatS) setVolet(null)
    controle.current?.allerAuBloc(id)
  }
  const envoyerMargo = () => {
    const demande = demandeMargo.trim()
    if (!demande) return
    setDemandeMargo('')
    demanderMargo({ demande, selection })
  }
  const panneauMargo = peutMargo ? (
    <PanneauMargo
      titre={t('interface.margo')}
      messages={margo.fil.map((m) => ({
        cle: m.cle,
        etiquette: m.auteur === 'margo' ? t('interface.margo') : t('margo.vous'),
        morceaux:
          m.auteur === 'margo'
            ? morceauxDeMargo(m, allerAuBloc)
            : [{ texte: m.corriger ? t('margo.demandeCorriger') : m.texte }],
        bilan: m.bilan ? [t('margo.bilan', m.bilan), MARGO_ARRET[m.bilan.arret]?.()].filter(Boolean).join(' ') : null,
      }))}
      accueil={t('margo.accueil')}
      enCours={margo.enCours ? (MARGO_EN_COURS[margo.enCours] ?? MARGO_EN_COURS.reflexion)() : null}
      erreur={margo.erreur ? messageErreur(t, margo.erreur, { max: MARGO_DEMANDE_MAX_SIGNES }) : null}
      portee={selection ? t('margo.porteeSelection') : t('margo.porteeDocument')}
      saisie={{
        libelle: t('margo.saisie'),
        valeur: demandeMargo,
        surChange: setDemandeMargo,
        surEnvoi: envoyerMargo,
        envoyer: t('margo.envoyer'),
        desactive: Boolean(margo.enCours) || !demandeMargo.trim(),
      }}
      nouvelle={margo.fil.length ? { libelle: t('margo.nouvelle'), surClic: margo.nouvelle } : null}
    />
  ) : null
  const editeur = (
    <EditeurCollaboratif
      contexte={session.contexte}
      personne={moi}
      langue={t.langue}
      langueDocument={LANGUE_DOCUMENT_PAR_DEFAUT}
      nomAccessible={t('document.zoneEdition', { id: docId })}
      mode={mode}
      nomsDe={nomsAvecMargo}
      commentaires={commentaires}
      surSuggestions={caps.includes('arbitrer') ? setSuggestions : undefined}
      historique={historique && !formatS}
      peutRestaurer={caps.includes('restaurer')}
      surFermerHistorique={() => setHistorique(false)}
      lectureAuDepart={formatS || tactile}
      controle={controle}
      surModification={setEnModification}
      surPlan={setPlan}
      corriger={corriger}
      surSelection={peutMargo ? setSelection : undefined}
    />
  )

  // Format S (téléphone) : la maquette validée (docs/v2-format-S.md). Comme
  // Docs sur téléphone, pas d'historique dans le menu.
  if (formatS)
    return (
      <PageEditionS
        titre={titreAffiche}
        surTitre={peutRenommer ? renommer : undefined}
        favori={favori}
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
          ...autresModes('icone'),
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
              contenu: voletDocs.contenu,
            },
          ],
        }}
        voletDroit={
          suggestions || peutMargo
            ? {
                titre: t('telephone.relecture'),
                onglets: [
                  {
                    cle: 'modifications',
                    libelle: t('telephone.modifications'),
                    icone: 'modifications',
                    contenu: modifications,
                  },
                  ...(peutMargo
                    ? [{ cle: 'margo', libelle: t('interface.margo'), icone: 'margo', contenu: panneauMargo }]
                    : []),
                ],
                actif: ongletRelecture,
                surOnglet: setOngletRelecture,
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
          favori={favori}
          renommer={
            peutRenommer
              ? { libelle: t('document.renommer'), valeur: titre ?? '', surValider: enregistrerTitre }
              : undefined
          }
          mention={mention}
          // L : dans le bandeau, comme la v1 ; M (iPad) : dans le menu « … »,
          // comme au téléphone, le bandeau étant trop étroit (10/11/2026).
          modes={
            caps.includes('ecrire') && !etroit
              ? {
                  libelle: t('document.modes'),
                  valeur: modeEditeur,
                  options: MODES.map(([m, libelle]) => ({ valeur: m, libelle })),
                  surChange: setModeEditeur,
                }
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
          documents={voletDocs.contenu}
        />
      }
      voletDroit={
        avecVoletDroit ? (
          <VoletRelecture
            titre={t('telephone.relecture')}
            onglets={{ modifications: t('telephone.modifications'), margo: t('interface.margo') }}
            modifications={modifications}
            margo={panneauMargo}
            actif={ongletRelecture}
            surOnglet={setOngletRelecture}
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
