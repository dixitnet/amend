// Images collées dans un document (16/09/2026, voir
// claude/etude-tableaux-images.md, projet Amend). Version volontairement
// réduite : **le collage et rien d'autre**. Pas de bouton dans la barre
// d'outils, pas de glisser-déposer, pas de légende, pas d'habillage, pas de
// redimensionnement à la souris. Personne ne va chercher un bouton
// « insérer une image » : on colle une capture d'écran, c'est le chemin
// qu'on traite.
//
// Trois choses se passent au collage, dans cet ordre :
//
//  1. réduction côté navigateur (1600 px de large au maximum, ré-encodage
//     en PNG ou en JPEG selon ce qui pèse le moins) — c'est ce qui divise
//     le poids du stockage sans que personne ne le remarque ;
//  2. dépôt sur le serveur, qui répond l'URL de l'image ;
//  3. insertion du nœud, qui ne porte que cette URL.
//
// Pendant les deux premières étapes, un repère « Dépôt de l'image… » tient
// la place : une décoration locale, jamais un nœud, donc rien de tout ça
// n'atteint le document collaboratif tant que le dépôt n'a pas abouti.

import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { ySyncPluginKey } from 'y-prosemirror'

/** Largeur maximale conservée à l'envoi. Au-delà, personne ne voit la
 * différence à l'écran ni à l'impression, et le poids est divisé par
 * plusieurs. */
export const LARGEUR_MAX = 1600

/** Au-delà de ce poids, on essaie le JPEG : en dessous, le PNG d'une
 * capture d'écran est à la fois plus léger et plus net, et il n'y a rien à
 * gagner à le dégrader. */
const SEUIL_JPEG_OCTETS = 600 * 1024

const cle = new PluginKey('images-en-attente')

/** Un message qui s'efface tout seul — il n'y en avait pas encore dans
 * l'application, et un `alert()` couperait la saisie pour dire « l'image
 * est trop lourde ». */
function messageFugace(texte, { erreur = false } = {}) {
  const bulle = document.createElement('div')
  bulle.className = `message-fugace${erreur ? ' erreur' : ''}`
  bulle.textContent = texte
  document.body.appendChild(bulle)
  setTimeout(() => {
    bulle.classList.add('sortant')
    setTimeout(() => bulle.remove(), 400)
  }, erreur ? 5000 : 2500)
}

/** L'image d'un presse-papiers, ou `null`. On ne retient que les vrais
 * fichiers (`clipboardData.files`) : c'est ce que produisent une capture
 * d'écran et un « copier l'image » du Finder. Un collage qui transporte
 * aussi du texte est un collage de texte — on le laisse au chemin normal
 * (richPastePlugin, trackChanges.js). */
function imageDuPressePapiers(clipboardData) {
  if (!clipboardData) return null
  if (clipboardData.getData('text/plain')) return null
  const fichiers = Array.from(clipboardData.files || [])
  return fichiers.find((f) => f.type && f.type.startsWith('image/')) || null
}

function versBlob(canvas, type, qualite) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, qualite))
}

/** Réduit et ré-encode. Renvoie `{ blob, largeur, hauteur }` — les
 * dimensions sont celles de l'image finale, portées par le nœud pour que la
 * mise en page ne saute pas au chargement et que l'export Word sache à
 * quelle taille la poser. */
async function preparer(fichier) {
  const bitmap = await createImageBitmap(fichier)
  const facteur = Math.min(1, LARGEUR_MAX / bitmap.width)
  const largeur = Math.max(1, Math.round(bitmap.width * facteur))
  const hauteur = Math.max(1, Math.round(bitmap.height * facteur))
  const canvas = document.createElement('canvas')
  canvas.width = largeur
  canvas.height = hauteur
  canvas.getContext('2d').drawImage(bitmap, 0, 0, largeur, hauteur)
  if (bitmap.close) bitmap.close()

  let blob = await versBlob(canvas, 'image/png')
  if (!blob) throw new Error("cette image n'a pas pu être lue")
  if (blob.size > SEUIL_JPEG_OCTETS) {
    // Une photo pèse cinq à dix fois moins en JPEG ; une capture d'écran
    // aux aplats nets, elle, ressort souvent plus lourde — d'où la
    // comparaison plutôt qu'une règle fixe sur le type d'origine.
    const jpeg = await versBlob(canvas, 'image/jpeg', 0.85)
    if (jpeg && jpeg.size < blob.size) blob = jpeg
  }
  // Une image déjà petite et déjà dans un de nos deux formats n'a rien à
  // gagner à être ré-encodée : on garde l'original s'il est plus léger.
  if (
    facteur === 1 &&
    (fichier.type === 'image/png' || fichier.type === 'image/jpeg') &&
    fichier.size <= blob.size
  ) {
    return { blob: fichier, largeur, hauteur }
  }
  return { blob, largeur, hauteur }
}

