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
  async function rafraichir() {
    const attributions = await contexte.suggestions.auteurs()
    if (arrete || !attributions) return
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
 * Les suggestions du document, dans l'ordre du texte : plages contiguës
 * d'ajout ou de suppression d'un même auteur ; une suppression suivie d'un
 * ajout du même auteur fait un remplacement.
 * @returns {Array<{ type: 'ajout' | 'suppression' | 'remplacement', auteur: string | null, avant: string, apres: string, debut: number, fin: number }>}
 */
export function listeDesSuggestions(editeur) {
  return editeur.transact((tr) => {
    const plages = []
    tr.doc.descendants((n, pos) => {
      if (!n.isText) return
      const m = n.marks.find((x) => x.type.name === INSERTION || x.type.name === SUPPRESSION)
      if (!m) return
      const type = m.type.name === INSERTION ? 'ajout' : 'suppression'
      const auteur = m.attrs.userIds?.[0] ?? null
      const der = plages[plages.length - 1]
      if (der && der.fin === pos && der.type === type && der.auteur === auteur) {
        der.fin = pos + n.nodeSize
        der.texte += n.text
      } else plages.push({ type, auteur, debut: pos, fin: pos + n.nodeSize, texte: n.text })
    })
    const liste = []
    for (const p of plages) {
      const der = liste[liste.length - 1]
      if (der && der.type === 'suppression' && p.type === 'ajout' && der.fin === p.debut && der.auteur === p.auteur)
        Object.assign(der, { type: 'remplacement', apres: p.texte, fin: p.fin })
      else
        liste.push({
          type: p.type,
          auteur: p.auteur,
          avant: p.type === 'suppression' ? p.texte : '',
          apres: p.type === 'ajout' ? p.texte : '',
          debut: p.debut,
          fin: p.fin,
        })
    }
    return liste
  })
}
