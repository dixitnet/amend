// Modèle de la feuille de style — **partagé par le client et le serveur**.
//
// Jusqu'ici, `DEFAULT_STYLE` était recopié à la main dans
// `client/src/styleConfig.js` et dans `server/storage.js`, et ajouter un
// seul réglage demandait de toucher six endroits : les deux copies, la
// fusion, le CSS d'impression, l'export Word et le formulaire. C'est
// exactement ce qui rend une mise en page difficile à faire évoluer — or
// elle va évoluer.
//
// D'où le parti pris de ce fichier : **la liste des blocs et la liste des
// propriétés sont des données, pas du code**. Ajouter « retrait de
// première ligne », un sixième niveau de titre ou un bloc « légende » se
// fait en ajoutant une ligne ici. Le formulaire de réglage, le CSS, le
// .docx et le gabarit Typst se déduisent tous de ces deux tableaux, et ne
// connaissent aucun nom de propriété en dur.
//
// Un seul fichier, importé des deux côtés (`server/` par chemin relatif,
// `client/` via Vite) : plus de copie à tenir synchrone.

/** Version du format. Incrémentée quand la forme change ; `migrer()`
 * ci-dessous remonte les anciens enregistrements. */
export const VERSION_STYLE = 2

// --- Listes fermées -------------------------------------------------------

// Liste fermée plutôt que texte libre : garantit que l'export rend avec la
// police réglée ici, quelle que soit la machine qui ouvrira le fichier.
// `docx` : le nom unique à demander à Word (pas de notion de pile de
// replis). `typst` : le nom de la famille pour le rendu PDF.
/** Les polices proposées dans le panneau de mise en page.
 *
 * `typst` est une **liste de repli**, pas un nom unique (18/09/2026), et
 * c'est ce qui manquait. Typst remplace en silence une famille qu'il ne
 * trouve pas : il n'embarque que Libertinus Serif, New Computer Modern et
 * DejaVu Sans **Mono** — pas DejaVu Sans, pas Roboto, pas Libre Caslon.
 * Sur un serveur sans polices installées, choisir « Système (sans-serif) »
 * donnait donc un PDF en serif, sans un mot d'avertissement. C'est la cause
 * la plus probable des écarts constatés entre le panneau et la sortie.
 *
 * Une liste laisse Typst prendre la première famille réellement présente.
 * Les noms sont ordonnés du plus fidèle au plus sûr, et se terminent
 * toujours par une famille embarquée : au pire, on sait ce qu'on obtient.
 * Reste à installer les polices sur le serveur (voir
 * claude/serveur-production-collabtext.md) pour que le premier nom gagne. */
export const POLICES = [
  { id: 'system', label: 'Système (sans-serif)', css: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif', docx: undefined,
    typst: ['DejaVu Sans', 'Liberation Sans', 'Helvetica', 'Arial', 'New Computer Modern Sans', 'Libertinus Serif'] },
  { id: 'serif', label: 'Serif (Georgia)', css: 'Georgia, "Times New Roman", serif', docx: 'Georgia',
    typst: ['Georgia', 'Libertinus Serif'] },
  { id: 'times', label: 'Times New Roman', css: '"Times New Roman", Times, serif', docx: 'Times New Roman',
    typst: ['Times New Roman', 'Liberation Serif', 'Libertinus Serif'] },
  { id: 'arial', label: 'Arial', css: 'Arial, Helvetica, sans-serif', docx: 'Arial',
    typst: ['Arial', 'Liberation Sans', 'Helvetica', 'DejaVu Sans', 'Libertinus Serif'] },
  { id: 'mono', label: 'Monospace', css: '"Courier New", Courier, monospace', docx: 'Courier New',
    typst: ['DejaVu Sans Mono', 'Liberation Mono', 'Courier New'] },
  { id: 'roboto', label: 'Roboto', css: '"Roboto", -apple-system, sans-serif', docx: 'Roboto',
    typst: ['Roboto', 'DejaVu Sans', 'Liberation Sans', 'Libertinus Serif'] },
  { id: 'libre-caslon-text', label: 'Libre Caslon Text', css: '"Libre Caslon Text", Georgia, serif', docx: 'Libre Caslon Text',
    typst: ['Libre Caslon Text', 'Libertinus Serif'] },
]

