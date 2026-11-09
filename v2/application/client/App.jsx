// Les écrans (couche application technique) : connexion, mes documents,
// l'écran d'un document et son partage ; état et appels au serveur. Tout
// l'affichage est délégué à la couche design ; tous les textes viennent de
// v2/i18n/.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PageEdition,
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
import { serviceCommentaires, nomsDe } from './commentaires.js'

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

const envoyerJson = async (methode, chemin, corps) => {
  const r = await fetch(chemin, {
    method: methode,
    headers: corps === undefined ? {} : { 'content-type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  const donnees = await lireJson(r)
  if (!r.ok)
    throw Object.assign(new Error(donnees.code || `http-${r.status}`), { code: donnees.code || `http-${r.status}` })
  return donnees
}

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
  if (visee.liste)
    return <MesDocuments onglet={visee.liste} dossier={visee.dossier ?? null} admin={etat.personne.admin === true} />
  // Une adresse illisible a le même message qu'un nom refusé, sans dépendre du domaine.
  const doc = identifiantDocument(visee.document)
  if (!doc.ok) return <EcranMessage texte={messageErreur(t, doc.code)} />
  return <Document key={doc.id} config={etat.config} personne={etat.personne} docId={doc.id} />
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
function MesDocuments({ onglet, dossier, admin }) {
  const equipe = onglet.startsWith(VERS_EQUIPE) ? onglet.slice(VERS_EQUIPE.length) : null
  const [donnees, setDonnees] = useState(null)
  const [vueEquipe, setVueEquipe] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [message, setMessage] = useState(null)
  const [membres, setMembres] = useState(false)
  const recharger = async () => {
    try {
      const d = await envoyerJson('GET', '/api/documents')
      const e = equipe ? await envoyerJson('GET', `/api/equipes/${encodeURIComponent(equipe)}`) : null
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
    setMessage(null)
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
  const nouvelleEquipe = agir(async () => {
    const nom = window.prompt(t('documents.nomEquipe'))
    if (nom !== null) location.hash = adresseEspace((await envoyerJson('POST', '/api/equipes', { nom })).id)
  })
  const commun = {
    nomApplication: t('application.nom'),
    actions: (
      <>
        <Bouton libelle={t('documents.nouvelleEquipe')} surClic={nouvelleEquipe} />
        {admin ? <Bouton libelle={t('admin.titre')} surClic={() => (location.hash = '#/admin')} /> : null}
        <Deconnexion />
      </>
    ),
    onglets: [
      { value: 'mes', label: t('documents.mesDocuments') },
      { value: 'partages', label: t('documents.partagesAvecMoi') },
      ...donnees.equipes.map((e) => ({ value: `${VERS_EQUIPE}${e.id}`, label: e.nom })),
    ],
    onglet,
    surOnglet: (o) =>
      (location.hash =
        o === 'partages' ? '#/partages' : o.startsWith(VERS_EQUIPE) ? adresseEspace(o.slice(VERS_EQUIPE.length)) : '#'),
    libelleChemin: t('documents.chemin'),
    message,
  }

  if (onglet === 'partages')
    return (
      <ListeDocuments
        {...commun}
        titre={t('documents.partagesAvecMoi')}
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
                  if (window.confirm(t('documents.confirmerRetrait')))
                    await envoyerJson('DELETE', `/api/documents/${encodeURIComponent(d.id)}/moi`)
                })}
              />
            ),
          }))}
        vide={t('documents.videPartages')}
      />
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
      if (!window.confirm(t('documents.confirmerSortie', { titre: titreDe(d) }))) return
      cible = { equipe: null, dossier: null }
    } else if (v.startsWith(VERS_EQUIPE)) {
      const id = v.slice(VERS_EQUIPE.length)
      const nom = donnees.equipes.find((e) => e.id === id)?.nom ?? ''
      if (!window.confirm(t('documents.confirmerEntree', { titre: titreDe(d), equipe: nom }))) return
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
            surClic={agir(async () => {
              const nom = window.prompt(t('documents.nomDuDossier'), d.nom)
              if (nom !== null) await envoyerJson('PUT', `/api/dossiers/${d.id}`, { nom })
            })}
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
              if (window.confirm(t('documents.confirmerSuppressionDossier', { nom: d.nom })))
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
  const nouveauDocument = agir(async () => {
    location.hash = (await envoyerJson('POST', '/api/documents', { dossier, equipe })).id
  })
  const nouveauDossier = agir(async () => {
    const nom = window.prompt(t('documents.nomDuDossier'))
    if (nom !== null) await envoyerJson('POST', '/api/dossiers', { nom, parent: dossier, equipe })
  })
  const baseEquipe = equipe ? `/api/equipes/${encodeURIComponent(equipe)}` : null
  const boutonsEquipe = equipe ? (
    <>
      {gestionnaire ? (
        <>
          <BoutonBascule libelle={t('documents.membres')} actif={membres} surBasculer={() => setMembres((m) => !m)} />
          <Bouton
            libelle={t('documents.renommerEquipe')}
            surClic={agir(async () => {
              const nom = window.prompt(t('documents.nomEquipe'), vueEquipe.equipe.nom)
              if (nom !== null) await envoyerJson('PUT', baseEquipe, { nom })
            })}
          />
          <Bouton
            libelle={t('documents.supprimerEquipe')}
            surClic={agir(async () => {
              if (!window.confirm(t('documents.confirmerSuppressionEquipe', { nom: vueEquipe.equipe.nom }))) return
              await envoyerJson('DELETE', baseEquipe)
              location.hash = '#'
            })}
          />
        </>
      ) : null}
      <Bouton
        libelle={t('documents.quitterEquipe')}
        surClic={agir(async () => {
          if (!window.confirm(t('documents.confirmerDepart', { nom: vueEquipe.equipe.nom }))) return
          await envoyerJson('DELETE', `${baseEquipe}/moi`)
          location.hash = '#'
        })}
      />
    </>
  ) : null
  return (
    <ListeDocuments
      {...commun}
      titre={nomEspace}
      chemin={[
        { cle: 'racine', libelle: nomEspace, href: adresseEspace(equipe) },
        ...cheminDe(dossiers, dossier).map((d) => ({ cle: d.id, libelle: d.nom, href: adresseEspace(equipe, d.id) })),
      ]}
      boutons={
        <>
          {modifiable ? (
            <>
              <Bouton libelle={t('documents.nouveau')} surClic={nouveauDocument} />
              <Bouton libelle={t('documents.nouveauDossier')} surClic={nouveauDossier} />
            </>
          ) : null}
          {boutonsEquipe}
        </>
      }
      panneau={equipe && gestionnaire && membres ? <Membres vue={vueEquipe} surChangement={recharger} /> : null}
      colonnes={[t('documents.colonneNom'), t('documents.colonneRole'), t('documents.colonneDate')]}
      lignes={[...lignesDossiers, ...lignesDocuments]}
      vide={dossier ? t('documents.videDossier') : equipe ? t('documents.videEquipe') : t('documents.vide')}
    />
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

/** Un seul bouton pour se déconnecter (Sylvain, 09/11/2026) ; « déconnecter
 * partout » reste une route du serveur, sans bouton pour le moment. */
function Deconnexion() {
  const sortir = async () => {
    await envoyerJson('POST', '/api/deconnexion').catch(() => {})
    location.reload()
  }
  return <Bouton libelle={t('documents.deconnexion')} surClic={sortir} />
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

function Edition({ config, personne, docId, droits }) {
  // L'interface suit les capacités, jamais le nom du rôle.
  const caps = droits.capacites
  const mode = caps.includes('ecrire') ? 'ecrire' : caps.includes('suggerer') ? 'suggerer' : 'lire'
  const moi = useMemo(() => ({ ...personne, couleur: couleurAuteur(personne.id) }), [personne])
  const session = useMemo(
    () =>
      ouvrirDocument({
        url: config.collaboration,
        api: `${location.origin}/collaboration`,
        docId,
        personne: moi,
        suggestions: mode !== 'lire',
      }),
    [config, docId, moi, mode],
  )
  const commentaires = useMemo(
    () => (caps.includes('commenter') ? { service: serviceCommentaires(docId), capacites: caps } : null),
    [caps, docId],
  )
  const [connexion, setConnexion] = useState('connexion')
  const [autres, setAutres] = useState(0)
  const [suggestions, setSuggestions] = useState(null)
  const [noms, setNoms] = useState({})
  const [historique, setHistorique] = useState(false)
  const [partage, setPartage] = useState(false)
  const supprimer = async () => {
    if (!window.confirm(t('document.confirmerSuppression'))) return
    try {
      await envoyerJson('DELETE', `/api/documents/${encodeURIComponent(docId)}`)
      location.hash = ''
    } catch (e) {
      window.alert(messageErreur(t, e.code || 'reseau'))
    }
  }
  useEffect(() => session.surEtat(setConnexion), [session])
  useEffect(() => session.surParticipants(setAutres), [session])
  useEffect(() => () => session.fermer(), [session])
  // Les noms des auteurs des suggestions, demandés une fois chacun.
  const demandes = useRef(new Set())
  useEffect(() => {
    const manquants = [...new Set((suggestions?.liste ?? []).map((s) => s.auteur))].filter(
      (id) => id && !(id in noms) && !demandes.current.has(id),
    )
    manquants.forEach((id) => demandes.current.add(id))
    if (manquants.length)
      nomsDe(manquants).then((l) => setNoms((n) => ({ ...n, ...Object.fromEntries(l.map((p) => [p.id, p.username])) })))
  }, [suggestions, noms])

  const ligne = (s) => {
    const auteur = noms[s.auteur] ?? t('suggestions.auteurInconnu')
    const v = { auteur, avant: s.avant.trim(), apres: s.apres.trim() }
    if (s.type === 'ajout') return t('suggestions.ajout', v)
    if (s.type === 'suppression') return t('suggestions.suppression', v)
    return t('suggestions.remplacement', v)
  }
  return (
    <PageEdition
      nomApplication={t('application.nom')}
      titre={t('document.titre', { id: docId })}
      etat={t('document.etat', { etat: connexion })}
      participants={t('document.participants', { n: autres })}
      actions={
        <>
          <Bouton libelle={t('document.mesDocuments')} surClic={() => (location.hash = '')} />
          <BoutonBascule
            libelle={t('document.historique')}
            actif={historique}
            surBasculer={() => setHistorique((h) => !h)}
          />
          {caps.includes('inviter') ? (
            <BoutonBascule libelle={t('document.partager')} actif={partage} surBasculer={() => setPartage((p) => !p)} />
          ) : null}
          {caps.includes('supprimer') ? <Bouton libelle={t('document.supprimer')} surClic={supprimer} /> : null}
        </>
      }
      mention={{ ecrire: null, suggerer: t('document.modeSuggestion'), lire: t('document.lectureSeule') }[mode]}
      cote={
        <>
          {partage ? <Partage docId={docId} /> : null}
          {suggestions ? (
            <PanneauSuggestions
              titre={t('suggestions.titre', { n: suggestions.liste.length })}
              lignes={suggestions.liste.map((s) => ({ cle: `${s.debut}-${s.type}`, texte: ligne(s) }))}
              libelles={{
                accepter: t('suggestions.accepter'),
                refuser: t('suggestions.refuser'),
                toutAccepter: t('suggestions.toutAccepter'),
                toutRefuser: t('suggestions.toutRefuser'),
              }}
              surAccepter={(i) => suggestions.accepter(suggestions.liste[i])}
              surRefuser={(i) => suggestions.refuser(suggestions.liste[i])}
              surToutAccepter={suggestions.toutAccepter}
              surToutRefuser={suggestions.toutRefuser}
            />
          ) : null}
        </>
      }
      editeur={
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
          historique={historique}
          peutRestaurer={caps.includes('restaurer')}
          surFermerHistorique={() => setHistorique(false)}
        />
      }
    />
  )
}
