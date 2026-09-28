// Export PDF par Typst — le sérialiseur, côté client.
//
// Pourquoi côté client : le serveur ne détient pas le document ProseMirror,
// seulement des mises à jour Yjs binaires. Le reconstruire là-bas
// demanderait Yjs et y-prosemirror dans un backend qui n'a aujourd'hui
// aucune dépendance de production. Le navigateur, lui, a le document sous
// la main. Il fabrique donc la source Typst et la poste ; le serveur ne
// fait que la compiler dans un bac à sable (server/typst.js).
//
// Ce que ça implique, et qui est assumé : le serveur reçoit du code d'un
// langage de composition, pas des données. Typst ne sait ni ouvrir une
// socket ni lancer un processus, et l'exécution est bornée de trois côtés —
// mémoire, durée, et un dossier racine qui ne contient que ce document.
// Reste la personne, qui est authentifiée et éditrice du document.
//
// Échappement : tout passe par des **appels de fonction** (`#heading[...]`,
// `#strong[...]`) plutôt que par la syntaxe de balisage de Typst. C'est plus
// verbeux, mais ça supprime l'ambiguïté — un paragraphe qui commence par
// « = » ou « - » ne peut pas devenir par accident un titre ou une liste.

import { BLOCS, NIVEAUX_TITRE, police, formatPage, styleParDefaut, langue } from '../../shared/style.js'

// Caractères que Typst interprète en mode contenu. Le backslash d'abord,
// sinon on échapperait ceux qu'on vient d'ajouter.
const SPECIAUX = ['\\', '#', '$', '*', '_', '`', '<', '>', '@', '~', '[', ']', '"', "'"]

function echapper(texte) {
  let out = texte
  for (const c of SPECIAUX) out = out.split(c).join('\\' + c)
  // Deux séquences que Typst lit même en mode contenu (trouvées le
  // 28/09/2026 en compilant un document de pièges) : `//` ouvre un
  // commentaire jusqu'à la fin de la ligne — tout le paragraphe, avec son
  // crochet fermant, donc « unclosed delimiter » ; `--`, `---` et `-?`
  // deviennent tiret demi-cadratin, cadratin et césure conditionnelle. Le
  // PDF doit montrer ce que l'éditeur montre ; les autres exports ne
  // convertissent rien. (`/*` est déjà neutralisé par l'échappement de `*`.)
  return out.replace(/\/(?=\/)/g, '\\/').replace(/-(?=[-?])/g, '\\-')
}

/** Le début d'un morceau de texte, quand il suit une expression Typst.
 *
 * Tout morceau mis en forme devient un appel (`#emph[…]`), comme un retour
 * à la ligne (`#linebreak()`) ou une image. Dans le balisage, Typst
 * **prolonge** une telle expression par ce qui la suit immédiatement : une
 * parenthèse ouvre une nouvelle liste d'arguments, un point suivi d'une
 * lettre un accès de champ. « *ANRU*(Agence nationale…) » devenait donc
 * `#emph[ANRU](Agence nationale…)` — et « error: expected comma », tout le
 * PDF refusé (signalé le 28/09/2026 sur un long texte collé, où l'espace
 * avant la parenthèse disparaît souvent). Vérifié en compilant.
 *
 * On échappe donc ces deux caractères en tête de **chaque** morceau : c'est
 * sans effet visible quand rien ne le précède, et on n'a pas à savoir ce
 * qui le précède. Pas ailleurs : échapper tous les points casserait la
 * conversion de « ... » en « … ».
 *
 * Le point-virgule aussi (28/09) : après une expression, il la termine et
 * Typst l'avale — « #emph[x]; suite » sort « x suite ». */