/** Toutes les familles nommées quelque part, pour que le serveur puisse
 * dire au démarrage lesquelles manquent (voir server/typst.js). */
export function famillesTypst() {
  return [...new Set(POLICES.flatMap((p) => p.typst))]
}

export const ALIGNEMENTS = [
  { id: 'left', label: 'Gauche' },
  { id: 'center', label: 'Centré' },
  { id: 'right', label: 'Droite' },
  { id: 'justify', label: 'Justifié' },
]

export const INTERLIGNES = [
  { id: 1, label: 'Simple' },
  { id: 1.15, label: '1,15' },
  { id: 1.5, label: '1,5' },
  { id: 2, label: 'Double' },
]

/** La langue du document. Elle ne change rien à l'interface : elle décide
 * des **motifs de césure** et de la forme des guillemets à la composition.
 * Un texte anglais composé en français se coupe aux mauvais endroits — et
 * jusqu'au 19/09/2026 le gabarit d'export écrivait « fr » en dur, quoi
 * qu'il arrive. Deux langues seulement pour l'instant, c'est ce dont on a
 * besoin ; en ajouter une est une ligne. */
export const LANGUES = [
  { id: 'fr', label: 'Français', docx: 'fr-FR' },
  { id: 'en', label: 'English', docx: 'en-GB' },
]

export function langue(id) {
  return LANGUES.find((l) => l.id === id) || LANGUES[0]
}

/** Les formats de page proposés (01/10/2026) : A4, A5, et un format libre.
 * Décision de Sylvain — pas de catalogue plus large pour l'instant ; le
 * format libre couvre le reste. `mm` est la page **en portrait** ; pour
 * « personnalisé » il vaut `null`, les dimensions sont alors `largeur` et
 * `hauteur` de la page, telles qu'écrites (pas d'orientation à choisir :
 * 210 × 148 *est* un paysage). */
export const FORMATS_PAGE = [
  { id: 'A4', label: 'A4', mm: [210, 297] },
  { id: 'A5', label: 'A5', mm: [148, 210] },
  { id: 'personnalise', label: 'Personnalisé…', mm: null },
]

/** Valeurs encore lues mais plus proposées : Letter a été retiré de la
 * liste le 01/10/2026. Un document qui l'a déjà continue de s'exporter en
 * Letter — le retirer d'ici le ferait retomber en A4 sans prévenir. */
export const FORMATS_ANCIENS = [{ id: 'Letter', label: 'Letter (US) — ancien', mm: [215.9, 279.4] }]

export const ORIENTATIONS = [
  { id: 'portrait', label: 'Portrait' },
  { id: 'paysage', label: 'Paysage' },
]

/** Bornes d'un côté de page libre, en mm : de la fiche cartonnée au
 * demi-A2. Au-dessous, la composition n'a plus de sens ; au-dessus, le PDF
 * n'a plus d'imprimante. */
export const BORNES_FORMAT = { min: 80, max: 450 }

/** Largeur utile minimale entre les marges, en mm. Un format étroit avec de
 * grandes marges ne laisserait plus de place pour une ligne de texte, et
 * Typst comme Word refusent alors de composer. */
export const UTILE_MIN = 40

// --- Propriétés d'un bloc -------------------------------------------------

/** Les réglages qu'un bloc peut porter. `type` suffit au formulaire pour
 * savoir quel contrôle afficher, et aux exports pour savoir quoi en faire.
 * Ajouter un réglage = ajouter une entrée ici, plus une valeur par défaut
 * dans les blocs concernés ci-dessous. */
