// Extension de BlockNote (couche 3) : l'exposant, style en ligne (XIXe siècle,
// 1er, Mme), pour une typographie française correcte (comparaison v1 / v2,
// point 19, décidé le 11/11/2026). Ni BlockNote ni Docs ne l'ont. Rendu par
// l'élément sémantique `<sup>`, sans classe ni style (règle 19) ; au collage,
// un `<sup>` (Word, page web) redevient un exposant. Écrite comme si elle
// devait partir en amont : elle ne dépend que de BlockNote.
import { createStyleSpec } from '@blocknote/core'

const sup = () => {
  const dom = document.createElement('sup')
  return { dom, contentDOM: dom }
}

export const styleExposant = createStyleSpec(
  { type: 'exposant', propSchema: 'boolean' },
  {
    render: sup,
    toExternalHTML: sup,
    parse: (element) => (element.tagName === 'SUP' ? true : undefined),
  },
)
