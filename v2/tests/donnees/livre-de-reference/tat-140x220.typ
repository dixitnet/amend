#set document(title: "Petit conte immoral", author: "Ada")
#let amend-pas = 14pt
#set page(width: 140mm, height: 220mm, margin: (top: 23.2mm, bottom: 33.817mm - 0.1pt, inside: 21mm, outside: 18mm), footer-descent: amend-pas + 0.1pt, header-ascent: amend-pas, footer: context { let p = here().page(); let blanche = query(<amend-fin>).any(f => f.location().page() == p - 1) and query(<amend-debut>).any(d => d.location().page() == p + 1) and not query(<amend-debut>).any(d => d.location().page() == p); let ouverture = query(heading.where(level: 1, outlined: true)).any(h => h.location().page() == p); let ouverture2 = query(heading.where(level: 2, outlined: true)).any(h => h.location().page() == p); if not blanche and not ouverture { align(center + top, counter(page).display()) } }, header: context { let p = here().page(); let blanche = query(<amend-fin>).any(f => f.location().page() == p - 1) and query(<amend-debut>).any(d => d.location().page() == p + 1) and not query(<amend-debut>).any(d => d.location().page() == p); let ouverture = query(heading.where(level: 1, outlined: true)).any(h => h.location().page() == p); let ouverture2 = query(heading.where(level: 2, outlined: true)).any(h => h.location().page() == p); if not blanche { if not (ouverture or ouverture2) { let c = if calc.odd(p) { { show linebreak: [ ]; show parbreak: [ ]; show regex("[\n\r]+"): [ ]; let hs = query(selector(heading.where(level: 1, outlined: true)).or(heading.where(level: 2, outlined: true)).before(here())); if hs.len() > 0 { hs.last().body } } } else { [#"Petit conte immoral"] }; if c != none { align(center, text(style: "normal", smallcaps(c))) } } } })
#set text(font: ("EB Garamond",), size: 11pt, weight: "regular", style: "normal", lang: "fr", top-edge: amend-pas, bottom-edge: "baseline", fill: cmyk(0%, 0%, 0%, 100%))
#set par(justify: true, leading: 0pt, spacing: 0pt, first-line-indent: (amount: 5mm, all: true))
#set block(spacing: 0pt)
#set list(spacing: 0pt)
#set enum(spacing: 0pt)
#set footnote.entry(gap: 0pt, clearance: amend-pas)
#set image(width: 100%)
#let amend-brique(dehors, dedans, apres, corps) = block(width: 100%, above: dehors, below: apres, inset: (top: dedans), corps)
#let amend-mesure(dehors, dedans, apres, corps) = block(width: 100%, above: dehors, below: apres, sticky: true, breakable: false, layout(size => { let h = measure(block(width: size.width, corps)).height; pad(top: calc.ceil(h / amend-pas - 0.001) * amend-pas - h + dedans, corps) }))
#let amend-entier(corps) = block(width: 100%, breakable: false, layout(size => { let h = measure(block(width: size.width, corps)).height; let reste = (calc.ceil(h / amend-pas - 0.001) + 1) * amend-pas - h; pad(top: reste / 2, bottom: reste / 2, corps) }))
#show image: it => amend-entier(it)
#show table: it => amend-entier(it)
#show quote.where(block: true): it => amend-brique(0pt, 7pt, 7pt, { set text(size: 10pt, weight: "regular", style: "normal"); set par(justify: true, first-line-indent: 0pt); pad(left: 5mm, align(left, it.body)) })
#show link: set text(fill: cmyk(0%, 0%, 0%, 100%))
#show outline.entry: it => { show linebreak: [ ]; show regex("[\n\r]+"): [ ]; it }
#show outline.entry.where(level: 1): set text(weight: "regular")
#let amend-blanc = block(width: 100%, height: amend-pas, breakable: false)
#let amend-separateur = block(width: 100%, height: amend-pas, breakable: false)
#let amend-titre(corps) = amend-mesure(14pt, 0pt, 14pt, { set text(size: 20pt, weight: "bold", style: "normal", top-edge: 23pt, hyphenate: false); set par(justify: false, first-line-indent: 0pt); align(center, corps) })
#let amend-sous-titre(corps) = amend-mesure(14pt, 0pt, 14pt, { set text(size: 14pt, weight: "regular", style: "italic", top-edge: 16.1pt, hyphenate: false); set par(justify: false, first-line-indent: 0pt); align(center, corps) })
#let amend-legende(corps) = amend-brique(0pt, 0pt, 14pt, { set text(size: 9pt, weight: "regular", style: "italic"); set par(justify: false, first-line-indent: 0pt); align(center, corps) })
#let amend-bibliographie(corps) = amend-brique(0pt, 0pt, 0pt, { set text(size: 10pt, weight: "regular", style: "normal"); set par(justify: false, first-line-indent: 0pt, hanging-indent: 5mm); align(left, par(corps)) })
#let amend-surligne(corps) = highlight(fill: rgb("#d8f5a2"), corps)
#let amend-sans-alinea(corps) = corps
#let amend-sans-alinea-2(corps) = corps
#show heading: it => amend-mesure(14pt, 0pt, 0pt, { set text(size: 11pt, weight: "regular", style: "italic", top-edge: 12.65pt, hyphenate: false); set par(justify: false, first-line-indent: 0pt); align(left, it.body) })
#show heading.where(level: 4): it => amend-mesure(14pt, 0pt, 0pt, { set text(size: 11pt, weight: "regular", style: "italic", top-edge: 12.65pt, hyphenate: false); set par(justify: false, first-line-indent: 0pt); align(left, it.body) })
#show heading.where(level: 3): it => amend-mesure(14pt, 7pt, 7pt, { set text(size: 11pt, weight: "bold", style: "normal", top-edge: 12.65pt, hyphenate: false); set par(justify: false, first-line-indent: 0pt); align(left, it.body) })
#show heading.where(level: 2): it => {[#metadata(none) <amend-fin>]; pagebreak(to: "odd", weak: true); [#metadata(none) <amend-debut>]; amend-mesure(0pt, 70pt, 56pt, { set text(size: 11pt, weight: "bold", style: "normal", top-edge: 12.65pt, hyphenate: false); set par(justify: false, first-line-indent: 0pt); align(center, it.body) })}
#show heading.where(level: 1): it => {[#metadata(none) <amend-fin>]; pagebreak(to: "odd", weak: true); [#metadata(none) <amend-debut>]; amend-mesure(0pt, 168pt, 42pt, { set text(size: 14pt, weight: "regular", style: "normal", top-edge: 16.1pt, hyphenate: false); set par(justify: false, first-line-indent: 0pt); align(center, smallcaps(it.body)) })}

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
