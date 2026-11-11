// Adaptateur BlockNote (couche 2) : le magasin des fils de commentaires, sur
// le modèle de Docs (`DocsThreadStore`, dérivé de `ThreadStore`) : les fils
// vivent sur notre serveur, BlockNote les affiche. Le service (les appels à
// nos routes) est fourni par l'application ; qui peut faire quoi vient du
// domaine, et le serveur le vérifie de nouveau.
//
// L'ancre d'un fil (la marque `comment` dans le texte) : qui peut écrire la
// pose dans son navigateur, comme dans Docs ; pour le correcteur, qui ne le
// peut pas, on envoie au serveur le passage en coordonnées du texte principal
// (bloc, décalage sans les insertions suggérées, passage cité), et il la pose.
import { ThreadStore, ThreadStoreAuth } from '@blocknote/core/comments'
import { peutCommenter } from '../../domaine/index.js'

const SUGGERE = 'y-attributed-insert'

/** Un point de la sélection, en coordonnées du texte principal. */
function point($p) {
  let d = $p.depth
  while (d > 0 && $p.node(d - 1).type.name !== 'blockContainer') d--
  if (d === 0) return null
  const contenu = $p.node(d)
  const jusqua = $p.pos - $p.start(d)
  let decalage = 0
  contenu.forEach((enfant, debut) => {
    if (debut >= jusqua || enfant.marks.some((m) => m.type.name === SUGGERE)) return
    decalage += enfant.isText ? Math.min(enfant.nodeSize, jusqua - debut) : 1
  })
  return { blocId: $p.node(d - 1).attrs.id, decalage }
}

/** La sélection de l'éditeur, en ancre pour le serveur ; `null` si impossible. */
function ancreDeLaSelection(editeur) {
  return editeur.transact((tr) => {
    const { $from, $to, from, to } = tr.selection
    const debut = point($from)
    const fin = point($to)
    if (!debut || !fin) return null
    let citation = ''
    tr.doc.nodesBetween(from, to, (n, pos) => {
      if (n.isText && !n.marks.some((m) => m.type.name === SUGGERE))
        citation += n.text.slice(Math.max(0, from - pos), to - pos)
      else if (n.type.name === 'blockContainer' && citation) citation += '\n'
    })
    return { debut, fin, citation }
  })
}

/** Les droits sur les fils, dits par le domaine. */
class AutorisationsFils extends ThreadStoreAuth {
  constructor(caps, idPersonne) {
    super()
    this.peut = (action, objet) => peutCommenter(caps, idPersonne, action, objet)
  }
  canCreateThread = () => this.peut('creer')
  canAddComment = () => this.peut('repondre')
  canUpdateComment = (c) => this.peut('modifier', { auteur: c.userId })
  canDeleteComment = (c) => this.peut('supprimer', { auteur: c.userId })
  // L'auteur du fil, enregistré à sa création (Sylvain, 10/11/2026, Q4).
  canDeleteThread = (f) => this.peut('supprimer', { auteur: f.auteur })
  canResolveThread = (f) => this.peut('resoudre', { auteur: f.auteur })
  canUnresolveThread = (f) => this.peut('resoudre', { auteur: f.auteur })
  canAddReaction = () => this.peut('reagir')
  canDeleteReaction = () => this.peut('reagir')
}

// Sans `resolvedBy` : BlockNote 0.57 lève une erreur en affichant un fil résolu
// tant que le nom de qui l'a résolu n'est pas chargé (`Thread`, « …but their data
// could not be found »), au lieu d'attendre. Contournement (veille) : la ligne
// « résolu par » ne s'affiche pas ; à retirer quand BlockNote attendra le nom.
const enDates = ({ resolvedBy, ...f }) => ({
  ...f,
  createdAt: new Date(f.createdAt),
  updatedAt: new Date(f.updatedAt),
  resolvedUpdatedAt: f.resolvedUpdatedAt ? new Date(f.resolvedUpdatedAt) : undefined,
  comments: f.comments.map((c) => ({
    ...c,
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
    reactions: c.reactions.map((r) => ({ ...r, createdAt: new Date(r.createdAt) })),
  })),
})

