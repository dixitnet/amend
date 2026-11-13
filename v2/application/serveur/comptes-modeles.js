// Les modèles de mise en page (étape 7, ADR 0011 ; 12/11/2026,
// docs/v2-modeles-pdf-plan.md) : le modèle du code (« A4 simple », par
// défaut), ceux de l'instance (les administrateurs les créent, les règlent,
// les suppriment et choisissent le défaut de l'instance), ceux d'une équipe
// (son gestionnaire), et ceux offerts à un document. Le serveur calcule le
// modèle complet (domaine) et l'envoie ; le client y joint les polices.
import {
  nomDossier,
  peutGererModeles,
  peutChoisirModele,
  modeleRetenu,
  resoudreModele,
  ecartsVers,
  famillesDePolices,
} from '../../domaine/index.js'
import { MODELES_LIVRE, REGLES_MODELES, REGLES_MODELES_INSTANCE, REPRISE_MODELES } from '../../design/livre.js'

/** Le modèle du code (design), par identifiant. */
const CODE = new Map(MODELES_LIVRE.map((m) => [m.id, m]))
const ID_CODE = MODELES_LIVRE[0].id
/** Le réglage de l'instance qui porte son modèle par défaut. */
const REGLAGE_DEFAUT = 'modeles.defaut'
/** Le réglage qui garde trace des modèles repris du code. */
const REGLAGE_REPRISE = 'modeles.reprise'
const REGLES = { instance: REGLES_MODELES_INSTANCE, equipe: REGLES_MODELES }

/** L'adresse d'un fichier de police de l'instance. */
export const adressePolice = (id) => `/api/polices/${id}`
/** Les familles fournies avec amend.ink (le client en a les fichiers). */
const FAMILLES_DU_CODE = new Set(REGLES_MODELES_INSTANCE.polices.map((p) => p.famille))

/** Un modèle complet tel que le client le reçoit : sans les fichiers d'une
 * police fournie avec amend.ink (le client les prend dans son catalogue) ;
 * avec les adresses des fichiers d'une police de l'instance, qu'il télécharge. */
function sansPolices(modele) {
  const reste = { ...modele }
  if (FAMILLES_DU_CODE.has(modele.police)) delete reste.polices
  return reste
}

