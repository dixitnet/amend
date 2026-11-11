// Les modèles de mise en page (étape 7, ADR 0011) : ceux d'une équipe (le
// gestionnaire les crée, les règle, les supprime) et ceux offerts à un document.
// Découpé de `comptes.js` sans changement de logique ; `ctx` porte les aides
// construites par `creerComptes`.
import { nomDossier, peutGererModeles, peutChoisirModele, appliquerEcarts, modeleRetenu } from '../../domaine/index.js'
import { MODELES_LIVRE, REGLES_MODELES } from '../../design/livre.js'

/** Les modèles de mise en page d'amend.ink (design), par identifiant. */
const MAISON = new Map(MODELES_LIVRE.map((m) => [m.id, m]))
const IDS_MAISON = MODELES_LIVRE.map((m) => m.id)
/** Un modèle d'équipe tel que le client le reçoit (il calcule le modèle complet). */
const modeleVu = (m) => ({ id: m.id, nom: m.nom, base: m.base, ecarts: m.ecarts })

/** @param {any} ctx  les aides et dépendances de `creerComptes` */
export function creerModeles(ctx) {
  const { comptes, lireCorps, json, ok, err } = ctx

  /** Les modèles de mise en page d'une équipe (étape 7, ADR 0011) : le
   * gestionnaire les crée, les règle, les supprime et choisit le défaut. */
  async function modelesEquipe(req, res, p, equipe, moi, sous, cible) {
    const methode = req.method
    if (!peutGererModeles(moi.caps)) return err(res, 403, 'droit-insuffisant')
    /** Un modèle de cette équipe, ou un modèle d'amend.ink. */
    const permis = async (id) => MAISON.has(id) || (await comptes.modele(id))?.equipe === equipe.id
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
      if (!MAISON.has(corps.base)) return err(res, 400, 'modele-introuvable')
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
      const r = appliquerEcarts(MAISON.get(modele.base), corps.ecarts, REGLES_MODELES)
      if (!r.ok) return (json(res, 400, { code: r.code, reglage: r.reglage ?? null, raison: r.raison ?? null }), true)
      ecarts = r.ecarts
    }
    await comptes.modifierModele(modele.id, { nom: n?.nom, ecarts })
    return ok(res, ecarts === undefined ? {} : { ecarts })
  }

  /** Les modèles offerts au document et celui retenu (GET), ou le choix du
   * modèle (PUT) ; rend `undefined` pour une autre requête. `cx` : { docId, caps, sous, cible }. */
  async function modelesDocument(req, res, p, { docId, caps, sous, cible }) {
    const methode = req.method
    // Les modèles de mise en page du document (étape 7, ADR 0011) : ceux
    // d'amend.ink et ceux de son équipe ; le modèle suit le document (un
    // correcteur extérieur reçoit celui retenu, pas la liste de l'équipe).
    if ((sous === 'modeles' && methode === 'GET') || (sous === 'modele' && methode === 'PUT')) {
      if (cible) return err(res, 404, 'introuvable')
      const doc = await comptes.document(docId)
      const equipe = doc.equipe ? await comptes.equipe(doc.equipe) : null
      const deLEquipe = equipe ? await comptes.modelesDe(equipe.id) : []
      const permis = [...IDS_MAISON, ...deLEquipe.map((m) => m.id)]
      if (sous === 'modele') {
        if (!peutChoisirModele(caps)) return err(res, 403, 'droit-insuffisant')
        const { modele } = await lireCorps(req)
        if (modele !== null && !permis.includes(modele)) return err(res, 404, 'modele-introuvable')
        await comptes.definirModeleDocument(docId, modele)
        return ok(res)
      }
      const retenu = modeleRetenu({ choisi: doc.modele, defautEquipe: equipe?.modeleDefaut, permis })
      const membre = equipe ? Boolean(await comptes.roleMembre(equipe.id, p.id)) : false
      return ok(res, {
        modeles: [
          ...IDS_MAISON.map((id) => ({ id, maison: true })),
          ...deLEquipe.filter((m) => membre || m.id === retenu).map(modeleVu),
        ],
        equipe: equipe ? equipe.nom : null,
        choisi: doc.modele && permis.includes(doc.modele) ? doc.modele : null,
        retenu,
        peutChoisir: peutChoisirModele(caps),
      })
    }
  }

  return { modelesEquipe, modelesDocument }
}
