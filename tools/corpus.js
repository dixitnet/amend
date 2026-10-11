#!/usr/bin/env node
// Corpus de documents d'essai (protocole de test global, §3.1 et §8, phase 1).
//
// Des documents *réalistes et reproductibles* — une graine fixe donne les
// mêmes octets — pour que les essais de charge, de collage, d'export et de
// restauration portent sur ce qu'une vraie personne finit par avoir, et pas
// sur trois paragraphes de « lorem ». Le texte est du français plausible
// (pas de lorem ipsum : les coupes de mots, la typographie et les
// espaces insécables se comportent comme en vrai), les structures sont
// celles du schéma de l'éditeur (client/src/schema.js).
//
//   node tools/corpus.js liste
//   node tools/corpus.js generer these --sortie /tmp/corpus            # écrit these.bin + these.json
//   node tools/corpus.js generer tous  --sortie /tmp/corpus
//   node tools/corpus.js envoyer these --base http://127.0.0.1:18900 --cookie "collabtext_session=…"
//
// Profils :
//   these                 ≈ 80 000 mots, 3 niveaux de titres, ~300 notes, citations, listes
//   livre                 ≈ 120 000 mots, 30 chapitres, quelques notes
//   suivi-dense           ≈ 15 000 mots, ~900 insertions/suppressions de trois auteurs
//   commentaires-denses   ≈ 15 000 mots, ~400 commentaires ancrés et leurs réponses
//   listes-profondes      listes imbriquées sur 8 niveaux, cases à cocher
//   vieux-journal         ~60 000 frappes et effacements séparés : un document « ancien »
//   hostile-de-bonne-foi  ce qu'une vraie personne colle sans mauvaise intention : un
//                         paragraphe de 200 000 signes, 5 000 paragraphes d'un caractère,
//                         des mots interminables, de l'arabe et du combinant, 1 000 notes
//
// Les .bin sont des mises à jour Yjs (`Y.encodeStateAsUpdate`) : on les envoie
// sur la WebSocket du document comme n'importe quel client, ce qui exerce aussi
// le chemin « gros envoi initial ».

import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT = join(RACINE, 'client')

// Tout ce qui touche à ProseMirror / y-prosemirror vient de client/ (une seule
// copie de Yjs : on ne mélange pas deux instances).
const importerClient = (chemin) => import(pathToFileURL(join(CLIENT, chemin)).href)
const Y = await importerClient('node_modules/yjs/dist/yjs.mjs')
const YPM = await importerClient('node_modules/y-prosemirror/src/y-prosemirror.js')
const { schema } = await importerClient('src/schema.js')
const { NOM_TEXTE, NOM_COMMENTAIRES } = await importerClient('../shared/protocole.js')

// ------------------------------------------------------------------ hasard

