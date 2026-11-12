// Les modèles de mise en page (12/11/2026, docs/v2-modeles-pdf-plan.md) :
// ceux d'une équipe (son gestionnaire) et ceux de l'instance (back-office,
// administrateurs), dans un même composant. Le serveur envoie chaque modèle
// complet ; le formulaire en montre les réglages ouverts, par groupe.
import { useState } from 'react'
import { PanneauModeles, FormulaireModele, REGLES_MODELES, REGLES_MODELES_INSTANCE } from '../../design/index.js'
import { messageErreur } from '../../i18n/index.js'
import { valeurDuReglage } from '../../domaine/index.js'
import { t, envoyerJson } from './commun.js'

/** Les noms des modèles du code, des réglages et de leurs options (catalogue
 * des textes) ; un modèle ou un réglage ajouté au design s'ajoute ici. */
const NOMS_CODE = { a4: () => t('modeles.maison.a4') }
const NOMS_REGLAGES = {
  'page.largeur': () => t('modeles.reglage.page.largeur'),
  'page.hauteur': () => t('modeles.reglage.page.hauteur'),
  'marges.haut': () => t('modeles.reglage.marges.haut'),
  'marges.interieure': () => t('modeles.reglage.marges.interieure'),
  'marges.exterieure': () => t('modeles.reglage.marges.exterieure'),
  'grille.corps': () => t('modeles.reglage.grille.corps'),
  'grille.interligne': () => t('modeles.reglage.grille.interligne'),
  'grille.lignes': () => t('modeles.reglage.grille.lignes'),
  police: () => t('modeles.reglage.police'),
  alinea: () => t('modeles.reglage.alinea'),
  'chapitre.debut': () => t('modeles.reglage.chapitre.debut'),
  'chapitre.ligneTitre': () => t('modeles.reglage.chapitre.ligneTitre'),
  'chapitre.ligneTexte': () => t('modeles.reglage.chapitre.ligneTexte'),
  'chapitre.corps': () => t('modeles.reglage.chapitre.corps'),
  'chapitre.interligne': () => t('modeles.reglage.chapitre.interligne'),
  'chapitre.graisse': () => t('modeles.reglage.chapitre.graisse'),
  'titre.corps': () => t('modeles.reglage.titre.corps'),
  'titre.graisse': () => t('modeles.reglage.titre.graisse'),
  'sousTitre.corps': () => t('modeles.reglage.sousTitre.corps'),
  'sousTitre.italique': () => t('modeles.reglage.sousTitre.italique'),
  'folio.position': () => t('modeles.reglage.folio.position'),
  'folio.depart': () => t('modeles.reglage.folio.depart'),
  'folio.bas': () => t('modeles.reglage.folio.bas'),
  'folio.ouverture': () => t('modeles.reglage.folio.ouverture'),
  'enTete.gauche': () => t('modeles.reglage.enTete.gauche'),
  'enTete.droite': () => t('modeles.reglage.enTete.droite'),
  'intertitres.italique': () => t('modeles.reglage.intertitres.italique'),
  'intertitres.lignesAvant': () => t('modeles.reglage.intertitres.lignesAvant'),
  'intertitres.lignesApres': () => t('modeles.reglage.intertitres.lignesApres'),
  'citation.retrait': () => t('modeles.reglage.citation.retrait'),
  separateur: () => t('modeles.reglage.separateur'),
  cesure: () => t('modeles.reglage.cesure'),
}
const NOMS_OPTIONS = {
  separateur: {
    blanc: () => t('modeles.options.separateur.blanc'),
    asterisme: () => t('modeles.options.separateur.asterisme'),
    etoiles: () => t('modeles.options.separateur.etoiles'),
    trait: () => t('modeles.options.separateur.trait'),
  },
  chapitre: {
    continuer: () => t('modeles.options.chapitre.continuer'),
    page: () => t('modeles.options.chapitre.page'),
    'belle-page': () => t('modeles.options.chapitre.belle-page'),
  },
  folio: {
    'bas-centre': () => t('modeles.options.folio.bas-centre'),
    'bas-exterieur': () => t('modeles.options.folio.bas-exterieur'),
    'haut-exterieur': () => t('modeles.options.folio.haut-exterieur'),
    aucun: () => t('modeles.options.folio.aucun'),
  },
  enTete: {
    rien: () => t('modeles.options.enTete.rien'),
    titreDocument: () => t('modeles.options.enTete.titreDocument'),
    chapitre: () => t('modeles.options.enTete.chapitre'),
  },
}
/** Les options d'un réglage à choix, par sa clé. */
const optionsDe = (cle) => NOMS_OPTIONS[cle.startsWith('enTete.') ? 'enTete' : cle.split('.')[0]] ?? {}
const groupes = () => [
  { cle: 'format', libelle: t('modeles.groupes.format') },
  { cle: 'texte', libelle: t('modeles.groupes.texte') },
  { cle: 'titres', libelle: t('modeles.groupes.titres') },
  { cle: 'pages', libelle: t('modeles.groupes.pages') },
]

