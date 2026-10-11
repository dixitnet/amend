#!/usr/bin/env node
// Fuzz de convergence de la collaboration (protocole de test global, §5, T-C
// « convergence »). Plusieurs faux clients écrivent au hasard dans un même
// document — texte, coupures et fusions de paragraphes, gras, notes, listes,
// commentaires et réponses — en se coupant, en travaillant hors ligne, en
// reprenant, et pendant que le serveur est redémarré (arrêt propre ou SIGKILL).
// À la fin, tout le monde se rejoint et on vérifie :
//   1. tous les clients ont *exactement* le même état (vecteur d'état, contenu) ;
//   2. ce serveur-là l'a aussi, et le garde après un redémarrage brutal ;
//   3. le contenu converti en ProseMirror ne contient que des nœuds connus.
//      (Les contenus que le schéma refuse mais que l'éditeur répare à l'ouverture,
//      par exemple une liste vide, sont comptés comme avertissements.)
//
// Une graine rejoue la même suite d'opérations (l'ordre exact des messages
// réseau, lui, dépend du temps : une divergence se rejoue souvent, pas toujours —
// le journal des opérations est écrit pour comprendre).
//
//   node tools/fuzz-collab.js --graine 7 --clients 4 --secondes 20
//   node tools/fuzz-collab.js --serie 20 --secondes 8      # 20 graines à la suite
//
// Local uniquement (instance jetable, tools/instance-test.js) : ne se lance
// jamais contre la production.

import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { lancerInstance } from './instance-test.js'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const { WebSocket } = createRequire(import.meta.url)('ws')
const importerClient = (chemin) => import(pathToFileURL(join(RACINE, 'client', chemin)).href)
const Y = await importerClient('node_modules/yjs/dist/yjs.mjs')
const YPM = await importerClient('node_modules/y-prosemirror/src/y-prosemirror.js')
const { schema } = await importerClient('src/schema.js')
const { NOM_TEXTE, NOM_COMMENTAIRES } = await importerClient('../shared/protocole.js')

const dors = (ms) => new Promise((r) => setTimeout(r, ms))

