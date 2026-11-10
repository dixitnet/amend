import{C as e,E as t,T as n,b as r,t as i,y as a}from"./style-eL_ZhQN1.js";import{A as o,O as s,k as c,n as l,r as u,t as d}from"./index-DV50vuG1.js";var f=[`\\`,`#`,`$`,`*`,`_`,"`",`<`,`>`,`@`,`~`,`[`,`]`,`"`,`'`];function p(e){let t=e;for(let e of f)t=t.split(e).join(`\\`+e);return t.replace(/\/(?=\/)/g,`\\/`).replace(/-(?=[-?])/g,`\\-`)}function m(e){return e.replace(/^\(/,`\\(`).replace(/^\.(?=[\p{L}\p{N}_])/u,`\\.`).replace(/^;/,`\\;`).replace(/^[=\-+/]/,e=>`\\`+e).replace(/^(\d+)\./,`$1\\.`)}function h(e){return`"`+String(e).replace(/\\/g,`\\\\`).replace(/"/g,`\\"`)+`"`}function g(e){let t=``;return e.forEach(e=>{if(e.type.name===`hard_break`){t+=`#linebreak()`;return}if(e.type.name===`image`){t+=C(e);return}if(e.type.name===`footnote`){t+=`#footnote[${g(e)}]`;return}if(!e.isText)return;let n=m(p(e.text));for(let t of e.marks){let e=t.type.name;if(e===`strong`)n=`#strong[${n}]`;else if(e===`em`)n=`#emph[${n}]`;else if(e===`underline`)n=`#underline[${n}]`;else if(e===`strike`)n=`#strike[${n}]`;else if(e===`link`){let e=c(t.attrs.href);e&&(n=`#link(${h(e)})[${n}]`)}}t+=n}),t}var _=``,v={n:1,gouttiere:0};function y(){let{n:e,gouttiere:t}=v,n=`page.width - largeur-marges(page.margin)`;return e>1?`(${n} - ${t*(e-1)}mm) / ${e}`:n}var b=`trait`;function x(e){let t=e=>`#v(0.6em)\n#align(center)[${e}]\n#v(0.6em)\n\n`;return e===`asterisques`?t(`\\*  \\*  \\*`):e===`asterisme`?t(`⁂`):e===`blanc`?`#v(1.4em)

`:`#v(0.6em)\n#line(length: 100%, stroke: 0.5pt + ${k})\n#v(0.6em)\n\n`}function S(e,t){let n=/^\/api\/docs\/([A-Za-z0-9_-]+)\/images\//.exec(e);return _&&n&&n[1]!==_?`images/${n[1]}/${t}`:`images/${t}`}function C(e){let t=String(e.attrs.src||``),n=t.split(`/`).pop();if(!o(t)||!/^[A-Za-z0-9_-]+\.(png|jpg)$/.test(n))return``;let r=e.attrs.largeur,i=e.attrs.alt?`, alt: ${h(e.attrs.alt)}`:``,a=r?`, width: calc.min(disponible, ${r}pt * 0.75)`:`, width: disponible`;return`#figure(image(${h(S(t,n))}${a}${i}), caption: none)`}function w(e){let t=String(e.attrs.src||``),n=t.split(`/`).pop();if(!o(t)||!/^[A-Za-z0-9_-]+\.(png|jpg)$/.test(n))return``;let r=e.attrs.alt?`, alt: ${h(e.attrs.alt)}`:``,{largeur:i,hauteur:a}=e.attrs,s=i&&a?Math.round(i/a*1e4)/1e4:0,c=s?`calc.min(disponible, hauteur-utile * ${s})`:`disponible`;return`#pagebreak(weak: true)
#context {
  let disponible = ${y()}
  let hauteur-utile = page.height - page.margin.top - page.margin.bottom - 2pt
  block(width: 100%, height: hauteur-utile, align(center + horizon, image(${h(S(t,n))}, width: ${c}${r})))
}
#pagebreak(weak: true)

`}function T(e,t){let n=[];return e.forEach(t=>{let r=``;t.forEach(e=>{r+=D(e)}),e.type.name===`task_list`&&(r=`#box[${t.attrs.checked?`☒`:`☐`}] `+(t.attrs.checked?`#strike[${r}]`:r)),n.push(`[${r}]`)}),`#${t}(${t===`list`?`marker: [–], `:``}${n.join(`, `)})\n\n`}function E(e){let t=[],n=0;return e.forEach(e=>{let r=[];e.forEach(e=>{let t=``;e.forEach(e=>{t+=g(e)}),r.push(`[${t}]`)}),n=Math.max(n,r.length),t.push(r.join(`, `))}),n?`#table(columns: ${n}, stroke: 0.5pt + ${k}, ${t.join(`, `)})\n\n`:``}function D(e,{sansRetrait:t=!1}={}){switch(e.type.name){case`heading`:return`#heading(level: ${d(e.attrs.level)})[${g(e).replace(/(?:#linebreak\(\))+$/,``)}]\n\n`;case`paragraph`:{let n=a(e.attrs.style),r=g(e);return`#${n===`body`?t?`amend-corps-sr`:`amend-corps`:`amend-${n}`}[${r.trim()===``?`\\u{200B}`:r}]\n\n`}case`blockquote`:{let t=``;return e.forEach(e=>{t+=e.type.name===`paragraph`?`#amend-citation[${g(e).trim()===``?`\\u{200B}`:g(e)}]\n\n`:D(e)}),t}case`bullet_list`:return T(e,`list`);case`ordered_list`:return T(e,`enum`);case`task_list`:return T(e,`list`);case`table`:return E(e);case`image`:{let t=C(e);return t?`#context {
  let disponible = ${y()}
  [${t}]
}

`:``}case`horizontal_rule`:return`#pagebreak(weak: true)

`;case`ligne_separation`:return x(b);case`table_of_contents`:return`#amend-corps[#{ show linebreak: [ ]; outline(title: none, depth: ${d(e.attrs.profondeur,2)}, indent: auto) }]\n\n`;default:return``}}var O=`cmyk(50%, 40%, 40%, 100%)`,k=`cmyk(0%, 0%, 0%, 41%)`,A=`cmyk(0%, 0%, 0%, 100%)`,j=72/25.4;function M(e){let t=n(e.font),r=`${(Number(e.lineHeight)||1.15).toFixed(2)}em - 1em + 0.2em`;return{texte:[`font: (${t.typst.map(h).join(`, `)})`,`size: ${e.size}pt`,`weight: ${e.bold?`"bold"`:`"regular"`}`,`style: ${e.italic?`"italic"`:`"normal"`}`].join(`, `),par:[`justify: ${e.align===`justify`}`,`leading: ${r}`,`spacing: ${r} + ${e.spaceAfter||0}pt`,`first-line-indent: (amount: ${((e.firstLineIndent||0)*j).toFixed(2)}pt, all: true)`].join(`, `),align:e.align===`justify`?`left`:e.align||`left`,avant:e.spaceBefore||0,apres:e.spaceAfter||0,retrait:(Number(e.indent)||0)*j,uppercase:!!e.uppercase}}function N(e,t){let n=M(t),r=n.uppercase?`upper(corps)`:`corps`;n.retrait>0&&(r=`pad(left: ${n.retrait.toFixed(2)}pt, ${r})`);let i=n.avant>0?`\n  v(${n.avant}pt, weak: true)`:``,a=n.apres>0?`\n  v(${n.apres}pt, weak: true)`:``;return`#let ${e}(corps) = {${i}
  set text(${n.texte})
  set par(${n.par})
  // Aucun conteneur ici : il sortirait le paragraphe du flux, ce qui annule
  // le retrait de première ligne et l'espacement entre paragraphes.
  set align(${n.align})
  ${r}${a}
}`}function P(e,t={}){let r=Number.isFinite(Number(t.notesReduction))?Number(t.notesReduction):2,i=Number(t.notesInterligne)||0,a=M(i?{...e,lineHeight:i}:e),o=n(e.font),s=Math.max(7,e.size-r);return`#set footnote.entry(indent: 0pt)
#set footnote.entry(separator: line(length: 30% + 0pt, stroke: 0.5pt + ${A}))
#show footnote.entry: it => {
  set text(${`font: (${o.typst.map(h).join(`, `)}), size: ${s}pt, weight: "regular", style: "normal"`})
  set par(${a.par.replace(/first-line-indent: \(.*\)$/,`first-line-indent: 0pt`)})
  set align(left)
  let n = counter(footnote).at(it.note.location())
  super(numbering(it.note.numbering, ..n))
  h(0.15em)
  it.note.body
}`}function F(e,t){if(!e)return null;if(e.type===`titreDocument`){let e=String(t||``).trim();return e?h(e):null}if(e.type===`texte`){let t=String(e.texte||``).trim();return t?h(t):null}return e.type===`titre`?`courant`:null}var I=`let ici = here().page()
    let titres = query(heading.where(level: 1))
    let ouverture = titres.filter(t => t.location().page() == ici).len() > 0`;function L(e,t){let n=e&&e.entete||{},r=F(n.gauche,t),i=F(n.droite,t),a=e&&e.pageNumbers||{},o=a.enabled?a.position||`bas-centre`:null,s=o===`haut-exterieur`,c=o===`bas-exterieur`||o===`bas-centre`&&a.sautOuverture,l=a.sautOuverture?`true`:`false`,u=o===`bas-centre`?`center`:`if calc.even(ici) { left } else { right }`,d=`counter(page).display("1")`,f=``;if(r||i||s){let e=n.sautOuverture===!1?`false`:`true`,t=r||i?`if ${e} and ouverture {
      none
    } else {
      let avant = titres.filter(t => t.location().page() <= ici)
      let courant = if avant.len() > 0 { avant.last().body } else { none }
      let contenu = if calc.even(ici) { ${r||`none`} } else { ${i||`none`} }
      // Un titre à retour à la ligne se lit sur une ligne en en-tête.
      if contenu != none { show linebreak: [ ]; align(center, contenu) }
    }`:`none`;f+=`
  header: context {
    ${I}
    let texte = ${t}
    ${s?`let numero = if ${l} and ouverture { none } else { place(${u}, ${d}) }
    [#numero#texte]`:`texte`}
  },`}return c&&(f+=`
  footer: context {
    ${I}
    if ${l} and ouverture { none } else { align(${u}, ${d}) }
  },`),f}function R(a,o){let s=a&&a.blocs?a:t(),c=s.page,[l,u]=r(c),d=s.blocs.body,f=[N(`amend-corps`,s.blocs.body),N(`amend-citation`,s.blocs.quote),N(`amend-title`,s.blocs.title||i.find(e=>e.id===`title`).defauts),N(`amend-subtitle`,s.blocs.subtitle||i.find(e=>e.id===`subtitle`).defauts),N(`amend-caption`,s.blocs.caption||i.find(e=>e.id===`caption`).defauts)];c.premierSansRetrait&&f.push(N(`amend-corps-sr`,{...s.blocs.body,firstLineIndent:0}));let p=i.filter(e=>e.docxHeading!==null).map(e=>{let t=Number(e.id.slice(1)),n=``;return t===1&&(c.debutChapitre===`droite`?n=`pagebreak(to: "odd", weak: true)
  `:c.debutChapitre===`page`&&(n=`pagebreak(weak: true)
  `),n&&c.descente>0&&(n+=`v(${c.descente}mm)\n  `)),n?`#show heading.where(level: ${t}): it => {\n  ${n}amend-${e.id}(it.body)\n}`:`#show heading.where(level: ${t}): it => amend-${e.id}(it.body)`}),m=i.filter(e=>e.docxHeading!==null).map(e=>N(`amend-${e.id}`,s.blocs[e.id])),g=L(c,o),_=c.pageNumbers||{},v=_.enabled&&(_.position||`bas-centre`)===`bas-centre`&&!_.sautOuverture?`numbering: "1", number-align: center,`:``,y=Number(c.colonnes)||1,b=y>1?`columns: ${y},`:``,x=y>1?`\n#set columns(gutter: ${Number(c.gouttiere)||0}mm)`:``,S=c.margesMiroir?`inside: ${c.marginLeft}mm, outside: ${c.marginRight}mm`:`left: ${c.marginLeft}mm, right: ${c.marginRight}mm`,C=c.titresSolidaires===!1?``:`#show heading: set block(sticky: true)
