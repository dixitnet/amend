// Adaptateur BlockNote (couche 2) : les suggestions, avec le montage de
// BlockNote (`suggestionDoc`, un `DiffRenderer` de Yjs entre le texte et les
// suggestions, créé une fois et jamais reconstruit : exemple de BlockNote
// `07-collaboration/12-multi-doc-versioning`). Deux ajouts à nous, parce que
// ni BlockNote ni Docs ne les fournissent :
//  - les auteurs : y/hub les enregistre mais ne les envoie pas en direct ; on
//    les redemande après chaque changement et on les lit à côté, pour le seul
//    panneau. L'afficheur, lui, n'en reçoit pas : reconstruit avec eux, il
//    faisait sortir du panneau les suggestions d'un éditeur dès qu'il tapait en
//    direct (diagnostic du 10/11/2026, docs/v2-tests/tableau-problemes-2026-11-10.md) ;
//  - la liste des suggestions, pour le panneau où l'éditeur accepte ou refuse
//    (disposition C, choix de Sylvain) ; un remplacement y fait une ligne.
import * as Y from '@y/y'
import { resolvedPositionToRelativePosition } from '@y/prosemirror'

const INSERTION = 'y-attributed-insert'
const SUPPRESSION = 'y-attributed-delete'

/** L'afficheur des suggestions : le texte, plus les propositions attribuées. */
export function creerAfficheur(contexte, suggerer) {
  const r = Y.createDiffRenderer(contexte.doc, contexte.suggestions.doc)
  r.suggestionMode = suggerer
  return r
}

/**
 * Tient à jour les auteurs des suggestions (la table de y/hub) : une demande
 * au départ, puis après chaque changement des suggestions. `rappel(auteurs)`
 * à chaque table reçue. Rend la fonction qui arrête.
 */
// La première demande part tout de suite (les noms au plus tôt) ; ensuite, le
// délai laisse passer la mise en cache des réponses de y/hub (1 s), qui
// servirait sinon une table d'avant le changement.
export function suivreAuteurs(contexte, rappel, delai = 1500) {
  let minuterie = null
  let arrete = false
  async function rafraichir(essai = 0) {
    // Un rejet vaut une absence de réponse : même nouvel essai.
    let attributions = null
    try {
      attributions = await contexte.suggestions.auteurs()
    } catch {
      // attributions reste nul
    }
    if (arrete) return
    // y/hub n'a pas répondu : un nouvel essai, plus tard, sans attendre le
    // prochain changement (audit du 10/11/2026).
    if (!attributions) {
      if (essai === 0) minuterie = setTimeout(() => rafraichir(1).catch(() => {}), delai * 4)
      return
    }
    rappel(attributions)
  }
  // Seuls les changements des suggestions comptent (d'une autre personne, par
  // y/hub, ou d'ici) ; le texte principal recopié par l'afficheur n'a pas d'origine.
  const surChangement = (maj, origine) => {
    if (origine === null || origine === undefined) return
    clearTimeout(minuterie)
    minuterie = setTimeout(() => rafraichir().catch(() => {}), delai)
  }
  contexte.suggestions.doc.on('update', surChangement)
  minuterie = setTimeout(() => rafraichir().catch(() => {}), 0)
  return () => {
    arrete = true
    clearTimeout(minuterie)
    contexte.suggestions.doc.off('update', surChangement)
  }
}

/** L'auteur d'un morceau proposé, d'après la table de y/hub (`null` : inconnu). */
function auteurDans(auteurs, vue, $pos, type) {
  if (!auteurs || !vue) return null
  try {
    const rp = resolvedPositionToRelativePosition(vue, $pos)
    const id = rp?.item
    if (!id) return null
    const table = type === 'ajout' ? auteurs.inserts : auteurs.deletes
    for (const r of table.slice(id.client, id.clock, 1)) {
      const a = (r.attrs ?? []).find((x) => typeof x?.val === 'string' && x.val)
      if (a) return a.val
    }
  } catch {
    // Une position que la liaison ne sait pas traduire : auteur inconnu.
  }
  return null
}

/** Les auteurs déjà trouvés, par table des auteurs puis par nœud de texte. */
const dejaTrouves = new WeakMap()

/**
 * L'auteur d'un nœud de texte proposé. La recherche dans la table de y/hub
 * coûte cher, et la liste est recalculée à chaque changement de l'éditeur :
 * sur un livre de 500 suggestions, une phrase tapée par un correcteur mettait
 * 14 s à s'afficher chez l'éditrice en relecture (mesure du 11/11/2026,
 * `exploitation/dev/mesurer-relecture.mjs`). Un nœud de texte qui n'a pas
 * changé garde son objet d'un état de l'éditeur au suivant : son auteur n'est
 * cherché qu'une fois, tant que la table des auteurs est la même.
 */
