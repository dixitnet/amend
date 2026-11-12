// L'écran d'un document : éditeur, volets, relecture, Margo, export.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PanneauSuggestions,
  PanneauMargo,
  couleurAuteur,
  Coquille,
  ColonneTexte,
  ZoneZoom,
  Bandeau,
  VoletPlanDocuments,
  VoletRelecture,
  ListeDesFils,
  TexteDeVolet,
  AlerteHorsLigne,
  Fenetre,
  montrerMessage,
  useFormat,
  PageEditionS,
  PlanDocument,
  useFormatS,
} from '../../design/index.js'
import { REGLAGES } from '../../design/reglages.js'
import { messageErreur } from '../../i18n/index.js'
import { LANGUE_DOCUMENT_PAR_DEFAUT, MARGO_DEMANDE_MAX_SIGNES } from '../../domaine/index.js'
import { ouvrirDocument } from '../../adaptateurs/yjs/index.js'
import { EditeurCollaboratif } from '../../adaptateurs/blocknote/index.jsx'
import { serviceCommentaires, envoyerImage } from './commentaires.js'
import { nomsAdemander } from './nomsAuteurs.js'
import { useVolets } from './volets.js'
import { useMargo } from './margo.js'
import { t, nomsAvecMargo, envoyerJson, compteDe, boutonGauche } from './commun.js'
import { MARGO_EN_COURS, MARGO_ARRET, morceauxDeMargo } from './textesMargo.js'
import { useSaisie, useConfirmation } from './fenetres.jsx'
import { useExport } from './useExport.jsx'
import { Partage } from './Partage.jsx'
import { noterDernier, useVoletDocuments } from './voletDocuments.jsx'
import { lireZoom, noterZoom, TEXTES_EDITEUR, FiletDeLEditeur } from './aidesEdition.jsx'

