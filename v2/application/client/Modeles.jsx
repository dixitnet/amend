// Les modèles de mise en page (12/11/2026, docs/v2-modeles-pdf-plan.md) :
// ceux d'une équipe (son gestionnaire) et ceux de l'instance (back-office,
// administrateurs), dans un même composant. Le serveur envoie chaque modèle
// complet ; le formulaire en montre les réglages ouverts, par groupe.
import { useEffect, useState } from 'react'
import { PanneauModeles, PageReglageModele, PanneauPolices, EcranMessage, REGLES_MODELES } from '../../design/index.js'
import { messageErreur } from '../../i18n/index.js'
import { valeurDuReglage } from '../../domaine/index.js'
import { t, envoyerJson } from './commun.js'
import { envoyerPolice } from './commentaires.js'

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
  'chapitre.debut': () => t('modeles.reglage.chapitre.debut'),
  'chapitre.ligneTitre': () => t('modeles.reglage.chapitre.ligneTitre'),
  'chapitre.ligneTexte': () => t('modeles.reglage.chapitre.ligneTexte'),
  'chapitre.interligne': () => t('modeles.reglage.chapitre.interligne'),
  'folio.position': () => t('modeles.reglage.folio.position'),
  'folio.depart': () => t('modeles.reglage.folio.depart'),
  'folio.bas': () => t('modeles.reglage.folio.bas'),
  'folio.ouverture': () => t('modeles.reglage.folio.ouverture'),
  'enTete.gauche': () => t('modeles.reglage.enTete.gauche'),
  'enTete.droite': () => t('modeles.reglage.enTete.droite'),
  separateur: () => t('modeles.reglage.separateur'),
  cesure: () => t('modeles.reglage.cesure'),
}
// Les réglages d'un style (`styles.<style>.<propriété>`) : le même nom pour
// chaque style, le groupe du formulaire disant lequel.
const NOMS_PROPRIETES = {
  police: () => t('modeles.propriete.police'),
  corps: () => t('modeles.propriete.corps'),
  gras: () => t('modeles.propriete.gras'),
  italique: () => t('modeles.propriete.italique'),
  capitales: () => t('modeles.propriete.capitales'),
  alignement: () => t('modeles.propriete.alignement'),
  lignesAvant: () => t('modeles.propriete.lignesAvant'),
  lignesApres: () => t('modeles.propriete.lignesApres'),
  alinea: () => t('modeles.propriete.alinea'),
  retrait: () => t('modeles.propriete.retrait'),
}
/** Le nom d'un réglage, par sa clé. */
const nomDuReglage = (cle) =>
  cle.startsWith('styles.') ? NOMS_PROPRIETES[cle.split('.')[2]]?.() : NOMS_REGLAGES[cle]?.()