`,w=c.pageNumbers&&c.pageNumbers.enabled?`#counter(page).update(${Math.max(1,Number(c.pageNumbers.startAt)||1)})\n`:``;return`// Engendré par amend.ink — ne pas modifier à la main.
#set document(title: ${h(o||`Document`)})
#set page(
  width: ${l}mm,
  height: ${u}mm,
  margin: (top: ${c.marginTop}mm, bottom: ${c.marginBottom}mm, ${S}),
  ${v}${b}${g}
)${x}
// La langue décide des motifs de césure et de la forme des guillemets.
// \`hyphenate\` vaut \`auto\` : les mots ne sont coupés que dans du texte
// justifié — même règle que celle posée dans l'export navigateur.
#set text(lang: ${h(e(c.langue).id)}, font: (${n(d.font).typst.map(h).join(`, `)}), size: ${d.size}pt${c.cesure===!1?`, hyphenate: false`:``}${c.veuvesOrphelines===!1?`, costs: (widow: 0%, orphan: 0%)`:``}, fill: ${O})
#set par(justify: ${d.align===`justify`})
// Les notes de bas de page (29/09/2026, reprises le 03/10) : voir regleNotes.
${P(d,c)}
// La largeur des marges, que les marges soient miroir (inside et outside)
// ou non (left et right) : Typst ne rend que les clés qu'on a posées, et lire
// directement la marge gauche échoue avec des marges miroir (trouvé en
// compilant, 28/10/2026).
#let largeur-marges(m) = if "left" in m { m.left + m.right } else { m.inside + m.outside }
// Les liens (30/09/2026) : soulignés, sans couleur — un PDF s'imprime, et
// une couleur qui porte le sens disparaît en noir et blanc.
#show link: underline