export function Edition({ config, personne, docId, droits, surDroitsChanges }) {
  // L'interface suit les capacités, jamais le nom du rôle.
  const caps = droits.capacites
  // Les trois modes d'un éditeur, comme l'exemple de BlockNote (Sylvain,
  // 10/11/2026) : Modifier à l'ouverture, Suggérer, Relire ; le correcteur
  // suggère toujours, le lecteur lit.
  const [modeEditeur, setModeEditeur] = useState('ecrire')
  const [zoom, setZoom] = useState(lireZoom)
  const choisirZoom = (z) => (setZoom(z), noterZoom(z))
  // Le compteur du menu « … », calculé à son ouverture, comme le menu de Docs.
  const [compteur, setCompteur] = useState(null)
  const compterAuMenu = () => setCompteur(controle.current?.compter?.() ?? null)
  const piedMenu = compteur ? t('document.compteur', compteur) : undefined
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
  // Les tâches en attente (Sylvain, 12/11/2026) : suggestions et commentaires
  // ouverts, leur total toujours sur le bouton du volet droit.
  const [nombreFils, setNombreFils] = useState(0)
  const nombreSuggestions = suggestions?.nombre ?? 0
  const [suggestionActive, setSuggestionActive] = useState(null)
  // Une suggestion traitée décale les cartes : plus de carte active.
  const longueurListe = suggestions?.liste.length ?? 0
  useEffect(() => setSuggestionActive(null), [longueurListe])
  // L'onglet « Commentaires » : l'élément où l'éditeur place la liste des fils, et son filtre.
  const [cibleFils, setCibleFils] = useState(null)
  const [filtreFils, setFiltreFils] = useState('open')
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
  // Droits changés pendant que le document est ouvert : on les relit.
  useEffect(
    () =>
      session.surFermeture((raison) => {
        if (raison === 'droits') {
          montrerMessage(t('document.droitsChanges'))
          surDroitsChanges?.()
        } else if (raison === 'supprime') location.hash = ''
        else montrerMessage(t('document.connexionPerdue'), { erreur: true })
      }),
    [session, surDroitsChanges],
  )
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
  // Un nom introuvable (serveur injoignable) n'est pas retenu : « auteur
  // inconnu » s'affiche, et il n'est redemandé qu'après un délai ; l'état ne
  // change pas quand rien n'est trouvé, sinon l'effet reboucle (audit du 11/11/2026).
  const essaisNoms = useRef(new Map())
  useEffect(() => {
    const manquants = nomsAdemander(
      (suggestions?.liste ?? []).map((s) => s.auteur),
      noms,
      essaisNoms.current,
      Date.now(),
    )
    if (manquants.length)
      nomsAvecMargo(manquants).then((l) => {
        const trouves = l.filter((p) => p.username !== p.id)
        if (!trouves.length) return
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
  // navigateur comme chez Docs, depuis la fenêtre « Exporter ».
  const [fenetreExport, ouvrirExport] = useExport({ docId, controle, titre: titreAffiche })
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
  // Le zoom du texte, dans le menu « … » des trois formats : un choix parmi les paliers.
  const elementsZoom = [
    { cle: 'zoom', libelle: t('document.zoom'), titre: true, separe: true },
    ...REGLAGES.zoom.paliers.map((z) => ({
      cle: `zoom-${z}`,
      libelle: t('document.zoomPalier', { zoom: z }),
      coche: z === zoom,
      surClic: () => choisirZoom(z),
    })),
  ]
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
    { cle: 'exporter', libelle: t('document.exporter'), picto: 'exporter', surClic: ouvrirExport },
    {
      cle: 'dupliquer',
      libelle: t('document.dupliquer'),
      picto: 'dupliquer',
      surClic: () => voletDocs.dupliquer(docId),
    },
    ...elementsZoom,
    ...(caps.includes('supprimer')
      ? [{ cle: 'supprimer', libelle: t('document.supprimer'), picto: 'supprimer', separe: true, surClic: supprimer }]
      : []),
  ]
  // Le lecteur ne voit pas les suggestions : pas de volet droit pour lui.
  const avecVoletDroit = mode !== 'lire'
  // Contournement (veille) : l'afficheur dit qu'il reste des suggestions que la
  // liste ne montre pas (une suppression de paragraphe, après un rechargement) ;
  // « Tout accepter » et « Tout refuser » les traitent quand même.
  const invisibles = mode === 'relire' && !!suggestions?.enAttente && suggestions.liste.length === 0
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
          : invisibles
            ? { texte: t('suggestions.invisibles') }
            : null
      }
      actionsGlobales={invisibles}
      lignes={suggestions.liste.map((s) => ({
        cle: `${s.debut}-${s.type}`,
        texte: ligne(s),
        auteur: noms[s.auteur] ?? t('suggestions.auteurInconnu'),
        passage: {
          avant: s.type === 'ajout' ? '' : s.avant.trim(),
          apres: s.type === 'suppression' ? '' : s.apres.trim(),
        },
      }))}
      active={suggestionActive}
      surMontrer={(i) => {
        setSuggestionActive(i)
        suggestions.montrer(suggestions.liste[i])
      }}
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
  // Envoyer une image (comme Docs) : qui écrit ou suggère ; un refus se dit.
  const peutEnvoyer = caps.includes('ecrire') || caps.includes('suggerer')
  const televerser = useMemo(
    () =>
      peutEnvoyer
        ? (fichier) =>
            envoyerImage(docId, fichier).catch((e) => {
              montrerMessage(messageErreur(t, e.code || 'reseau'), { erreur: true })
              throw e
            })
        : undefined,
    [docId, peutEnvoyer],
  )
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
  const listeFils = commentaires ? (
    <ListeDesFils
      filtre={{
        libelle: t('commentaires.filtre'),
        valeur: filtreFils,
        options: [
          { valeur: 'open', libelle: t('commentaires.ouverts') },
          { valeur: 'resolved', libelle: t('commentaires.resolus') },
          { valeur: 'all', libelle: t('commentaires.tous') },
        ],
        surChange: setFiltreFils,
      }}
      cible={setCibleFils}
    />
  ) : null
  // Un essai de plus de l'éditeur après une panne en Suggérer ou Relire (repli en Modifier).
  const [essaiEditeur, setEssaiEditeur] = useState(0)
  const editeur = (
    <ZoneZoom zoom={zoom}>
      <FiletDeLEditeur
        key={essaiEditeur}
        repli={<TexteDeVolet texte={t('suivi.panne')} />}
        surErreur={() => {
          if (caps.includes('ecrire') && mode !== 'ecrire') {
            setModeEditeur('ecrire')
            setEssaiEditeur((n) => n + 1)
            montrerMessage(t('suivi.panneRepli'), { erreur: true })
          }
        }}
      >
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
          surNombreFils={commentaires ? setNombreFils : undefined}
          historique={historique && !formatS}
          peutRestaurer={caps.includes('restaurer')}
          surFermerHistorique={() => setHistorique(false)}
          fils={commentaires ? { element: cibleFils, filtre: filtreFils } : null}
          surRefus={(code) =>
            montrerMessage(
              { 'suggestion-a-cheval': t('suivi.aCheval'), 'suggestion-mise-en-forme': t('suivi.miseEnForme') }[code] ??
                messageErreur(t, code),
              {
                erreur: true,
              },
            )
          }
          confirmerRestauration={() =>
            confirmer({
              titre: t('document.restaurerTitre'),
              texte: t('document.restaurerTexte'),
              libelle: t('document.restaurer'),
            })
          }
          lectureAuDepart={formatS || tactile}
          controle={controle}
          surModification={setEnModification}
          surPlan={setPlan}
          corriger={corriger}
          surSelection={peutMargo ? setSelection : undefined}
          textes={TEXTES_EDITEUR}
          televerser={televerser}
        />
      </FiletDeLEditeur>
    </ZoneZoom>
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
          { cle: 'exporter', libelle: t('document.exporter'), icone: 'exporter', surClic: ouvrirExport },
          {
            cle: 'dupliquer',
            libelle: t('document.dupliquer'),
            icone: 'dupliquer',
            surClic: () => voletDocs.dupliquer(docId),
          },
          { cle: 'liste', libelle: t('document.mesDocuments'), icone: 'retour', surClic: () => (location.hash = '') },
          ...elementsZoom,
          ...(caps.includes('supprimer')
            ? [
                {
                  cle: 'supprimer',
                  libelle: t('document.supprimer'),
                  icone: 'supprimer',
                  separe: true,
                  surClic: supprimer,
                },
              ]
            : []),
        ]}
        piedMenu={piedMenu}
        surOuvrirMenu={compterAuMenu}
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
          suggestions || peutMargo || listeFils
            ? {
                titre: t('telephone.relecture'),
                nombre: nombreSuggestions + nombreFils,
                onglets: [
                  {
                    cle: 'modifications',
                    libelle: t('telephone.modifications'),
                    icone: 'modifications',
                    nombre: nombreSuggestions,
                    contenu: modifications,
                  },
                  ...(listeFils
                    ? [
                        {
                          cle: 'commentaires',
                          libelle: t('commentaires.titre'),
                          icone: 'commentaires',
                          nombre: nombreFils,
                          contenu: listeFils,
                        },
                      ]
                    : []),
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
            {fenetreExport}
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
          actions={{
            libelle: t('telephone.autresActions'),
            elements: actions,
            pied: piedMenu,
            surOuvrir: compterAuMenu,
          }}
          compte={compteDe(personne, config)}
          voletDroit={
            avecVoletDroit
              ? {
                  libelle: t('interface.voletDroit'),
                  nombre: nombreSuggestions + nombreFils,
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
            onglets={{
              modifications: t('telephone.modifications'),
              commentaires: t('commentaires.titre'),
              margo: t('interface.margo'),
            }}
            nombres={{ modifications: nombreSuggestions, commentaires: nombreFils }}
            modifications={modifications}
            commentaires={listeFils}
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
      {fenetreExport}
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
