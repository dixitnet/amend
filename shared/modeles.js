// Les modèles de mise en page (01/10/2026) — la partie **commune au client
// et au serveur** : les modèles livrés avec l'application, et quelques
// fonctions pures (libellé d'un format, nombre d'écarts d'un document).
//
// Un modèle est une feuille de style nommée (voir shared/style.js), pas
// autre chose : le format de page, les marges et la typographie y vivent
// ensemble (décision de Sylvain, 01/10/2026). Trois portées :
//
//  - **livré**    : défini ici, dans le code. Immuable : on le duplique pour
//    partir de lui. « Texte brut » (02/10/2026) : les modèles de goût
//    (Manuscrit, Livre, Note) ont été retirés, chacun se fait à son idée à
//    partir de « Par défaut » ou de « Texte brut ». Depuis le 28/10/2026, des
//    modèles d'imprimeur (KDP, BoD) et celui des P'tits Papiers de dixit.
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

/** La catégorie des modèles qui viennent avec amend.ink : « Par défaut » et
 * « Texte brut ». Réservée : personne ne range un modèle à lui dedans. */
export const CATEGORIE_AMEND = 'amend.ink'

const IDENTIQUE = (taille, extra = {}) => ({ size: taille, ...extra })

/** Un livre imprimé, composé en Libertinus Serif : le corps en points, les
 * titres en proportion. Les marges sont celles de la page (haut, droite, bas,
 * gauche). Les marges miroir sont actives : « gauche » est la marge
 * intérieure (côté reliure), « droite » l'extérieure ; elles sont ici égales
 * (la plus grande des deux), à régler sur épreuve. */
function livreImprime({ largeur, hauteur, corps, marges: [haut, droite, bas, gauche] }) {
  const police = { font: 'serif' }
  return {
    page: {
      size: 'personnalise',
      largeur,
      hauteur,
      marginTop: haut,
      marginRight: droite,
      marginBottom: bas,
      marginLeft: gauche,
      margesMiroir: true,
      pageNumbers: { enabled: true, startAt: 1 },
      debutChapitre: 'droite',
    },
    blocs: {
      body: { ...police, size: corps, align: 'justify', spaceAfter: 0, firstLineIndent: 5 },
      quote: { ...police, size: corps - 0.5, align: 'justify', indent: 8, spaceBefore: 4, spaceAfter: 6 },
      h1: { ...police, size: corps + 10, align: 'center', spaceBefore: 50, spaceAfter: 24 },
      h2: { ...police, size: corps + 4, spaceBefore: 20, spaceAfter: 8 },
      h3: { ...police, size: corps + 1.5, spaceBefore: 14, spaceAfter: 6 },
      title: { ...police, size: corps + 18, align: 'center', spaceBefore: 60, spaceAfter: 12 },
      subtitle: { ...police, size: corps + 3, align: 'center', italic: true, spaceAfter: 20 },
    },
  }
}

const NOTE_MIROIR =
  'Marges miroir, intérieure et extérieure égales au départ (à régler). Valeurs de départ à juger sur un vrai PDF.'

