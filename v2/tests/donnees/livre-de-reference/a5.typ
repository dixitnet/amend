#set document(title: "Petit conte immoral", author: "Ada")
#set page(width: 148mm, height: 210mm, margin: (top: 20mm, bottom: 20.667mm, inside: 20mm, outside: 15mm), footer-descent: 8.667mm, footer: context { let p = here().page(); let blanche = query(<amend-fin>).any(f => f.location().page() == p - 1) and query(<amend-debut>).any(d => d.location().page() == p + 1) and not query(<amend-debut>).any(d => d.location().page() == p); let ouverture = query(heading.where(level: 1, outlined: true)).any(h => h.location().page() == p); if not blanche and true { align(center + top, text(top-edge: "baseline", counter(page).display())) } }, header: none)
#set text(font: ("EB Garamond",), size: 11pt, weight: "regular", style: "normal", lang: "fr", top-edge: 0.8em, bottom-edge: -0.2em, fill: cmyk(0%, 0%, 0%, 100%))
#set par(justify: true, leading: 14pt - 1em, spacing: 14pt - 1em, first-line-indent: (amount: 5mm, all: true))
#set block(spacing: 14pt - 1em)
#set image(width: 100%)
#set list(spacing: 14pt - 1em)
#set enum(spacing: 14pt - 1em)
#show quote.where(block: true): it => block(width: 100%, above: 3pt, below: 3pt, { set text(font: ("EB Garamond",), size: 11pt, weight: "regular", style: "normal"); set par(justify: true, leading: 14pt - 1em, first-line-indent: (amount: 5mm, all: true)); pad(left: 8mm, align(left, par(it.body)))})
#show link: set text(fill: cmyk(0%, 0%, 0%, 100%))
#show outline.entry: it => { show linebreak: [ ]; show regex("[\n\r]+"): [ ]; it }
#show outline.entry.where(level: 1): set text(weight: "bold")
#let amend-blanc = par(first-line-indent: 0pt)[#box(height: 1em)]
#let amend-separateur = v(14pt)
#let amend-titre(corps) = block(width: 100%, above: 9.8pt, below: 15.2pt, { set text(font: ("EB Garamond",), size: 20pt, weight: "bold", style: "normal"); set par(justify: false, leading: 14pt - 1em, first-line-indent: (amount: 0mm, all: true)); align(center, corps)})
#let amend-sous-titre(corps) = block(width: 100%, above: 14.6pt, below: 16.4pt, { set text(font: ("EB Garamond",), size: 14pt, weight: "regular", style: "italic"); set par(justify: false, leading: 14pt - 1em, first-line-indent: (amount: 0mm, all: true)); align(center, corps)})
#let amend-legende(corps) = block(width: 100%, above: 4.6pt, below: 17.4pt, { set text(font: ("EB Garamond",), size: 9pt, weight: "regular", style: "italic"); set par(justify: false, leading: 14pt - 1em, first-line-indent: (amount: 0mm, all: true)); align(center, corps)})
#let amend-bibliographie(corps) = block(width: 100%, above: 3pt, below: 3pt, { set text(font: ("EB Garamond",), size: 11pt, weight: "regular", style: "normal"); set par(justify: false, leading: 14pt - 1em, first-line-indent: (amount: 0mm, all: true), hanging-indent: 5mm); align(left, par(corps))})
#let amend-surligne(corps) = highlight(fill: rgb("#d8f5a2"), corps)
#let amend-sans-alinea(corps) = par(first-line-indent: 0pt, corps)
#let amend-sans-alinea-2(corps) = corps
#show heading: it => block(width: 100%, above: 17pt, below: 3pt, sticky: true, { set text(font: ("EB Garamond",), size: 11pt, weight: "regular", style: "italic"); set par(justify: false, leading: 14pt - 1em, first-line-indent: (amount: 0mm, all: true)); align(left, it.body)})
#show heading.where(level: 4): it => block(width: 100%, above: 17pt, below: 3pt, sticky: true, { set text(font: ("EB Garamond",), size: 11pt, weight: "regular", style: "italic"); set par(justify: false, leading: 14pt - 1em, first-line-indent: (amount: 0mm, all: true)); align(left, it.body)})
#show heading.where(level: 3): it => block(width: 100%, above: 17pt, below: 3pt, sticky: true, { set text(font: ("EB Garamond",), size: 11pt, weight: "regular", style: "italic"); set par(justify: false, leading: 14pt - 1em, first-line-indent: (amount: 0mm, all: true)); align(left, it.body)})
#show heading.where(level: 2): it => block(width: 100%, above: 17pt, below: 3pt, sticky: true, { set text(font: ("EB Garamond",), size: 11pt, weight: "regular", style: "italic"); set par(justify: false, leading: 14pt - 1em, first-line-indent: (amount: 0mm, all: true)); align(left, it.body)})
#show heading.where(level: 1): it => {[#metadata(none) <amend-fin>]; pagebreak(to: "odd", weak: true); [#metadata(none) <amend-debut>]; block(height: 112pt, width: 100%, above: 0pt, below: 0pt, sticky: true, {v(52pt); set text(font: ("EB Garamond",), size: 16pt, weight: "bold", style: "normal"); set par(justify: false, first-line-indent: 0mm, leading: 19pt - 1em); align(center, it.body)})}

#amend-titre[#"Petit conte immoral"]

#amend-sous-titre[#"Un essai de référence"]

#pagebreak()

#outline(title: none, depth: 3)

#heading(level: 1)[#"Premier chapitre"]

#amend-sans-alinea[#"« Le second [conte] est "#emph("parfaitement")#" immoral. »"]

#"Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima."

#"Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima."

#"Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima."

#"Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima."

#"Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima."

#"Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima."

#"Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima."

#"Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima."

#"Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima."

#"Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima."

#"Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima."

#"Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima. Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima."

#heading(level: 2)[#"Les crises de l’idéal du progrès"]

#amend-sans-alinea-2[#"Au XIX"#super("e")#" siècle, un "#amend-surligne("texte")#footnote[#"Une note de bas de page."]#"."]

#quote(block: true)[#"Une citation détachée, sur plus d’une ligne quand le format est étroit comme celui d’un livre de poche."]

#amend-blanc

#"Un paragraphe après une ligne blanche, avec du "#strong("gras")#" et un "#link("https://amend.ink")[#"lien"]#"."

#amend-separateur

#heading(level: 3)[#"Listes et tableau"]

#list([#"un"], [#"deux"])

#enum([#"premier"], [#"second"])

#table(
  columns: (auto, auto),
  stroke: 0.5pt + luma(200),
  inset: 6pt,
  [#"Année"], [#"Titre"],
  [#"1967"], [#"Petit conte"],
)

#amend-legende[#"Tableau 1 : une légende."]

#heading(level: 1)[#"Second chapitre"]

#heading(level: 4)[#"Un intertitre"]

#heading(level: 5)[#"Un intertitre mineur"]

#"Fin # $ * _ \\ \" ` < > @ [ ] — é ’ « » … œ"

#heading(level: 2)[#"Bibliographie"]

#amend-bibliographie[#"Ascher, François, "#emph("Les nouveaux principes de l’urbanisme")#", La Tour-d’Aigues, Éditions de l’Aube, 2001, une référence assez longue pour passer à la ligne."]

#amend-bibliographie[#"Choay, Françoise, "#emph("L’urbanisme, utopies et réalités")#", Paris, Seuil, 1965."]
