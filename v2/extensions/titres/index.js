// Extension de BlockNote (couche 3) : les blocs « Titre », « Sous-titre » et
// « Légende » (Sylvain, 12/11/2026 ; la légende, 13/11/2026), le titre du
// document, son sous-titre et la légende d'une image ou d'un tableau, posés dans
// le texte. Ce ne sont pas des titres de BlockNote (`heading`) : ils restent
// hors du plan et de la table des matières, et leur rendu à l'export est le
// leur (PDF : centrés, corps du modèle ; Markdown : gras, italique). Docs n'en
// a pas.
//
// À l'écran : un paragraphe sémantique marqué `data-amend-bloc`, sans classe
// ni style (règle 19) ; l'apparence est décidée dans le design.
import { createBlockSpec } from '@blocknote/core'

export const TYPE_TITRE = 'titre'
export const TYPE_SOUS_TITRE = 'sousTitre'
export const TYPE_LEGENDE = 'legende'

const bloc = (type) =>
  createBlockSpec(
    { type, propSchema: {}, content: 'inline' },
    {
      render() {
        const p = document.createElement('p')
        p.setAttribute('data-amend-bloc', type)
        return { dom: p, contentDOM: p }
      },
    },
  )

export const blocTitre = bloc(TYPE_TITRE)
export const blocSousTitre = bloc(TYPE_SOUS_TITRE)
export const blocLegende = bloc(TYPE_LEGENDE)