function prng(graine) {
  // mulberry32 : petit, rapide, reproductible
  let a = graine >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ------------------------------------------------------------------ texte

const SUJETS = ['La ville', 'Le foncier', 'Cette friche', 'Le quartier', 'Une collectivité', 'L’aménageur', 'Le plan local', 'Chaque parcelle', 'Le renouvellement urbain', 'La densité', 'Un îlot', 'La sobriété foncière', 'Le projet', 'Cette transition', 'L’usage des sols']
const VERBES = ['redéfinit', 'suppose', 'interroge', 'organise', 'transforme', 'contraint', 'accompagne', 'révèle', 'déplace', 'prolonge', 'met en tension', 'rend visible', 'engage', 'conditionne']
const OBJETS = ['les équilibres entre emploi et habitat', 'une lecture fine des usages', 'la manière dont on mesure l’artificialisation', 'un travail de long terme sur les tissus existants', 'la question des mobilités quotidiennes', 'les arbitrages que personne ne veut assumer', 'la place du vivant dans la ville dense', 'des compromis rarement documentés', 'une économie du projet très différente', 'le rôle des acteurs publics et privés']
const LIENS = ['Pourtant', 'En effet', 'Ainsi', 'Cela dit', 'À cet égard', 'D’un autre côté', 'Dans ce cadre', 'Par ailleurs', 'De ce fait', 'En pratique']
const FIN = ['sur le temps long', 'à l’échelle du quartier', 'dans les faits', 'sans qu’on en discute vraiment', 'comme le montrent les cas étudiés', 'selon les territoires', 'et c’est là que tout se joue']
const MOTS_TITRE = ['Introduction', 'Cadre théorique', 'Terrains', 'Méthode', 'Résultats', 'Discussion', 'Conclusion', 'Genèse', 'Controverses', 'Pratiques', 'Instruments', 'Acteurs', 'Échelles', 'Temporalités', 'Limites']

function fabrique(hasard) {
  const pick = (t) => t[Math.floor(hasard() * t.length)]
  const phrase = () => {
    const base = `${pick(SUJETS)} ${pick(VERBES)} ${pick(OBJETS)}`
    const avec = hasard() < 0.45 ? `${pick(LIENS)}, ${base.charAt(0).toLowerCase()}${base.slice(1)}` : base
    return `${avec}${hasard() < 0.5 ? ' ' + pick(FIN) : ''}${hasard() < 0.08 ? ' (voir plus loin)' : ''}.`
  }
  const paragraphe = (minPhrases = 3, maxPhrases = 8) => {
    const n = minPhrases + Math.floor(hasard() * (maxPhrases - minPhrases + 1))
    return Array.from({ length: n }, phrase).join(' ')
  }
  const titre = () => `${pick(MOTS_TITRE)} ${pick(['de la densité', 'du foncier', 'des usages', 'du projet', 'de la ville', 'des sols'])}`
  return { pick, phrase, paragraphe, titre }
}

const compterMots = (s) => (s.match(/\S+/g) || []).length

// -------------------------------------------------------- nœuds ProseMirror

const texte = (t, marques) => (t ? { type: 'text', text: t, ...(marques ? { marks: marques } : {}) } : null)
const para = (...inline) => ({ type: 'paragraph', content: inline.flat().filter(Boolean) })
const titreN = (niveau, t) => ({ type: 'heading', attrs: { level: niveau }, content: [texte(t)] })
const note = (t) => ({ type: 'footnote', content: [texte(t)] })
const liste = (type, items) => ({ type, content: items.map((c) => ({ type: 'list_item', content: Array.isArray(c) ? c : [c] })) })

const AUTEURS = [
  { user: 'Claire Test', userColor: '#c2410c' },
  { user: 'Marc Test', userColor: '#1d4ed8' },
  { user: 'Aïcha Test', userColor: '#15803d' },
]
const marqueIns = (a, ts, groupe = null) => [
  { type: 'insertion', attrs: { ...a, ts, groupe } },
  { type: 'authorColor', attrs: { user: a.user, userColor: a.userColor } },
]
const marqueDel = (a, ts, groupe = null) => [{ type: 'deletion', attrs: { ...a, ts, groupe } }]

// ------------------------------------------------------------------ profils

function docThese(hasard, { mots = 80000, notes = 300 } = {}) {
  const f = fabrique(hasard)
  const blocs = [titreN(1, 'Essai sur la ville qui se refait sur elle-même'), para(texte(f.paragraphe(2, 3))), { type: 'table_of_contents', attrs: { profondeur: 3 } }]
  let total = 0
  let nNotes = 0
  const parNote = Math.max(1, Math.floor(mots / 100 / Math.max(1, notes)))
  let paraN = 0
  let partie = 0
  while (total < mots) {
    partie++
    blocs.push(titreN(2, `${partie}. ${f.titre()}`))
    const nSous = 2 + Math.floor(hasard() * 3)
    for (let s = 1; s <= nSous && total < mots; s++) {
      blocs.push(titreN(3, `${partie}.${s} ${f.titre()}`))
      const nParas = 4 + Math.floor(hasard() * 6)
      for (let p = 0; p < nParas && total < mots; p++) {
        const t = f.paragraphe()
        total += compterMots(t)
        paraN++
        const r = hasard()
        if (r < 0.06) {
          blocs.push({ type: 'blockquote', content: [para(texte(t))] })
        } else if (r < 0.12) {
          blocs.push(liste('bullet_list', [0, 1, 2].map(() => para(texte(f.phrase())))))
        } else if (nNotes < notes && paraN % parNote === 0) {
          const coupe = t.indexOf(' ', Math.floor(t.length / 2))
          blocs.push(para(texte(t.slice(0, coupe)), note(`${f.phrase()} Voir ${f.pick(AUTEURS).user}, ${1990 + Math.floor(hasard() * 35)}.`), texte(t.slice(coupe))))
          nNotes++
        } else blocs.push(para(texte(t)))
      }
    }
  }
  return { doc: { type: 'doc', content: blocs }, resume: { mots: total, notes: nNotes } }
}

function docLivre(hasard) {
  const f = fabrique(hasard)
  const blocs = [titreN(1, 'Vie et mort de la rue Test')]
  let total = 0
  let notes = 0
  for (let c = 1; c <= 30; c++) {
    blocs.push(titreN(2, `Chapitre ${c} — ${f.titre()}`))
    const nParas = 55 + Math.floor(hasard() * 40)
    for (let p = 0; p < nParas; p++) {
      const t = f.paragraphe(2, 6)
      total += compterMots(t)
      if (hasard() < 0.02) {
        const coupe = t.indexOf(' ', Math.floor(t.length / 2))
        blocs.push(para(texte(t.slice(0, coupe)), note(f.phrase()), texte(t.slice(coupe))))
        notes++
      } else blocs.push(para(texte(t)))
    }
    if (c % 5 === 0) blocs.push({ type: 'horizontal_rule' })
  }
  return { doc: { type: 'doc', content: blocs }, resume: { mots: total, notes } }
}

function docSuiviDense(hasard) {
  const f = fabrique(hasard)
  const blocs = [titreN(1, 'Chapitre en relecture')]
  let total = 0
  let ins = 0
  let del = 0
  const ts0 = Date.UTC(2026, 8, 1)
  for (let i = 0; total < 15000; i++) {
    if (i % 12 === 0) blocs.push(titreN(2, f.titre()))
    const a = f.paragraphe(3, 6)
    total += compterMots(a)
    const morceaux = []
    let reste = a
    const nChangements = hasard() < 0.85 ? 1 + Math.floor(hasard() * 4) : 0
    for (let k = 0; k < nChangements; k++) {
      const auteur = f.pick(AUTEURS)
      const ts = ts0 + Math.floor(hasard() * 20 * 86400000)
      const coupe = Math.max(1, reste.indexOf(' ', Math.floor(hasard() * reste.length * 0.6)))
      morceaux.push(texte(reste.slice(0, coupe)))
      reste = reste.slice(coupe)
      if (hasard() < 0.5) {
        morceaux.push(texte(` ${f.pick(['notamment', 'bien souvent', 'à titre d’exemple', 'contre toute attente'])}`, marqueIns(auteur, ts)))
        ins++
      } else {
        const fin = Math.max(2, reste.indexOf(' ', 12))
        morceaux.push(texte(reste.slice(0, fin), marqueDel(auteur, ts)))
        reste = reste.slice(fin)
        del++
        if (hasard() < 0.5) { morceaux.push(texte(' ' + f.pick(['plus précisément', 'en somme']), marqueIns(auteur, ts))); ins++ }
      }
    }
    morceaux.push(texte(reste))
    blocs.push(para(morceaux))
  }
  return { doc: { type: 'doc', content: blocs }, resume: { mots: total, insertions: ins, suppressions: del, auteurs: AUTEURS.length } }
}

function docCommentairesDenses(hasard) {
  const f = fabrique(hasard)
  const blocs = [titreN(1, 'Chapitre très commenté')]
  let total = 0
  for (let i = 0; total < 15000; i++) {
    if (i % 12 === 0) blocs.push(titreN(2, f.titre()))
    const t = f.paragraphe(3, 6)
    total += compterMots(t)
    blocs.push(para(texte(t)))
  }
  return { doc: { type: 'doc', content: blocs }, resume: { mots: total }, commentaires: { n: 400, reponses: 0.5 } }
}

function docListesProfondes(hasard) {
  const f = fabrique(hasard)
  const niveau = (profondeur) => {
    const items = []
    const n = profondeur === 0 ? 6 : 2 + Math.floor(hasard() * 2)
    for (let i = 0; i < n; i++) {
      const contenu = [para(texte(f.phrase()))]
      if (profondeur < 7 && hasard() < 0.55) contenu.push(liste(hasard() < 0.5 ? 'bullet_list' : 'ordered_list', niveau(profondeur + 1).content.map((li) => li.content)))
      items.push(contenu)
    }
    return liste('bullet_list', items)
  }
  const blocs = [titreN(1, 'Listes imbriquées')]
  for (let i = 0; i < 12; i++) blocs.push(niveau(0))
  for (let i = 0; i < 40; i++) {
    blocs.push({ type: 'task_list', content: [0, 1, 2].map((k) => ({ type: 'task_item', attrs: { checked: hasard() < 0.4 }, content: [para(texte(f.phrase()))] })) })
  }
  return { doc: { type: 'doc', content: blocs }, resume: { profondeurMax: 8 } }
}

function docHostile(hasard) {
  const f = fabrique(hasard)
  const blocs = [titreN(1, 'Ce que les gens collent')]
  // 1. un paragraphe de 200 000 signes sans retour à la ligne
  let gros = ''
  while (gros.length < 200000) gros += f.phrase() + ' '
  blocs.push(para(texte(gros)))
  // 2. cinq mille paragraphes d'un caractère
  for (let i = 0; i < 5000; i++) blocs.push(para(texte(String.fromCharCode(97 + (i % 26)))))
  // 3. des mots interminables (une URL, un hash, un mot allemand)
  blocs.push(para(texte('https://exemple.test/' + 'a'.repeat(3000) + '?q=' + 'b'.repeat(2000))))
  blocs.push(para(texte('Donaudampfschifffahrtsgesellschaftskapitänsmützenabzeichen'.repeat(40))))
  // 4. de l'arabe, de l'hébreu, du combinant, des emoji composés
  blocs.push(para(texte('مدينة تعيد بناء نفسها — ' + 'שלום עולם '.repeat(50))))
  blocs.push(para(texte('é̂̃'.repeat(300) + ' 👩🏽‍🚀👨‍👩‍👧‍👦🏳️‍🌈'.repeat(100))))
  // 5. des espaces de toutes sortes, des tabulations, des sauts forcés
  blocs.push(para(texte('un insécable étroit fin​sans-largeur\ttab ' + 'x '.repeat(500))))
  blocs.push({ type: 'paragraph', content: Array.from({ length: 200 }, (_, i) => [texte(`ligne ${i}`), { type: 'hard_break' }]).flat() })
  // 6. mille notes dans un seul paragraphe
  blocs.push(para(Array.from({ length: 1000 }, (_, i) => [texte(`mot${i} `), note(`note ${i}`)]).flat()))
  return { doc: { type: 'doc', content: blocs }, resume: { grandParagraphe: gros.length, paragraphesCourts: 5000, notesDansUnParagraphe: 1000 } }
}

// Un document « ancien » : des dizaines de milliers de petites transactions,
// la moitié défaites. Le .bin garde les tombes — c'est ce qui fait gonfler
// un vrai document et ralentit sa réouverture.
function vieuxJournal(hasard) {
  const f = fabrique(hasard)
  const ydoc = new Y.Doc()
  ydoc.clientID = 4242
  const frag = ydoc.getXmlFragment(NOM_TEXTE)
  const textes = []
  ydoc.transact(() => {
    for (let i = 0; i < 40; i++) {
      const p = new Y.XmlElement('paragraph')
      const t = new Y.XmlText('')
      p.insert(0, [t])
      frag.insert(frag.length, [p])
      textes.push(t)
    }
  })
  let frappes = 0
  let effaces = 0
  for (let i = 0; i < 60000; i++) {
    const t = textes[Math.floor(hasard() * textes.length)]
    ydoc.transact(() => {
      if (t.length > 200 && hasard() < 0.6) {
        const d = Math.min(t.length, 1 + Math.floor(hasard() * 12))
        t.delete(Math.floor(hasard() * (t.length - d)), d)
        effaces += d
      } else {
        const c = f.pick(['e', 'a', ' ', 'i', 'n', 's', 't', 'r', 'o', 'l'])
        t.insert(Math.floor(hasard() * (t.length + 1)), c)
        frappes++
      }
    })
  }
  return { ydoc, resume: { transactions: 60000, frappes, effaces } }
}

export const PROFILS = {
  these: { texte: 'thèse de 80 000 mots', fait: (h) => docThese(h) },
  livre: { texte: 'livre de 120 000 mots', fait: (h) => docLivre(h) },
  'suivi-dense': { texte: 'suivi de modifications dense', fait: (h) => docSuiviDense(h) },
  'commentaires-denses': { texte: '400 commentaires ancrés', fait: (h) => docCommentairesDenses(h) },
  'listes-profondes': { texte: 'listes imbriquées sur 8 niveaux', fait: (h) => docListesProfondes(h) },
  'vieux-journal': { texte: '60 000 frappes séparées', fait: (h) => vieuxJournal(h) },
  'hostile-de-bonne-foi': { texte: 'ce que les gens collent sans mauvaise intention', fait: (h) => docHostile(h) },
}

// ------------------------------------------------------ construction du .bin

/** Positions (dans le document ProseMirror) où poser une ancre : à
 * l'intérieur des textes ordinaires. */
function positionsDeTexte(pmDoc) {
  const out = []
  pmDoc.descendants((noeud, pos) => {
    if (noeud.isText && noeud.text.length > 30 && !noeud.marks.length) out.push({ debut: pos, longueur: noeud.text.length })
  })
  return out
}

function poserCommentaires(ydoc, pmDoc, hasard, { n, reponses }) {
  const f = fabrique(hasard)
  const { meta } = YPM.initProseMirrorDoc(ydoc.getXmlFragment(NOM_TEXTE), schema)
  const frag = ydoc.getXmlFragment(NOM_TEXTE)
  const cartes = ydoc.getMap(NOM_COMMENTAIRES)
  const lieux = positionsDeTexte(pmDoc)
  const t0 = Date.UTC(2026, 8, 10)
  let ancres = 0
  let rep = 0
  ydoc.transact(() => {
    for (let i = 0; i < n && lieux.length; i++) {
      const lieu = lieux[Math.floor(hasard() * lieux.length)]
      const a = lieu.debut + Math.floor(hasard() * (lieu.longueur - 25))
      const b = a + 5 + Math.floor(hasard() * 18)
      const auteur = f.pick(AUTEURS)
      const id = `c-${t0 + i * 1000}-${String(i).padStart(6, '0')}`
      cartes.set(id, {
        id, author: auteur.user, authorId: `u-${auteur.user.split(' ')[0].toLowerCase()}`, color: auteur.userColor,
        anchorFrom: Y.relativePositionToJSON(YPM.absolutePositionToRelativePosition(a, frag, meta.mapping)),
        anchorTo: Y.relativePositionToJSON(YPM.absolutePositionToRelativePosition(b, frag, meta.mapping)),
        text: f.phrase(), createdAt: t0 + i * 1000,
      })
      ancres++
      if (hasard() < reponses) {
        const r = f.pick(AUTEURS)
        const rid = `r-${t0 + i * 1000 + 500}-${String(i).padStart(6, '0')}`
        cartes.set(rid, { id: rid, parent: id, author: r.user, authorId: `u-${r.user.split(' ')[0].toLowerCase()}`, color: r.userColor, text: f.phrase(), createdAt: t0 + i * 1000 + 500 })
        rep++
      }
    }
  })
  return { ancres, reponses: rep }
}

/** Le document ProseMirror d'un profil (ou `null` pour les profils qui ne
 * passent que par Yjs) : de quoi fabriquer la source Typst côté outil, comme
 * le ferait le navigateur (tools/export-pdf.mjs, scénario C4). */
export function documentProseMirror(profil, graine = 20261011) {
  const def = PROFILS[profil]
  if (!def) throw new Error(`profil inconnu : ${profil}`)
  const hasard = prng(graine + [...profil].reduce((s, c) => s + c.charCodeAt(0), 0))
  const sortie = def.fait(hasard)
  return sortie.doc ? schema.nodeFromJSON(sortie.doc) : null
}

export function construire(profil, graine = 20261011) {
  const def = PROFILS[profil]
  if (!def) throw new Error(`profil inconnu : ${profil} (essayez « liste »)`)
  const hasard = prng(graine + [...profil].reduce((s, c) => s + c.charCodeAt(0), 0))
  const sortie = def.fait(hasard)
  let ydoc
  let pmDoc = null
  if (sortie.ydoc) ydoc = sortie.ydoc
  else {
    pmDoc = schema.nodeFromJSON(sortie.doc)
    pmDoc.check()
    ydoc = new Y.Doc()
    ydoc.clientID = 4242 // fixe : mêmes graines, mêmes octets
    YPM.prosemirrorToYXmlFragment(pmDoc, ydoc.getXmlFragment(NOM_TEXTE))
  }
  const resume = { profil, graine, ...sortie.resume }
  if (sortie.commentaires) resume.commentaires = poserCommentaires(ydoc, pmDoc, hasard, sortie.commentaires)
  const bin = Y.encodeStateAsUpdate(ydoc)
  resume.octets = bin.length
  resume.empreinte = createHash('sha256').update(bin).digest('hex').slice(0, 16)
  if (pmDoc) { resume.signes = pmDoc.textContent.length; resume.blocs = pmDoc.childCount }
  return { bin, resume }
}

// --------------------------------------------------------------------- CLI

async function envoyer(profil, { base, cookie }) {
  const { bin, resume } = construire(profil)
  if (bin.length > 15 * 1024 * 1024) throw new Error(`${profil} : ${bin.length} octets, au-delà du plafond de trame du serveur (16 Mo)`)
  const entetes = { 'content-type': 'application/json', cookie }
  const res = await fetch(`${base}/api/docs`, { method: 'POST', headers: entetes, body: JSON.stringify({ title: `CORPUS ${profil} — à supprimer` }) })
  if (!res.ok) throw new Error(`création refusée : ${res.status} ${await res.text()}`)
  const { id } = await res.json()
  const { WebSocket } = createRequire(import.meta.url)('ws')
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws/${id}?user=corpus`, { headers: { cookie } })
    let envoye = false
    ws.on('message', (data, binaire) => {
      if (binaire) return
      let m
      try { m = JSON.parse(data.toString()) } catch { return }
      if (m.type === 'synced' && !envoye) {
        envoye = true
        ws.send(bin, { binary: true }, (e) => {
          if (e) return reject(e)
          // le temps que le serveur absorbe : il ne répond pas à un envoi, on attend l'écho
          setTimeout(() => { ws.close(); resolve() }, Math.min(30000, 500 + bin.length / 2000))
        })
      } else if (m.type === 'refuse') reject(new Error('refusé par le serveur : ' + data))
    })
    ws.on('error', reject)
    setTimeout(() => reject(new Error('délai')), 120000)
  })
  return { id, ...resume }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const cmd = args[0]
  const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1] }
  const cible = args[1]
  const noms = cible === 'tous' ? Object.keys(PROFILS) : [cible]
  if (cmd === 'liste' || !cmd) {
    for (const [nom, d] of Object.entries(PROFILS)) console.log(`${nom.padEnd(22)} ${d.texte}`)
  } else if (cmd === 'generer') {
    const dossier = opt('sortie', 'corpus')
    mkdirSync(dossier, { recursive: true })
    for (const nom of noms) {
      const t0 = Date.now()
      const { bin, resume } = construire(nom, Number(opt('graine', 20261011)))
      writeFileSync(join(dossier, `${nom}.bin`), bin)
      writeFileSync(join(dossier, `${nom}.json`), JSON.stringify(resume, null, 2))
      console.log(`${nom.padEnd(22)} ${(bin.length / 1024).toFixed(0).padStart(7)} Ko  ${Date.now() - t0} ms  ${JSON.stringify(resume)}`)
    }
  } else if (cmd === 'envoyer') {
    const base = opt('base', '').replace(/\/$/, '')
    const cookie = opt('cookie', process.env.AMEND_COOKIE || '')
    if (!base || !cookie) { console.error('--base et --cookie (ou $AMEND_COOKIE) sont requis'); process.exit(2) }
    for (const nom of noms) console.log(JSON.stringify(await envoyer(nom, { base, cookie })))
    process.exit(0)
  } else {
    console.error('usage : corpus.js liste | generer <profil|tous> [--sortie dossier] | envoyer <profil|tous> --base … --cookie …')
    process.exit(2)
  }
}
