// La fenêtre de dialogue avec Claude (07/10/2026,
// claude/conception-dialogue-integre.md).
//
// Une palette flottante, pas un panneau : elle se pose par-dessus un coin de
// l'écran et laisse voir — et lire — le texte dont on parle. Claude y répond
// en citant des blocs par leur numéro entre crochets ([34]) ; chaque numéro
// est un bouton qui y mène. Quand il propose des modifications, elles
// arrivent comme celles d'un collègue : en suivi de modifications, à accepter
// ou à rejeter dans le panneau habituel. Rien n'est jamais écrit en direct.
//
// La conversation reste **dans le navigateur** (sessionStorage, le temps de
// l'onglet) : le serveur ne la garde pas, et ne journalise ni les messages
// ni le texte du document.

import { defilerVers } from './defilement.js'
import { rapport, signes } from '../../shared/signes.js'
import { changesKey } from './changesPanel.js'
import { rejectAgentChanges, estModificationDAgent, listChanges } from './trackChanges.js'

const MESSAGE_MAX = 8000

// ---------------------------------------------------------------------------
// Les blocs, comme le serveur les compte (server/agentTexte.js, blocsDuDocument)
// ---------------------------------------------------------------------------

const SELECTEUR_BLOCS = 'p, h1, h2, h3, h4, h5, h6'

/** Les éléments du document que le serveur numérote : tout paragraphe ou
 * titre de l'éditeur principal, sauf ceux de la table des matières. C'est la
 * règle du compteur CSS des numéros de bloc (style.css). */
export function blocsDuDom(view) {
  return Array.from(view.dom.querySelectorAll(SELECTEUR_BLOCS)).filter((el) => !el.closest('[data-table-of-contents]'))
}

/** Le numéro (à partir de 1) du dernier bloc qui commence à `pos` ou avant. */
function numeroAvant(positions, pos) {
  let n = 0
  for (let i = 0; i < positions.length; i++) {
    if (positions[i] <= pos) n = i + 1
    else break
  }
  return Math.max(1, n)
}

function positionsDesBlocs(view, els) {
  return els.map((el) => {
    try {
      return view.posAtDOM(el, 0)
    } catch {
      return Number.MAX_SAFE_INTEGER
    }
  })
}

/** La portée de la conversation, telle que le serveur l'attend :
 * `{type:'document'}`, `{type:'section', de, a}` (du titre en cours au titre
 * suivant de même niveau ou plus haut) ou `{type:'selection', de, a}`.
 * Renvoie `null` si la portée demandée n'a pas de sens (rien de sélectionné). */
export function porteeDe(view, type) {
  if (type === 'document' || !view) return { type: 'document' }
  const els = blocsDuDom(view)
  if (!els.length) return { type: 'document' }
  const positions = positionsDesBlocs(view, els)
  const { from, to, empty } = view.state.selection
  if (type === 'selection') {
    if (empty) return null
    return { type: 'selection', de: numeroAvant(positions, from), a: numeroAvant(positions, to) }
  }
  // Section : remonter au titre qui couvre le curseur.
  const niveau = (el) => (/^H[1-6]$/.test(el.tagName) ? Number(el.tagName[1]) : null)
  let debut = numeroAvant(positions, from)
  let i = debut - 1
  while (i >= 0 && niveau(els[i]) === null) i--
  if (i < 0) return { type: 'section', de: 1, a: Math.min(els.length, debut) }
  const n0 = niveau(els[i])
  let fin = els.length
  for (let j = i + 1; j < els.length; j++) {
    const nj = niveau(els[j])
    if (nj !== null && nj <= n0) {
      fin = j
      break
    }
  }
  return { type: 'section', de: i + 1, a: fin }
}

/** Les signes (espaces compris) du texte de la portée, tels qu'on les voit
 * dans l'éditeur : c'est la taille que le serveur contrôlera, à quelques
 * signes près (il compte le texte visible des blocs numérotés). */
export function taillePortee(view, p) {
  if (!view || !p) return 0
  const els = blocsDuDom(view)
  const retenus = p.type === 'document' ? els : els.slice(p.de - 1, p.a)
  return retenus.reduce((n, el) => n + el.textContent.length, 0)
}

