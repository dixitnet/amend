// Extension de BlockNote (couche 3) : le surlignage, style en ligne, comme un
// coup de stabilo d'une seule couleur (Sylvain, 26/11/2026 : « 1 à 5 ok, citron
// vert, pas d'export »). Elle part dans le PDF depuis le 27/11/2026 (« le surligneur
// doit apparaître dans les exports PDF »), pas dans le Markdown (adaptateur, `export.js`). BlockNote a des couleurs de fond,
// en palette complète, que Docs garde ; nous les avions retirées (renoncement
// n° 8), et un oui ou non suffit ici : un texte collé n'apporte pas d'autres
// couleurs, et la teinte reste un réglage de design. Rendu par l'élément
// sémantique `<mark>`, sans classe ni style (règle 19) ; au collage, un `<mark>`
// redevient un surlignage. Écrite comme si elle devait partir en amont : elle ne
// dépend que de BlockNote.
import { createExtension, createStyleSpec } from '@blocknote/core'

export const STYLE_SURLIGNE = 'surligne'

const mark = () => {
  const dom = document.createElement('mark')
  return { dom, contentDOM: dom }
}

export const styleSurligne = createStyleSpec(
  { type: STYLE_SURLIGNE, propSchema: 'boolean' },
  {
    render: mark,
    toExternalHTML: mark,
    parse: (element) => (element.tagName === 'MARK' ? true : undefined),
  },
)

/** Le raccourci du surlignage (Ctrl ou Cmd + Maj + H, celui de Notion), tant que `actif()` le permet. */
export const extensionSurligne = createExtension(({ options }) => {
  const actif = options.actif ?? (() => true)
  return {
    key: 'surligne',
    keyboardShortcuts: {
      'Mod-Shift-h': ({ editor }) => {
        if (!actif() || !editor.isEditable) return false
        editor.toggleStyles({ [STYLE_SURLIGNE]: true })
        return true
      },
    },
  }
})