export const PROPRIETES = [
  { id: 'font', label: 'Police', type: 'choix', options: POLICES },
  { id: 'size', label: 'Taille', type: 'nombre', unite: 'pt', min: 5, max: 96, pas: 0.5 },
  { id: 'bold', label: 'Gras', type: 'booleen' },
  { id: 'italic', label: 'Italique', type: 'booleen' },
  { id: 'uppercase', label: 'Majuscules', type: 'booleen' },
  { id: 'align', label: 'Alignement', type: 'choix', options: ALIGNEMENTS },
  { id: 'lineHeight', label: 'Interligne', type: 'choix', options: INTERLIGNES },
  { id: 'spaceBefore', label: 'Espace avant', type: 'nombre', unite: 'pt', min: 0, max: 120, pas: 1 },
  { id: 'spaceAfter', label: 'Espace après', type: 'nombre', unite: 'pt', min: 0, max: 120, pas: 1 },
  // Ajouté le 16/09/2026 à la demande de Sylvain — et premier test du
  // modèle déclaratif : cette seule ligne, plus une valeur par défaut sur
  // le bloc « corps », suffit à le faire exister partout.
  { id: 'firstLineIndent', label: 'Retrait de 1re ligne', type: 'nombre', unite: 'mm', min: 0, max: 50, pas: 0.5 },
  // Retrait du bloc entier, à gauche (19/09/2026) — demandé pour la
  // citation, qui se distingue traditionnellement par sa marge et non par
  // un retrait de première ligne. Disponible sur tous les blocs : rien ne
  // justifierait de le réserver à un seul.
  { id: 'indent', label: 'Retrait à gauche', type: 'nombre', unite: 'mm', min: 0, max: 100, pas: 0.5 },
]

const PAR_ID = Object.fromEntries(PROPRIETES.map((p) => [p.id, p]))

export function propriete(id) {
  return PAR_ID[id]
}

// --- Blocs ----------------------------------------------------------------

/** Les blocs de texte réglables. Chaque niveau de titre a désormais **ses
 * propres réglages complets** (16/09/2026) : auparavant les cinq niveaux
 * partageaient une seule définition et ne différaient que par la taille,
 * ce qui interdisait par exemple un H1 centré et sans gras au-dessus de H2
 * alignés à gauche.
 *
 * `balise` sert au CSS d'impression, `docxHeading` à l'export Word (index
 * du niveau, `null` pour un paragraphe ordinaire). Les valeurs par défaut
 * reproduisent exactement le rendu d'avant la refonte : personne ne doit
 * voir son document changer d'aspect à la mise à jour. */
export const BLOCS = [
  {
    id: 'body',
    label: 'Texte courant',
    balise: 'p',
    docxHeading: null,
    defauts: { font: 'system', size: 11, bold: false, italic: false, uppercase: false, align: 'left', lineHeight: 1.15, spaceBefore: 0, spaceAfter: 8, firstLineIndent: 0, indent: 0 },
  },
  {
    id: 'quote',
    label: 'Citation',
    balise: 'blockquote',
    docxHeading: null,
    // Aligné sur le texte courant depuis le 13/09/2026 — décision conservée,
    // mais devenue modifiable puisque la citation a maintenant son bloc.
    // Retrait de 10 mm par défaut (19/09/2026) : c'est ce qui fait *lire*
    // une citation comme une citation, sans italique ni guillemets ajoutés.
    defauts: { font: 'system', size: 11, bold: false, italic: false, uppercase: false, align: 'left', lineHeight: 1.15, spaceBefore: 0, spaceAfter: 8, firstLineIndent: 0, indent: 10 },
  },
  // **Trois niveaux, pas cinq** (18/09/2026). Cinq niveaux de titre, c'est
  // une table des matières qu'on ne lit plus et un panneau de mise en page
  // qui déroule soixante-dix réglages. Le document de test le disait déjà à
  // sa façon : ses 204 titres de niveaux 4 et 5 n'étaient pas des titres
  // mais des citations (voir claude/proto-export-pdf-typst-pagedjs.md, §5).
  // Tout ce qui dérive des niveaux — formulaire, CSS, exports, plan du
  // document — se déduit de ce tableau : il n'y a que cette ligne à
  // changer si l'on veut revenir en arrière.
  ...[24, 20, 17].map((taille, i) => ({
    id: `h${i + 1}`,
    label: `Titre ${i + 1}`,
    balise: `h${i + 1}`,
    docxHeading: i,
    defauts: { font: 'system', size: taille, bold: true, italic: false, uppercase: false, align: 'left', lineHeight: 1.15, spaceBefore: 16, spaceAfter: 8, firstLineIndent: 0, indent: 0 },
  })),
]

