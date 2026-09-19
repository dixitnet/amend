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

import { BLOCS, NIVEAUX_TITRE, police, formatPage, styleParDefaut } from '../../shared/style.js'

// Caractères que Typst interprète en mode contenu. Le backslash d'abord,
// sinon on échapperait ceux qu'on vient d'ajouter.
const SPECIAUX = ['\\', '#', '$', '*', '_', '`', '<', '>', '@', '~', '[', ']', '"', "'"]

function echapper(texte) {
  let out = texte
  for (const c of SPECIAUX) out = out.split(c).join('\\' + c)
  return out
}

/** Une chaîne littérale Typst (pour les arguments, pas le contenu). */
function chaine(v) {
  return '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

/** Le contenu inline d'un nœud : texte, marques, sauts de ligne, images.
 * Les marques du suivi des modifications ressortent en texte normal — même
 * convention que les trois autres exports : « l'état présent » est pris au
 * pied de la lettre, rien n'est accepté ni rejeté au passage. */
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
    let t = echapper(child.text)
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
 * voir ailleurs. */
function imageTypst(node) {
  const src = String(node.attrs.src || '')
  const nom = src.split('/').pop()
  if (!/^[A-Za-z0-9_-]+\.(png|jpg)$/.test(nom)) return ''
  const largeur = node.attrs.largeur
  const alt = node.attrs.alt ? `, alt: ${chaine(node.attrs.alt)}` : ''
  // `width: 100%` plafonné à la largeur réelle du fichier : une petite
  // capture ne doit pas être étirée jusqu'au flou.
  const taille = largeur ? `, width: calc.min(100%, ${largeur}pt * 0.75)` : ', width: 100%'
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
      corps = `#box[#sym.ballot${item.attrs.checked ? '.x' : ''}] ` + (item.attrs.checked ? `#strike[${corps}]` : corps)
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
    case 'image':
      return imageTypst(node) + '\n\n'
    case 'horizontal_rule':
      // Dans Amend la ligne horizontale EST un saut de page (voir schema.js).
      return '#pagebreak(weak: true)\n\n'
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
    uppercase: !!v.uppercase,
  }
}

/** Un bloc réglable -> une fonction Typst qui le rend. */
function fonctionBloc(nom, v) {
  const r = reglagesTypst(v)
  const corps = r.uppercase ? 'upper(corps)' : 'corps'
  return `#let ${nom}(corps) = {
  v(${r.avant}pt, weak: true)
  set text(${r.texte})
  set par(${r.par})
  // Aucun conteneur ici : il sortirait le paragraphe du flux, ce qui annule
  // le retrait de première ligne et l'espacement entre paragraphes.
  set align(${r.align})
  // L'espace après est porté par par.spacing ci-dessus, pas par un v().
  ${corps}
}`
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
    return `#show heading.where(level: ${niveau}): it => amend-${b.id}(it.body)`
  })
  const fonctionsTitres = BLOCS.filter((b) => b.docxHeading !== null).map((b) =>
    fonctionBloc(`amend-${b.id}`, complet.blocs[b.id])
  )

  const numerotation = p.pageNumbers && p.pageNumbers.enabled
    ? `numbering: "1", number-align: center,`
    : ''
  const depart = p.pageNumbers && p.pageNumbers.enabled
    ? `#counter(page).update(${Math.max(1, Number(p.pageNumbers.startAt) || 1)})\n`
    : ''

  return `// Engendré par amend.ink — ne pas modifier à la main.
#set document(title: ${chaine(titre || 'Document')})
#set page(
  width: ${format.mm[0]}mm,
  height: ${format.mm[1]}mm,
  margin: (top: ${p.marginTop}mm, bottom: ${p.marginBottom}mm, left: ${p.marginLeft}mm, right: ${p.marginRight}mm),
  ${numerotation}
)
// La langue décide des motifs de césure et de la forme des guillemets.
// \`hyphenate\` vaut \`auto\` : les mots ne sont coupés que dans du texte
// justifié — même règle que celle posée dans l'export navigateur.
#set text(lang: "fr", font: (${police(corps.font).typst.map(chaine).join(', ')}), size: ${corps.size}pt)
#set par(justify: ${corps.align === 'justify'})

${fonctions.join('\n\n')}

${fonctionsTitres.join('\n\n')}

${titres.join('\n')}

${depart}`
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