const NOMS_OPTIONS = {
  alignement: {
    gauche: () => t('modeles.options.alignement.gauche'),
    justifie: () => t('modeles.options.alignement.justifie'),
    centre: () => t('modeles.options.alignement.centre'),
  },
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
const optionsDe = (cle) =>
  NOMS_OPTIONS[cle.endsWith('.alignement') ? 'alignement' : cle.startsWith('enTete.') ? 'enTete' : cle.split('.')[0]] ??
  {}
const groupes = () => [
  { cle: 'format', libelle: t('modeles.groupes.format') },
  { cle: 'texte', libelle: t('modeles.groupes.texte') },
  { cle: 'citation', libelle: t('modeles.groupes.citation') },
  { cle: 'titre1', libelle: t('modeles.groupes.titre1') },
  { cle: 'titre2', libelle: t('modeles.groupes.titre2') },
  { cle: 'titre3', libelle: t('modeles.groupes.titre3') },
  { cle: 'titre4', libelle: t('modeles.groupes.titre4') },
  { cle: 'titre5', libelle: t('modeles.groupes.titre5') },
  { cle: 'titre', libelle: t('modeles.groupes.titre') },
  { cle: 'sousTitre', libelle: t('modeles.groupes.sousTitre') },
  { cle: 'legende', libelle: t('modeles.groupes.legende') },
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
const champsDu = (complet, regles, familles = null) => {
  // Le catalogue des polices : celui que le serveur envoie (polices de
  // l'instance comprises), sinon celui du code.
  const polices = (familles ?? regles.polices.map((p) => p.famille)).map((f) => ({ value: f, label: f }))
  return regles.reglables.map((r) => ({
    cle: r.cle,
    type: r.type,
    groupe: r.groupe,
    libelle: nomDuReglage(r.cle) ?? r.cle,
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
 * La liste, le défaut, la création, la duplication et la suppression de
 * modèles ; le réglage d'un modèle a sa propre page (`PageModele`).
 * @param {object} o
 * @param {string} o.chemin  la route des modèles (`…/modeles`)
 * @param {string} o.cheminDefaut  la route du défaut (`…/modele-defaut`)
 * @param {(id: string) => string} o.adresse  l'adresse de la page de réglage d'un modèle
 * @param {Array<any>} o.modeles  les modèles gérés ici (complets)
 * @param {Array<any>} o.bases  les modèles qu'on peut copier pour en créer un (code, instance, équipe)
 * @param {{ options: Array<any>, valeur: string | null, enregistre: (v: string) => string | null }} o.defaut
 * @param {Record<string, string[]>} [o.fichiersPolices]  les fichiers des polices de l'instance
 * @param {string | null} [o.intro]  le texte d'en-tête de la liste
 * @param {(m: any) => string} o.detail
 * @param {(m: any) => string} o.texteSuppression
 * @param {string} o.libelleDefaut
 * @param {string} o.aucun
 * @param {((m: any) => Promise<void>) | null} [o.essayer]  exporter le document ouvert avec ce modèle
 */
function GestionModeles({
  chemin,
  cheminDefaut,
  adresse,
  modeles,
  bases,
  defaut,
  fichiersPolices = {},
  intro = null,
  detail,
  texteSuppression,
  libelleDefaut,
  aucun,
  essayer = null,
  confirmer,
  surChangement,
}) {
  const [message, setMessage] = useState(null)
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
  return (
    <PanneauModeles
      libelles={{
        defaut: libelleDefaut,
        nom: t('modeles.nom'),
        base: t('modeles.base'),
        creer: t('modeles.creer'),
        nouveau: t('modeles.nouveau'),
        annuler: t('interface.annuler'),
        regler: t('modeles.modifier'),
        dupliquer: t('modeles.dupliquer'),
        supprimer: t('modeles.supprimer'),
        actions: t('modeles.actions'),
        aucun,
        colonnes: {
          nom: t('modeles.colonnes.nom'),
          format: t('modeles.colonnes.format'),
          police: t('modeles.colonnes.police'),
          documents: t('modeles.colonnes.documents'),
        },
        actionsDe: (nom) => t('modeles.actionsDe', { nom }),
        copieDe: (nom) => t('modeles.copieDe', { nom }),
        titres: { defaut: t('modeles.titreDefaut'), liste: t('modeles.titreListe') },
      }}
      intro={intro}
      defaut={{
        options: defaut.options,
        valeur: defaut.valeur,
        surChange: (choix) => essayerDe(() => envoyerJson('PUT', cheminDefaut, { modele: defaut.enregistre(choix) })),
      }}
      modeles={modeles.map((m) => ({
        cle: m.id,
        nom: m.nom,
        adresse: adresse(m.id),
        // Le format de la page et la police du texte, pour reconnaître un modèle d'un coup d'œil.
        format: m.complet
          ? t('modeles.format', { largeur: m.complet.page.largeur, hauteur: m.complet.page.hauteur })
          : null,
        police: m.complet?.styles?.texte?.police ?? null,
        detail: detail(m),
        parDefaut: m.id === defaut.valeur ? t('modeles.parDefaut') : null,
      }))}
      bases={bases.map((m) => ({ value: m.id, label: nomDuModele(m) }))}
      message={message}
      essayer={
        essayer
          ? {
              libelle: t('modeles.essayer'),
              surClic: (id) =>
                essayerDe(() =>
                  essayer(
                    modeles.find((m) => m.id === id),
                    fichiersPolices,
                  ),
                ),
            }
          : null
      }
      surCreer={(nom, depart) => essayerDe(() => envoyerJson('POST', chemin, { nom, depart }))}
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

/** Le chemin d'un modèle dans les adresses : `#/admin/modeles/id` ou `#/equipes/équipe/modeles/id`. */
const adresseModele = (equipe) => (id) =>
  `${equipe ? `#/equipes/${encodeURIComponent(equipe)}` : '#/admin'}/modeles/${encodeURIComponent(id)}`
// La fenêtre des modèles d'une équipe s'ouvre depuis la liste des documents ou
// depuis un document ; en revenant de la page de réglage d'un modèle, on la
// retrouve ouverte (13/11/2026). Par onglet, sans autre portée.
const CLE_ORIGINE = 'amend.modeles.origine'
const adresseEquipe = (equipe) => `#/equipes/${encodeURIComponent(equipe)}`
const lireOrigine = () => {
  try {
    return sessionStorage.getItem(CLE_ORIGINE)
  } catch {
    return null
  }
}
/** Retient l'équipe dont on ouvre la fenêtre des modèles. */
export const retenirOrigineModeles = (equipe) => {
  try {
    sessionStorage.setItem(CLE_ORIGINE, equipe)
  } catch {
    // Sans stockage de session, on revient à la page de l'équipe, fenêtre fermée.
  }
}
/** L'équipe dont la fenêtre des modèles est à rouvrir (retour de la page de réglage), sinon nul. */
export const equipeDesModelesOuverts = lireOrigine
/** La fenêtre des modèles est fermée : on ne la rouvrira plus au retour. */
export const oublierOrigineModeles = () => {
  try {
    sessionStorage.removeItem(CLE_ORIGINE)
  } catch {
    // rien à retirer
  }
}

/**
 * La page de réglage d'un modèle (13/11/2026) : `equipe` est l'identifiant de
 * l'équipe, ou nul pour un modèle de l'instance (administrateurs).
 */
export function PageModele({ equipe, modele }) {
  const [etat, setEtat] = useState({ phase: 'chargement' })
  const [message, setMessage] = useState(null)
  const chemin = equipe ? `/api/equipes/${encodeURIComponent(equipe)}/modeles` : '/api/admin/modeles'
  const retour = equipe ? adresseEquipe(equipe) : '#/admin/modeles'
  useEffect(() => {
    let vivant = true
    envoyerJson('GET', equipe ? `/api/equipes/${encodeURIComponent(equipe)}` : '/api/admin/modeles')
      .then((d) => vivant && setEtat({ phase: 'pret', donnees: d }))
      .catch((e) => vivant && setEtat({ phase: 'erreur', code: e.code || 'reseau' }))
    return () => {
      vivant = false
    }
  }, [equipe])
  if (etat.phase === 'chargement') return <EcranMessage texte={t('application.chargement')} />
  if (etat.phase === 'erreur') return <EcranMessage texte={messageErreur(t, etat.code)} />
  const m = (etat.donnees.modeles ?? []).find((x) => x.id === modele)
  if (!m?.complet) return <EcranMessage texte={messageErreur(t, 'modele-introuvable')} />
  return (
    <PageReglageModele
      key={m.id}
      libelles={{
        nom: t('modeles.nom'),
        general: t('modeles.groupes.general'),
        retour: t('modeles.retour'),
        enregistrer: t('modeles.enregistrer'),
        annuler: t('interface.annuler'),
      }}
      titre={t('modeles.reglerTitre', { nom: m.nom })}
      adresseRetour={retour}
      nom={m.nom}
      groupes={groupes()}
      champs={champsDu(m.complet, REGLES_MODELES, etat.donnees.polices ?? null)}
      message={message}
      surEnregistrer={async ({ nom, valeurs }) => {
        try {
          await envoyerJson('PUT', `${chemin}/${encodeURIComponent(m.id)}`, { nom, reglages: valeurs })
          location.hash = retour
        } catch (e) {
          setMessage(messageErreur(t, e.code || 'reseau'))
        }
      }}
      surAnnuler={() => (location.hash = retour)}
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
  return (
    <GestionModeles
      chemin={`${base}/modeles`}
      cheminDefaut={`${base}/modele-defaut`}
      adresse={adresseModele(vue.equipe.id)}
      modeles={modeles}
      bases={[...maison, ...modeles]}
      fichiersPolices={vue.fichiersPolices ?? {}}
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
      detail={(m) => t('modeles.detail', { n: m.documents ?? 0 })}
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
      adresse={adresseModele(null)}
      modeles={donnees.modeles}
      bases={[code, ...donnees.modeles]}
      fichiersPolices={donnees.fichiersPolices ?? {}}
      intro={t('admin.modelesPdf.intro', { code: nomDuModele(code) })}
      defaut={{
        options: groupesDeModeles(null, [code, ...donnees.modeles]),
        valeur: donnees.defaut ?? code.id,
        // Le modèle du code, choisi par défaut, s'enregistre comme « aucun choix ».
        enregistre: (v) => (v === code.id ? null : v),
      }}
      libelleDefaut={t('admin.modelesPdf.defaut')}
      aucun={t('admin.modelesPdf.aucun')}
      detail={(m) => t('admin.modelesPdf.detail', { n: m.documents ?? 0, e: m.equipes ?? 0 })}
      texteSuppression={(m) => t('admin.modelesPdf.confirmerSuppression', { nom: m.nom })}
      confirmer={confirmer}
      surChangement={surChangement}
    />
  )
}

/** Des octets en mégaoctets, à une décimale (le catalogue met le nombre en forme). */
/** Une liste de noms dans la langue de l'interface (« A, B et C »). */
const enListe = (noms) => new Intl.ListFormat(t.langue, { style: 'long', type: 'conjunction' }).format(noms)
const octetsEnMo = (n) => Math.round((n / (1024 * 1024)) * 10) / 10
const NOMS_STYLES = {
  romain: () => t('admin.polices.styles.romain'),
  italique: () => t('admin.polices.styles.italique'),
  gras: () => t('admin.polices.styles.gras'),
  'gras-italique': () => t('admin.polices.styles.grasItalique'),
}
const nomDuStyle = (s) => NOMS_STYLES[s]?.() ?? s

/** Les polices de l'instance (back-office, administrateurs, 13/11/2026) :
 * `donnees` est la réponse de `GET /api/admin/polices`. */
export function PolicesInstance({ donnees, confirmer, surChangement }) {
  const [message, setMessage] = useState(null)
  const [enCours, setEnCours] = useState(false)
  const erreur = (e) =>
    messageErreur(t, e.code || 'reseau', {
      famille: e.famille ?? '',
      modeles: enListe(e.modeles ?? []),
      max: octetsEnMo(donnees.max),
    })
  const envoyer = async (fichiers) => {
    if (!fichiers?.length) return
    setEnCours(true)
    const faits = []
    const refus = []
    for (const f of fichiers) {
      try {
        const r = await envoyerPolice(f)
        faits.push(t('admin.polices.envoye', { famille: r.famille, style: nomDuStyle(r.style) }))
      } catch (e) {
        refus.push(t('admin.polices.refuse', { fichier: f.name, raison: erreur(e) }))
      }
    }
    setEnCours(false)
    setMessage([...faits, ...refus].join(' '))
    surChangement()
  }
  const supprimer = async (id) => {
    const fichier = donnees.familles.flatMap((f) => f.fichiers).find((x) => x.id === id)
    // Supprimé entre-temps (autre onglet) : on recharge la liste.
    if (!fichier) return surChangement()
    if (
      !(await confirmer({
        titre: t('admin.polices.supprimer'),
        texte: t('admin.polices.confirmerSuppression', { fichier: fichier.fichier }),
        libelle: t('admin.polices.supprimer'),
        danger: true,
      }))
    )
      return
    try {
      await envoyerJson('DELETE', `/api/admin/polices/${encodeURIComponent(id)}`)
      setMessage(null)
    } catch (e) {
      setMessage(erreur(e))
    }
    surChangement()
  }
  return (
    <PanneauPolices
      libelles={{
        fournies: t('admin.polices.fournies'),
        envoyees: t('admin.polices.envoyees'),
        aucune: t('admin.polices.aucune'),
        envoyer: t('admin.polices.envoyer'),
        supprimer: t('admin.polices.supprimer'),
        supprimerDe: (fichier) => t('admin.polices.supprimerDe', { fichier }),
      }}
      intro={t('admin.polices.intro')}
      aide={t('admin.polices.aide', { max: octetsEnMo(donnees.max) })}
      fournies={donnees.fournies}
      familles={donnees.familles.map((f) => ({
        famille: f.famille,
        usage: f.modeles.length ? t('admin.polices.usage', { n: f.modeles.length, modeles: enListe(f.modeles) }) : null,
        avertissement: f.manquants.length
          ? t('admin.polices.manquants', { styles: enListe(f.manquants.map(nomDuStyle)) })
          : null,
        fichiers: f.fichiers.map((x) => ({
          cle: x.id,
          fichier: x.fichier,
          libelle: t('admin.polices.fichier', {
            style: nomDuStyle(x.style),
            fichier: x.fichier,
            taille: octetsEnMo(x.octets),
          }),
        })),
      }))}
      message={message}
      enCours={enCours}
      surFichiers={envoyer}
      surSupprimer={supprimer}
    />
  )
}