export function libellePortee(p) {
  if (!p) return ''
  if (p.type === 'document') return 'tout le document'
  return p.de === p.a ? `bloc ${p.de}` : `blocs ${p.de} à ${p.a}`
}

// ---------------------------------------------------------------------------
// Le flux : une ligne JSON par événement
// ---------------------------------------------------------------------------

/** Lit la réponse ndjson au fil de l'eau. Une ligne illisible est ignorée :
 * un flux coupé en deux par un intermédiaire ne doit pas tout casser. */
export async function lireFlux(reponse, surEvenement) {
  const lecteur = reponse.body.getReader()
  const decodeur = new TextDecoder()
  let reste = ''
  const traiter = (ligne) => {
    if (!ligne.trim()) return
    let evt
    try {
      evt = JSON.parse(ligne)
    } catch {
      return
    }
    surEvenement(evt)
  }
  for (;;) {
    const { done, value } = await lecteur.read()
    if (done) break
    reste += decodeur.decode(value, { stream: true })
    let i
    while ((i = reste.indexOf('\n')) >= 0) {
      traiter(reste.slice(0, i))
      reste = reste.slice(i + 1)
    }
  }
  reste += decodeur.decode()
  traiter(reste)
}

// ---------------------------------------------------------------------------
// Le texte de Claude : paragraphes, listes à tirets, **gras**, [n] cliquables
// ---------------------------------------------------------------------------

const REF = /\[(\d{1,6})(?:\s*[–-]\s*(\d{1,6}))?\]/g

/** Écrit `texte` dans `parent` en texte brut, sauf les références de bloc,
 * qui deviennent des boutons. Jamais d'innerHTML : la réponse d'un modèle
 * n'est pas une source de balisage. */
function ecrireLigne(parent, texte, surBloc) {
  const gras = texte.split(/(\*\*[^*]+\*\*)/g)
  for (const morceau of gras) {
    if (!morceau) continue
    let cible = parent
    let t = morceau
    if (/^\*\*[^*]+\*\*$/.test(morceau)) {
      cible = document.createElement('strong')
      parent.appendChild(cible)
      t = morceau.slice(2, -2)
    }
    let dernier = 0
    for (const m of t.matchAll(REF)) {
      if (m.index > dernier) cible.appendChild(document.createTextNode(t.slice(dernier, m.index)))
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'dialogue-bloc'
      b.textContent = m[0]
      b.title = m[2] ? `Aller aux blocs ${m[1]} à ${m[2]}` : `Aller au bloc ${m[1]}`
      b.dataset.n = m[1]
      b.addEventListener('click', () => surBloc(Number(m[1]), m[2] ? Number(m[2]) : Number(m[1])))
      cible.appendChild(b)
      dernier = m.index + m[0].length
    }
    if (dernier < t.length) cible.appendChild(document.createTextNode(t.slice(dernier)))
  }
}

export function rendreTexte(conteneur, texte, surBloc = () => {}) {
  conteneur.textContent = ''
  let liste = null
  for (const ligne of String(texte).replace(/\r/g, '').split('\n')) {
    const item = ligne.match(/^\s*[-•]\s+(.*)$/)
    if (item) {
      if (!liste) {
        liste = document.createElement('ul')
        conteneur.appendChild(liste)
      }
      const li = document.createElement('li')
      ecrireLigne(li, item[1], surBloc)
      liste.appendChild(li)
      continue
    }
    liste = null
    if (!ligne.trim()) continue
    const p = document.createElement('p')
    ecrireLigne(p, ligne, surBloc)
    conteneur.appendChild(p)
  }
}

// ---------------------------------------------------------------------------
// La conversation à envoyer
// ---------------------------------------------------------------------------

/** L'API veut une alternance stricte : si un message de Claude est resté vide
 * (il n'a fait que travailler, ou a échoué), les deux messages de la personne
 * qui l'entourent n'en font qu'un. */
export function pourEnvoi(messages) {
  const sortie = []
  for (const m of messages) {
    const contenu = String(m.content || '').trim()
    if (!contenu) continue
    const dernier = sortie[sortie.length - 1]
    if (dernier && dernier.role === m.role) dernier.content += `\n\n${contenu}`
    else sortie.push({ role: m.role, content: contenu })
  }
  return sortie.map((m) => ({ role: m.role, content: m.content.slice(0, MESSAGE_MAX) }))
}

