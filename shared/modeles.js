// Les modèles de mise en page (01/10/2026) — la partie **commune au client
// et au serveur** : les modèles livrés avec l'application, et quelques
// fonctions pures (libellé d'un format, nombre d'écarts d'un document).
//
// Un modèle est une feuille de style nommée (voir shared/style.js), pas
// autre chose : le format de page, les marges et la typographie y vivent
// ensemble (décision de Sylvain, 01/10/2026). Trois portées :
//
//  - **livré**    : défini ici, dans le code. Immuable : on le duplique pour
//    partir de lui. Il n'y en a qu'un, « Texte brut » (02/10/2026) : les
//    modèles de goût (Manuscrit, Livre, Note) ont été retirés, chacun se
//    fait à son idée à partir de « Par défaut » ou de « Texte brut ».
//  - **instance** : créé par un administrateur, visible de tous. Le modèle
//    « Par défaut » en est un cas particulier : c'est le style par défaut de
//    l'instance (`data/style.json`), celui que la page `#/style` réglait.
//  - **perso**    : créé par une personne, visible d'elle seule.
//
// Les modèles livrés ne portent que leurs **écarts aux valeurs du code**,
// comme tout calque (voir `fusionner`). Ils sont donc autonomes : le style
// par défaut de l'instance ne s'y mêle pas — un administrateur qui met sa
// police maison dans « Par défaut » ne change pas « Texte brut ».
//
// Ce que les valeurs d'usine ci-dessous valent sur du papier se juge sur un
// vrai PDF, pas sur le papier : elles sont un point de départ raisonnable,
// pas une charte. Les polices sont celles de la liste fermée (shared/style.js)
// que le serveur Typst sait vraiment rendre.

import { FORMATS_PAGE, FORMATS_ANCIENS } from './style.js'

/** Le modèle « Par défaut » : le style par défaut de l'instance. Aussi le
 * repli de tout document dont le modèle n'existe plus. */
export const ID_DEFAUT = 'defaut'
export const NOM_DEFAUT = 'Par défaut'

/** Portées, dans l'ordre où on les range. */
export const PORTEES = ['livre', 'instance', 'perso']

const IDENTIQUE = (taille, extra = {}) => ({ size: taille, ...extra })

export const MODELES_LIVRES = [
  {
    id: 'texte-brut',
    nom: 'Texte brut',
    description: 'Presque rien : une seule police, des titres à peine plus gras que le texte. Pour un export qui ne doit rien imposer.',
    style: {
      page: IDENTIQUE('A4'),
      blocs: {
        body: { font: 'system', size: 11, spaceAfter: 8 },
        quote: { font: 'system', size: 11, indent: 10 },
        h1: { font: 'system', size: 14, spaceBefore: 14, spaceAfter: 6 },
        h2: { font: 'system', size: 12, spaceBefore: 12, spaceAfter: 4 },
        h3: { font: 'system', size: 11, spaceBefore: 10, spaceAfter: 4 },
      },
    },
  },
]

/** Un modèle livré par son identifiant, ou `null`. */
export function modeleLivre(id) {
  return MODELES_LIVRES.find((m) => m.id === id) || null
}

/** Le format d'une feuille de style complète, lisible : « A5 », « A4
 * paysage », « 148 × 210 mm ». C'est ce qui se lit dans la liste des modèles
 * du menu Exporter — le format fait partie du modèle, et on ne l'y devine
 * pas d'après le nom. */
export function libelleFormat(page) {
  const p = page || {}
  const nombre = (v) => String(Math.round(Number(v) * 10) / 10).replace('.', ',')
  if (p.size === 'personnalise') return `${nombre(p.largeur)} × ${nombre(p.hauteur)} mm`
  const f = [...FORMATS_PAGE, ...FORMATS_ANCIENS].find((x) => x.id === p.size)
  const nom = f ? f.id : 'A4'
  return p.orientation === 'paysage' ? `${nom} paysage` : nom
}

/** Combien de réglages propres porte un calque **réduit** (ce qu'un
 * document enregistre) : chaque valeur terminale compte pour un. Sert à dire
 * « 3 réglages propres » — jamais à décider de quoi que ce soit. */
export function compterEcarts(reduit) {
  if (!reduit || typeof reduit !== 'object') return 0
  let n = 0
  const parcourir = (o) => {
    for (const v of Object.values(o)) {
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) parcourir(v)
      else n++
    }
  }
  if (reduit.page) parcourir(reduit.page)
  if (reduit.blocs) for (const b of Object.values(reduit.blocs)) parcourir(b)
  return n
}
