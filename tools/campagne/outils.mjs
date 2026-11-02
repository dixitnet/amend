// Campagne de tests de l'interface d'édition — les outils communs.
//
// Une instance locale jetable (tools/instance-test.js), des comptes réels
// (propriétaire, éditeur, correcteur, lecteur), un document partagé entre eux
// par invitation, et un Chromium par personne. On agit comme une personne :
// clics, sélection à la souris ou au clavier, frappe, collage, composition
// (touches mortes) ; on lit le résultat dans le DOM de l'éditeur, sous une
// forme compacte :
//
//   texte ordinaire · [-barré par X-] · {+ajouté par X+}
//
// avec l'initiale de l'auteur entre crochets si on le demande
// (`{A+mot+}`, `[B-mot-]`).

/* global window, document, NodeFilter, DataTransfer, ClipboardEvent -- fonctions exécutées dans la page (Playwright) */
import { createRequire } from 'node:module'
import { lancerInstance } from '../instance-test.js'

const playwright = createRequire(import.meta.url)('playwright')

// Le navigateur : `--navigateur=webkit` (le moteur de Safari) ou `firefox`,
// ou la variable NAVIGATEUR ; Chromium par défaut.
export const NAVIGATEUR =
  process.argv.find((a) => a.startsWith('--navigateur='))?.split('=')[1] || process.env.NAVIGATEUR || 'chromium'
if (!['chromium', 'webkit', 'firefox'].includes(NAVIGATEUR)) throw new Error(`navigateur inconnu : ${NAVIGATEUR}`)
const MAC = process.platform === 'darwin'

/** Les raccourcis écrits pour Linux (Ctrl), traduits pour le Mac (Cmd, Option). */
export function traduireTouche(t) {
  if (!MAC) return t
  const table = {
    'Control+Shift+ArrowRight': 'Alt+Shift+ArrowRight',
    'Control+Shift+ArrowLeft': 'Alt+Shift+ArrowLeft',
    'Shift+End': 'Meta+Shift+ArrowRight',
    'Shift+Home': 'Meta+Shift+ArrowLeft',
  }
  return table[t] || t.replace(/^Control\+/, 'Meta+')
}

/** La composition (touche morte) ne se pilote que par le protocole de Chromium. */
export const COMPOSITION = NAVIGATEUR === 'chromium'

export const COMPTES = {
  alice: { mail: 'alice@test.local', nom: 'Alice' },
  bruno: { mail: 'bruno@test.local', nom: 'Bruno' },
  chloe: { mail: 'chloe@test.local', nom: 'Chloé' }, // correctrice
  louis: { mail: 'louis@test.local', nom: 'Louis' }, // lecteur
}

export const attendre = (ms) => new Promise((r) => setTimeout(r, ms))

export async function demarrer({ port = 19400 } = {}) {
  const inst = await lancerInstance({
    port,
    comptes: Object.values(COMPTES).map((c) => c.mail),
  })
  for (const c of Object.values(COMPTES)) {
    await inst.api('/api/auth/name', { cookie: inst.cookies[c.mail], methode: 'POST', corps: { nom: c.nom } })
  }
  const navigateur = await playwright[NAVIGATEUR].launch()
  return { inst, navigateur }
}

async function jeton(inst, mail) {
  const courriers = await (await fetch(`${inst.fauxMailgun}/courriers`)).json()
  for (const c of courriers.reverse()) {
    if (c.to === mail) {
      const m = /#\/invite\/([A-Za-z0-9_-]+)/.exec(c.text || '')
      if (m) return m[1]
    }
  }
  throw new Error(`pas de courrier d'invitation pour ${mail}`)
}

/** Un document d'Alice, partagé avec Bruno (éditeur), Chloé (correctrice) et
 * Louis (lecteur). Le limiteur d'invitations est par personne et par
 * destinataire : chaque scénario n'a pas besoin de son propre document, il
 * remet le texte à zéro (`reinitialiser`). */