export const MODELES_LIVRES = [
  {
    id: 'texte-brut',
    nom: 'Texte brut',
    categorie: CATEGORIE_AMEND,
    // Le seul qui reste dans le code, fixe : les autres sont copiés dans les
    // modèles de l'instance au démarrage (voir `modeleLivreSemable`).
    fixe: true,
    description:
      'Presque rien : une seule police, des titres à peine plus gras que le texte. Pour un export qui ne doit rien imposer.',
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
  // --- Impression à la demande (28/10/2026) ---
  // KDP France propose 16 tailles de coupe, sans en désigner de plus
  // courante. On retient les deux plus proches des formats français :
  // 13,97 × 21,59 cm (broché usuel 14 × 21) et 15,6 × 23,39 cm (grand
  // format). Marges : 12,7 mm intérieure de 151 à 300 pages, 15,9 mm de 301
  // à 500, 6,4 mm minimum ailleurs (sans fond perdu) ; on prend 16 mm, bon
  // jusqu'à 500 pages.
  {
    id: 'kdp-15-6x23-39',
    nom: '15,6 × 23,39 cm',
    categorie: 'KDP',
    description: `Le format de KDP le plus proche du grand format français courant (15,5 × 23,5 cm environ). Marges sûres jusqu'à 500 pages, sans fond perdu. ${NOTE_MIROIR}`,
    style: livreImprime({ largeur: 156, hauteur: 233.9, corps: 11, marges: [18, 16, 20, 16] }),
  },
  {
    id: 'kdp-5-5x8-5',
    nom: '13,97 × 21,59 cm',
    categorie: 'KDP',
    description: `Le format de KDP le plus proche du broché français usuel (14 × 21 cm). Marges sûres jusqu'à 500 pages, sans fond perdu. ${NOTE_MIROIR}`,
    style: livreImprime({ largeur: 139.7, hauteur: 215.9, corps: 10.5, marges: [17, 16, 19, 16] }),
  },
  // BoD : les formats viennent de son guide de mise en page (2013), qui ne
  // donne aucune marge chiffrée ni de corps conseillé — les valeurs sont les
  // nôtres. Fond perdu de 5 mm.
  {
    id: 'bod-12x19',
    nom: '12 × 19 cm',
    categorie: 'BOD',
    description: `Un des formats de BoD. Le guide de BoD ne donne pas de marges : valeurs de départ à contrôler sur l'épreuve. ${NOTE_MIROIR}`,
    style: livreImprime({ largeur: 120, hauteur: 190, corps: 10, marges: [15, 15, 17, 15] }),
  },
  {
    id: 'bod-13-5x21-5',
    nom: '13,5 × 21,5 cm',
    categorie: 'BOD',
    description: `Un des formats de BoD. Le guide de BoD ne donne pas de marges : valeurs de départ à contrôler sur l'épreuve. ${NOTE_MIROIR}`,
    style: livreImprime({ largeur: 135, hauteur: 215, corps: 10.5, marges: [18, 17, 20, 17] }),
  },
  // Éditions de l'Aube, Terre à terres (29/10/2026) : trois formats à régler
  // sur un exemplaire. Relevés sur les fiches de l'éditeur : grand 140 × 220
  // mm (fiches « En tête »), poche 120 × 180 mm (« Le temps des liens »,
  // l'autre poche relevé fait 108 × 178 mm). Le format moyen n'est décrit
  // nulle part : dimensions provisoires. Marges, corps et police : les nôtres.
  {
    id: 'tat-grand',
    nom: 'TàT grand',
    categorie: 'Aube',
    description: `Terre à terres, grand format (14 × 22 cm d'après les fiches de l'éditeur). Marges et corps de départ, à régler sur un exemplaire. ${NOTE_MIROIR}`,
    style: livreImprime({ largeur: 140, hauteur: 220, corps: 11, marges: [20, 17, 22, 17] }),
  },
  {
    id: 'tat-moyen',
    nom: 'TàT moyen',
    categorie: 'Aube',
    description: `Terre à terres, format moyen. Dimensions provisoires (13 × 20 cm) : l'éditeur ne publie pas ce format, à régler. ${NOTE_MIROIR}`,
    style: livreImprime({ largeur: 130, hauteur: 200, corps: 10.5, marges: [18, 16, 20, 16] }),
  },
  {
    id: 'tat-poche',
    nom: 'TàT poche',
    categorie: 'Aube',
    description: `Terre à terres poche (12 × 18 cm d'après « Le temps des liens » ; un autre titre fait 10,8 × 17,8 cm). Marges et corps de départ, à régler. ${NOTE_MIROIR}`,
    style: livreImprime({ largeur: 120, hauteur: 180, corps: 9.5, marges: [15, 13, 17, 13] }),
  },
  // dixit : le P'tit Papier, une brochure d'une cinquantaine de pages dans
  // l'esprit des Tracts de Gallimard. Provisoire : aucune source n'en donne
  // les dimensions ni la composition (la presse décrit des feuillets A4
  // pliés en deux, soit un A5) ; à régler d'après un exemplaire imprimé.
  {
    id: 'dixit-ptit-papier',
    nom: 'P’tit papier',
    categorie: 'dixit',
    description:
      'Brochure d’une cinquantaine de pages, A5. Provisoire : valeurs de départ à régler d’après un P’tit Papier imprimé.',
    style: {
      page: {
        size: 'A5',
        marginTop: 20,
        marginRight: 20,
        marginBottom: 22,
        marginLeft: 20,
        pageNumbers: { enabled: true, startAt: 1 },
      },
      blocs: {
        body: { font: 'serif', size: 11, align: 'justify', spaceAfter: 6 },
        quote: { font: 'serif', size: 10.5, italic: true, indent: 8, spaceAfter: 6 },
        h1: { font: 'serif', size: 24, spaceBefore: 0, spaceAfter: 14 },
        h2: { font: 'serif', size: 15, spaceBefore: 18, spaceAfter: 6 },
        h3: { font: 'serif', size: 12, spaceBefore: 12, spaceAfter: 4 },
        title: { font: 'serif', size: 32, spaceBefore: 40, spaceAfter: 8 },
        subtitle: { font: 'serif', size: 16, italic: true, spaceAfter: 16 },
      },
    },
  },
]

/** Un modèle livré qui est **copié** dans les modèles de l'instance au
 * premier démarrage qui le connaît (29/10/2026), pour que les administrateurs
 * puissent le régler, le renommer, le supprimer, ou le rétablir tel que le
 * code le livre. Tous, sauf « Texte brut », qui reste la référence fixe de la
 * catégorie amend.ink. Renvoie le modèle livré, ou `null`. */
export function modeleLivreSemable(id) {
  const m = modeleLivre(id)
  return m && !m.fixe ? m : null
}

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

// --- Catégories (28/10/2026) ---------------------------------------------
//
// Un modèle est rangé dans une **catégorie** : un texte court et libre — une
// maison d'édition, un client, un type de document — et se lit « catégorie -
// nom » : « BOD - Livre poche », « dixit - rapport A4 paysage », « Aube -
// petit format ». La catégorie est une étiquette de rangement : elle ne
// règle rien. Depuis le 28/10/2026 elle est **obligatoire** pour tout nouveau
// modèle ; « Par défaut » et « Texte brut » sont rangés dans « amend.ink »,
// catégorie réservée. Seuls les modèles d'avant les catégories peuvent encore
// n'en avoir aucune, jusqu'à ce qu'on les range.

export const CATEGORIE_MAX = 40

// eslint-disable-next-line no-control-regex
const CARACTERES_DE_CONTROLE = /[\u0000-\u001f\u007f]/g

/** Une catégorie propre, ou `null` si elle est invalide : espaces compactés,
 * caractères de contrôle retirés, au plus CATEGORIE_MAX caractères. La
 * chaîne vide est valide : « sans catégorie ». Un nombre ou un objet ne l'est
 * pas. */
export function categorieValide(categorie) {
  if (categorie === undefined || categorie === null) return ''
  if (typeof categorie !== 'string') return null
  const propre = categorie.replace(CARACTERES_DE_CONTROLE, ' ').replace(/\s+/g, ' ').trim()
  return propre.length > CATEGORIE_MAX ? null : propre
}

/** Vrai si cette catégorie est celle d'amend.ink (sans égard à la casse). */
export function categorieReservee(categorie) {
  return cleCategorie(categorie) === cleCategorie(CATEGORIE_AMEND)
}

/** Le nom d'un modèle tel qu'on le lit partout : « catégorie - nom », ou le
 * seul nom s'il n'a pas de catégorie. */
export function libelleModele(modele) {
  const m = modele || {}
  return m.categorie ? `${m.categorie} - ${m.nom}` : m.nom
}

/** Une clé qui ne distingue ni la casse ni les accents : « BOD » et « bod »
 * sont la même catégorie pour le tri et le filtre. */
export function cleCategorie(categorie) {
  return String(categorie || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** L'ordre des modèles : « Par défaut » d'abord, puis ceux sans catégorie
 * (par portée, puis nom), puis chaque catégorie par ordre alphabétique, ses
 * modèles par nom. */
export function comparerModeles(a, b) {
  if (!!a.defaut !== !!b.defaut) return a.defaut ? -1 : 1
  const ca = a.categorie || ''
  const cb = b.categorie || ''
  if (!ca !== !cb) return ca ? 1 : -1
  if (ca) {
    const c = cleCategorie(ca).localeCompare(cleCategorie(cb), 'fr')
    if (c) return c
  } else {
    const p = PORTEES.indexOf(a.portee) - PORTEES.indexOf(b.portee)
    if (p) return p
  }
  const n = a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' })
  if (n) return n
  // Un ordre total, pour que la liste ne dépende pas de l'ordre des fichiers.
  if (ca !== cb) return ca < cb ? -1 : 1
  return String(a.id) < String(b.id) ? -1 : 1
}