/** Le nom d'un modèle : celui du catalogue pour le modèle du code, le sien sinon. */
export const nomDuModele = (m) => (m.code ? (NOMS_CODE[m.id]?.() ?? m.id) : m.nom)
/** Les modèles d'amend.ink (le modèle du code et ceux de l'instance), puis ceux d'une équipe, en groupes d'un Select. */
export const groupesDeModeles = (equipe, maison, deLEquipe = []) => [
  { group: t('export.groupeMaison'), items: maison.map((m) => ({ value: m.id, label: nomDuModele(m) })) },
  ...(equipe && deLEquipe.length
    ? [{ group: t('export.groupeEquipe', { equipe }), items: deLEquipe.map((m) => ({ value: m.id, label: m.nom })) }]
    : []),
]
/** Les champs du formulaire d'un modèle complet, pour une liste de réglages. */
const champsDu = (complet, regles) => {
  const polices = regles.polices.map((p) => ({ value: p.famille, label: p.famille }))
  return regles.reglables.map((r) => ({
    cle: r.cle,
    type: r.type,
    groupe: r.groupe,
    libelle: NOMS_REGLAGES[r.cle]?.() ?? r.cle,
    valeur: valeurDuReglage(complet, r.cle),
    min: r.min,
    max: r.max,
    pas: r.pas,
    options:
      r.type === 'police'
        ? polices
        : r.type === 'choix'
          ? r.options.map((v) => ({ value: v, label: optionsDe(r.cle)[v]?.() ?? v }))
          : undefined,
  }))
}

/**
 * La liste, le défaut, la création, le réglage et la suppression de modèles.
 * @param {object} o
 * @param {string} o.chemin  la route des modèles (`…/modeles`)
 * @param {string} o.cheminDefaut  la route du défaut (`…/modele-defaut`)
 * @param {Array<any>} o.modeles  les modèles gérés ici (complets)
 * @param {Array<any>} o.bases  les modèles dont on peut partir (code, instance)
 * @param {{ options: Array<any>, valeur: string | null, enregistre: (v: string) => string | null }} o.defaut
 * @param {object} o.regles  les réglages ouverts (équipe ou instance)
 * @param {(m: any) => string} o.detail
 * @param {(m: any) => string} o.texteSuppression
 * @param {string} o.libelleDefaut
 * @param {string} o.aucun
 * @param {((m: any) => Promise<void>) | null} [o.essayer]  exporter le document ouvert avec ce modèle
 */
function GestionModeles({
  chemin,
  cheminDefaut,
  modeles,
  bases,
  defaut,
  regles,
  detail,
  texteSuppression,
  libelleDefaut,
  aucun,
  essayer = null,
  confirmer,
  surChangement,
}) {
  const [message, setMessage] = useState(null)
  const [enReglage, setEnReglage] = useState(null)
  const essayerDe = async (f, succes = null) => {
    try {
      await f()
      setMessage(succes)
      return true
    } catch (e) {
      setMessage(messageErreur(t, e.code || 'reseau'))
      return false
    } finally {
      surChangement()
    }
  }
  const regle = modeles.find((m) => m.id === enReglage)
  if (regle?.complet) {
    return (
      <FormulaireModele
        key={regle.id}
        libelles={{ nom: t('modeles.nom'), enregistrer: t('modeles.enregistrer'), annuler: t('interface.annuler') }}
        nom={regle.nom}
        groupes={groupes()}
        champs={champsDu(regle.complet, regles)}
        message={message}
        surEnregistrer={async ({ nom, valeurs }) => {
          if (
            await essayerDe(
              () => envoyerJson('PUT', `${chemin}/${encodeURIComponent(regle.id)}`, { nom, ecarts: valeurs }),
              t('modeles.enregistre'),
            )
          )
            setEnReglage(null)
        }}
        surAnnuler={() => (setEnReglage(null), setMessage(null))}
      />
    )
  }
  return (
    <PanneauModeles
      libelles={{
        defaut: libelleDefaut,
        nom: t('modeles.nom'),
        base: t('modeles.base'),
        creer: t('modeles.creer'),
        modifier: t('modeles.modifier'),
        supprimer: t('modeles.supprimer'),
        aucun,
        modifierDe: (nom) => t('modeles.modifierDe', { nom }),
        supprimerDe: (nom) => t('modeles.supprimerDe', { nom }),
      }}
      defaut={{
        options: defaut.options,
        valeur: defaut.valeur,
        surChange: (choix) => essayerDe(() => envoyerJson('PUT', cheminDefaut, { modele: defaut.enregistre(choix) })),
      }}
      modeles={modeles.map((m) => ({
        cle: m.id,
        nom: m.nom,
        detail: detail(m),
        parDefaut: m.id === defaut.valeur ? t('modeles.parDefaut') : null,
      }))}
      bases={bases.map((m) => ({ value: m.id, label: nomDuModele(m) }))}
      message={message}
      essayer={
        essayer
          ? {
              libelle: t('modeles.essayer'),
              libelleDe: (nom) => t('modeles.essayerDe', { nom }),
              surClic: (id) => essayerDe(() => essayer(modeles.find((m) => m.id === id))),
            }
          : null
      }
      surCreer={(nom, depart) => essayerDe(() => envoyerJson('POST', chemin, { nom, base: depart }))}
      // Un modèle qui ne se calcule plus (base disparue) ne se règle pas : on le dit.
      surModifier={(id) =>
        modeles.find((m) => m.id === id)?.complet
          ? (setEnReglage(id), setMessage(null))
          : setMessage(messageErreur(t, 'modele-introuvable'))
      }
      surSupprimer={async (id) => {
        const m = modeles.find((x) => x.id === id)
        if (
          await confirmer({
            titre: t('modeles.supprimer'),
            texte: texteSuppression(m),
            libelle: t('modeles.supprimer'),
            danger: true,
          })
        )
          essayerDe(() => envoyerJson('DELETE', `${chemin}/${encodeURIComponent(id)}`))
      }}
    />
  )
}