function prng(graine) {
  let a = graine >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ------------------------------------------------------------------ client

/** Un index qui ne coupe pas une paire de substitution (emoji). Un clavier
 * ne le fait pas — la suppression arrière retire l'emoji entier — et Yjs
 * remplace les moitiés orphelines par U+FFFD *au moment de la coupure*, donc
 * à des moments différents d'un client à l'autre : ce n'est pas un scénario
 * réel, c'est un artefact du hasard. */
function sansCouper(texte, i) {
  // toString() d'un XmlText met les balises de mise en forme dans la chaîne :
  // les index se comptent sur le texte seul (un objet intégré compte pour 1).
  const s = texte.toDelta().map((d) => (typeof d.insert === 'string' ? d.insert : '\ufffc')).join('')
  const c = s.charCodeAt(i)
  const avant = s.charCodeAt(i - 1)
  return i > 0 && avant >= 0xd800 && avant <= 0xdbff && c >= 0xdc00 && c <= 0xdfff ? i - 1 : i
}

class Faux {
  constructor(nom, base, cookie, docId, hasard, journal) {
    this.nom = nom
    this.base = base
    this.cookie = cookie
    this.docId = docId
    this.hasard = hasard
    this.journal = journal
    this.doc = new Y.Doc()
    this.frag = this.doc.getXmlFragment(NOM_TEXTE)
    this.commentaires = this.doc.getMap(NOM_COMMENTAIRES)
    this.ws = null
    this.synchro = false
    this.veutEtreConnecte = true
    this.doc.on('update', (u, origine) => {
      if (origine === 'distant') return
      if (this.ws && this.ws.readyState === 1 && this.synchro) this.ws.send(u)
      // hors ligne ou pas encore synchronisé : le vecteur d'état à la
      // reconnexion enverra le reste (`sv` + envoi complet du différentiel).
    })
  }

  connecter() {
    if (this.ws) return Promise.resolve()
    return new Promise((resolve) => {
      this.synchro = false
      const sv = Buffer.from(Y.encodeStateVector(this.doc)).toString('base64')
      const ws = new WebSocket(`${this.base.replace(/^http/, 'ws')}/ws/${this.docId}?user=${this.nom}&sv=${encodeURIComponent(sv)}`, { headers: { cookie: this.cookie } })
      this.ws = ws
      ws.on('message', (data, binaire) => {
        if (binaire) { try { Y.applyUpdate(this.doc, new Uint8Array(data), 'distant') } catch (e) { this.journal.push(`${this.nom} applyUpdate: ${e.message}`) } return }
        let m
        try { m = JSON.parse(data.toString()) } catch { return }
        if (m.type === 'refuse') this.journal.push(`${this.nom} REFUSÉ par le serveur : ${m.raison}`)
        if (m.type === 'synced') {
          // ce que le serveur n'a pas : le différentiel depuis son vecteur d'état
          try {
            const svServeur = m.sv ? new Uint8Array(Buffer.from(m.sv, 'base64')) : undefined
            const reste = Y.encodeStateAsUpdate(this.doc, svServeur)
            if (reste.length > 2) ws.send(reste)
          } catch { /* on réessaiera à la prochaine connexion */ }
          this.synchro = true
          resolve()
        }
      })
      ws.on('close', (code) => { if (this.ws === ws) { this.ws = null; this.synchro = false; this.journal.push(`${this.nom} connexion fermée (${code})`) } resolve() })
      ws.on('unexpected-response', (req, res) => this.journal.push(`${this.nom} réponse inattendue ${res.statusCode}`))
      ws.on('error', (e) => this.journal.push(`${this.nom} erreur ws : ${e.message}`))
      setTimeout(resolve, 8000)
    })
  }

  couper(brutal) {
    const ws = this.ws
    if (!ws) return
    this.ws = null
    this.synchro = false
    try { brutal ? ws.terminate() : ws.close() } catch { /* déjà fermé */ }
  }

  paragraphes() { return this.frag.toArray().filter((n) => n instanceof Y.XmlElement && (n.nodeName === 'paragraph' || n.nodeName === 'heading')) }
  textes() {
    const out = []
    for (const p of this.paragraphes()) for (const c of p.toArray()) if (c instanceof Y.XmlText) out.push(c)
    return out
  }

  /** Une opération au hasard ; renvoie sa description (pour le journal). */
  agir() {
    const h = this.hasard
    const entier = (n) => Math.floor(h() * n)
    const textes = this.textes()
    const ps = this.paragraphes()
    const r = h()
    let d = ''
    this.doc.transact(() => {
      if (!ps.length || r < 0.02) {
        const p = new Y.XmlElement(h() < 0.2 ? 'heading' : 'paragraph')
        if (p.nodeName === 'heading') p.setAttribute('level', 1 + entier(3))
        p.insert(0, [new Y.XmlText(`départ-${this.nom}`)])
        this.frag.insert(entier(this.frag.length + 1), [p])
        d = 'nouveau bloc'
      } else if (r < 0.45 && textes.length) {
        const t = textes[entier(textes.length)]
        const mot = ['alpha', 'béta', 'γ', ' ', 'é', '👩🏽‍🚀', 'x'][entier(7)]
        const i = sansCouper(t, entier(t.length + 1))
        t.insert(i, mot)
        d = `insère « ${mot} » en ${i}`
      } else if (r < 0.6 && textes.length) {
        const t = textes[entier(textes.length)]
        if (t.length > 2) {
          const i = sansCouper(t, entier(t.length - 1))
          const j = sansCouper(t, Math.min(t.length, i + 1 + entier(8)))
          if (j > i) { t.delete(i, j - i); d = `supprime ${j - i} en ${i}` }
        }
      } else if (r < 0.67 && textes.length) {
        const t = textes[entier(textes.length)]
        if (t.length > 6) {
          const i = sansCouper(t, entier(t.length - 4))
          const j = sansCouper(t, Math.min(t.length, i + 2 + entier(3)))
          t.format(i, j - i, h() < 0.7 ? { strong: {} } : { strong: null })
          d = `gras en ${i}`
        }
      } else if (r < 0.74 && ps.length) {
        // coupe d'un paragraphe : la fin passe dans un nouveau bloc
        const p = ps[entier(ps.length)]
        const t = p.toArray().find((c) => c instanceof Y.XmlText)
        if (t && t.length > 4) {
          const i = sansCouper(t, 1 + entier(t.length - 2))
          const fin = t.toDelta().map((d) => (typeof d.insert === 'string' ? d.insert : '')).join('').slice(i)
          t.delete(i, t.length - i)
          const q = new Y.XmlElement('paragraph')
          q.insert(0, [new Y.XmlText(fin)])
          const idx = this.frag.toArray().indexOf(p)
          this.frag.insert(idx + 1, [q])
          d = `coupe un bloc en ${i}`
        }
      } else if (r < 0.8 && ps.length > 2) {
        // fusion : le bloc suivant est ajouté au précédent puis supprimé
        const tous = this.frag.toArray()
        const k = 1 + entier(tous.length - 1)
        const prec = tous[k - 1]
        const cour = tous[k]
        if (prec instanceof Y.XmlElement && cour instanceof Y.XmlElement && ['paragraph', 'heading'].includes(prec.nodeName) && cour.nodeName === 'paragraph') {
          const tp = prec.toArray().find((c) => c instanceof Y.XmlText)
          const tc = cour.toArray().find((c) => c instanceof Y.XmlText)
          if (tp && tc) { tp.insert(tp.length, tc.toDelta().map((d) => (typeof d.insert === 'string' ? d.insert : '')).join('')); this.frag.delete(k, 1); d = `fusionne les blocs ${k - 1}/${k}` }
        }
      } else if (r < 0.84 && ps.some((q) => q.nodeName === 'paragraph')) {
        // pas de note dans un titre : le schéma l'interdit, l'interface aussi
        const seuls = ps.filter((q) => q.nodeName === 'paragraph')
        const p = seuls[entier(seuls.length)]
        const note = new Y.XmlElement('footnote')
        note.insert(0, [new Y.XmlText(`note-${this.nom}`)])
        p.insert(entier(p.length + 1), [note])
        d = 'insère une note'
      } else if (r < 0.88) {
        const li = new Y.XmlElement('list_item')
        const q = new Y.XmlElement('paragraph')
        q.insert(0, [new Y.XmlText(`item-${this.nom}`)])
        li.insert(0, [q])
        const listes = this.frag.toArray().filter((n) => n instanceof Y.XmlElement && n.nodeName === 'bullet_list')
        if (listes.length && h() < 0.8) {
          const l = listes[entier(listes.length)]
          l.insert(entier(l.length + 1), [li])
          d = 'item de liste'
        } else {
          const l = new Y.XmlElement('bullet_list')
          l.insert(0, [li])
          this.frag.insert(entier(this.frag.length + 1), [l])
          d = 'nouvelle liste'
        }
      } else if (r < 0.9) {
        const listes = this.frag.toArray().filter((n) => n instanceof Y.XmlElement && n.nodeName === 'bullet_list')
        if (listes.length) {
          const l = listes[entier(listes.length)]
          if (l.length > 1) { l.delete(entier(l.length), 1); d = 'supprime un item' }
        }
      } else if (r < 0.95 && textes.length) {
        const t = textes[entier(textes.length)]
        if (t.length > 8) {
          const a = sansCouper(t, entier(t.length - 6))
          const id = `c-${this.nom}-${Date.now()}-${entier(1e6)}`
          this.commentaires.set(id, {
            id, author: this.nom, authorId: `u-${this.nom}`, color: '#555',
            anchorFrom: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(t, a)),
            anchorTo: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(t, a + 5)),
            text: `remarque de ${this.nom}`, createdAt: Date.now(),
          })
          d = 'commente'
        }
      } else if (r < 0.98) {
        const ancres = [...this.commentaires.entries()].filter(([, c]) => c && !c.parent)
        if (ancres.length) {
          const [pid] = ancres[entier(ancres.length)]
          const id = `r-${this.nom}-${Date.now()}-${entier(1e6)}`
          this.commentaires.set(id, { id, parent: pid, author: this.nom, authorId: `u-${this.nom}`, color: '#555', text: 'réponse', createdAt: Date.now() })
          d = 'répond'
        }
      } else {
        const ids = [...this.commentaires.keys()]
        if (ids.length) { this.commentaires.delete(ids[entier(ids.length)]); d = 'supprime un commentaire' }
      }
    })
    return d
  }
}

