// Les modèles de mise en page (étape 7, ADR 0011 ; 12/11/2026,
// docs/v2-modeles-pdf-plan.md ; revus le 13/11/2026) : le modèle du code
// (« A4 simple », par défaut), ceux de l'instance (les administrateurs les
// créent, les règlent, les suppriment et choisissent le défaut de l'instance),
// ceux d'une équipe (son gestionnaire), et ceux offerts à un document. Un modèle
// est une copie complète : on le crée à partir d'un autre, puis il est
// indépendant. Le serveur le complète (domaine) et l'envoie ; le client y joint
// les fichiers de ses polices.
import {
  nomDossier,
  peutGererModeles,
  peutChoisirModele,
  modeleRetenu,
  appliquerReglages,
  verifierModele,
  completerModele,
  famillesDuModele,
  famillesDePolices,
  ancienModele,
  versModeleParStyle,
} from '../../domaine/index.js'
import { MODELES_LIVRE, REGLES_MODELES, REPRISE_MODELES } from '../../design/livre.js'

/** Le modèle du code (design), par identifiant. */
const CODE = new Map(MODELES_LIVRE.map((m) => [m.id, m]))
const ID_CODE = MODELES_LIVRE[0].id
/** Le réglage de l'instance qui porte son modèle par défaut. */
const REGLAGE_DEFAUT = 'modeles.defaut'
/** Le réglage qui garde trace des modèles repris du code. */
const REGLAGE_REPRISE = 'modeles.reprise'

/** L'adresse d'un fichier de police de l'instance. */
export const adressePolice = (id) => `/api/polices/${id}`