/** La valeur « celui de l'instance » du défaut d'une équipe (enregistrée nulle). */
const DEFAUT_INSTANCE = 'instance'

/** Les modèles de mise en page d'une équipe (ADR 0011), pour son gestionnaire. */
export function ModelesEquipe({ vue, confirmer, surChangement, essayer = null }) {
  const base = `/api/equipes/${encodeURIComponent(vue.equipe.id)}`
  const maison = [vue.modeleCode, ...(vue.modelesInstance ?? [])].filter(Boolean)
  const modeles = vue.modeles ?? []
  const nomDeLaBase = (id) => nomDuModele(maison.find((m) => m.id === id) ?? { id, code: true })
  return (
    <GestionModeles
      chemin={`${base}/modeles`}
      cheminDefaut={`${base}/modele-defaut`}
      modeles={modeles}
      bases={maison}
      regles={REGLES_MODELES}
      defaut={{
        options: [
          {
            group: t('modeles.defautInstance'),
            items: [{ value: DEFAUT_INSTANCE, label: t('modeles.defautInstance') }],
          },
          ...groupesDeModeles(vue.equipe.nom, maison, modeles),
        ],
        valeur: vue.modeleDefaut ?? DEFAUT_INSTANCE,
        enregistre: (v) => (v === DEFAUT_INSTANCE ? null : v),
      }}
      libelleDefaut={t('modeles.defaut')}
      aucun={t('modeles.aucun')}
      detail={(m) => t('modeles.detail', { titre: nomDeLaBase(m.base), n: m.documents ?? 0 })}
      texteSuppression={(m) => t('modeles.confirmerSuppression', { nom: m.nom, n: m.documents ?? 0 })}
      essayer={essayer}
      confirmer={confirmer}
      surChangement={surChangement}
    />
  )
}

/** Les modèles de l'instance (back-office, administrateurs) : `donnees` est
 * la réponse de `GET /api/admin/modeles`. */
export function ModelesInstance({ donnees, confirmer, surChangement }) {
  const code = donnees.modeleCode
  return (
    <GestionModeles
      chemin="/api/admin/modeles"
      cheminDefaut="/api/admin/modele-defaut"
      modeles={donnees.modeles}
      bases={[code]}
      regles={REGLES_MODELES_INSTANCE}
      defaut={{
        options: groupesDeModeles(null, [code, ...donnees.modeles]),
        valeur: donnees.defaut ?? code.id,
        // Le modèle du code, choisi par défaut, s'enregistre comme « aucun choix ».
        enregistre: (v) => (v === code.id ? null : v),
      }}
      libelleDefaut={t('admin.modelesPdf.defaut')}
      aucun={t('admin.modelesPdf.aucun')}
      detail={(m) =>
        t('admin.modelesPdf.detail', {
          titre: nomDuModele(code),
          n: m.documents ?? 0,
          e: m.equipes ?? 0,
          d: m.derives ?? 0,
        })
      }
      texteSuppression={(m) => t('admin.modelesPdf.confirmerSuppression', { nom: m.nom, code: nomDuModele(code) })}
      confirmer={confirmer}
      surChangement={surChangement}
    />
  )
}
