// Le volet « Documents » : arbre, recherche, création et actions de chaque entrée.
import { useEffect, useRef, useState } from 'react'
import { Fenetre, FenetreChoix, VoletDocuments, montrerMessage } from '../../design/index.js'
import { messageErreur } from '../../i18n/index.js'
import { capacites, peutGererModeles, trierDocuments, dateDuJour } from '../../domaine/index.js'
import { t, envoyerJson } from './commun.js'
import { useSaisie, useConfirmation } from './fenetres.jsx'
import { Membres } from './Membres.jsx'
import { ModelesEquipe, equipeDesModelesOuverts, retenirOrigineModeles, oublierOrigineModeles } from './Modeles.jsx'
import { Partage } from './Partage.jsx'

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

/** Le volet « Documents » : mes dossiers et documents, puis ceux partagés avec moi. */
/** Le dernier document ouvert dans ce navigateur (une commodité, perdue sans
 * conséquence : on retombe sur le plus récent). */
const CLE_DERNIER = 'amend.dernierDocument'
export function lireDernier() {
  try {
    return localStorage.getItem(CLE_DERNIER)
  } catch {
    return null
  }
}
export function noterDernier(id) {
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
 * ses fenêtres, et les favoris (pour l'étoile du bandeau). `essayerModele(m)` :
 * exporter le document ouvert avec un modèle d'équipe (« Essayer », 12/11/2026).
 */
export function useVoletDocuments(docId, { actif = true, essayerModele = null } = {}) {
  const [donnees, setDonnees] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [equipes, setEquipes] = useState({})
  const [recherche, setRecherche] = useState('')
  const [corbeille, setCorbeille] = useState([])
  const [fenetreSaisie, demanderNom] = useSaisie()
  const [fenetreConfirmation, confirmer] = useConfirmation()
  const [choix, setChoix] = useState(null)
  const [membresDe, setMembresDe] = useState(null)
  // Revenir de la page de réglage d'un modèle rouvre la liste des modèles de l'équipe.
  const [modelesDe, setModelesDe] = useState(equipeDesModelesOuverts)
  // La fenêtre ouverte est retenue, pour la retrouver en revenant d'une page de réglage ; fermée, elle est oubliée.
  useEffect(() => (modelesDe ? retenirOrigineModeles(modelesDe) : oublierOrigineModeles()), [modelesDe])
  const [partageDe, setPartageDe] = useState(null)
  const recharger = async () => {
    try {
      const d = await envoyerJson('GET', '/api/documents')
      setErreur(null)
      const vues = await Promise.all(
        d.equipes.map((e) => envoyerJson('GET', `/api/equipes/${encodeURIComponent(e.id)}`).catch(() => null)),
      )
      setDonnees(d)
      setEquipes(Object.fromEntries(vues.filter(Boolean).map((v) => [v.equipe.id, v])))
      setCorbeille((await envoyerJson('GET', '/api/corbeille').catch(() => null))?.documents ?? [])
    } catch (e) {
      montrerMessage(messageErreur(t, e.code || 'reseau'), { erreur: true })
      setErreur(e.code || 'reseau')
    }
  }
  useEffect(() => {
    if (actif) recharger()
  }, [docId, actif])
  // Sans données et en erreur : un seul nouvel essai, après 5 s.
  const nouvelEssai = useRef(false)
  useEffect(() => {
    if (!erreur || donnees || nouvelEssai.current) return undefined
    const minuteur = setTimeout(() => {
      nouvelEssai.current = true
      recharger()
    }, 5000)
    return () => clearTimeout(minuteur)
  }, [erreur, donnees])
  const agir = (f) => async () => {
    try {
      await f()
    } catch (e) {
      montrerMessage(messageErreur(t, e.code || 'reseau'), { erreur: true })
    }
    recharger()
  }
  const titreDe = (d) => d.titre || t('documents.sansTitre')
  // L'arbre par titre ; la recherche par date de modification (Sylvain, 12/11/2026).
  const trier = (liste) => trierDocuments(liste, 'titre', t.langue)
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

  /** Dupliquer (comme Docs) : la copie s'ouvre. */
  const dupliquer = (id) =>
    agir(async () => {
      location.hash = (await envoyerJson('POST', `/api/documents/${encodeURIComponent(id)}/copie`)).id
    })()
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
  // « Nouvelle note » (Sylvain, 12/11/2026) : un document daté du jour
  // (AAAA-MM-JJ) dans le dossier « Notes » de Mes documents, créé s'il manque.
  const creerNote = agir(async () => {
    const nom = t('documents.dossierNotes')
    const existant = (donnees?.dossiers ?? []).find((d) => (d.parent ?? null) === null && d.nom === nom)
    const dossier = existant?.id ?? (await envoyerJson('POST', '/api/dossiers', { nom, parent: null, equipe: null })).id
    location.hash = (await envoyerJson('POST', '/api/documents', { equipe: null, dossier, titre: dateDuJour() })).id
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
      { cle: 'dupliquer', libelle: t('documents.dupliquer'), picto: 'dupliquer', surClic: () => dupliquer(d.id) },
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

  /** Les actions d'un document de la corbeille : le restaurer, l'effacer. */
  const actionsCorbeille = (d) => {
    const url = `/api/corbeille/${encodeURIComponent(d.id)}`
    return [
      {
        cle: 'restaurer',
        libelle: t('documents.restaurer'),
        picto: 'restaurer',
        surClic: agir(() => envoyerJson('POST', url)),
      },
      {
        cle: 'effacer',
        libelle: t('documents.effacer'),
        picto: 'supprimer',
        danger: true,
        surClic: agir(async () => {
          const ok = await confirmer({
            titre: t('documents.effacer'),
            texte: t('documents.confirmerEffacement', { titre: titreDe(d) }),
            libelle: t('documents.effacer'),
            danger: true,
          })
          if (ok) await envoyerJson('DELETE', url)
        }),
      },
    ]
  }

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
      ...trier(documents.filter((d) => (d.dossier ?? null) === parent)).map(entreeDoc),
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
            ...(peutGererModeles(capacites(v.equipe.role))
              ? [
                  {
                    cle: 'modeles',
                    libelle: t('documents.modeles'),
                    picto: 'exporter',
                    surClic: () => setModelesDe(id),
                  },
                ]
              : []),
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
    entrees = trierDocuments(
      tous.filter((d) => sansAccents(titreDe(d)).includes(q)),
      'modifies',
      t.langue,
    ).map(entreeDoc)
  } else if (donnees) {
    const favoris = trier(tous.filter((d) => d.favori))
    const mes = arbreEspace(
      null,
      donnees.documents.filter((d) => d.section === 'mes-documents'),
    )
    const partages = trier(donnees.documents.filter((d) => d.section === 'partage'))
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
      // La corbeille (comme Docs, \`trashbin\`) : ce que je peux restaurer, 30 jours.
      ...(corbeille.length
        ? [
            {
              cle: 'corbeille',
              nom: t('documents.corbeille'),
              picto: 'corbeille',
              enfants: corbeille.map((d) => ({
                cle: `corbeille-${d.id}`,
                nom: titreDe(d),
                picto: 'document',
                detail: t('documents.joursRestants', { n: d.joursRestants }),
                actions: actionsCorbeille(d),
              })),
            },
          ]
        : []),
    ]
  }

  const contenu = (
    <>
      <VoletDocuments
        recherche={{ libelle: t('documents.rechercher'), valeur: recherche, surChange: setRecherche }}
        nouveau={{
          libelle: t('documents.nouveauMenu'),
          // Dans cet ordre : document, note, dossier, équipe (Sylvain, 12/11/2026).
          elements: [
            {
              cle: 'nouveau',
              libelle: t('documents.nouveau'),
              picto: 'nouveau',
              surClic: () => creerDocument(lieuCourant),
            },
            { cle: 'note', libelle: t('documents.nouvelleNote'), picto: 'note', surClic: creerNote },
            {
              cle: 'dossier',
              libelle: t('documents.nouveauDossier'),
              picto: 'dossier',
              surClic: () => creerDossier(null),
            },
            { cle: 'equipe', libelle: t('documents.nouvelleEquipe'), picto: 'equipe', surClic: creerEquipe },
          ],
        }}
        entrees={entrees}
        vide={
          donnees
            ? recherche.trim()
              ? t('documents.rienTrouve')
              : t('documents.aucun')
            : erreur
              ? messageErreur(t, erreur)
              : t('application.chargement')
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
        ouverte={!!modelesDe && !!equipes[modelesDe]}
        titre={t('modeles.titre')}
        surFermer={() => setModelesDe(null)}
        libelleFermer={t('interface.fermer')}
      >
        {modelesDe && equipes[modelesDe] ? (
          <ModelesEquipe
            vue={equipes[modelesDe]}
            confirmer={confirmer}
            surChangement={recharger}
            essayer={essayerModele}
          />
        ) : null}
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
  return { contenu, donnees, erreur, tous, estFavori, basculerFavori, recharger, dupliquer }
}
