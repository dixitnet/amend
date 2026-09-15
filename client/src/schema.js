import { Schema } from 'prosemirror-model'
import { tableNodes } from 'prosemirror-tables'

// A deliberately small schema: paragraphs, headings (5 levels), hard
// breaks, three kinds of list (à puces, numérotée, à cocher — les deux
// dernières ajoutées le 15/09/2026), a blockquote,
// bold/italic/underline/strike,
// and the two marks that drive tracked changes. Les tableaux simples sont
// arrivés le 15/09/2026 (voir claude/etude-tableaux-images.md) ; les images
// restent pour plus tard, et pour une raison de fond : elles n'ont pas leur
// place dans le CRDT, que chaque connexion rejoue intégralement. Paragraph/heading splits
// directly under the document (the common case: pressing Enter, or a
// multi-line paste — see rewriteForTracking/richPastePlugin in
// trackChanges.js) are tracked via `trackedBreak` below; a split nested
// inside a list item or blockquote, and anything that changes the
// surrounding structure more than a plain split (list/quote toggles,
// heading-level changes), stays a plain, untracked edit for this version.
export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      // `trackedBreak`: null, or { user, userColor, ts } when this
      // paragraph is the second half of a still-pending tracked split —
      // see rewriteForTracking (Entrée) and richPastePlugin (collage
      // multi-lignes) in trackChanges.js, rendered via pendingBreakPlugin's
      // decoration (style.css: .pending-break). Cleared on accept
      // (acceptChange), undone by rejoining the two paragraphs on reject
      // (rejectChange) — never touched by hand elsewhere.
      attrs: { trackedBreak: { default: null } },
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0]
      },
    },
    heading: {
      attrs: { level: { default: 2 }, trackedBreak: { default: null } },
      content: 'inline*',
      group: 'block',
      defining: true,
      parseDOM: [
        { tag: 'h1', attrs: { level: 1 } },
        { tag: 'h2', attrs: { level: 2 } },
        { tag: 'h3', attrs: { level: 3 } },
        { tag: 'h4', attrs: { level: 4 } },
        { tag: 'h5', attrs: { level: 5 } },
      ],
      toDOM(node) {
        return [`h${node.attrs.level}`, 0]
      },
    },
    blockquote: {
      content: 'block+',
      group: 'block',
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM() {
        return ['blockquote', 0]
      },
    },
    // A single (unordered, "tiret") list. Item content mirrors the usual
    // prosemirror-schema-list shape: one leading paragraph, then optionally
    // more blocks (including a nested bullet_list) — see toggleList/
    // splitListItem/liftListItem/sinkListItem wiring in editor.js.
    bullet_list: {
      content: 'list_item+',
      group: 'block',
      parseDOM: [{ tag: 'ul' }],
      toDOM() {
        return ['ul', 0]
      },
    },
    // Liste numérotée (15/09/2026). `order` suit la convention de
    // prosemirror-schema-list : le numéro de départ, presque toujours 1.
    ordered_list: {
      content: 'list_item+',
      group: 'block',
      attrs: { order: { default: 1 } },
      parseDOM: [
        {
          tag: 'ol',
          getAttrs(dom) {
            return { order: dom.hasAttribute('start') ? Number(dom.getAttribute('start')) : 1 }
          },
        },
      ],
      toDOM(node) {
        return node.attrs.order === 1 ? ['ol', 0] : ['ol', { start: node.attrs.order }, 0]
      },
    },
    list_item: {
      content: 'paragraph block*',
      defining: true,
      parseDOM: [{ tag: 'li' }],
      toDOM() {
        return ['li', 0]
      },
    },
    // Liste à cocher (15/09/2026). Nœuds distincts plutôt qu'un attribut sur
    // list_item : une case cochée n'est pas une puce, elle n'a ni le même
    // rendu ni la même sémantique à l'export, et les commandes de liste
    // (wrapInList/splitListItem/liftListItem) fonctionnent telles quelles
    // sur une paire liste/élément dédiée.
    task_list: {
      content: 'task_item+',
      group: 'block',
      parseDOM: [{ tag: 'ul[data-type="taches"]' }],
      toDOM() {
        return ['ul', { 'data-type': 'taches', class: 'liste-taches' }, 0]
      },
    },
    task_item: {
      content: 'paragraph block*',
      defining: true,
      attrs: { checked: { default: false } },
      parseDOM: [
        {
          tag: 'li[data-checked]',
          getAttrs(dom) {
            return { checked: dom.getAttribute('data-checked') === 'true' }
          },
        },
      ],
      // La case est un élément non éditable à part : c'est elle que le
      // greffon de l'éditeur intercepte au clic (editor.js), et c'est le
      // sélecteur [data-checked="true"] qui barre le contenu en CSS — rien
      // n'est écrit deux fois dans le document.
      toDOM(node) {
        return [
          'li',
          { 'data-checked': node.attrs.checked ? 'true' : 'false', class: 'tache' },
          ['span', { class: 'tache-case', contenteditable: 'false' }],
          ['div', { class: 'tache-contenu' }, 0],
        ]
      },
    },
    // Une ligne insérée volontairement dans le texte (bouton dédié dans la
    // barre d'outils, voir editor.js) — un simple <hr> à l'écran et dans
    // l'export .md (mdExport.js : "---"), mais remplacée par un saut de
    // page dans l'export PDF (pdfExport.js) plutôt que dessinée comme une
    // ligne : le trait en pointillés dans l'éditeur (style.css) est
    // justement là pour rappeler que sa fonction réelle est "page suivante
    // à l'impression", pas une simple séparation visuelle.
    horizontal_rule: {
      group: 'block',
      parseDOM: [{ tag: 'hr' }],
      toDOM() {
        return ['hr', { title: "Saut de page à l'export PDF" }]
      },
    },
    // Tableaux simples (15/09/2026). `cellContent: 'paragraph'` est une
    // limite volontaire : une cellule porte un seul paragraphe, jamais une
    // liste ni un titre. Ça garde le schéma lisible, rend l'export Markdown
    // représentable (une cellule = une ligne de texte entre pipes) et évite
    // d'ouvrir la porte aux attentes de tableur. Pas de fusion de cellules
    // pour la même raison — voir claude/etude-tableaux-images.md.
    ...tableNodes({
      tableGroup: 'block',
      cellContent: 'paragraph',
      cellAttributes: {},
    }),
    text: { group: 'inline' },
    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM() {
        return ['br']
      },
    },
  },
  marks: {
    strong: {
      parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
      toDOM() {
        return ['strong', 0]
      },
    },
    em: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }],
      toDOM() {
        return ['em', 0]
      },
    },
    underline: {
      parseDOM: [{ tag: 'u' }],
      toDOM() {
        return ['u', 0]
      },
    },
    // Deliberately its own mark (tag `s`), never `del` — `del`/tracked-
    // deletion is reserved for the suivi des modifications mark below, and
    // must stay distinguishable from a manual strikethrough the user asked
    // for on purpose.
    strike: {
      parseDOM: [{ tag: 's' }, { tag: 'strike' }],
      toDOM() {
        return ['s', 0]
      },
    },
    // Text proposed as an addition — by a human (when "suivi des
    // modifications" is on) or by the AI. Rendered underlined, tinted with
    // the author's color; accept keeps it (drops the mark), reject removes
    // the text entirely.
    insertion: {
      attrs: { user: {}, userColor: {}, ts: {} },
      // Deliberately NOT inclusive: text typed right after an
      // insertion/deletion span must never silently inherit that mark —
      // every span's attribution has to come from an explicit addMark call
      // in trackChanges.js, never from ProseMirror's boundary inheritance.
      inclusive: false,
      // Pas de parseDOM (bug corrigé le 14/09/2026, voir
      // claude/rapport-bug-collage-yjs.md, projet Amend) : sans lui,
      // coller un <ins> venu d'ailleurs (y compris depuis Amend lui-même,
      // par ex. un Ctrl+A/Ctrl+C sur un document qui a du texte marqué)
      // aurait tenté de recréer ce mark sans ses attributs obligatoires
      // (user/userColor/ts n'ont pas de valeur par défaut) — ProseMirror
      // lève alors une exception pendant l'analyse du collage, avant même
      // de construire la transaction : le texte collé apparaît une
      // fraction de seconde (insertion native du navigateur dans le DOM)
      // puis disparaît (ProseMirror resynchronise le DOM sur son état
      // interne resté inchangé, la transaction n'ayant jamais abouti). De
      // toute façon, hériter l'attribution ou le statut "en attente" d'un
      // <ins>/<del> collé depuis ailleurs n'aurait aucun sens : un collage
      // doit être attribué à la personne qui colle, pas rejouer
      // l'historique de sa source — laissé à rewriteForTracking/
      // richPastePlugin ci-dessous, qui s'en chargent déjà correctement.
      toDOM(mark) {
        return [
          'ins',
          {
            class: 'tracked-insertion',
            style: `--user-color:${mark.attrs.userColor}`,
            title: `Ajout de ${mark.attrs.user}`,
          },
          0,
        ]
      },
    },
    // Text proposed for removal. Kept in the document (struck through)
    // until accepted (removes it for real) or rejected (drops the mark).
    deletion: {
      attrs: { user: {}, userColor: {}, ts: {} },
      inclusive: false,
      // Pas de parseDOM — même raison que insertion ci-dessus.
      toDOM(mark) {
        return [
          'del',
          {
            class: 'tracked-deletion',
            style: `--user-color:${mark.attrs.userColor}`,
            title: `Suppression proposée par ${mark.attrs.user}`,
          },
          0,
        ]
      },
    },
    // Who wrote this text — unlike insertion/deletion, this mark is
    // deliberately NOT removed when a change is accepted: it's meant to
    // outlive the review, so a passage still shows a subtle tint of its
    // author's color long after the tracked-change marker itself is gone.
    // Added alongside `insertion` everywhere text gets inserted (see
    // trackChanges.js) — never inherited/typed into automatically
    // (inclusive: false), same reasoning as insertion/deletion above.
    authorColor: {
      attrs: { user: {}, userColor: {} },
      inclusive: false,
      // Pas de parseDOM — même raison que insertion plus haut. C'est
      // d'ailleurs le cas concret qui a révélé le bug : authorColor reste
      // sur le texte accepté (voir le commentaire au-dessus de toDOM), donc
      // n'importe quel texte d'un document réellement utilisé avec le
      // suivi des modifications en est couvert — un Ctrl+A/Ctrl+C dessus
      // déclenchait l'exception sur la quasi-totalité du contenu collé.
      toDOM(mark) {
        return [
          'span',
          {
            class: 'author-color',
            style: `--author-color:${mark.attrs.userColor}`,
            title: `Écrit par ${mark.attrs.user}`,
          },
          0,
        ]
      },
    },
  },
})
