import { Schema } from 'prosemirror-model'

// A deliberately small schema for v0.1: paragraphs, headings (5 levels),
// hard breaks, a bullet list, a blockquote, bold/italic/underline/strike,
// and the two marks that drive tracked changes. Tables and images are left
// for a later iteration (see README roadmap) — adding tracked changes for
// structural edits (paragraph splits, list/quote toggles) is harder and
// out of scope for this first version; those still apply as plain,
// untracked edits (see rewriteForTracking in trackChanges.js).
export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0]
      },
    },
    heading: {
      attrs: { level: { default: 2 } },
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
    list_item: {
      content: 'paragraph block*',
      defining: true,
      parseDOM: [{ tag: 'li' }],
      toDOM() {
        return ['li', 0]
      },
    },
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
      parseDOM: [{ tag: 'ins' }],
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
      parseDOM: [{ tag: 'del' }],
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
      parseDOM: [{ tag: 'span', getAttrs: (el) => (el.classList.contains('author-color') ? {} : false) }],
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
