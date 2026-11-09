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
  PanneauPartage,
  PanneauSuggestions,
  BoutonBascule,
  Bouton,
  couleurAuteur,
} from '../../design/index.js'
import { creerTraducteur, choisirLangue, messageErreur, libelleDuRole, LANGUE_PSEUDO } from '../../i18n/index.js'
import { identifiantDocument, LANGUE_DOCUMENT_PAR_DEFAUT } from '../../domaine/index.js'
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

/** Ce que vise l'adresse : `#` vide, mes documents ; `#!code`, un message ;
 * `#id`, un document ; `null` si l'adresse est mal encodée (`#%`). */
function viseeDansAdresse() {
  let h
  try {
    h = decodeURIComponent(location.hash.slice(1))
  } catch {
    return null
  }
  if (!h) return { liste: true }
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
        titre={t('nom.titre')}
        explication={t('nom.explication')}
        libelleNom={t('nom.nom')}
        libelleBouton={t('nom.bouton')}
        surEntrer={nommer}
      />
    )
  if (visee === null) return <EcranMessage texte={messageErreur(t, 'document-caracteres')} />
  if (visee.message) return <EcranMessage texte={messageErreur(t, visee.message)} />
  if (visee.liste) return <MesDocuments />
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

/** Mes documents : tous, créés par moi, partagés avec moi ; en créer un. */
function MesDocuments() {
  const [documents, setDocuments] = useState(null)
  const [filtre, setFiltre] = useState('tous')
  const [erreur, setErreur] = useState(null)
  useEffect(() => {
    envoyerJson('GET', '/api/documents')
      .then(setDocuments)
      .catch((e) => setErreur(e.code || 'reseau'))
  }, [])
  if (erreur) return <EcranMessage texte={messageErreur(t, erreur)} />
  if (!documents) return <EcranMessage texte={t('application.chargement')} />
  const date = new Intl.DateTimeFormat(t.langue, { dateStyle: 'medium' })
  const visibles = documents.filter((d) => filtre === 'tous' || (filtre === 'miens') === d.creeParMoi)
  const nouveau = async () => {
    try {
      location.hash = (await envoyerJson('POST', '/api/documents', {})).id
    } catch (e) {
      setErreur(e.code || 'reseau')
    }
  }
  return (
    <ListeDocuments
      titre={t('documents.titre')}
      libelleNouveau={t('documents.nouveau')}
      filtres={[
        { value: 'tous', label: t('documents.tous') },
        { value: 'miens', label: t('documents.miens') },
        { value: 'partages', label: t('documents.partages') },
      ]}
      filtre={filtre}
      colonnes={{
        titre: t('documents.colonneTitre'),
        role: t('documents.colonneRole'),
        date: t('documents.colonneDate'),
      }}
      documents={visibles.map((d) => ({
        id: d.id,
        titre: d.titre || t('documents.sansTitre'),
        role: nomDuRole(d.role),
        date: date.format(d.creeLe),
      }))}
      vide={t('documents.vide')}
      actions={<Deconnexion />}
      surFiltre={setFiltre}
      surNouveau={nouveau}
    />
  )
}

function Deconnexion() {
  const sortir = (partout) => async () => {
    await envoyerJson('POST', partout ? '/api/deconnexion-partout' : '/api/deconnexion').catch(() => {})
    location.reload()
  }
  return (
    <>
      <Bouton libelle={t('documents.deconnexion')} surClic={sortir(false)} />
      <Bouton libelle={t('documents.deconnexionPartout')} surClic={sortir(true)} />
    </>
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