export async function documentPartage(inst, titre = 'Campagne') {
  const proprio = inst.cookies[COMPTES.alice.mail]
  const cree = await inst.api('/api/docs', { cookie: proprio, methode: 'POST', corps: { title: titre } })
  if (cree.status !== 201) throw new Error(`création : ${cree.status} ${cree.texte}`)
  const id = cree.json.id
  for (const [role, c] of [
    ['editeur', COMPTES.bruno],
    ['correcteur', COMPTES.chloe],
    ['lecteur', COMPTES.louis],
  ]) {
    const inv = await inst.api(`/api/docs/${id}/invitations`, {
      cookie: proprio,
      methode: 'POST',
      corps: { email: c.mail, role },
    })
    if (inv.status !== 200) throw new Error(`invitation ${role} : ${inv.status} ${inv.texte}`)
    const acc = await inst.api(`/api/invitations/${await jeton(inst, c.mail)}`, { methode: 'POST' })
    if (acc.status !== 200) throw new Error(`acceptation ${role} : ${acc.status} ${acc.texte}`)
  }
  return id
}

/** Une personne devant le document : son propre contexte (cookies, cache),
 * sa page, et les gestes de base. */
export async function ouvrir(navigateur, inst, qui, id, { largeur = 1280 } = {}) {
  const compte = COMPTES[qui]
  const contexte = await navigateur.newContext({
    viewport: { width: largeur, height: 900 },
    locale: 'fr-FR',
  })
  const [nom, valeur] = inst.cookies[compte.mail].split(';')[0].split(/=(.*)/s)
  await contexte.addCookies([{ name: nom, value: valeur, url: inst.base }])
  const page = await contexte.newPage()
  const erreurs = []
  page.on('pageerror', (e) => erreurs.push(String(e.message || e)))
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(m.text())
  })
  await page.goto(`${inst.base}/#/doc/${id}`)
  await page.waitForSelector('.masque-chargement.masque-parti', { state: 'attached', timeout: 30000 })
  await page.waitForSelector('.ProseMirror[contenteditable]', { timeout: 30000 })
  // Les fenêtres d'accueil éventuelles (embarquement) : on les ferme.
  await fermerModales(page)
  return new Personne(qui, compte, contexte, page, erreurs)
}

async function fermerModales(page) {
  for (let i = 0; i < 3; i++) {
    const modale = page.locator('dialog[open], .modale-fond:visible').first()
    if (!(await modale.count())) return
    await page.keyboard.press('Escape')
    await attendre(150)
  }
}

export class Personne {
  constructor(qui, compte, contexte, page, erreurs) {
    Object.assign(this, { qui, compte, contexte, page, erreurs })
    this.ed = page.locator('.ProseMirror').first()
  }

  async fermer() {
    await this.contexte.close()
  }

  async suivi(actif) {
    const caseSuivi = this.page.locator('.track-toggle input[type=checkbox]')
    if ((await caseSuivi.isChecked()) !== actif) await caseSuivi.click()
    if ((await caseSuivi.isChecked()) !== actif) throw new Error(`suivi non ${actif ? 'activé' : 'désactivé'}`)
  }

  async focus() {
    await this.ed.focus()
  }

  /** Lecture compacte du document : un paragraphe par ligne. */
  async lire({ auteurs = false } = {}) {
    return this.page.evaluate((auteurs) => {
      const racine = document.querySelector('.ProseMirror')
      const initiale = (el) => {
        if (!auteurs) return ''
        const m = /(?:Ajout de|proposée par) (.+)$/.exec(el.getAttribute('title') || '')
        return m ? m[1][0] : '?'
      }
      const parcourir = (n) => {
        if (n.nodeType === 3) return n.data
        if (n.nodeType !== 1) return ''
        if (
          n.classList.contains('ProseMirror-widget') ||
          (n !== racine && n.getAttribute('contenteditable') === 'false')
        ) {
          // Les widgets (curseurs distants, ancres) ne font pas partie du texte.
          if (!n.matches('.footnote, sup')) return ''
        }
        const dedans = [...n.childNodes].map(parcourir).join('')
        if (n.matches('ins.tracked-insertion')) return `{${initiale(n)}+${dedans}+}`
        if (n.matches('del.tracked-deletion')) return `[${initiale(n)}-${dedans}-]`
        return dedans
      }
      const blocs = [...racine.children].filter((b) => !b.classList.contains('ProseMirror-widget'))
      // Des marques voisines du même auteur (une par lettre tapée) se lisent
      // comme une seule.
      let t = blocs.map(parcourir).join('\n').replace(/ /g, '⍽').replace(/ /g, '·')
      for (let avant = ''; avant !== t;) {
        avant = t
        t = t
          .replace(/\{([^+{}]?)\+((?:(?!\+\})[^])*)\+\}\{\1\+/g, '{$1+$2')
          .replace(/\[([^-[\]]?)-((?:(?!-\])[^])*)-\]\[\1-/g, '[$1-$2')
      }
      return t
    }, auteurs)
  }