function auteurDuNoeud(auteurs, vue, noeud, position, type) {
  if (!auteurs || !vue) return null
  let parNoeud = dejaTrouves.get(auteurs)
  if (!parNoeud) dejaTrouves.set(auteurs, (parNoeud = new WeakMap()))
  const connu = parNoeud.get(noeud)
  if (connu) return connu
  const auteur = auteurDans(auteurs, vue, position(), type)
  // Un auteur introuvable n'est pas retenu : il sera cherché de nouveau.
  if (auteur) parNoeud.set(noeud, auteur)
  return auteur
}

/**
 * Les suggestions du document, dans l'ordre du texte, telles que Yjs les
 * découpe (Sylvain, 09/11/2026 : on garde ce découpage) : les morceaux d'un
 * même auteur qui se touchent, dans un même bloc, font une ligne ; une
 * suppression et un ajout réunis font un remplacement. Yjs garde les lettres
 * communes à l'ancien et au nouveau texte (« beau » → « blanc » : « b » reste,
 * « eau » barré, « lanc » ajouté) : veille.
 * @param {object} editeur
 * @param {object | null} [auteurs] la table des auteurs de y/hub (`suivreAuteurs`)
 * @returns {Array<{ type: 'ajout' | 'suppression' | 'remplacement', auteur: string | null, avant: string, apres: string, debut: number, fin: number, plage: { debut: number, fin: number } }>}
 */
export function listeDesSuggestions(editeur, auteurs = null) {
  const vue = editeur.prosemirrorView
  return editeur.transact((tr) => {
    // Les morceaux : texte marqué, avec son bloc.
    const morceaux = []
    tr.doc.descendants((n, pos) => {
      if (!n.isText) return
      const m = n.marks.find((x) => x.type.name === INSERTION || x.type.name === SUPPRESSION)
      if (!m) return
      morceaux.push({
        type: m.type.name === INSERTION ? 'ajout' : 'suppression',
        auteur:
          m.attrs.userIds?.[0] ??
          auteurDuNoeud(
            auteurs,
            vue,
            n,
            () => tr.doc.resolve(pos),
            m.type.name === INSERTION ? 'ajout' : 'suppression',
          ),
        bloc: tr.doc.resolve(pos).start(),
        debut: pos,
        fin: pos + n.nodeSize,
      })
    })
    // Les lignes : morceaux qui se touchent, d'un même auteur, dans un même bloc.
    const groupes = []
    for (const m of morceaux) {
      const g = groupes[groupes.length - 1]
      if (g && g.auteur === m.auteur && g.bloc === m.bloc && m.debut === g.fin) g.fin = m.fin
      else groupes.push({ auteur: m.auteur, bloc: m.bloc, debut: m.debut, fin: m.fin })
    }
    // Le texte avant et après chaque proposition.
    return groupes.map((g) => {
      let avant = ''
      let apres = ''
      const types = new Set()
      tr.doc.nodesBetween(g.debut, g.fin, (n, pos) => {
        if (!n.isText) return
        const t = n.text.slice(Math.max(0, g.debut - pos), g.fin - pos)
        const m = n.marks.find((x) => x.type.name === INSERTION || x.type.name === SUPPRESSION)
        if (m?.type.name === INSERTION) ((apres += t), types.add('ajout'))
        else if (m?.type.name === SUPPRESSION) ((avant += t), types.add('suppression'))
        else ((avant += t), (apres += t))
      })
      const type = types.size === 2 ? 'remplacement' : [...types][0]
      // Un paragraphe entier proposé (ajouté ou supprimé) : on accepte ou on
      // refuse le bloc, pas seulement son texte, sans quoi rien ne change
      // (diagnostic du 10/11/2026, « Tout accepter » le faisait déjà).
      const $d = tr.doc.resolve(g.debut)
      // Seulement si le bloc lui-même est proposé (il porte la marque) : un
      // paragraphe existant dont on supprime tout le texte reste au texte.
      const proposee = (n) => n.marks.some((x) => x.type.name === INSERTION || x.type.name === SUPPRESSION)
      const entier =
        g.debut === $d.start() &&
        g.fin === $d.end() &&
        $d.depth > 1 &&
        (proposee($d.parent) || proposee($d.node($d.depth - 1)))
      const plage = entier
        ? { debut: $d.before($d.depth - 1), fin: $d.after($d.depth - 1) }
        : { debut: g.debut, fin: g.fin }
      return { type, auteur: g.auteur, avant, apres, debut: g.debut, fin: g.fin, plage }
    })
  })
}