// ----------------------------------------------------------------- vérifs

const empreinte = (u8) => createHash('sha256').update(u8).digest('hex').slice(0, 12)

function instantane(doc) {
  const frag = doc.getXmlFragment(NOM_TEXTE)
  const contenu = frag.toJSON()
  const commentaires = JSON.stringify([...doc.getMap(NOM_COMMENTAIRES).entries()].sort(([a], [b]) => (a < b ? -1 : 1)))
  return { contenu, commentaires, sv: empreinte(Y.encodeStateVector(doc)) }
}

/** Où deux états s'écartent, pour comprendre sans rejouer. */
function premiereDifference(a, b) {
  const sa = JSON.stringify([a.contenu, a.commentaires])
  const sb = JSON.stringify([b.contenu, b.commentaires])
  let i = 0
  while (i < sa.length && i < sb.length && sa[i] === sb[i]) i++
  const extrait = (s) => JSON.stringify(s.slice(Math.max(0, i - 25), i + 40))
  return `\n       premier écart au signe ${i} : ${a.nom} ${extrait(sa)} / ${b.nom} ${extrait(sb)}`
}

function verifierSchema(doc) {
  const avertissements = []
  const erreurs = []
  let json
  try { json = YPM.yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(NOM_TEXTE)) } catch (e) { return { erreurs: [`conversion impossible : ${e.message}`], avertissements } }
  try {
    const noeud = schema.nodeFromJSON({ type: 'doc', content: json.content || [] })
    try { noeud.check() } catch (e) { avertissements.push(e.message.slice(0, 160)) }
  } catch (e) {
    erreurs.push(`nœud inconnu ou invalide : ${e.message.slice(0, 200)}`)
  }
  return { erreurs, avertissements }
}

