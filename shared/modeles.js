// Les modèles de mise en page (01/10/2026) — la partie **commune au client
// et au serveur** : les modèles livrés avec l'application, et quelques
// fonctions pures (libellé d'un format, nombre d'écarts d'un document).
//
// Un modèle est une feuille de style nommée (voir shared/style.js), pas
// autre chose : le format de page, les marges et la typographie y vivent
// ensemble (décision de Sylvain, 01/10/2026). Trois portées :
//
//  - **livré**    : défini ici, dans le code. Immuable : on le duplique pour
//    partir de lui. C'est ce qui rend la fonction utile dès le premier jour.
//  - **instance** : créé par un administrateur, visible de tous. Le modèle
//    « Par défaut » en est un cas particulier : c'est le style par défaut de
//    l'instance (`data/style.json`), celui que la page `#/style` réglait.
//  - **perso**    : créé par une personne, visible d'elle seule.
//
// Les modèles livrés ne portent que leurs **écarts aux valeurs du code**,
// comme tout calque (voir `fusionner`). Ils sont donc autonomes : le style
// par défaut de l'instance ne s'y mêle pas — un administrateur qui met sa
// police maison dans « Par défaut » ne change pas « Manuscrit ».
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
    id: 'manuscrit',
    nom: 'Manuscrit',
    description: 'La page de relecture : empattement, corps 12, interligne 1,5, retrait de première ligne, pages numérotées.',
    style: {
      page: {
        size: 'A4',
        marginTop: 25,
        marginRight: 25,
        marginBottom: 25,
        marginLeft: 25,
        pageNumbers: { enabled: true, startAt: 1 },
      },
      blocs: {
        body: { font: 'times', size: 12, lineHeight: 1.5, spaceAfter: 0, firstLineIndent: 12 },
        quote: { font: 'times', size: 11, lineHeight: 1.15, indent: 15, spaceBefore: 6, spaceAfter: 6 },
        h1: { font: 'times', size: 16, align: 'center', spaceBefore: 24, spaceAfter: 12 },
        h2: { font: 'times', size: 14, spaceBefore: 18, spaceAfter: 6 },
        h3: { font: 'times', size: 12, italic: true, spaceBefore: 12, spaceAfter: 6 },
      },
    },
  },
  {
    id: 'livre',
    nom: 'Livre',
    description: 'Un livre au petit format : justifié, corps 10,5, retrait de première ligne, titres centrés, pages numérotées.',
    style: {
      page: {
        size: 'A5',
        marginTop: 20,
        marginRight: 18,
        marginBottom: 22,
        marginLeft: 18,
        pageNumbers: { enabled: true, startAt: 1 },
      },
      blocs: {
        body: { font: 'libre-caslon-text', size: 10.5, align: 'justify', lineHeight: 1.15, spaceAfter: 0, firstLineIndent: 5 },
        quote: { font: 'libre-caslon-text', size: 10, align: 'justify', indent: 8, spaceBefore: 4, spaceAfter: 4 },
        h1: { font: 'libre-caslon-text', size: 20, align: 'center', spaceBefore: 36, spaceAfter: 18 },
        h2: { font: 'libre-caslon-text', size: 14, align: 'center', spaceBefore: 18, spaceAfter: 8 },
        h3: { font: 'libre-caslon-text', size: 11, italic: true, align: 'center', spaceBefore: 12, spaceAfter: 6 },
      },
    },
  },
  {
    id: 'note',
    nom: 'Note',
    description: 'Une note ou un rapport court : sans empattement, titres marqués, pas de retrait, un espace entre paragraphes.',
    style: {
      page: {
        size: 'A4',
        marginTop: 20,
        marginRight: 20,
        marginBottom: 20,
        marginLeft: 20,
      },
      blocs: {
        body: { font: 'arial', size: 10.5, spaceAfter: 7 },
        quote: { font: 'arial', size: 10, indent: 8, spaceAfter: 7 },
        h1: { font: 'arial', size: 20, spaceBefore: 18, spaceAfter: 8 },
        h2: { font: 'arial', size: 15, spaceBefore: 14, spaceAfter: 6 },
        h3: { font: 'arial', size: 12, uppercase: true, spaceBefore: 12, spaceAfter: 4 },
      },
    },
  },
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