function protegerDebut(texte) {
  return (
    texte
      .replace(/^\(/, '\\(')
      .replace(/^\.(?=[\p{L}\p{N}_])/u, '\\.')
      .replace(/^;/, '\\;')
      // En tête d'un bloc de contenu `[…]`, Typst lit aussi ses structures
      // de ligne : `= ` un titre (qui déclenche nos règles de titre —
      // « pagebreaks are not allowed inside of containers » quand le
      // titre 1 ouvre sur belle page), `- ` et `+ ` une liste, `/ ` une
      // liste de définitions (« expected colon »), `1. ` une énumération.
      // Un paragraphe qui commence ainsi est courant dans un texte collé.
      .replace(/^[=\-+/]/, (c) => '\\' + c)
      .replace(/^(\d+)\./, '$1\\.')
  )
}

/** Une chaîne littérale Typst (pour les arguments, pas le contenu). */
function chaine(v) {
  return '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

/** Le contenu inline d'un nœud : texte, marques, sauts de ligne, images.
 * Les marques du suivi des modifications ressortent en texte normal — même
 * variante d'export (voir exportVariante.js) : le document reçu ici a déjà
 * eu ses marques de suivi résolues. */
function inline(node) {
  let out = ''
  node.forEach((child) => {
    if (child.type.name === 'hard_break') {
      out += '#linebreak()'
      return
    }
    if (child.type.name === 'image') {
      out += imageTypst(child)
      return
    }
    if (!child.isText) return
    let t = protegerDebut(echapper(child.text))
    for (const mark of child.marks) {
      const n = mark.type.name
      if (n === 'strong') t = `#strong[${t}]`
      else if (n === 'em') t = `#emph[${t}]`
      else if (n === 'underline') t = `#underline[${t}]`
      else if (n === 'strike') t = `#strike[${t}]`
      // insertion / deletion / authorColor : texte normal, voir plus haut.
    }
    out += t
  })
  return out
}

/** Une image. Le nom de fichier seul : le serveur dépose les images du
 * document dans `images/` à côté de la source, et `--root` interdit d'aller
 * voir ailleurs.
 *
 * `disponible` : une variable Typst (pas une valeur JS), définie par
 * l'appelant dans un bloc #context — voir le cas 'image' de blocTypst.
 * Nécessaire parce que Typst refuse de comparer un ratio et une longueur :
 * `calc.min(100%, 600pt)` échoue à la compilation ("cannot compare length
 * and ratio"), trouvé en compilant réellement une source générée avec une
 * image ayant une largeur enregistrée — donc systématiquement, pour toute
 * image collée. `page.width`/`page.margin` ne sont lisibles qu'au moment de
 * la mise en page (d'où #context), jamais à la déclaration. */
function imageTypst(node) {
  const src = String(node.attrs.src || '')
  const nom = src.split('/').pop()
  if (!/^[A-Za-z0-9_-]+\.(png|jpg)$/.test(nom)) return ''
  const largeur = node.attrs.largeur
  const alt = node.attrs.alt ? `, alt: ${chaine(node.attrs.alt)}` : ''
  // Plafonné à la largeur réelle du fichier : une petite capture ne doit
  // pas être étirée jusqu'au flou.
  const taille = largeur ? `, width: calc.min(disponible, ${largeur}pt * 0.75)` : ', width: disponible'
  return `#figure(image(${chaine('images/' + nom)}${taille}${alt}), caption: none)`
}

function listeTypst(node, fonction) {
  const items = []
  node.forEach((item) => {
    let corps = ''
    item.forEach((enfant) => {
      corps += blocTypst(enfant)
    })
    if (node.type.name === 'task_list') {
      // Les caractères eux-mêmes (U+2610, U+2612), pas `sym.ballot.x` : ce
      // nom n'existe plus dans Typst 0.15 (« unknown symbol modifier »), et
      // toute liste de tâches cochée faisait échouer le PDF — trouvé le
      // 28/09/2026 par le test qui compile pour de vrai. Un caractère ne
      // dépend d'aucune version.
      corps = `#box[${item.attrs.checked ? '☒' : '☐'}] ` + (item.attrs.checked ? `#strike[${corps}]` : corps)
    }
    items.push(`[${corps}]`)
  })
  return `#${fonction}(${items.join(', ')})\n\n`
}

function tableauTypst(node) {
  const lignes = []
  let colonnes = 0
  node.forEach((row) => {
    const cellules = []
    row.forEach((cell) => {
      let contenu = ''
      cell.forEach((b) => {
        contenu += inline(b)
      })
      cellules.push(`[${contenu}]`)
    })
    colonnes = Math.max(colonnes, cellules.length)
    lignes.push(cellules.join(', '))
  })
  if (!colonnes) return ''
  return `#table(columns: ${colonnes}, stroke: 0.5pt + luma(150), ${lignes.join(', ')})\n\n`
}

/** Un nœud de bloc. Chaque type de bloc du modèle de style a sa fonction
 * Typst correspondante, définie par le gabarit (`amend-*` plus bas) — le
 * sérialiseur ne connaît aucune taille ni aucune police. */
function blocTypst(node) {
  switch (node.type.name) {
    case 'heading': {
      const niveau = Math.min(NIVEAUX_TITRE, Math.max(1, node.attrs.level))
      return `#heading(level: ${niveau})[${inline(node)}]\n\n`
    }
    case 'paragraph':
      return `#amend-corps[${inline(node)}]\n\n`
    case 'blockquote': {
      let inner = ''
      node.forEach((child) => {
        inner += child.type.name === 'paragraph' ? `#amend-citation[${inline(child)}]\n\n` : blocTypst(child)
      })
      return inner
    }
    case 'bullet_list':
      return listeTypst(node, 'list')
    case 'ordered_list':
      return listeTypst(node, 'enum')
    case 'task_list':
      return listeTypst(node, 'list')
    case 'table':
      return tableauTypst(node)
    case 'image': {
      // #context : voir le commentaire d'imageTypst pour pourquoi
      // `disponible` doit être une longueur déjà résolue, jamais `100%`.
      const fig = imageTypst(node)
      if (!fig) return ''
      // `[${fig}]` : on est en mode code dans #context {...}, et fig
      // commence par `#figure(...)` (mode contenu — c'est aussi ce
      // qu'attend inline() ci-dessus, seul autre appelant). Les crochets
      // rebasculent en mode contenu le temps de cette expression, sans
      // rien changer à ce que renvoie imageTypst.
      return `#context {
  let disponible = page.width - page.margin.left - page.margin.right
  [${fig}]
}

`
    }
    case 'horizontal_rule':
      // Dans amend.ink la ligne horizontale EST un saut de page (voir schema.js).
      return '#pagebreak(weak: true)\n\n'
    case 'table_of_contents': {
      // `title: none` : le bloc ne s'intitule pas lui-même — si l'auteur
      // veut « Sommaire » au-dessus, il l'écrit, comme n'importe quel
      // titre, et il choisit son niveau. Le style vient du texte courant,
      // d'où l'enveloppe `amend-corps`.
      const n = Math.min(NIVEAUX_TITRE, Math.max(1, Number(node.attrs.profondeur) || 2))
      return `#amend-corps[#outline(title: none, depth: ${n}, indent: auto)]\n\n`
    }
    default:
      return ''
  }
}

// --- Le gabarit -----------------------------------------------------------

const PT_PAR_MM = 72 / 25.4

/** Les réglages d'un bloc, traduits en arguments Typst. Engendré depuis le
 * modèle : ajouter une propriété au schéma se traite ici et nulle part
 * ailleurs dans la chaîne PDF. */
function reglagesTypst(v) {
  const f = police(v.font)
  const interligne = `${(Number(v.lineHeight) || 1.15).toFixed(2)}em - 1em + 0.2em`
  return {
    texte: [
      // Une liste, pas un nom : Typst prend la première famille réellement
      // présente sur la machine qui compose. Voir POLICES.
      `font: (${f.typst.map(chaine).join(', ')})`,
      `size: ${v.size}pt`,
      `weight: ${v.bold ? '"bold"' : '"regular"'}`,
      `style: ${v.italic ? '"italic"' : '"normal"'}`,
    ].join(', '),
    par: [
      `justify: ${v.align === 'justify'}`,
      `leading: ${interligne}`,
      // `spacing` REMPLACE l'interligne, il ne s'y ajoute pas : sans le
      // `leading`, un spaceAfter nul ferait se chevaucher les paragraphes.
      `spacing: ${interligne} + ${v.spaceAfter || 0}pt`,
      `first-line-indent: (amount: ${((v.firstLineIndent || 0) * PT_PAR_MM).toFixed(2)}pt, all: true)`,
    ].join(', '),
    align: v.align === 'justify' ? 'left' : v.align || 'left',
    avant: v.spaceBefore || 0,
    apres: v.spaceAfter || 0,
    retrait: (Number(v.indent) || 0) * PT_PAR_MM,
    uppercase: !!v.uppercase,
  }
}

/** Un bloc réglable -> une fonction Typst qui le rend. */
function fonctionBloc(nom, v) {
  const r = reglagesTypst(v)
  let corps = r.uppercase ? 'upper(corps)' : 'corps'
  // Retrait du bloc entier : `pad` est le seul outil de Typst pour ça, et
  // il n'a pas l'inconvénient du `block()` retiré le 19/09 — le retrait de
  // première ligne continue de s'appliquer à l'intérieur (vérifié en
  // compilant). On ne l'écrit pas quand il est nul, pour ne pas envelopper
  // tous les paragraphes du document sans raison.
  if (r.retrait > 0) corps = `pad(left: ${r.retrait.toFixed(2)}pt, ${corps})`
  // Un `v()` **faible de zéro n'est pas rien** : posé entre deux blocs, il
  // écrase l'espacement de paragraphe au lieu de s'y ajouter, et les lignes
  // finissent par se chevaucher. C'est ce qui avait fait disparaître
  // l'espace après les titres (signalé par Sylvain le 19/09). On ne l'écrit
  // donc que s'il vaut quelque chose ; le reste du temps, c'est `par.spacing`
  // qui tient l'espacement, et lui seul.
  const avant = r.avant > 0 ? `\n  v(${r.avant}pt, weak: true)` : ''
  const apres = r.apres > 0 ? `\n  v(${r.apres}pt, weak: true)` : ''
  return `#let ${nom}(corps) = {${avant}
  set text(${r.texte})
  set par(${r.par})
  // Aucun conteneur ici : il sortirait le paragraphe du flux, ce qui annule
  // le retrait de première ligne et l'espacement entre paragraphes.
  set align(${r.align})
  ${corps}${apres}
}`
}

/** Un côté d'en-tête, en source Typst — ou `null` s'il ne porte rien. */
function coteEntete(cote) {
  if (!cote) return null
  if (cote.type === 'texte') {
    const t = String(cote.texte || '').trim()
    return t ? chaine(t) : null
  }
  if (cote.type === 'titre') return 'courant'
  return null
}

/** L'en-tête complet, prêt à être glissé dans le `#set page(...)`. Renvoie
 * une chaîne vide quand les deux côtés sont vides : inutile d'installer un
 * bandeau qui ne dira jamais rien. */
function enteteTypst(p) {
  const e = (p && p.entete) || {}
  const gauche = coteEntete(e.gauche)
  const droite = coteEntete(e.droite)
  if (!gauche && !droite) return ''
  // `sautOuverture` : on regarde s'il existe un titre de niveau 1 **sur**
  // cette page, et pas seulement à son sommet.
  const saut = e.sautOuverture === false ? 'false' : 'true'
  return `
  header: context {
    let ici = here().page()
    let titres = query(heading.where(level: 1))
    let ouverture = titres.filter(t => t.location().page() == ici).len() > 0
    if ${saut} and ouverture {
      none
    } else {
      let avant = titres.filter(t => t.location().page() <= ici)
      let courant = if avant.len() > 0 { avant.last().body } else { none }
      let contenu = if calc.even(ici) { ${gauche || 'none'} } else { ${droite || 'none'} }
      if contenu != none { align(center, contenu) }
    }
  },`
}

/** Le gabarit complet : page, langue, blocs, titres. */
function gabarit(style, titre) {
  const complet = style && style.blocs ? style : styleParDefaut()
  const p = complet.page
  const format = formatPage(p.size)
  const corps = complet.blocs.body

  const fonctions = [
    fonctionBloc('amend-corps', complet.blocs.body),
    fonctionBloc('amend-citation', complet.blocs.quote),
  ]
  // Un `show heading` par niveau : c'est ce qui donne à chaque H ses
  // réglages propres, demandés le 16/09/2026.
  const titres = BLOCS.filter((b) => b.docxHeading !== null).map((b) => {
    const niveau = Number(b.id.slice(1))
    // Belle page pour les titres de niveau 1 : `to: "odd"` insère au
    // besoin une page blanche ; `weak` évite d'en insérer une au tout
    // début du document, quand on y est déjà.
    const saut =
      niveau === 1 && p.titre1PageImpaire ? 'pagebreak(to: "odd", weak: true)\n  ' : ''
    if (saut) {
      return `#show heading.where(level: ${niveau}): it => {\n  ${saut}amend-${b.id}(it.body)\n}`
    }
    return `#show heading.where(level: ${niveau}): it => amend-${b.id}(it.body)`
  })
  const fonctionsTitres = BLOCS.filter((b) => b.docxHeading !== null).map((b) =>
    fonctionBloc(`amend-${b.id}`, complet.blocs[b.id])
  )

  // L'en-tête (20/09/2026). Deux côtés, toujours centrés, et rien du tout
  // sur une page qui porte un titre 1 — voir shared/style.js pour le
  // raisonnement. Écrit comme un `context` Typst parce que le contenu
  // dépend de la page composée : on interroge les titres réellement placés,
  // seul moyen d'avoir un titre courant juste.
  const entete = enteteTypst(p)
  const numerotation = p.pageNumbers && p.pageNumbers.enabled
    ? `numbering: "1", number-align: center,`
    : ''
  // Un titre ne reste pas seul en bas d'une page : `sticky` le fait
  // descendre avec le texte qu'il annonce.
  const solidaires = p.titresSolidaires === false ? '' : '#show heading: set block(sticky: true)\n'
  const depart = p.pageNumbers && p.pageNumbers.enabled
    ? `#counter(page).update(${Math.max(1, Number(p.pageNumbers.startAt) || 1)})\n`
    : ''

  return `// Engendré par amend.ink — ne pas modifier à la main.
#set document(title: ${chaine(titre || 'Document')})
#set page(
  width: ${format.mm[0]}mm,
  height: ${format.mm[1]}mm,
  margin: (top: ${p.marginTop}mm, bottom: ${p.marginBottom}mm, left: ${p.marginLeft}mm, right: ${p.marginRight}mm),
  ${numerotation}${entete}
)
// La langue décide des motifs de césure et de la forme des guillemets.
// \`hyphenate\` vaut \`auto\` : les mots ne sont coupés que dans du texte
// justifié — même règle que celle posée dans l'export navigateur.
#set text(lang: ${chaine(langue(p.langue).id)}, font: (${police(corps.font).typst.map(chaine).join(', ')}), size: ${corps.size}pt)
#set par(justify: ${corps.align === 'justify'})

${fonctions.join('\n\n')}

${fonctionsTitres.join('\n\n')}

${titres.join('\n')}

${solidaires}${depart}`
}

/** La source Typst complète d'un document. */
export function docToTypst(doc, style, titre) {
  let corps = ''
  doc.forEach((node) => {
    corps += blocTypst(node)
  })
  return gabarit(style, titre) + '\n' + corps
}

/** Demande le PDF au serveur et déclenche son téléchargement. Renvoie une
 * erreur lisible plutôt que de laisser la page muette : un rendu peut être
 * refusé (trop lourd, trop long, file d'attente pleine), et c'est une
 * information utile, pas un incident. */
export async function downloadTypstPdf(doc, style, titre, docId) {
  const source = docToTypst(doc, style, titre)
  const res = await fetch(`/api/docs/${docId}/pdf`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source }),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail.error || `le rendu a échoué (${res.status})`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(titre || 'document').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 150)}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