function compterImages(doc) {
  let n = 0
  doc.descendants((node) => {
    if (node.type.name === 'image') n++
  })
  return n
}

/** Le greffon. `peutInserer` vaut faux pour un correcteur : une image est
 * un nœud, donc hors suivi des modifications avec l'architecture actuelle —
 * la supprimer ne laisserait aucune trace dans le panneau des
 * modifications. Tant que le suivi ne descend pas au niveau des nœuds,
 * insérer et supprimer une image restent réservés à l'éditeur (même
 * raisonnement que pour les lignes de tableau). Le serveur applique la même
 * règle de son côté : celle-ci n'est pas la seule protection. */
export function imagesPlugin({ docId, peutInserer }) {
  return new Plugin({
    key: cle,
    state: {
      init() {
        return DecorationSet.empty
      },
      apply(tr, set) {
        set = set.map(tr.mapping, tr.doc)
        const action = tr.getMeta(cle)
        if (action && action.ajouter) {
          const repere = document.createElement('div')
          repere.className = 'image-en-attente'
          repere.textContent = "Dépôt de l'image…"
          set = set.add(tr.doc, [
            Decoration.widget(action.ajouter.pos, repere, { id: action.ajouter.id, side: 1 }),
          ])
        } else if (action && action.retirer) {
          set = set.remove(set.find(null, null, (spec) => spec.id === action.retirer))
        }
        return set
      },
    },
    props: {
      decorations(state) {
        return cle.getState(state)
      },
      handlePaste(view, event) {
        const fichier = imageDuPressePapiers(event.clipboardData)
        if (!fichier) return false
        event.preventDefault()
        if (!peutInserer) {
          messageFugace("Seul un éditeur peut ajouter une image à ce document.", { erreur: true })
          return true
        }
        deposer(view, docId, fichier)
        return true
      },
    },
    // Un correcteur ne fait pas disparaître une image sans laisser de
    // trace. Les transactions venues des autres participants (y-prosemirror
    // les marque comme telles) passent toujours : les filtrer ferait
    // diverger son document de celui des autres, ce qui serait un bien
    // pire défaut que celui qu'on corrige ici.
    filterTransaction(tr, state) {
      if (peutInserer || !tr.docChanged) return true
      if (tr.getMeta(ySyncPluginKey)) return true
      if (compterImages(tr.doc) >= compterImages(state.doc)) return true
      messageFugace("Un correcteur ne peut pas supprimer une image.", { erreur: true })
      return false
    },
  })
}

/** Dépose l'image puis insère le nœud à la place du repère. Tout est local
 * jusqu'à la dernière transaction : un échec de dépôt ne laisse rien
 * derrière lui. */
async function deposer(view, docId, fichier) {
  // Une image est un bloc : elle se pose après le bloc où se trouve le
  // curseur, jamais au milieu d'une phrase.
  const $from = view.state.selection.$from
  const pos = $from.depth >= 1 ? $from.after(1) : $from.pos
  const id = {}
  view.dispatch(view.state.tr.setMeta(cle, { ajouter: { id, pos } }))

  const retirerRepere = () => {
    view.dispatch(view.state.tr.setMeta(cle, { retirer: id }))
  }

  try {
    const { blob, largeur, hauteur } = await preparer(fichier)
    const reponse = await fetch(`/api/docs/${docId}/images`, {
      method: 'POST',
      headers: { 'content-type': blob.type },
      body: blob,
    })
    if (!reponse.ok) {
      const detail = await reponse.json().catch(() => ({}))
      throw new Error(detail.error || "le dépôt a été refusé")
    }
    const { src } = await reponse.json()

    // Le repère a pu bouger pendant le dépôt (quelqu'un d'autre a écrit
    // plus haut) : c'est sa position courante qui compte, pas celle de
    // départ. S'il a disparu, l'image est déposée mais on ne l'insère
    // nulle part plutôt que de la poser au hasard.
    const trouve = cle.getState(view.state).find(null, null, (spec) => spec.id === id)
    if (!trouve.length) {
      retirerRepere()
      messageFugace("L'image a été déposée mais son emplacement a disparu.", { erreur: true })
      return
    }
    const tr = view.state.tr
      .setMeta(cle, { retirer: id })
      .insert(trouve[0].from, view.state.schema.nodes.image.create({ src, largeur, hauteur }))
    // Insertion d'un nœud : hors suivi des modifications, comme les autres
    // changements de structure (voir trackChanges.js).
    tr.setMeta('trackChangesInternal', true)
    view.dispatch(tr)
  } catch (err) {
    retirerRepere()
    messageFugace(err.message || "l'image n'a pas pu être ajoutée", { erreur: true })
  }
}