${f.join(`

`)}

${m.join(`

`)}

${p.join(`
`)}

${C}${w}`}function z(e,t,n,r=``){n=s(n),_=r,b=t&&t.page&&t.page.separateur||`trait`,v={n:t&&t.page&&Number(t.page.colonnes)||1,gouttiere:t&&t.page&&Number(t.page.gouttiere)||0};let i=``,a=!!(t&&t.blocs&&t.page&&t.page.imagesPleinePage);try{let n=!!(t&&t.page&&t.page.premierSansRetrait),r=``;e.forEach(e=>{let t=n&&[`heading`,`ligne_separation`,`horizontal_rule`].includes(r);i+=a&&e.type.name===`image`?w(e):D(e,{sansRetrait:t}),r=e.type.name})}finally{_=``,b=`trait`,v={n:1,gouttiere:0}}return R(t,n)+`
`+i}async function B(e,t,n,r){let i=z(e,t,n,r),a=await fetch(`/api/docs/${r}/pdf`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({source:i})});if(!a.ok){let e=await a.json().catch(()=>({}));throw Error(e.error||`le rendu a échoué (${a.status})`)}let o=await a.blob();u(o,`${l(n)}.pdf`)}export{k as GRIS_TRAITS,O as NOIR_TEXTE,A as NOIR_TRAITS,z as docToTypst,B as downloadTypstPdf,P as regleNotes};