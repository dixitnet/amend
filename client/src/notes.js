// Les notes d'un document — ce que tous les exports et l'éditeur partagent
// (28/09/2026, claude/conception-notes-bas-de-page.md).
//
// Le numéro d'une note n'est **jamais** stocké : la n-ième note du
// document porte le numéro n. Cette fonction est le seul endroit qui
// compte, et tout le monde compte donc pareil — l'appel dans le texte, la
// liste en fin de document, le PDF, le .docx, le Markdown, la page
// publiée.

/** Les notes du document, dans l'ordre du texte : `[{ node, pos }]`. Le
 * numéro est l'indice plus un. */
export function notesDuDocument(doc) {
  const out = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'footnote') {
      out.push({ node, pos })
      return false // pas de note dans une note
    }
    return true
  })
  return out
}

/** Le numéro de chaque note, par identité de nœud : `Map<Node, number>`.
 * Les sérialiseurs s'en servent en descendant le document, sans avoir à
 * connaître les positions. */
export function numerosDesNotes(doc) {
  const m = new Map()
  notesDuDocument(doc).forEach(({ node }, i) => m.set(node, i + 1))
  return m
}