/**
 * @param {object} service  les appels à nos routes (application) : `lister()`,
 *   `creer(corps, metadonnees)`, `repondre(fil, corps)`, `modifier(fil, c, corps)`,
 *   `supprimer(fil, c)`, `supprimerFil(fil)`, `resoudre(fil)`, `rouvrir(fil)`,
 *   `reagir(fil, c, emoji)`, `retirerReaction(fil, c, emoji)`, `ancrer(fil, ancre)`,
 *   `abonner(rappel) → arrêter`, et `surEchecAncre(code)`, facultatif : un fil
 *   n'a pas pu être rattaché au texte
 * @param {readonly string[]} caps  les capacités de la personne
 * @param {string} idPersonne
 * @param {boolean} ancreParLeServeur  vrai pour qui ne peut pas écrire le texte (correcteur)
 */
export class MagasinFils extends ThreadStore {
  constructor(service, caps, idPersonne, ancreParLeServeur) {
    super(new AutorisationsFils(caps, idPersonne))
    this.service = service
    this.fils = new Map()
    this.rappels = new Set()
    this.arreter = null
    if (ancreParLeServeur)
      // Un fil qu'on n'a pas pu ancrer (sélection hors d'un bloc, passage
      // changé entre-temps) est retiré : pas de fil rattaché à rien.
      this.addThreadToDocument = async ({ threadId, editor }) => {
        try {
          const ancre = ancreDeLaSelection(editor)
          if (!ancre) throw Object.assign(new Error('ancre impossible'), { code: 'ancre-invalide' })
          await service.ancrer(threadId, ancre)
        } catch (err) {
          await this.apres(service.supprimerFil(threadId)).catch(() => {})
          // L'application dit pourquoi (un code, jamais une phrase ici).
          service.surEchecAncre?.(err.code || 'reseau')
          throw err
        }
      }
  }
  async recharger() {
    const fils = await this.service.lister()
    this.fils = new Map(fils.map((f) => [f.id, enDates(f)]))
    for (const r of this.rappels) r(this.fils)
  }
  async apres(promesse) {
    const r = await promesse
    await this.recharger()
    return r
  }
  getThread(id) {
    const f = this.fils.get(id)
    if (!f) throw new Error('fil introuvable')
    return f
  }
  getThreads() {
    return this.fils
  }
  subscribe(rappel) {
    this.rappels.add(rappel)
    if (!this.arreter) {
      this.arreter = this.service.abonner(() => this.recharger().catch(() => {}))
      this.recharger().catch(() => {})
    }
    return () => {
      this.rappels.delete(rappel)
      if (!this.rappels.size) {
        this.arreter?.()
        this.arreter = null
      }
    }
  }
  createThread = async ({ initialComment, metadata }) =>
    enDates(await this.apres(this.service.creer(initialComment.body, metadata ?? null)))
  addComment = async ({ comment, threadId }) => {
    const { id } = await this.apres(this.service.repondre(threadId, comment.body))
    return this.getThread(threadId).comments.find((c) => c.id === id)
  }
  updateComment = ({ comment, threadId, commentId }) =>
    this.apres(this.service.modifier(threadId, commentId, comment.body)).then(() => {})
  deleteComment = ({ threadId, commentId }) => this.apres(this.service.supprimer(threadId, commentId)).then(() => {})
  deleteThread = ({ threadId }) => this.apres(this.service.supprimerFil(threadId)).then(() => {})
  resolveThread = ({ threadId }) => this.apres(this.service.resoudre(threadId)).then(() => {})
  unresolveThread = ({ threadId }) => this.apres(this.service.rouvrir(threadId)).then(() => {})
  addReaction = ({ threadId, commentId, emoji }) =>
    this.apres(this.service.reagir(threadId, commentId, emoji)).then(() => {})
  deleteReaction = ({ threadId, commentId, emoji }) =>
    this.apres(this.service.retirerReaction(threadId, commentId, emoji)).then(() => {})
}