async function lireDepuisServeur(base, cookie, docId) {
  const doc = new Y.Doc()
  await new Promise((resolve) => {
    const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws/${docId}?user=verif`, { headers: { cookie } })
    ws.on('message', (data, binaire) => {
      if (binaire) Y.applyUpdate(doc, new Uint8Array(data), 'distant')
      else { try { if (JSON.parse(data.toString()).type === 'synced') { ws.close(); resolve() } } catch { /* pas du JSON */ } }
    })
    ws.on('error', resolve)
    setTimeout(resolve, 10000)
  })
  return doc
}

// ------------------------------------------------------------------ essai

export async function essai({ graine = 1, clients = 4, secondes = 10, opsParSeconde = 12, tauxCoupure = 0.03, redemarrages = 1, port = 18990, dossierRapports = null, silencieux = false } = {}) {
  const hasard = prng(graine)
  const journal = []
  const inst = await lancerInstance({ port, comptes: ['fuzz@test.local'] })
  const cookie = inst.cookies['fuzz@test.local']
  const rapport = { graine, clients, secondes, donnees: inst.data, ok: true, problemes: [], avertissements: [], ops: 0, coupures: 0, redemarrages: 0 }
  try {
    const creation = await inst.api('/api/docs', { cookie, methode: 'POST', corps: { title: `fuzz ${graine}` } })
    if (!creation.json || !creation.json.id) throw new Error(`création du document refusée : ${creation.status} ${creation.texte.slice(0, 200)} (un serveur de l'essai précédent tient peut-être encore le port ${port} ?)`)
    const docId = creation.json.id
    const faux = Array.from({ length: clients }, (_, i) => new Faux(`f${i + 1}`, inst.base, cookie, docId, hasard, journal))
    await Promise.all(faux.map((f) => f.connecter()))
    faux[0].agir()
    await dors(200)

    const fin = Date.now() + secondes * 1000
    const prochainRedemarrage = Array.from({ length: redemarrages }, () => Date.now() + (0.2 + 0.6 * hasard()) * secondes * 1000).sort()
    while (Date.now() < fin) {
      const f = faux[Math.floor(hasard() * faux.length)]
      if (f.ws || hasard() < 0.5) {
        const d = f.agir()
        if (d) { rapport.ops++; journal.push(`${((Date.now() - (fin - secondes * 1000)) / 1000).toFixed(2)} ${f.nom} ${d}`) }
      }
      if (hasard() < tauxCoupure) {
        if (f.ws) { const brutal = hasard() < 0.5; f.couper(brutal); rapport.coupures++; journal.push(`${f.nom} coupe (${brutal ? 'brutal' : 'propre'})`) }
        else f.connecter()
      }
      if (prochainRedemarrage.length && Date.now() > prochainRedemarrage[0]) {
        prochainRedemarrage.shift()
        const brutal = hasard() < 0.5
        journal.push(`serveur redémarre (${brutal ? 'SIGKILL' : 'SIGTERM'})`)
        await inst.redemarrer({ brutal })
        rapport.redemarrages++
        for (const g of faux) g.couper(true)
        await dors(300)
        await Promise.all(faux.map((g) => g.connecter()))
      }
      // quelques clients reviennent seuls
      for (const g of faux) if (!g.ws && hasard() < 0.15) g.connecter()
      await dors(Math.max(1, Math.round(1000 / opsParSeconde * (0.5 + hasard()))))
    }

    // tout le monde revient, on laisse tout circuler
    for (const g of faux) { g.couper(true) }
    await dors(300)
    await Promise.all(faux.map((g) => g.connecter()))
    await dors(1500)
    // un second tour : ce que les uns ont reçu en dernier doit repartir vers les autres
    for (const g of faux) g.couper(false)
    await dors(300)
    await Promise.all(faux.map((g) => g.connecter()))
    await dors(1500)

    if (process.env.FUZZ_DETAIL) for (const g of faux) journal.push(`fin : ${g.nom} ws=${g.ws && g.ws.readyState} synchro=${g.synchro} blocs=${g.frag.length} commentaires=${g.commentaires.size} sv=${empreinte(Y.encodeStateVector(g.doc))}`)
    const vues = faux.map((g) => ({ nom: g.nom, ...instantane(g.doc) }))
    const serveur = instantane(await lireDepuisServeur(inst.base, cookie, docId))
    const ref = JSON.stringify([vues[0].contenu, vues[0].commentaires])
    for (const v of vues.slice(1)) {
      if (JSON.stringify([v.contenu, v.commentaires]) !== ref) rapport.problemes.push(`${v.nom} diverge de ${vues[0].nom} (vecteurs ${v.sv} / ${vues[0].sv})${premiereDifference(vues[0], v)}`)
    }
    if (JSON.stringify([serveur.contenu, serveur.commentaires]) !== ref) rapport.problemes.push(`le serveur diverge des clients (vecteurs ${serveur.sv} / ${vues[0].sv})`)
    const s = verifierSchema(faux[0].doc)
    rapport.problemes.push(...s.erreurs)
    rapport.avertissements.push(...s.avertissements)

    // ce que le serveur a gardé survit à un plantage brutal
    await inst.redemarrer({ brutal: true })
    const apres = instantane(await lireDepuisServeur(inst.base, cookie, docId))
    if (JSON.stringify([apres.contenu, apres.commentaires]) !== ref) rapport.problemes.push('le serveur a perdu du contenu au redémarrage brutal final')

    for (const g of faux) g.couper(true)
    rapport.ok = rapport.problemes.length === 0
    rapport.empreinte = vues[0].sv
  } catch (e) {
    rapport.ok = false
    rapport.problemes.push(`essai interrompu : ${e.stack || e.message}`)
  } finally {
    await inst.arreter({ garderDonnees: !rapport.ok })
    if (dossierRapports && !rapport.ok) {
      mkdirSync(dossierRapports, { recursive: true })
      writeFileSync(join(dossierRapports, `fuzz-${graine}.log`), journal.join('\n') + '\n\n' + JSON.stringify(rapport, null, 2) + '\n\n--- journal du serveur ---\n' + inst.journal.join('').slice(-4000))
    }
    if (!silencieux) console.log(`graine ${String(graine).padStart(4)}  ${rapport.ok ? 'OK ' : 'ÉCHEC'}  ${rapport.ops} opérations, ${rapport.coupures} coupures, ${rapport.redemarrages} redémarrages${rapport.avertissements.length ? `, ${rapport.avertissements.length} avertissement(s)` : ''}${rapport.ok ? '' : '\n   - ' + rapport.problemes.join('\n   - ')}${rapport.avertissements.length ? '\n   ~ ' + [...new Set(rapport.avertissements)].join('\n   ~ ') : ''}`)
  }
  return rapport
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1] }
  const serie = Number(opt('serie', 0))
  const graine0 = Number(opt('graine', 1))
  const options = {
    clients: Number(opt('clients', 4)),
    secondes: Number(opt('secondes', 10)),
    opsParSeconde: Number(opt('ops', 12)),
    tauxCoupure: Number(opt('coupures', 0.03)),
    redemarrages: Number(opt('redemarrages', 1)),
    port: Number(opt('port', 18990)),
    dossierRapports: opt('rapports', 'tests/campagne/fuzz'),
  }
  const graines = serie ? Array.from({ length: serie }, (_, i) => graine0 + i) : [graine0]
  let echecs = 0
  for (const g of graines) if (!(await essai({ ...options, graine: g })).ok) echecs++
  console.log(echecs ? `\n${echecs} échec(s) sur ${graines.length} — journaux dans ${options.dossierRapports}/` : `\n${graines.length} essai(s) sans divergence`)
  process.exit(echecs ? 1 : 0)
}
