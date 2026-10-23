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
//  1. réduction côté navigateur (2000 px de large au maximum, ré-encodage
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
import { isTrackChangesEnabled } from './trackChanges.js'

/** Largeur maximale conservée à l'envoi. Portée de 1600 à 2000 px le
 * 23/10/2026 (demande de Sylvain) : une image « pleine page » d'un A4 à
 * 150 ppp fait 1240 px, à 200 ppp 1650 px — 2000 px laisse de la marge pour
 * un format plus grand ou un écran à fort pixel. Au-delà, personne ne voit
 * la différence à l'écran ni à l'impression, et le poids est divisé par
 * plusieurs. */
export const LARGEUR_MAX = 2000

/** Le nombre de fichiers pris d'un seul geste (glisser-déposer, sélecteur). */
export const FICHIERS_MAX = 10

/** Au-delà de ce poids, on essaie le JPEG : en dessous, le PNG d'une
 * capture d'écran est à la fois plus léger et plus net, et il n'y a rien à
 * gagner à le dégrader. */
const SEUIL_JPEG_OCTETS = 600 * 1024

const cle = new PluginKey('images-en-attente')

/** Un message qui s'efface tout seul — il n'y en avait pas encore dans
 * l'application, et un `alert()` couperait la saisie pour dire « l'image
 * est trop lourde ». */
export function messageFugace(texte, { erreur = false } = {}) {
  const bulle = document.createElement('div')
  bulle.className = `message-fugace${erreur ? ' erreur' : ''}`
  bulle.textContent = texte
  document.body.appendChild(bulle)
  setTimeout(
    () => {
      bulle.classList.add('sortant')
      setTimeout(() => bulle.remove(), 400)
    },
    erreur ? 5000 : 2500
  )
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
  if (facteur === 1 && (fichier.type === 'image/png' || fichier.type === 'image/jpeg') && fichier.size <= blob.size) {
    return { blob: fichier, largeur, hauteur }
  }
  return { blob, largeur, hauteur }
}

/** Le greffon. `peutInserer` suit le serveur, qui réserve le dépôt du
 * fichier à `canManageDocument`. Depuis le 29/09/2026 une image est un
 * nœud suivi entier (attribut `suivi`, schema.js) : insérée en suivi, elle
 * est proposée ; supprimée en suivi, elle est barrée — un correcteur peut
 * donc en retirer une, et ça passe par le panneau des modifications, là
 * où c'était interdit faute de trace. */
export function imagesPlugin({ docId, peutInserer, getUser }) {
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
          set = set.add(tr.doc, [Decoration.widget(action.ajouter.pos, repere, { id: action.ajouter.id, side: 1 })])
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
          messageFugace('Seul un éditeur peut ajouter une image à ce document.', { erreur: true })
          return true
        }
        deposer(view, docId, fichier, getUser, positionDuBloc(view, view.state.selection.$from.pos))
        return true
      },
      // Le glisser-déposer d'un fichier (23/10/2026). Un glisser interne
      // (du texte, d'un bloc) ne porte aucun fichier : il reste à
      // ProseMirror. L'image se pose après le bloc qui est sous le curseur
      // de la souris, comme au collage — jamais au milieu d'une phrase.
      handleDrop(view, event) {
        const transfert = event.dataTransfer
        if (!transfert || !transfert.files || !transfert.files.length) return false
        const fichiers = imagesDuTransfert(transfert.files)
        // Un fichier qui n'est pas une image : on ne l'avale pas, mais on ne
        // laisse pas non plus le navigateur quitter la page pour l'ouvrir.
        event.preventDefault()
        if (!fichiers.length) {
          messageFugace('Seules les images (png, jpeg…) peuvent être déposées dans le texte.', { erreur: true })
          return true
        }
        if (!peutInserer) {
          messageFugace('Seul un éditeur peut ajouter une image à ce document.', { erreur: true })
          return true
        }
        const point = view.posAtCoords({ left: event.clientX, top: event.clientY })
        deposerImages(view, docId, fichiers, getUser, point ? point.pos : view.state.selection.$from.pos)
        return true
      },
    },
  })
}

/** Les fichiers image d'un transfert (glisser-déposer, sélecteur de
 * fichiers), dans l'ordre, au plus FICHIERS_MAX. */
export function imagesDuTransfert(fichiers) {
  return Array.from(fichiers || [])
    .filter((f) => f.type && f.type.startsWith('image/'))
    .slice(0, FICHIERS_MAX)
}

/** Une image est un bloc : elle se pose après le bloc de premier niveau où
 * se trouve `pos`, jamais au milieu d'une phrase. */
function positionDuBloc(view, pos) {
  const doc = view.state.doc
  const $p = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)))
  return $p.depth >= 1 ? $p.after(1) : $p.pos
}

/** Plusieurs fichiers d'un coup : l'un après l'autre, dans l'ordre où ils ont
 * été donnés, chacun à la suite du précédent. Séquentiel à dessein : le
 * dépôt est rapide, et c'est ce qui garantit l'ordre des images dans le
 * texte (en parallèle, la plus légère arriverait la première). */
export async function deposerImages(view, docId, fichiers, getUser, pos) {
  let suite = positionDuBloc(view, pos)
  for (const fichier of fichiers) {
    suite = await deposer(view, docId, fichier, getUser, suite)
  }
}

/** Ouvre le sélecteur de fichiers du système (la photothèque, sur
 * téléphone) et rend les images choisies à `rappel`. L'entrée est créée à
 * la demande et retirée aussitôt : rien ne reste dans la page. */
export function ouvrirSelecteurImages(rappel) {
  const entree = document.createElement('input')
  entree.type = 'file'
  entree.accept = 'image/*'
  entree.multiple = true
  entree.hidden = true
  entree.addEventListener('change', () => {
    const choisies = imagesDuTransfert(entree.files)
    const total = entree.files ? entree.files.length : 0
    entree.remove()
    if (total > FICHIERS_MAX) {
      messageFugace(`${FICHIERS_MAX} images à la fois au plus : les ${FICHIERS_MAX} premières sont prises.`)
    }
    if (choisies.length) rappel(choisies)
  })
  entree.addEventListener('cancel', () => entree.remove())
  document.body.appendChild(entree)
  entree.click()
}

/** Dépose l'image puis insère le nœud à la place du repère. Tout est local
 * jusqu'à la dernière transaction : un échec de dépôt ne laisse rien
 * derrière lui. Rend la position qui suit l'image insérée (ou `pos` si
 * rien n'a été inséré), pour que l'image suivante d'un lot s'y pose. */
async function deposer(view, docId, fichier, getUser, pos) {
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
      throw new Error(detail.error || 'le dépôt a été refusé')
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
      return pos
    }
    // En suivi, l'image naît proposée (attribut `suivi`, schema.js) : la
    // réécriture du suivi n'a rien à faire, la proposition est sur le nœud.
    const user = getUser ? getUser() : null
    const suivi =
      isTrackChangesEnabled(view.state) && user
        ? { type: 'insertion', user: user.name, userColor: user.color, ts: Date.now() }
        : null
    const tr = view.state.tr
      .setMeta(cle, { retirer: id })
      .insert(trouve[0].from, view.state.schema.nodes.image.create({ src, largeur, hauteur, suivi }))
    tr.setMeta('trackChangesInternal', true)
    view.dispatch(tr)
    // Un nœud atome occupe une position : la suivante est juste derrière.
    return trouve[0].from + 1
  } catch (err) {
    retirerRepere()
    messageFugace(err.message || "l'image n'a pas pu être ajoutée", { erreur: true })
    return pos
  }
}
