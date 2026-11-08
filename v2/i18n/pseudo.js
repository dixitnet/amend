// La pseudo-langue (règle 31) : chaque texte français, accentué, allongé
// d'environ 40 % et encadré de ⟦ ⟧. Elle révèle à l'écran les textes restés
// en dur (non transformés), les textes coupés (crochet manquant) et les mises
// en page qui ne supportent pas une langue plus longue. Les paramètres et les
// pluriels ICU sont préservés.
import { parse } from '@formatjs/icu-messageformat-parser'
import { printAST } from '@formatjs/icu-messageformat-parser/printer.js'

const ACCENTS = {
  a: 'á',
  e: 'é',
  i: 'î',
  o: 'ô',
  u: 'ü',
  c: 'ç',
  n: 'ñ',
  A: 'Á',
  E: 'É',
  I: 'Î',
  O: 'Ô',
  U: 'Ü',
  C: 'Ç',
}
const accentuer = (s) => s.replace(/[aeioucnAEIOUC]/g, (c) => ACCENTS[c])
const allonger = (s) => s + '~'.repeat(Math.ceil(s.replace(/\s/g, '').length * 0.4))

function transformer(elements) {
  for (const el of elements) {
    if (el.type === 0) el.value = allonger(accentuer(el.value))
    if (el.options) for (const o of Object.values(el.options)) transformer(o.value)
    if (el.children) transformer(el.children)
  }
  return elements
}

export function pseudoMessage(message) {
  return `⟦${printAST(transformer(parse(message)))}⟧`
}

export function pseudoCatalogue(catalogue) {
  return Object.fromEntries(
    Object.entries(catalogue).map(([k, v]) => [k, typeof v === 'string' ? pseudoMessage(v) : pseudoCatalogue(v)]),
  )
}