/** @param {any} ctx  les aides et dépendances de `creerComptes` */
export function creerModeles(ctx) {
  const { comptes, lireCorps, json, ok, err, administrateur } = ctx

  /** Les modèles de l'instance, et la façon de résoudre n'importe quel modèle. */
  async function sources() {
    const instance = await comptes.modelesInstance()
    const parId = new Map(instance.map((m) => [m.id, m]))
    // Le catalogue des polices : celles du code, puis celles de l'instance (13/11/2026).
    const envoyees = famillesDePolices(await comptes.polices()).map((f) => ({
      famille: f.famille,
      fichiers: f.fichiers.map((x) => adressePolice(x.id)),
    }))
    const avecPolices = (r) => ({ ...r, polices: [...r.polices, ...envoyees] })
    const regles = { instance: avecPolices(REGLES.instance), equipe: avecPolices(REGLES.equipe) }
    const polices = regles.instance.polices.map((x) => x.famille)
    const s = { code: (id) => CODE.get(id) ?? null, instance: (id) => parId.get(id) ?? null, regles }
    /** Le modèle complet d'un modèle enregistré (`null` s'il ne se calcule plus). */
    const complet = (m) => {
      const r = resoudreModele(m, s)
      return r.ok ? sansPolices({ ...r.modele, id: m.id }) : null
    }
    return { instance, parId, s, complet, polices }
  }
  const versClient = (m, complet, extra = {}) => ({
    id: m.id,
    nom: m.nom,
    base: m.base,
    ecarts: m.ecarts,
    complet: complet(m),
    ...extra,
  })
  const modeleDuCode = () => ({ id: ID_CODE, code: true, complet: sansPolices(CODE.get(ID_CODE)) })
  const refusEcarts = (res, r) => (
    json(res, 400, { code: r.code, reglage: r.reglage ?? null, raison: r.raison ?? null }),
    true
  )

  /** Les modèles de mise en page d'une équipe : le gestionnaire les crée
   * (sur le modèle du code ou un modèle de l'instance), les règle, les
   * supprime et choisit le défaut. */
  async function modelesEquipe(req, res, p, equipe, moi, sous, cible) {
    const methode = req.method
    if (!peutGererModeles(moi.caps)) return err(res, 403, 'droit-insuffisant')
    const { parId, s } = await sources()
    const baseDispo = (id) => CODE.has(id) || parId.has(id)
    /** Un modèle de cette équipe, de l'instance ou du code. */
    const permis = async (id) => baseDispo(id) || (await comptes.modele(id))?.equipe === equipe.id
    if (sous === 'modele-defaut') {
      if (cible || methode !== 'PUT') return err(res, 405, 'methode-refusee')
      const { modele } = await lireCorps(req)
      if (modele !== null && (typeof modele !== 'string' || !(await permis(modele))))
        return err(res, 404, 'modele-introuvable')
      await comptes.definirModeleDefaut(equipe.id, modele)
      return ok(res)
    }
    if (!cible) {
      if (methode !== 'POST') return err(res, 405, 'methode-refusee')
      const corps = await lireCorps(req)
      const n = nomDossier(corps.nom)
      if (!n.ok) return err(res, 400, n.code)
      if (typeof corps.base !== 'string' || !baseDispo(corps.base)) return err(res, 400, 'modele-introuvable')
      return ok(res, { id: await comptes.creerModele(equipe.id, n.nom, corps.base, {}, p.id) }, 201)
    }
    const modele = await comptes.modele(cible)
    if (!modele || modele.equipe !== equipe.id) return err(res, 404, 'modele-introuvable')
    if (methode === 'DELETE') return ok(res, { documents: await comptes.supprimerModele(modele.id) })
    if (methode !== 'PUT') return err(res, 405, 'methode-refusee')
    const corps = await lireCorps(req)
    // Tout est vérifié avant de rien changer.
    const n = corps.nom === undefined ? null : nomDossier(corps.nom)
    if (n && !n.ok) return err(res, 400, n.code)
    let ecarts
    if (corps.ecarts !== undefined) {
      const r = resoudreModele({ base: modele.base, ecarts: corps.ecarts, equipe: equipe.id }, s)
      if (!r.ok) return refusEcarts(res, r)
      ecarts = r.ecarts
    }
    await comptes.modifierModele(modele.id, { nom: n?.nom, ecarts })
    return ok(res, ecarts === undefined ? {} : { ecarts })
  }

  /** Ce qu'une équipe voit de ses modèles (fenêtre de l'équipe) : les siens,
   * complets, et ceux de l'instance comme bases possibles. */
  async function vueModelesEquipe(equipe) {
    const { instance, complet, polices } = await sources()
    return {
      polices,
      modeles: (await comptes.modelesDe(equipe.id)).map((m) =>
        versClient({ ...m, equipe: equipe.id }, complet, { documents: m.documents }),
      ),
      modelesInstance: instance.map((m) => versClient(m, complet)),
      modeleCode: modeleDuCode(),
      modeleDefaut: equipe.modeleDefaut ?? null,
    }
  }

  /** Les modèles de l'instance (back-office, administrateurs) : la liste et
   * le défaut (GET), la création (POST, sur le modèle du code), le réglage
   * (PUT, tout le modèle), la suppression (DELETE), le défaut (PUT
   * `modele-defaut`). `segments` suit `/api/admin/`. */
  async function modelesInstance(req, res, p, segments) {
    if (!(await administrateur(p))) return err(res, 403, 'reserve-administrateur')
    const methode = req.method
    const [racine, cible, ...reste] = segments
    if (reste.length) return err(res, 404, 'introuvable')
    const { instance, parId, s, complet, polices } = await sources()
    if (racine === 'modele-defaut') {
      if (cible || methode !== 'PUT') return err(res, 405, 'methode-refusee')
      const { modele } = await lireCorps(req)
      if (modele !== null && (typeof modele !== 'string' || !(CODE.has(modele) || parId.has(modele))))
        return err(res, 404, 'modele-introuvable')
      await comptes.definirReglage(REGLAGE_DEFAUT, modele, p.id)
      console.log(`[admin] modèle par défaut de l'instance : ${modele ?? ID_CODE}`)
      return ok(res)
    }
    if (!cible) {
      if (methode === 'GET') {
        const defaut = await comptes.reglage(REGLAGE_DEFAUT)
        return ok(res, {
          polices,
          modeles: instance.map((m) =>
            versClient(m, complet, { documents: m.documents, equipes: m.equipes, derives: m.derives }),
          ),
          modeleCode: modeleDuCode(),
          defaut: typeof defaut === 'string' && (CODE.has(defaut) || parId.has(defaut)) ? defaut : null,
        })
      }
      if (methode !== 'POST') return err(res, 405, 'methode-refusee')
      const n = nomDossier((await lireCorps(req)).nom)
      if (!n.ok) return err(res, 400, n.code)
      return ok(res, { id: await comptes.creerModele(null, n.nom, ID_CODE, {}, p.id) }, 201)
    }
    const modele = parId.get(cible)
    if (!modele) return err(res, 404, 'modele-introuvable')
    if (methode === 'DELETE') {
      const documents = await comptes.supprimerModeleInstance(modele.id, ID_CODE)
      if ((await comptes.reglage(REGLAGE_DEFAUT)) === modele.id)
        await comptes.definirReglage(REGLAGE_DEFAUT, null, p.id)
      return ok(res, { documents })
    }
    if (methode !== 'PUT') return err(res, 405, 'methode-refusee')
    const corps = await lireCorps(req)
    const n = corps.nom === undefined ? null : nomDossier(corps.nom)
    if (n && !n.ok) return err(res, 400, n.code)
    let ecarts
    if (corps.ecarts !== undefined) {
      const r = resoudreModele({ base: modele.base, ecarts: corps.ecarts, equipe: null }, s)
      if (!r.ok) return refusEcarts(res, r)
      ecarts = r.ecarts
    }
    await comptes.modifierModele(modele.id, { nom: n?.nom, ecarts })
    return ok(res, ecarts === undefined ? {} : { ecarts })
  }

  /** Les modèles offerts au document et celui retenu (GET), ou le choix du
   * modèle (PUT) ; rend `undefined` pour une autre requête. `cx` : { docId, caps, sous, cible }. */
  async function modelesDocument(req, res, p, { docId, caps, sous, cible }) {
    const methode = req.method
    // Le modèle du code, ceux de l'instance et ceux de l'équipe du document ;
    // le modèle suit le document (un correcteur extérieur reçoit celui
    // retenu, pas la liste de l'équipe).
    if ((sous === 'modeles' && methode === 'GET') || (sous === 'modele' && methode === 'PUT')) {
      if (cible) return err(res, 404, 'introuvable')
      const doc = await comptes.document(docId)
      const equipe = doc.equipe ? await comptes.equipe(doc.equipe) : null
      const deLEquipe = equipe ? await comptes.modelesDe(equipe.id) : []
      const { instance, complet } = await sources()
      const permis = [ID_CODE, ...instance.map((m) => m.id), ...deLEquipe.map((m) => m.id)]
      if (sous === 'modele') {
        if (!peutChoisirModele(caps)) return err(res, 403, 'droit-insuffisant')
        const { modele } = await lireCorps(req)
        if (modele !== null && !permis.includes(modele)) return err(res, 404, 'modele-introuvable')
        await comptes.definirModeleDocument(docId, modele)
        return ok(res)
      }
      const defautInstance = await comptes.reglage(REGLAGE_DEFAUT)
      const retenu = modeleRetenu({
        choisi: doc.modele,
        defautEquipe: equipe?.modeleDefaut,
        defautInstance: typeof defautInstance === 'string' ? defautInstance : null,
        permis,
      })
      const membre = equipe ? Boolean(await comptes.roleMembre(equipe.id, p.id)) : false
      return ok(res, {
        modeles: [
          modeleDuCode(),
          ...instance.map((m) => versClient(m, complet, { instance: true })),
          ...deLEquipe
            .filter((m) => membre || m.id === retenu)
            .map((m) => versClient({ ...m, equipe: equipe.id }, complet)),
        ],
        equipe: equipe ? equipe.nom : null,
        choisi: doc.modele && permis.includes(doc.modele) ? doc.modele : null,
        retenu,
        peutChoisir: peutChoisirModele(caps),
      })
    }
  }

  /**
   * La reprise des modèles qui quittent le code (12/11/2026) : chacun est
   * recréé une fois en modèle de l'instance (base : le modèle du code), ce
   * qui le citait est repris, et le premier devient le défaut de l'instance
   * s'il n'y en a pas. L'ancien réglage « belle page » des équipes devient
   * le début de chapitre. Sans effet la seconde fois.
   */
  async function reprendre() {
    await comptes.reprendreBellePage()
    const faits = (await comptes.reglage(REGLAGE_REPRISE)) ?? {}
    for (const r of REPRISE_MODELES) {
      if (faits[r.id]) continue
      const ecarts = ecartsVers(CODE.get(ID_CODE), r.valeurs, REGLES_MODELES_INSTANCE.reglables)
      const v = resoudreModele({ base: ID_CODE, ecarts, equipe: null }, { code: (id) => CODE.get(id), regles: REGLES })
      if (!v.ok) {
        console.error(`[modèles] reprise de ${r.id} impossible :`, v.code, v.reglage ?? v.raison ?? '')
        continue
      }
      // Un modèle déjà créé par une reprise interrompue (avant d'être noté) est
      // repris tel quel, sans doublon (audit du 12/11/2026).
      const existant = (await comptes.modelesInstance()).find((m) => m.nom === r.nom && m.base === ID_CODE)
      const id = existant?.id ?? (await comptes.creerModele(null, r.nom, ID_CODE, v.ecarts, null))
      await comptes.reprendreModele(r.id, id)
      if (!(await comptes.reglage(REGLAGE_DEFAUT))) await comptes.definirReglage(REGLAGE_DEFAUT, id, null)
      faits[r.id] = id
      await comptes.definirReglage(REGLAGE_REPRISE, faits, null)
      console.log(`[modèles] « ${r.nom} » repris en modèle de l'instance (${id})`)
    }
  }

  return { modelesEquipe, vueModelesEquipe, modelesInstance, modelesDocument, reprendre }
}