  /** Remet le document à un texte de départ, hors suivi (le propriétaire). */
  async remplirSansSuivi(paragraphes) {
    await this.suivi(false)
    await this.focus()
    await this.page.keyboard.press(traduireTouche('Control+A'))
    await this.page.keyboard.press('Delete')
    for (let i = 0; i < paragraphes.length; i++) {
      if (i) await this.page.keyboard.press('Enter')
      await this.page.keyboard.insertText(paragraphes[i])
    }
    await attendre(300)
  }

  /** Remet le document à un contenu HTML de départ, hors suivi : tout
   * sélectionner, puis coller (le collage pose aussi la structure). */
  async remettre(html) {
    await this.suivi(false)
    await this.focus()
    await this.page.keyboard.press(traduireTouche('Control+A'))
    await attendre(80)
    await this.coller(html.replace(/<[^>]+>/g, ' '), html)
    await attendre(250)
  }

  /** Sélectionne la n-ième occurrence (0 = première) d'un texte, en posant
   * la sélection DOM puis en laissant ProseMirror la reprendre — c'est ce
   * que fait une sélection à la souris. */
  async selectionner(texte, { occurrence = 0, jusqua = null } = {}) {
    const ok = await this.page.evaluate(
      ({ texte, occurrence, jusqua }) => {
        const racine = document.querySelector('.ProseMirror')
        const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT)
        const noeuds = []
        let tout = ''
        for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
          if (
            n.parentElement.closest('.ProseMirror-widget,[contenteditable=false]') !==
            racine.closest('[contenteditable=false]')
          )
            continue
          noeuds.push([n, tout.length])
          tout += n.data
        }
        let debut = -1
        for (let i = 0, de = 0; i <= occurrence; i++) {
          debut = tout.indexOf(texte, de)
          if (debut < 0) return false
          de = debut + 1
        }
        let fin = debut + texte.length
        if (jusqua) {
          const f = tout.indexOf(jusqua, debut)
          if (f < 0) return false
          fin = f + jusqua.length
        }
        // Un début se pose dans le nœud qui commence à cette position (et pas
        // à la fin du précédent, qui peut être le paragraphe d'avant) ; une
        // fin, dans le nœud qui se termine là.
        const placer = (abs, versLaFin) => {
          for (let k = 0; k < noeuds.length; k++) {
            const [n, d] = noeuds[k]
            const f = d + n.data.length
            if (versLaFin ? abs > d && abs <= f : abs >= d && abs < f) return [n, abs - d]
          }
          const [n, d] = noeuds[noeuds.length - 1]
          return abs === d + n.data.length ? [n, abs - d] : null
        }
        const a = placer(debut, false)
        const b = placer(fin, true)
        if (!a || !b) return false
        const r = document.createRange()
        r.setStart(a[0], a[1])
        r.setEnd(b[0], b[1])
        const s = window.getSelection()
        s.removeAllRanges()
        s.addRange(r)
        document.dispatchEvent(new Event('selectionchange'))
        return true
      },
      { texte, occurrence, jusqua }
    )
    if (!ok) throw new Error(`texte introuvable : « ${texte} »`)
    await attendre(120)
  }

  /** Double-clic sur un mot (sélection native du navigateur). */
  async doubleClic(texte, { occurrence = 0 } = {}) {
    // Un clic trop proche du précédent compterait pour un triple-clic.
    await attendre(600)
    const boite = await this.boiteDe(texte, occurrence)
    await this.page.mouse.dblclick(boite.x + boite.width / 2, boite.y + boite.height / 2)
    await attendre(150)
  }

  /** Glisser à la souris du début de `de` à la fin de `a`. */
  async glisser(de, a) {
    const b1 = await this.boiteDe(de, 0, 'debut')
    const b2 = await this.boiteDe(a, 0, 'fin')
    await this.page.mouse.move(b1.x + 1, b1.y + b1.height / 2)
    await this.page.mouse.down()
    await this.page.mouse.move(b2.x - 1, b2.y + b2.height / 2, { steps: 8 })
    await this.page.mouse.up()
    await attendre(150)
  }

  async cliquerApres(texte) {
    const b = await this.boiteDe(texte, 0, 'fin')
    await this.page.mouse.click(b.x, b.y + b.height / 2)
    await attendre(100)
    // Un clic posé pile sur la limite d'un caractère est ambigu (le WebKit de
    // macOS met parfois le curseur après l'espace suivant) : si le curseur
    // n'est pas juste derrière le texte, on l'y replace au clavier.
    const c = await this.curseur()
    if (!c || !c.vide || !(c.avant || '').endsWith(texte.slice(-12))) {
      await this.selectionner(texte)
      await this.touche('ArrowRight')
    }
  }

  async boiteDe(texte, occurrence = 0, bord = null) {
    // Le texte peut courir sur plusieurs nœuds (une lettre tapée en suivi
    // forme sa propre marque) : on cherche dans le texte mis bout à bout.
    const r = await this.page.evaluate(
      ({ texte, occurrence, bord }) => {
        const racine = document.querySelector('.ProseMirror')
        const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT)
        const noeuds = []
        let tout = ''
        for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
          if (
            n.parentElement.closest('.ProseMirror-widget,[contenteditable=false]') !==
            racine.closest('[contenteditable=false]')
          )
            continue
          noeuds.push([n, tout.length])
          tout += n.data
        }
        let debut = -1
        for (let i = 0, de = 0; i <= occurrence; i++) {
          debut = tout.indexOf(texte, de)
          if (debut < 0) return null
          de = debut + 1
        }
        const point = (abs) => {
          for (const [n, d] of noeuds) if (abs >= d && abs < d + n.data.length) return [n, abs - d]
          const [n, d] = noeuds[noeuds.length - 1]
          return [n, abs - d]
        }
        const r = document.createRange()
        const de = bord === 'fin' ? debut + texte.length - 1 : debut
        const a = bord === 'debut' ? debut + 1 : debut + texte.length
        const p1 = point(de)
        const p2 = point(a - 1)
        r.setStart(p1[0], p1[1])
        r.setEnd(p2[0], p2[1] + 1)
        const b = r.getBoundingClientRect()
        if (bord === 'fin') return { x: b.right, y: b.top, width: 0, height: b.height }
        return { x: b.left, y: b.top, width: b.width, height: b.height }
      },
      { texte, occurrence, bord }
    )
    if (!r) throw new Error(`texte introuvable à l'écran : « ${texte} »`)
    return r
  }

  /** Résout tous les fils de commentaires (par la marge, ou par le panneau). */
  async resoudreTout() {
    for (let i = 0; i < 20; i++) {
      const carte = this.page.locator('.carte-commentaire:not(.composeur)').first()
      if ((await carte.count()) && (await carte.isVisible())) {
        await carte.click()
        await carte.getByRole('button', { name: 'Résoudre' }).first().click({ timeout: 5000 })
      } else {
        const item = this.page.locator('.comments-list .comment-item').first()
        if (!(await item.count())) return
        await item.hover()
        await item.locator('.btn-accept').click({ timeout: 5000 })
      }
      await attendre(150)
    }
  }

  async taper(texte, { delai = 15 } = {}) {
    await this.page.keyboard.type(texte, { delay: delai })
  }

  /** Une lettre accentuée par touche morte (^ puis e → ê) : une composition,
   * comme sur un clavier français de Mac. */
  async composer(etapes, final) {
    if (!COMPOSITION) throw new Error(`composition non pilotable dans ${NAVIGATEUR}`)
    const cdp = await this.contexte.newCDPSession(this.page)
    for (const e of etapes) {
      await cdp.send('Input.imeSetComposition', { text: e, selectionStart: e.length, selectionEnd: e.length })
      await attendre(30)
    }
    await cdp.send('Input.insertText', { text: final })
    await cdp.detach()
    await attendre(60)
  }

  async touche(t, fois = 1) {
    // 30 ms entre deux touches : sans aucun délai, le navigateur n'a pas encore
    // signalé le déplacement du curseur (selectionchange) quand la touche
    // suivante arrive — une course qu'aucune main ne produit.
    for (let i = 0; i < fois; i++) {
      await this.page.keyboard.press(traduireTouche(t))
      await attendre(30)
    }
  }

  async coller(texte, html = null) {
    await this.page.evaluate(
      ({ texte, html }) => {
        const dt = new DataTransfer()
        dt.setData('text/plain', texte)
        if (html) dt.setData('text/html', html)
        const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
        document.querySelector('.ProseMirror').dispatchEvent(ev)
      },
      { texte, html }
    )
    await attendre(150)
  }

  /** Les modifications listées dans le panneau : [{type, qui, texte}]. */
  async modifications() {
    return this.page.evaluate(() =>
      [...document.querySelectorAll('.changes-list:not(.comments-list) > .change-item')].map((li) => ({
        type: [...li.classList].find((c) => c.startsWith('change-') && c !== 'change-item')?.slice(7),
        meta: li.querySelector('.change-meta')?.textContent.trim(),
        texte: li.querySelector('.change-text')?.textContent.trim(),
        accepter: !!li.querySelector('.btn-accept'),
      }))
    )
  }

  /** Accepte (ou rejette) une à une toutes les modifications du panneau. */
  async toutTraiter(accepter = true, max = 40) {
    for (let i = 0; i < max; i++) {
      const carte = this.page.locator('.changes-list:not(.comments-list) > .change-item').first()
      if (!(await carte.count())) return i
      // Les boutons d'une carte n'apparaissent qu'au survol (ou carte active).
      await carte.hover()
      await carte.locator(`.change-actions ${accepter ? '.btn-accept' : '.btn-reject'}`).click({ timeout: 5000 })
      await attendre(150)
    }
    throw new Error('modifications sans fin')
  }

  async commenter(passage, texte, opts = {}) {
    await this.selectionner(passage, opts)
    await attendre(300)
    // Large écran : le bouton « ＋ » de la marge ; sinon le panneau latéral.
    const plus = this.page.locator('.gouttiere-commenter')
    if ((await plus.count()) && (await plus.isVisible())) {
      await plus.click()
      await this.page.locator('.composeur textarea').fill(texte)
      await this.page.locator('.composeur .envoyer').click()
    } else {
      await this.page.locator('textarea[name=commentaire]').fill(texte, { timeout: 5000 })
      await this.page.getByRole('button', { name: 'Ajouter un commentaire' }).click()
    }
    await attendre(250)
  }

  /** Les commentaires vus : passage surligné et fils du panneau. */
  async commentaires() {
    return this.page.evaluate(() => ({
      surligne: [...document.querySelectorAll('.ProseMirror .comment-highlight')].map((e) => e.textContent),
      fils: [...document.querySelectorAll('.comments-list > .comment-item')].map((li) => ({
        meta: li.querySelector('.change-meta')?.textContent.trim(),
        texte: li.querySelector('.change-text')?.textContent.trim(),
        reponses: [...li.querySelectorAll('.comment-reply')].map((r) => r.textContent.trim()),
      })),
      marge: [...document.querySelectorAll('.carte-commentaire:not(.composeur)')].map((c) =>
        [...c.querySelectorAll('.carte-texte')].map((t) => t.textContent.trim())
      ),
    }))
  }

  /** Le texte sélectionné et la position du curseur, pour vérifier où l'on
   * se trouve après un geste. Le curseur est rendu par `‸` dans le texte. */
  async curseur() {
    return this.page.evaluate(() => {
      const s = window.getSelection()
      if (!s.rangeCount) return null
      const r = s.getRangeAt(0)
      const racine = document.querySelector('.ProseMirror')
      const avant = document.createRange()
      avant.setStart(racine, 0)
      avant.setEnd(r.startContainer, r.startOffset)
      const t = avant.toString()
      return { selection: s.toString(), avant: t.slice(-12), vide: r.collapsed }
    })
  }
}

/** Attend que toutes les personnes voient le même texte (ou échoue). */
export async function convergence(personnes, { delai = 5000, auteurs = true } = {}) {
  const t0 = Date.now()
  let lus = []
  for (;;) {
    lus = await Promise.all(personnes.map((p) => p.lire({ auteurs })))
    if (lus.every((l) => l === lus[0])) return lus[0]
    if (Date.now() - t0 > delai) {
      const detail = personnes.map((p, i) => `${p.qui} : ${JSON.stringify(lus[i])}`).join('\n    ')
      throw new Error(`pas de convergence en ${delai} ms :\n    ${detail}`)
    }
    await attendre(100)
  }
}