/** Le nombre de niveaux de titre. Déduit de BLOCS, jamais écrit deux
 * fois : les sérialiseurs et le schéma s'y réfèrent pour borner ce qu'ils
 * acceptent. */
export const NIVEAUX_TITRE = BLOCS.filter((b) => b.docxHeading !== null).length

export const PAGE_DEFAUT = {
  size: 'A4',
  // Portrait ou paysage, pour les formats nommés (01/10/2026). Un format
  // personnalisé porte directement ses deux côtés.
  orientation: 'portrait',
  largeur: 148,
  hauteur: 210,
  // Langue du document — césures et guillemets, pas l'interface.
  langue: 'fr',
  marginTop: 25,
  marginRight: 20,
  marginBottom: 25,
  marginLeft: 20,
  // Numérotation : export PDF seulement — aucun sens dans un éditeur en
  // défilement continu.
  pageNumbers: { enabled: false, startAt: 1 },
  // Mise en page des titres (19/09/2026), export seulement — l'éditeur est
  // un défilement continu, il n'a pas de bas de page.
  //
  // `titresSolidaires` empêche un titre de rester seul en bas d'une page,
  // séparé du texte qu'il annonce : il part à la page suivante avec lui.
  // Activé par défaut, parce que l'inverse est un défaut de composition,
  // jamais un choix.
  titresSolidaires: true,
  // `titre1PageImpaire` ouvre chaque titre de niveau 1 sur une belle page
  // (page de droite dans un livre), en insérant au besoin une page blanche.
  // À l'inverse du précédent, c'est une convention d'ouvrage : désactivé
  // par défaut.
  titre1PageImpaire: false,
  // En-têtes de page (20/09/2026). Deux côtés indépendants — pages de
  // gauche (paires) et de droite (impaires) — parce que c'est la seule
  // distinction qui compte dans un document relié ; toujours centrés,
  // parce que trois emplacements par bandeau, c'est six listes déroulantes
  // pour un besoin qui n'en demande pas tant.
  //
  // `type` vaut 'rien', 'texte' (le champ `texte` à côté) ou 'titre' (le
  // dernier titre de niveau 1 rencontré — le titre courant).
  //
  // `sautOuverture` laisse nue toute page **portant** un titre 1, et non
  // seulement celles qui commencent par lui : quand un titre 1 tombe au
  // milieu d'une page, l'en-tête nommerait le chapitre précédent alors que
  // le suivant a commencé. Le supprimer est plus sûr, et la distinction
  // disparaît dès que `titre1PageImpaire` est actif.
  entete: {
    gauche: { type: 'rien', texte: '' },
    droite: { type: 'rien', texte: '' },
    sautOuverture: true,
  },
}

/** Ce qu'un en-tête peut porter. */
export const CONTENUS_ENTETE = [
  { id: 'rien', label: 'Rien' },
  { id: 'texte', label: 'Texte libre' },
  { id: 'titre', label: 'Titre 1 courant' },
]

// --- Fabrication et fusion ------------------------------------------------

/** Vrai pour un réglage de page qui en contient d'autres (`pageNumbers`,
 * `entete`). Les traiter par leur **forme** plutôt que par leur nom évite
 * d'ajouter un cas particulier à la fusion à chaque réglage composé. */
