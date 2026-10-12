// La palette « Aide / avis » (17/09/2026, simplifiée le 10/10/2026).
//
// Un lien vers l'aide, puis un champ : plus de choix entre question, idée et
// bug — la personne écrit, et le contexte technique joint dit le reste.
//
// **Une palette, pas une modale**, et c'est le point : on la garde ouverte
// pendant qu'on montre le problème du doigt, on continue de lire le
// document derrière, et on ferme quand on veut. Une boîte de dialogue
// modale obligerait à quitter ce qu'on est en train de décrire — c'est-à-
// dire à décrire de mémoire.
//
// Pensée pour la **phase de test** : elle est visible partout, elle dit ce
// qu'elle est, et elle a vocation à changer de forme une fois les tests
// passés. D'où un module qui ne dépend de rien d'autre que `fetch`.
//
// Ce qui part avec le message : le document, le rôle, le navigateur,
// l'écran, la version de l'application et les dernières erreurs de la
// console. **Jamais de contenu de document** — ni le texte, ni le titre.

import { lienAide } from './aide.js'
import { roleDeLaPage } from './contextePage.js'

const VERSION = '0.1.0'

const INTENTION = 'avis'

// Les dernières erreurs de la console, gardées de côté dès le chargement.
// Un signalement de bug qui les emporte vaut dix allers-retours — et elles
// n'existent plus au moment où la personne pense à écrire.
const erreurs = []
function noter(texte) {
  erreurs.push(String(texte).slice(0, 500))
  if (erreurs.length > 5) erreurs.shift()
}
/** Ce qu'on garde d'un `console.error(...)` : le nom et le message des
 * **erreurs techniques** seulement (`TypeError: …`), coupés court. Les autres
 * arguments — chaînes, objets, nœuds — peuvent contenir un extrait du texte
 * du document, que l'interface promet de ne jamais envoyer (audit C18). */
export function resumeErreurConsole(args) {
  const techniques = args.filter((a) => a instanceof Error).map((a) => `${a.name}: ${a.message}`.slice(0, 200))
  return techniques.length ? techniques.join(' ; ') : 'console.error (détail non joint)'
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => noter(`${e.message} (${e.filename}:${e.lineno})`))
  window.addEventListener('unhandledrejection', (e) =>
    noter(
      `promesse rejetée : ${e.reason instanceof Error ? `${e.reason.name}: ${e.reason.message}`.slice(0, 200) : 'sans erreur technique'}`
    )
  )
  const erreurOrigine = console.error
  console.error = (...args) => {
    noter(resumeErreurConsole(args))
    erreurOrigine.apply(console, args)
  }
}

/** Le contexte technique joint au message. Rien qui vienne du document
 * lui-même : seulement de quoi reproduire. */
function contexte() {
  const doc = (location.hash.match(/^#\/doc\/([A-Za-z0-9_-]+)/) || [])[1] || null
  return {
    docId: doc,
    role: roleDeLaPage(),
    navigateur: navigator.userAgent,
    ecran: `${window.innerWidth}×${window.innerHeight}`,
    version: VERSION,
    erreurs: erreurs.slice(),
  }
}

export function monterPaletteContact() {
  if (document.querySelector('.contact-bouton')) return

  const bouton = document.createElement('button')
  bouton.type = 'button'
  bouton.className = 'contact-bouton'
  bouton.textContent = 'Aide / avis'
  bouton.title = 'Lire l’aide, poser une question, proposer une idée, signaler un bug'
  bouton.setAttribute('aria-expanded', 'false')

  const palette = document.createElement('div')
  palette.className = 'contact-palette'
  palette.hidden = true
  palette.setAttribute('role', 'dialog')
  palette.setAttribute('aria-label', 'Aide et avis')

  const titre = document.createElement('h2')
  titre.textContent = 'Aide / avis'
  const sous = document.createElement('p')
  sous.className = 'contact-sous'
  sous.textContent =
    'Sinon, écrivez-nous : une question, une idée, un bug. amend.ink est en test, tout retour est utile, même bref.'

  // L'aide d'abord : une question dont la réponse est écrite ne devrait pas
  // devenir un message. Elle s'ouvre dans un nouvel onglet, le document reste
  // là où on l'a laissé.
  const aide = lienAide({ classe: 'contact-aide', libelle: 'Lire l’aide d’amend.ink →' })

  const champ = document.createElement('textarea')
  champ.rows = 4
  champ.maxLength = 4000
  champ.placeholder = 'Votre question, votre idée, ce qui ne marche pas…'
  champ.setAttribute('aria-label', 'Votre message')
  champ.name = 'message'

  const note = document.createElement('p')
  note.className = 'contact-note'
  note.textContent =
    'Le document en cours, votre rôle, votre navigateur et les dernières erreurs techniques sont joints automatiquement. Le contenu de vos documents, jamais.'

  const envoyer = document.createElement('button')
  envoyer.type = 'button'
  envoyer.className = 'btn-primary contact-envoyer'
  envoyer.textContent = 'Envoyer'

  const statut = document.createElement('p')
  statut.className = 'contact-statut'
  statut.hidden = true
  statut.setAttribute('role', 'status')

  const fermer = document.createElement('button')
  fermer.type = 'button'
  fermer.className = 'contact-fermer'
  fermer.textContent = '×'
  fermer.title = 'Fermer'
  fermer.setAttribute('aria-label', 'Fermer')

  palette.append(fermer, titre, aide, sous, champ, note, envoyer, statut)

  function basculer(ouvrir) {
    palette.hidden = !ouvrir
    bouton.setAttribute('aria-expanded', String(ouvrir))
    if (ouvrir) champ.focus()
  }
  bouton.onclick = () => basculer(palette.hidden)
  fermer.onclick = () => basculer(false)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !palette.hidden) basculer(false)
  })

  envoyer.onclick = async () => {
    const message = champ.value.trim()
    if (!message) {
      statut.textContent = 'Écrivez quelques mots avant d’envoyer.'
      statut.className = 'contact-statut erreur'
      statut.hidden = false
      champ.focus()
      return
    }
    envoyer.disabled = true
    envoyer.textContent = 'Envoi…'
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intention: INTENTION, message, contexte: contexte() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `échec (${res.status})`)
      champ.value = ''
      statut.textContent = 'Merci — c’est bien arrivé.'
      statut.className = 'contact-statut ok'
      statut.hidden = false
      setTimeout(() => basculer(false), 1600)
    } catch (err) {
      statut.textContent = err.message || 'L’envoi a échoué — réessayez dans un instant.'
      statut.className = 'contact-statut erreur'
      statut.hidden = false
    } finally {
      envoyer.disabled = false
      envoyer.textContent = 'Envoyer'
    }
  }

  const hote = document.createElement('div')
  hote.className = 'contact-hote'
  hote.append(palette, bouton)
  document.body.appendChild(hote)
}
