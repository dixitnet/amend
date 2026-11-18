// Le gabarit HTML des courriers (couche 6, apparence seule) : une carte centrée, un titre, le
// message, un bouton, l'adresse recopiée en texte et une note, comme le courrier de Docs et celui
// de la v1. Un seul lien cliquable (le bouton : une passerelle de sécurité se méfie des courriers à
// plusieurs liens vers le même jeton, ADR 0010). Les textes arrivent traduits. Styles en ligne :
// les messageries ne lisent pas les feuilles de style (`reglagesCourrier.js`).
import { COURRIER as C } from './reglagesCourrier.js'

const echapper = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/**
 * @param {{ langue?: string, titre: string, intro: string, libelleLien: string, lien: string,
 *   copier: string, apres: string, marque: string }} o
 * @returns {string}
 */
export function htmlDuCourrier({ langue = 'fr', titre, intro, libelleLien, lien, copier, apres, marque }) {
  return `<!doctype html>
<html lang="${echapper(langue)}"><body style="${C.page}">
<div style="${C.carte}">
<p style="${C.titre}">${echapper(titre)}</p>
<p style="${C.intro}">${echapper(intro)}</p>
<p style="${C.paragrapheBouton}"><a href="${echapper(lien)}" style="${C.bouton}">${echapper(libelleLien)}</a></p>
<p style="${C.copier}">${echapper(copier)}</p>
<p style="${C.adresse}">${echapper(lien)}</p>
<hr style="${C.trait}">
<p style="${C.apres}">${echapper(apres)}</p>
</div>
<p style="${C.marque}">${echapper(marque)}</p>
</body></html>`
}
