// Adaptateur BlockNote (couche 2) : les suggestions, avec le montage de
// BlockNote (`suggestionDoc`, un `DiffRenderer` de Yjs entre le texte et les
// suggestions). Deux ajouts à nous, parce que ni BlockNote ni Docs ne les
// fournissent :
//  - les auteurs : y/hub les enregistre mais ne les envoie pas en direct ;
//    on les redemande après chaque changement et l'affichage est reconstruit
//    avec eux (commande publique `configureYProsemirror`) ;
//  - la liste des suggestions, pour le panneau où l'éditeur accepte ou refuse
//    (disposition C, choix de Sylvain) ; un remplacement y fait une ligne.
import * as Y from '@y/y'
import { configureYProsemirror } from '@y/prosemirror'

const INSERTION = 'y-attributed-insert'
const SUPPRESSION = 'y-attributed-delete'

/** Un afficheur des suggestions : le texte, plus les propositions attribuées. */
export function creerAfficheur(contexte, attributions, suggerer) {
  const r = Y.createDiffRenderer(contexte.doc, contexte.suggestions.doc, attributions ? { attributions } : undefined)
  r.suggestionMode = suggerer
  return r
}

/**
 * Tient les auteurs à jour : après chaque changement des suggestions (et une
 * fois au départ), redemande les auteurs à y/hub et reconstruit l'affichage.
 * Rend la fonction qui arrête.
 */
// Le délai laisse passer la mise en cache des réponses de y/hub (1 s).
export function suivreAuteurs(editeur, contexte, afficheurInitial, suggerer, delai = 1500) {
  let afficheur = afficheurInitial
  let minuterie = null
  let arrete = false
  const fragment = contexte.suggestions.fragment
  async function rafraichir(essai = 0) {
    const attributions = await contexte.suggestions.auteurs()
    if (arrete) return
    // y/hub n'a pas répondu : un nouvel essai, plus tard, sans attendre le
    // prochain changement (audit du 10/11/2026).
    if (!attributions) {
      if (essai === 0) minuterie = setTimeout(() => rafraichir(1).catch(() => {}), delai * 4)
      return
    }
    const nouveau = creerAfficheur(contexte, attributions, suggerer)
    editeur.exec(configureYProsemirror({ ytype: fragment, renderer: nouveau }))
    if (afficheur !== afficheurInitial) afficheur.destroy()
    afficheur = nouveau
  }
  // Seuls les changements des suggestions comptent (d'une autre personne, par
  // y/hub, ou d'ici) ; le texte principal recopié par l'afficheur n'a pas d'origine.
  const surChangement = (maj, origine) => {
    if (origine === null || origine === undefined) return
    clearTimeout(minuterie)
    minuterie = setTimeout(() => rafraichir().catch(() => {}), delai)
  }
  contexte.suggestions.doc.on('update', surChangement)
  minuterie = setTimeout(() => rafraichir().catch(() => {}), delai)
  return () => {
    arrete = true
    clearTimeout(minuterie)
    contexte.suggestions.doc.off('update', surChangement)
    if (afficheur !== afficheurInitial) afficheur.destroy()
  }
}

/**
 * Les suggestions du document, dans l'ordre du texte, telles que Yjs les
 * découpe (Sylvain, 09/11/2026 : on garde ce découpage) : les morceaux d'un
 * même auteur qui se touchent, dans un même bloc, font une ligne ; une
 * suppression et un ajout réunis font un remplacement. Yjs garde les lettres
 * communes à l'ancien et au nouveau texte (« beau » → « blanc » : « b » reste,
 * « eau » barré, « lanc » ajouté) : veille.
 * @returns {Array<{ type: 'ajout' | 'suppression' | 'remplacement', auteur: string | null, avant: string, apres: string, debut: number, fin: number }>}
 */
export function listeDesSuggestions(editeur) {
  return editeur.transact((tr) => {
    // Les morceaux : texte marqué, avec son bloc.
    const morceaux = []
    tr.doc.descendants((n, pos) => {
      if (!n.isText) return
      const m = n.marks.find((x) => x.type.name === INSERTION || x.type.name === SUPPRESSION)
      if (!m) return
      morceaux.push({
        type: m.type.name === INSERTION ? 'ajout' : 'suppression',
        auteur: m.attrs.userIds?.[0] ?? null,
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
      return { type, auteur: g.auteur, avant, apres, debut: g.debut, fin: g.fin }
    })
  })
}