function cle(docId) {
  return `amend.dialogue.${docId}`
}
function charger(docId) {
  try {
    const brut = sessionStorage.getItem(cle(docId))
    const v = brut ? JSON.parse(brut) : null
    return v && Array.isArray(v.messages)
      ? v.messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      : []
  } catch {
    return []
  }
}
function enregistrer(docId, messages) {
  try {
    sessionStorage.setItem(cle(docId), JSON.stringify({ messages }))
  } catch {
    // Navigation privée, stockage bloqué : la conversation vit alors le temps de la page.
  }
}

// ---------------------------------------------------------------------------
// La palette
// ---------------------------------------------------------------------------

function el(nom, classe, texte) {
  const e = document.createElement(nom)
  if (classe) e.className = classe
  if (texte != null) e.textContent = texte
  return e
}

/**
 * Monte la palette si — et seulement si — le serveur dit que la personne y
 * a droit. Renvoie `null` sinon (rien n'est ajouté à la page).
 *
 * `getView()` donne la vue de l'éditeur ; `fetcher` et `hote` ne servent
 * qu'aux tests.
 */
export async function monterDialogue({ docId, getView, hote = document.body, fetcher = (...a) => fetch(...a) }) {
  let droit
  try {
    const r = await fetcher(`/api/docs/${encodeURIComponent(docId)}/dialogue`, { credentials: 'same-origin' })
    if (!r.ok) return null
    droit = await r.json()
  } catch {
    return null
  }
  if (!droit || !droit.autorise) return null

  let messages = charger(docId)
  let enCours = null // AbortController de la réponse en train d'arriver
  let flashTimer = null

  const racine = el('div', 'dialogue-hote')
  const bouton = el('button', 'dialogue-bouton', 'Margo (IA)')
  bouton.type = 'button'
  bouton.title = 'Dialoguer avec Margo (IA) à propos de ce texte'
  bouton.setAttribute('aria-expanded', 'false')

  const palette = el('div', 'dialogue-palette')
  palette.hidden = true
  palette.setAttribute('role', 'dialog')
  palette.setAttribute('aria-label', 'Dialogue avec Margo (IA)')

  const entete = el('div', 'dialogue-entete')
  const titre = el('h2', null, 'Margo')
  titre.appendChild(el('small', 'dialogue-sous-titre', ' · IA d’amend.ink'))
  entete.appendChild(titre)
  const nouvelle = el('button', 'dialogue-lien', 'Nouvelle conversation')
  nouvelle.type = 'button'
  const fermer = el('button', 'dialogue-fermer', '×')
  fermer.type = 'button'
  fermer.setAttribute('aria-label', 'Fermer')
  entete.append(nouvelle, fermer)

  const fil = el('div', 'dialogue-fil')
  fil.setAttribute('role', 'log')
  fil.setAttribute('aria-live', 'polite')

  const reglages = el('div', 'dialogue-reglages')
  const etiquette = el('label', 'dialogue-etiquette', 'Porte sur')
  const choix = el('select', 'dialogue-portee')
  // Deux portées seulement. Elle suit la sélection de l'éditeur : du texte
  // sélectionné, « La sélection » ; sinon « Tout le texte » (voir
  // `suivreLaSelection`). La section reste comprise par le serveur, mais
  // l'interface ne la propose plus.
  for (const [v, t] of [
    ['document', 'Tout le texte'],
    ['selection', 'La sélection'],
  ]) {
    const o = el('option', null, t)
    o.value = v
    choix.appendChild(o)
  }
  etiquette.appendChild(choix)
  const indication = el('span', 'dialogue-indication')
  reglages.append(etiquette, indication)

  const saisie = el('textarea', 'dialogue-saisie')
  saisie.rows = 2
  saisie.maxLength = MESSAGE_MAX
  saisie.placeholder = 'Une question, une demande…'
  saisie.setAttribute('aria-label', 'Votre message à Margo')
  const envoyer = el('button', 'btn-primary dialogue-envoyer', 'Envoyer')
  envoyer.type = 'button'
  const arreter = el('button', 'dialogue-arreter', 'Arrêter')
  arreter.type = 'button'
  arreter.hidden = true
  const statut = el('p', 'dialogue-statut')
  const quota = el('p', 'dialogue-quota')
  const note = el(
    'p',
    'dialogue-note',
    'Margo lit le document pour vous répondre. Ses propositions arrivent en suivi de modifications : vous acceptez ou rejetez.'
  )

  const pied = el('div', 'dialogue-pied')
  const barre = el('div', 'dialogue-barre')
  barre.append(envoyer, arreter)
  pied.append(saisie, barre, statut)
  palette.append(entete, fil, reglages, pied, quota, note)
  racine.append(palette, bouton)
  hote.appendChild(racine)

  // --- Aller à un bloc -------------------------------------------------

  function allerAuBloc(de, a) {
    const view = getView()
    if (!view) return
    const els = blocsDuDom(view)
    const premier = els[de - 1]
    if (!premier) {
      statut.textContent = `Le bloc ${de} n’existe plus : le document a changé.`
      return
    }
    let pos
    try {
      pos = view.posAtDOM(premier, 0)
    } catch {
      return
    }
    defilerVers(view, pos, { fraction: 0.25 })
    // Éclairer les blocs concernés, avec le gris du survol des modifications.
    const dernier = els[Math.max(de, Math.min(a, els.length)) - 1] || premier
    try {
      const debut = view.state.doc.resolve(pos).before()
      const fin = view.state.doc.resolve(view.posAtDOM(dernier, 0)).after()
      view.dispatch(view.state.tr.setMeta(changesKey, { survol: { from: debut, to: fin } }))
      clearTimeout(flashTimer)
      flashTimer = setTimeout(() => {
        try {
          view.dispatch(view.state.tr.setMeta(changesKey, { survol: null }))
        } catch {
          // la vue a pu être détruite entre-temps
        }
      }, 2200)
    } catch {
      // un éclairage manqué n'empêche pas d'être arrivé
    }
  }

  // --- Affichage -------------------------------------------------------

  function bulleUtilisateur(texte) {
    const b = el('div', 'dialogue-message dialogue-moi')
    b.appendChild(el('p', null, texte))
    fil.appendChild(b)
    return b
  }
  function bulleClaude() {
    const b = el('div', 'dialogue-message dialogue-claude')
    fil.appendChild(b)
    return b
  }
  function descendre() {
    fil.scrollTop = fil.scrollHeight
  }

  function dessiner() {
    fil.textContent = ''
    if (!messages.length) {
      const vide = el('div', 'dialogue-vide')
      vide.appendChild(
        el('p', null, 'Posez une question sur le texte : un avis, un résumé, une incohérence à chercher.')
      )
      vide.appendChild(el('p', null, 'Demandez « corrige » ou « harmonise » pour qu’il propose des modifications.'))
      fil.appendChild(vide)
      return
    }
    for (const m of messages) {
      if (m.role === 'user') bulleUtilisateur(m.content)
      else {
        const b = bulleClaude()
        const corps = el('div', 'dialogue-texte')
        rendreTexte(corps, m.content, allerAuBloc)
        b.appendChild(corps)
      }
    }
    descendre()
  }

  /** Pose la portée d'après la sélection de l'éditeur : du texte sélectionné
   * → « La sélection », un simple curseur → « Tout le texte ». */
  function porteeSelonSelection() {
    const view = getView()
    if (!view) return
    choix.value = view.state.selection.empty ? 'document' : 'selection'
  }

  function majIndication() {
    const view = getView()
    const p = view ? porteeDe(view, choix.value) : { type: 'document' }
    if (!p) {
      indication.textContent = 'rien n’est sélectionné'
      indication.classList.add('dialogue-alerte')
      return
    }
    // La taille de la demande, en signes, avant l'envoi : la portée seule (le
    // message s'y ajoute) rapportée à la limite par demande.
    const taille = taillePortee(view, p)
    indication.textContent = `${libellePortee(p)} · ${rapport(taille, limites.signesParDemande)}`
    indication.classList.toggle('dialogue-alerte', taille > limites.signesParDemande)
  }

  /** Les limites et la consommation du mois, lues sur le serveur. */
  const limites = { signesParDemande: Number(droit.signesParDemande) || Infinity, mois: droit.mois || null }
  function majQuota() {
    quota.textContent = limites.mois ? `Ce mois-ci : ${rapport(limites.mois.utilises, limites.mois.max)}.` : ''
  }
  async function rafraichirQuota() {
    try {
      const r = await fetcher(`/api/docs/${encodeURIComponent(docId)}/dialogue`, { credentials: 'same-origin' })
      if (!r.ok) return
      const d = await r.json()
      if (d && d.autorise) {
        limites.signesParDemande = Number(d.signesParDemande) || limites.signesParDemande
        limites.mois = d.mois || limites.mois
        majQuota()
      }
    } catch {
      // l'affichage reste celui d'avant
    }
  }

  // --- Résumé des modifications proposées ------------------------------

  function resume(bulle, fin) {
    const ligne = el('div', 'dialogue-resume')
    const parts = []
    if (fin.modifications)
      parts.push(
        `${fin.modifications} modification${fin.modifications > 1 ? 's' : ''} proposée${fin.modifications > 1 ? 's' : ''}`
      )
    if (fin.commentaires) parts.push(`${fin.commentaires} commentaire${fin.commentaires > 1 ? 's' : ''}`)
    if (fin.refus) parts.push(`${fin.refus} refus`)
    if (!parts.length) return
    // « incomplet » : la demande s'est arrêtée avant la fin (le serveur l'a
    // dit plus haut) ; ne pas laisser croire que tout est fait.
    const suite = fin.incomplet
      ? 'demande interrompue avant la fin ; ce qui est posé est à relire dans le panneau des modifications.'
      : 'à relire dans le panneau des modifications.'
    ligne.appendChild(el('span', null, `${parts.join(' · ')} — ${suite}`))
    if (fin.modifications) {
      const rejeter = el('button', 'dialogue-lien dialogue-rejeter', 'Tout rejeter — Margo')
      rejeter.type = 'button'
      rejeter.title =
        'Rejette toutes les modifications proposées par les IA (Margo, ou Claude invité), sans toucher à celles des personnes'
      let arme = false
      rejeter.addEventListener('click', () => {
        const view = getView()
        if (!view) return
        const n = listChanges(view.state.doc).filter(estModificationDAgent).length
        if (!arme) {
          arme = true
          rejeter.textContent = `Confirmer : rejeter ${n}`
          setTimeout(() => {
            arme = false
            rejeter.textContent = 'Tout rejeter — Margo'
          }, 4000)
          return
        }
        const fait = rejectAgentChanges(view)
        rejeter.disabled = true
        rejeter.textContent = `${fait} rejetée${fait > 1 ? 's' : ''}`
      })
      ligne.appendChild(rejeter)
    }
    bulle.appendChild(ligne)
  }

  // --- Envoyer ---------------------------------------------------------

  async function envoyerMessage() {
    if (enCours) return
    const texte = saisie.value.trim()
    if (!texte) return
    const view = getView()
    const portee = porteeDe(view, choix.value)
    if (!portee) {
      statut.textContent = 'Sélectionnez d’abord un passage dans le texte, ou changez la portée.'
      return
    }
    // Trop gros ? On le dit avant d'envoyer, en signes : le serveur refuserait de toute façon.
    const taille = taillePortee(view, portee) + texte.length
    if (taille > limites.signesParDemande) {
      statut.textContent = `Cette demande porte sur ${signes(taille)} ; la limite est de ${signes(limites.signesParDemande)} par demande. Choisissez une portée plus courte.`
      return
    }
    statut.textContent = ''
    if (!messages.length) fil.textContent = ''
    messages.push({ role: 'user', content: texte })
    saisie.value = ''
    bulleUtilisateur(texte)

    // La bulle de Claude suit l'ordre des événements : un morceau de texte,
    // une ligne d'outil, un autre morceau de texte…
    const bulle = bulleClaude()
    const activite = el('div', 'dialogue-activite')
    bulle.appendChild(activite)
    const attente = el('div', 'dialogue-attente', 'Margo réfléchit…')
    activite.appendChild(attente)
    const inserer = (noeud) => activite.insertBefore(noeud, attente)
    descendre()

    enCours = new AbortController()
    envoyer.disabled = true
    arreter.hidden = false
    let accumule = ''
    let ligneOutil = null
    try {
      const reponse = await fetcher(`/api/docs/${encodeURIComponent(docId)}/dialogue`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: pourEnvoi(messages), portee }),
        signal: enCours.signal,
      })
      if (!reponse.ok) {
        let message = 'Margo n’est pas joignable pour le moment.'
        try {
          message = (await reponse.json()).error || message
        } catch {
          // corps illisible : le message par défaut suffit
        }
        throw new Error(message)
      }
      await lireFlux(reponse, (evt) => {
        if (evt.type === 'texte') {
          accumule += (accumule ? '\n\n' : '') + evt.texte
          const morceau = el('div', 'dialogue-texte')
          rendreTexte(morceau, evt.texte, allerAuBloc)
          inserer(morceau)
        } else if (evt.type === 'outil') {
          ligneOutil = el('div', 'dialogue-outil', `Margo ${evt.libelle}…`)
          inserer(ligneOutil)
        } else if (evt.type === 'outil_fin') {
          if (ligneOutil) {
            ligneOutil.classList.add(evt.ok ? 'fait' : 'echec')
            ligneOutil.textContent = ligneOutil.textContent.replace(/…$/, evt.ok ? ' ✓' : ' (refusé)')
          }
        } else if (evt.type === 'erreur') {
          inserer(el('div', 'dialogue-erreur', evt.message))
        } else if (evt.type === 'fin') {
          attente.remove()
          resume(bulle, evt)
        }
        descendre()
      })
    } catch (err) {
      if (err && err.name === 'AbortError') {
        inserer(el('div', 'dialogue-erreur', 'Interrompu.'))
      } else {
        inserer(el('div', 'dialogue-erreur', err && err.message ? err.message : 'Échec de la demande.'))
      }
    } finally {
      attente.remove()
      messages.push({ role: 'assistant', content: accumule })
      // Une réponse vide ne se garde pas : elle ne servirait qu'à casser l'alternance.
      if (!accumule) messages.pop()
      enregistrer(docId, messages)
      enCours = null
      envoyer.disabled = false
      arreter.hidden = true
      descendre()
      saisie.focus()
      rafraichirQuota()
    }
  }

  // --- Câblage ---------------------------------------------------------

  function ouvrir() {
    palette.hidden = false
    bouton.setAttribute('aria-expanded', 'true')
    bouton.hidden = false
    porteeSelonSelection()
    majIndication()
    saisie.focus()
    descendre()
  }
  function replier() {
    palette.hidden = true
    bouton.setAttribute('aria-expanded', 'false')
  }
  bouton.addEventListener('click', () => (palette.hidden ? ouvrir() : replier()))
  fermer.addEventListener('click', replier)
  nouvelle.addEventListener('click', () => {
    if (enCours) enCours.abort()
    messages = []
    enregistrer(docId, messages)
    statut.textContent = ''
    dessiner()
  })
  envoyer.addEventListener('click', envoyerMessage)
  arreter.addEventListener('click', () => enCours && enCours.abort())
  choix.addEventListener('change', majIndication)
  // La portée suit la sélection de l'éditeur tant qu'elle change : ni au
  // simple focus du champ de saisie, ni quand la sélection ne bouge pas, pour
  // ne pas défaire un choix que la personne vient de faire à la main. Le
  // report à la tâche suivante laisse ProseMirror mettre son état à jour.
  let derniere = ''
  const cle = () => {
    const view = getView()
    return view ? `${view.state.selection.from}-${view.state.selection.to}` : ''
  }
  const suivreLaSelection = () => {
    setTimeout(() => {
      if (palette.hidden) return
      const c = cle()
      if (c === derniere) return
      derniere = c
      porteeSelonSelection()
      majIndication()
    }, 0)
  }
  document.addEventListener('selectionchange', suivreLaSelection)
  saisie.addEventListener('focus', majIndication)
  saisie.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      envoyerMessage()
    }
    if (e.key === 'Escape') replier()
  })

  majQuota()
  dessiner()

  return {
    ouvrir,
    replier,
    estOuverte: () => !palette.hidden,
    messages: () => messages.map((m) => ({ ...m })),
    destroy() {
      if (enCours) enCours.abort()
      clearTimeout(flashTimer)
      document.removeEventListener('selectionchange', suivreLaSelection)
      racine.remove()
    },
  }
}