function estGroupe(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** Copie d'un réglage de page, sous-groupes compris — sur deux niveaux, ce
 * qui suffit au modèle et évite une récursion générale dont personne n'a
 * besoin. */
function copiePage(page) {
  const out = {}
  for (const [k, v] of Object.entries(page)) {
    if (!estGroupe(v)) {
      out[k] = v
      continue
    }
    out[k] = {}
    for (const [k2, v2] of Object.entries(v)) out[k][k2] = estGroupe(v2) ? { ...v2 } : v2
  }
  return out
}

/** La feuille de style complète, telle que le code la définit. */
export function styleParDefaut() {
  const blocs = {}
  for (const b of BLOCS) blocs[b.id] = { ...b.defauts }
  return { version: VERSION_STYLE, page: copiePage(PAGE_DEFAUT), blocs }
}

/** Empile des couches partielles par-dessus les valeurs par défaut, de la
 * plus générale à la plus précise : code, puis instance, puis document.
 * Une couche ne porte que ce qu'elle change — et une propriété apparue
 * après l'enregistrement d'une couche reprend simplement sa valeur par
 * défaut, au lieu de faire disparaître tout le bloc. C'est ce qui permet
 * d'ajouter un réglage sans migration. */
export function fusionner(...couches) {
  const out = styleParDefaut()
  for (const couche of couches) {
    if (!couche || typeof couche !== 'object') continue
    // On reconnaît le format à sa forme, pas à un numéro : les anciens
    // `style.json` n'ont pas de champ `version`, et une couche partielle
    // du format actuel peut très bien n'en porter aucun non plus.
    const c = estAncienFormat(couche) ? migrer(couche) : couche
    if (c.page) {
      for (const [k, v] of Object.entries(c.page)) {
        if (estGroupe(out.page[k])) {
          // Un groupe se complète, il ne se remplace pas : une couche qui
          // ne porte qu'un seul de ses réglages ne doit pas effacer les
          // autres.
          const fusion = { ...out.page[k] }
          for (const [k2, v2] of Object.entries(v || {})) {
            fusion[k2] = estGroupe(fusion[k2]) ? { ...fusion[k2], ...(v2 || {}) } : v2
          }
          out.page[k] = fusion
        } else {
          out.page[k] = v
        }
      }
    }
    if (c.blocs) {
      for (const b of BLOCS) {
        if (c.blocs[b.id]) out.blocs[b.id] = { ...out.blocs[b.id], ...c.blocs[b.id] }
      }
    }
  }
  return out
}

/** Ne garde d'une feuille de style que ce qui s'écarte des valeurs par
 * défaut. C'est ce qu'on enregistre : un document ne fige que ses propres
 * choix, et hérite du reste — donc une valeur par défaut qui change plus
 * tard profite à tout le monde sauf à ceux qui l'ont explicitement
 * changée.
 *
 * `instance` (feuille complète de l'instance) : à passer pour un
 * **document**. Une valeur est alors gardée si elle s'écarte du défaut du
 * code **ou** de l'instance. Sans ce second cas, un réglage ramené à sa
 * valeur codée en dur alors que l'instance en a une autre — page A4 quand
 * l'instance est en A5 — ne différait de rien, disparaissait du fichier,
 * et le document retombait silencieusement sur l'instance à la relecture.
 * Signalé en production le 26/09/2026 : « le passage en A4 ne
 * s'enregistre pas ». On ne compare pas **seulement** à l'instance : le
 * document cesserait de figer ce qu'il en a hérité, et un changement
 * ultérieur de l'instance refluerait sur lui.
 *
 * Deux régimes, donc. Un document **sans modèle choisi** (« Par défaut »)
 * garde le comportement ci-dessus : dès qu'on y touche, il fige ce qu'il
 * tient de l'instance. Un document **avec un modèle choisi** (01/10/2026)
 * passe `{ seulement: true }` : il ne garde que ce qui diffère de son
 * modèle, et suit le reste quand le modèle change — c'est ce que « Basé sur
 * Livre, 2 réglages propres » promet. */
export function reduire(style, instance = null, { seulement = false } = {}) {
  const base = styleParDefaut()
  // `seulement` (01/10/2026) : ne comparer **qu'à** `instance`, pas au code
  // en plus. C'est l'écart pur au modèle d'un document : une valeur qui
  // égale celle du modèle n'est pas enregistrée, et suit donc le modèle
  // quand il change — là où la comparaison double ci-dessus fige tout ce
  // que le document tient de l'instance (comportement conservé pour les
  // documents sur « Par défaut »).
  const bases = instance ? (seulement ? [instance] : [base, instance]) : [base]
  // Vrai si `v` s'écarte d'au moins une base, lue par `lire`.
  const ecarte = (v, lire) => bases.some((b) => lire(b) !== v)
  const out = { version: VERSION_STYLE }
  const page = {}
  for (const [k, v] of Object.entries(style.page || {})) {
    if (estGroupe(base.page[k])) {
      const diff = {}
      for (const [k2, v2] of Object.entries(v || {})) {
        if (estGroupe(base.page[k][k2])) {
          const d2 = {}
          for (const [k3, v3] of Object.entries(v2 || {})) {
            if (ecarte(v3, (b) => b.page?.[k]?.[k2]?.[k3])) d2[k3] = v3
          }
          // Un sous-groupe se note entier dès qu'il diffère : un en-tête
          // « texte libre » sans son texte ne veut rien dire.
          if (Object.keys(d2).length) diff[k2] = { ...base.page[k][k2], ...v2 }
        } else if (ecarte(v2, (b) => b.page?.[k]?.[k2])) diff[k2] = v2
      }
      if (Object.keys(diff).length) page[k] = diff
    } else if (ecarte(v, (b) => b.page?.[k])) page[k] = v
  }
  if (Object.keys(page).length) out.page = page
  const blocs = {}
  for (const bl of BLOCS) {
    const courant = (style.blocs || {})[bl.id]
    if (!courant) continue
    const diff = {}
    for (const [k, v] of Object.entries(courant)) {
      if (ecarte(v, (b) => b.blocs?.[bl.id]?.[k])) diff[k] = v
    }
    if (Object.keys(diff).length) blocs[bl.id] = diff
  }
  if (Object.keys(blocs).length) out.blocs = blocs
  return out
}

/** Remonte un enregistrement de l'ancien format (un bloc `body`, un bloc
 * `heading` unique portant un tableau `sizes` de cinq tailles) vers le
 * format actuel, où chaque niveau de titre est un bloc à part entière. Les
 * anciens fichiers `style.json` n'ont pas de champ `version`. */
export function estAncienFormat(couche) {
  if (!couche || typeof couche !== 'object') return false
  if (couche.blocs) return false
  return !!(couche.body || couche.heading)
}

export function migrer(ancien) {
  if (!ancien || typeof ancien !== 'object') return {}
  if (!estAncienFormat(ancien)) return ancien
  const out = { version: VERSION_STYLE, blocs: {} }
  if (ancien.page) out.page = ancien.page
  if (ancien.body) {
    out.blocs.body = { ...ancien.body }
    // La citation partageait la règle du corps de texte : elle en hérite.
    out.blocs.quote = { ...ancien.body }
  }
  if (ancien.heading) {
    const { sizes, ...commun } = ancien.heading
    // L'ancien format portait cinq tailles ; il n'y a plus que trois
    // niveaux (18/09). Les deux dernières sont simplement ignorées — un
    // document qui s'en servait a ses titres ramenés au niveau 3, ce que
    // fait aussi le schéma à la lecture.
    const tailles = Array.isArray(sizes) && sizes.length >= 3 ? sizes : [24, 20, 17]
    for (let i = 0; i < NIVEAUX_TITRE; i++) out.blocs[`h${i + 1}`] = { ...commun, size: tailles[i] }
  }
  return out
}

// --- Petits accès ---------------------------------------------------------

export function police(id) {
  return POLICES.find((f) => f.id === id) || POLICES[0]
}

export function formatPage(id) {
  return FORMATS_PAGE.find((f) => f.id === id) || FORMATS_ANCIENS.find((f) => f.id === id) || FORMATS_PAGE[0]
}

function borner(valeur, defaut, min, max) {
  const n = Number(valeur)
  if (!Number.isFinite(n)) return defaut
  return Math.min(max, Math.max(min, Math.round(n * 10) / 10))
}

/** `[largeur, hauteur]` de la page en mm, orientation comprise — **la seule
 * fonction que les exports (Typst, Word, CSS) appellent pour savoir la
 * taille d'une page**. Ne lève jamais : une valeur absente ou hors bornes
 * retombe sur une valeur utilisable. */
export function dimensionsPage(page) {
  const p = page || {}
  const f = formatPage(p.size)
  if (f.id === 'personnalise') {
    return [
      borner(p.largeur, PAGE_DEFAUT.largeur, BORNES_FORMAT.min, BORNES_FORMAT.max),
      borner(p.hauteur, PAGE_DEFAUT.hauteur, BORNES_FORMAT.min, BORNES_FORMAT.max),
    ]
  }
  const [l, h] = f.mm
  return p.orientation === 'paysage' ? [h, l] : [l, h]
}

// --- Assainissement -------------------------------------------------------

/** Remet une feuille de style **complète** dans le domaine de ce que le
 * modèle sait rendre : listes fermées respectées, nombres dans leurs
 * bornes, booléens booléens. Appelé par le serveur à chaque écriture
 * (document, instance, modèle) — jamais pour rejeter, toujours pour
 * ramener : une valeur invalide reprend sa valeur par défaut.
 *
 * Pourquoi maintenant : un modèle est partagé (celui de l'instance touche
 * tout le monde), et une marge `"abc"` ou un côté de page à 0 ferait
 * échouer l'export de chacun de ceux qui l'utilisent, avec un message
 * d'erreur de Typst à la clé. Aucun texte libre n'entre dans la feuille de
 * style à part le texte d'un en-tête, borné ici. */
export function assainir(style) {
  const base = styleParDefaut()
  const complet = fusionner(style)
  const p = complet.page

  const nombre = (v, defaut, min, max) => borner(v, defaut, min, max)
  const dans = (liste, v, defaut) => (liste.some((x) => String(x.id) === String(v)) ? v : defaut)
  const booleen = (v, defaut) => (typeof v === 'boolean' ? v : defaut)

  const page = {
    ...p,
    size: dans([...FORMATS_PAGE, ...FORMATS_ANCIENS], p.size, base.page.size),
    orientation: dans(ORIENTATIONS, p.orientation, base.page.orientation),
    largeur: nombre(p.largeur, base.page.largeur, BORNES_FORMAT.min, BORNES_FORMAT.max),
    hauteur: nombre(p.hauteur, base.page.hauteur, BORNES_FORMAT.min, BORNES_FORMAT.max),
    langue: dans(LANGUES, p.langue, base.page.langue),
    titresSolidaires: booleen(p.titresSolidaires, base.page.titresSolidaires),
    titre1PageImpaire: booleen(p.titre1PageImpaire, base.page.titre1PageImpaire),
  }
  for (const cle of ['marginTop', 'marginRight', 'marginBottom', 'marginLeft']) {
    page[cle] = nombre(p[cle], base.page[cle], 0, 100)
  }
  // Les marges ne mangent jamais la page : si elles laissent moins de
  // UTILE_MIN, on les réduit **proportionnellement**.
  const [l, h] = dimensionsPage(page)
  const serrer = (a, b, cote) => {
    const total = page[a] + page[b]
    const permis = Math.max(0, cote - UTILE_MIN)
    if (total > permis && total > 0) {
      const k = permis / total
      page[a] = Math.floor(page[a] * k * 10) / 10
      page[b] = Math.floor(page[b] * k * 10) / 10
    }
  }
  serrer('marginLeft', 'marginRight', l)
  serrer('marginTop', 'marginBottom', h)

  const pn = p.pageNumbers || base.page.pageNumbers
  page.pageNumbers = {
    enabled: booleen(pn.enabled, false),
    startAt: Math.round(nombre(pn.startAt, 1, 1, 9999)),
  }
  const en = p.entete || base.page.entete
  const cote = (c) => ({
    type: dans(CONTENUS_ENTETE, c && c.type, 'rien'),
    texte: typeof (c && c.texte) === 'string' ? c.texte.slice(0, 200) : '',
  })
  page.entete = {
    gauche: cote(en.gauche),
    droite: cote(en.droite),
    sautOuverture: booleen(en.sautOuverture, true),
  }

  const blocs = {}
  for (const b of BLOCS) {
    const v = complet.blocs[b.id] || {}
    const out = {}
    for (const prop of PROPRIETES) {
      const defaut = b.defauts[prop.id]
      const valeur = v[prop.id]
      if (prop.type === 'choix') {
        const ok = prop.options.find((o) => String(o.id) === String(valeur))
        out[prop.id] = ok ? ok.id : defaut
      } else if (prop.type === 'booleen') out[prop.id] = booleen(valeur, defaut)
      else out[prop.id] = nombre(valeur, defaut, prop.min, prop.max)
    }
    blocs[b.id] = out
  }
  return { version: VERSION_STYLE, page, blocs }
}

export function bloc(id) {
  return BLOCS.find((b) => b.id === id)
}