/** @param {any} ctx  les aides et dépendances de `creerComptes` */
export function creerModeles(ctx) {
  const { comptes, lireCorps, json, ok, err, administrateur } = ctx

  /** Les modèles de l'instance, le catalogue des polices (celles du code, puis
   * celles de l'instance) et la façon de compléter un modèle enregistré. */
  async function sources() {
    const instance = await comptes.modelesInstance()
    const parId = new Map(instance.map((m) => [m.id, m]))
    // Le catalogue des polices : celles du code, puis celles de l'instance (13/11/2026).
    const envoyees = famillesDePolices(await comptes.polices()).map((f) => ({
      famille: f.famille,
      fichiers: f.fichiers.map((x) => adressePolice(x.id)),
    }))
    const regles = { ...REGLES_MODELES, polices: [...REGLES_MODELES.polices, ...envoyees] }
    const polices = regles.polices.map((x) => x.famille)
    /** Les fichiers des familles envoyées par l'instance (le client a ceux du code). */
    const fichiersPolices = Object.fromEntries(envoyees.map((f) => [f.famille, f.fichiers]))
    /** Le modèle complet d'un modèle enregistré : ses valeurs, complétées par celles du code pour ce qui lui manque. */
    const complet = (m) => completerModele(m.valeurs ?? {}, CODE.get(ID_CODE))
    return { instance, parId, regles, complet, polices, fichiersPolices }
  }
  const versClient = (m, complet, extra = {}) => ({ id: m.id, nom: m.nom, complet: complet(m), ...extra })
  const modeleDuCode = () => ({ id: ID_CODE, code: true, complet: CODE.get(ID_CODE) })
  const refusReglages = (res, r) => (
    json(res, 400, { code: r.code, reglage: r.reglage ?? null, raison: r.raison ?? null }),
    true
  )

  /** Les noms des modèles (de l'instance et des équipes) dont une police est
   * cette famille : l'envoi et la suppression d'une police s'en servent. */
  async function modelesUtilisant(famille) {
    const { complet, instance } = await sources()
    const noms = []
    for (const m of [...instance, ...(await comptes.modelesDeToutesLesEquipes())])
      if (famillesDuModele(complet(m)).includes(famille)) noms.push(m.nom)
    return noms.sort((a, b) => a.localeCompare(b, 'fr'))
  }

  /** Le modèle complet dont on part : celui du code, de l'instance, ou de l'équipe. */
  async function modeleDeDepart(id, equipe, { parId, complet }) {
    if (typeof id !== 'string') return null
    if (CODE.has(id)) return CODE.get(id)
    if (parId.has(id)) return complet(parId.get(id))
    const m = equipe ? await comptes.modele(id) : null
    return m && m.equipe === equipe ? complet(m) : null
  }

  /** Les modèles de mise en page d'une équipe : le gestionnaire les crée (en
   * copiant un modèle du code, de l'instance ou de l'équipe), les règle, les
   * supprime et choisit le défaut. */
  async function modelesEquipe(req, res, p, equipe, moi, sous, cible) {
    const methode = req.method
    if (!peutGererModeles(moi.caps)) return err(res, 403, 'droit-insuffisant')
    const src = await sources()
    const { parId, regles, complet } = src
    /** Un modèle de cette équipe, de l'instance ou du code. */
    const permis = async (id) => CODE.has(id) || parId.has(id) || (await comptes.modele(id))?.equipe === equipe.id
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
      const depart = await modeleDeDepart(corps.depart, equipe.id, src)
      if (!depart) return err(res, 400, 'modele-introuvable')
      return ok(res, { id: await comptes.creerModele(equipe.id, n.nom, depart, p.id) }, 201)
    }
    const modele = await comptes.modele(cible)
    if (!modele || modele.equipe !== equipe.id) return err(res, 404, 'modele-introuvable')
    if (methode === 'DELETE') return ok(res, { documents: await comptes.supprimerModele(modele.id) })
    if (methode !== 'PUT') return err(res, 405, 'methode-refusee')
    const corps = await lireCorps(req)
    // Tout est vérifié avant de rien changer.
    const n = corps.nom === undefined ? null : nomDossier(corps.nom)
    if (n && !n.ok) return err(res, 400, n.code)
    let valeurs
    if (corps.reglages !== undefined) {
      const r = appliquerReglages(complet(modele), corps.reglages, regles)
      if (!r.ok) return refusReglages(res, r)
      valeurs = r.modele
    }
    await comptes.modifierModele(modele.id, { nom: n?.nom, valeurs })
    return ok(res)
  }

  /** Ce qu'une équipe voit de ses modèles (fenêtre de l'équipe) : les siens,
   * complets, et ceux de l'instance comme modèles de départ possibles. */
  async function vueModelesEquipe(equipe) {
    const { instance, complet, polices, fichiersPolices } = await sources()
    return {
      polices,
      fichiersPolices,
      modeles: (await comptes.modelesDe(equipe.id)).map((m) => versClient(m, complet, { documents: m.documents })),
      modelesInstance: instance.map((m) => versClient(m, complet)),
      modeleCode: modeleDuCode(),
      modeleDefaut: equipe.modeleDefaut ?? null,
    }
  }

  /** Les modèles de l'instance (back-office, administrateurs) : la liste et
   * le défaut (GET), la création (POST, en copiant un modèle), le réglage
   * (PUT), la suppression (DELETE), le défaut (PUT `modele-defaut`).
   * `segments` suit `/api/admin/`. */
  async function modelesInstance(req, res, p, segments) {
    if (!(await administrateur(p))) return err(res, 403, 'reserve-administrateur')
    const methode = req.method
    const [racine, cible, ...reste] = segments
    if (reste.length) return err(res, 404, 'introuvable')
    const src = await sources()
    const { instance, parId, regles, complet, polices, fichiersPolices } = src
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
          fichiersPolices,
          modeles: instance.map((m) => versClient(m, complet, { documents: m.documents, equipes: m.equipes })),
          modeleCode: modeleDuCode(),
          defaut: typeof defaut === 'string' && (CODE.has(defaut) || parId.has(defaut)) ? defaut : null,
        })
      }
      if (methode !== 'POST') return err(res, 405, 'methode-refusee')
      const corps = await lireCorps(req)
      const n = nomDossier(corps.nom)
      if (!n.ok) return err(res, 400, n.code)
      const depart = await modeleDeDepart(corps.depart, null, src)
      if (!depart) return err(res, 400, 'modele-introuvable')
      return ok(res, { id: await comptes.creerModele(null, n.nom, depart, p.id) }, 201)
    }
    const modele = parId.get(cible)
    if (!modele) return err(res, 404, 'modele-introuvable')
    if (methode === 'DELETE') {
      const documents = await comptes.supprimerModeleInstance(modele.id)
      if ((await comptes.reglage(REGLAGE_DEFAUT)) === modele.id)
        await comptes.definirReglage(REGLAGE_DEFAUT, null, p.id)
      return ok(res, { documents })
    }
    if (methode !== 'PUT') return err(res, 405, 'methode-refusee')
    const corps = await lireCorps(req)
    const n = corps.nom === undefined ? null : nomDossier(corps.nom)
    if (n && !n.ok) return err(res, 400, n.code)
    let valeurs
    if (corps.reglages !== undefined) {
      const r = appliquerReglages(complet(modele), corps.reglages, regles)
      if (!r.ok) return refusReglages(res, r)
      valeurs = r.modele
    }
    await comptes.modifierModele(modele.id, { nom: n?.nom, valeurs })
    return ok(res)
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
      const { instance, complet, polices, fichiersPolices } = await sources()
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
        polices,
        fichiersPolices,
        modeles: [
          modeleDuCode(),
          ...instance.map((m) => versClient(m, complet, { instance: true })),
          ...deLEquipe.filter((m) => membre || m.id === retenu).map((m) => versClient(m, complet)),
        ],
        equipe: equipe ? equipe.nom : null,
        choisi: doc.modele && permis.includes(doc.modele) ? doc.modele : null,
        retenu,
        peutChoisir: peutChoisirModele(caps),
      })
    }
  }

  /**
   * Les modèles enregistrés avant le 13/11/2026 (un modèle de base et des
   * écarts) deviennent des modèles complets, par style. Sans effet quand il
   * n'en reste aucun.
   */
  async function convertir() {
    const aConvertir = await comptes.modelesAConvertir()
    if (!aConvertir.length) return
    const anciens = new Map((await comptes.modelesDeLInstanceAncienne()).map((m) => [m.id, m]))
    for (const m of aConvertir) {
      const ancien = ancienModele(m, (id) => anciens.get(id) ?? null, ID_CODE)
      await comptes.poserValeurs(m.id, versModeleParStyle(ancien))
    }
    console.log(`[modèles] ${aConvertir.length} modèle(s) converti(s) en modèles complets par style`)
  }

  /**
   * La reprise des modèles qui quittent le code (12/11/2026) : chacun est
   * recréé une fois en modèle de l'instance, ce qui le citait est repris, et le
   * premier devient le défaut de l'instance s'il n'y en a pas. Les modèles
   * enregistrés à l'ancienne façon sont d'abord convertis. Sans effet la
   * seconde fois.
   */
  async function reprendre() {
    await convertir()
    const faits = (await comptes.reglage(REGLAGE_REPRISE)) ?? {}
    for (const r of REPRISE_MODELES) {
      if (faits[r.id]) continue
      const v = verifierModele(r.valeurs, REGLES_MODELES)
      if (!v.ok) {
        console.error(`[modèles] reprise de ${r.id} impossible :`, v.code, v.reglage ?? v.raison ?? '')
        continue
      }
      // Un modèle déjà créé par une reprise interrompue (avant d'être noté) est
      // repris tel quel, sans doublon (audit du 12/11/2026).
      const existant = (await comptes.modelesInstance()).find((m) => m.nom === r.nom)
      const id = existant?.id ?? (await comptes.creerModele(null, r.nom, r.valeurs, null))
      await comptes.reprendreModele(r.id, id)
      if (!(await comptes.reglage(REGLAGE_DEFAUT))) await comptes.definirReglage(REGLAGE_DEFAUT, id, null)
      faits[r.id] = id
      await comptes.definirReglage(REGLAGE_REPRISE, faits, null)
      console.log(`[modèles] « ${r.nom} » repris en modèle de l'instance (${id})`)
    }
  }

  return { modelesEquipe, vueModelesEquipe, modelesInstance, modelesDocument, reprendre, modelesUtilisant }
}
