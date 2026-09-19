// Le test qui manquait (18/09/2026).
//
// L'éditeur a été livré cassé : un paramètre de fonction oublié dans
// `monterMenuCompte`, et toute page de document restait blanche avec un
// `ReferenceError` dans la console. Rien ne l'a vu — `node --check` ne
// vérifie que la syntaxe, le build Vite compile sans exécuter, et les
// quarante-cinq tests de l'éditeur ne touchent que le **modèle** :
// transactions, suivi des modifications, exports, plan du document. Le
// bandeau, les panneaux et les menus n'avaient aucun test, et c'est
// exactement là que c'est tombé.
//
// Ces tests-ci ne vérifient donc pas un comportement fin mais une chose
// grossière et décisive : **est-ce que ça monte sans exploser**. Une
// variable non définie, un import manquant, une classe CSS lue sur un
// élément absent — toute cette famille d'erreurs n'existe qu'à
// l'exécution, et c'est la seule façon de la voir avant l'utilisateur.
//
// jsdom est en dépendance de développement seulement. Le backend garde
// ses zéro dépendances de production ; le prix payé ici, c'est un paquet
// dans `devDependencies`, contre une page blanche en production.
//
// **Ces tests ont été vérifiés contre le bug qu'ils visent** : en remettant
// le paramètre manquant de `monterMenuCompte`, les deux premiers échouent.
// Un test de non-régression qu'on n'a jamais vu échouer ne prouve rien.
//
// `--test-force-exit` est indispensable (voir package.json) : l'éditeur
// laisse derrière lui des minuteurs — rendu limité à une fois par seconde,
// compaction différée, reconnexion du provider — et Node ne rendrait jamais
// la main. Un `process.exit` dans `test.after` semblait équivalent : il
// coupait en réalité le dernier test avant qu'il ne s'exécute, et le total
// passait de cinq à quatre sans que rien ne le signale.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

/** Un DOM de navigateur, posé dans les globales que le code attend. Les
 * quelques absences de jsdom qui feraient échouer un montage pour de
 * mauvaises raisons sont comblées ici, et seulement celles-là. */
function installerDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  // `navigator` est en lecture seule dans Node récent : on le définit par
  // `defineProperty` plutôt que par affectation.
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  globalThis.HTMLElement = w.HTMLElement
  globalThis.Node = w.Node
  globalThis.Element = w.Element
  globalThis.getComputedStyle = w.getComputedStyle
  globalThis.location = w.location
  globalThis.CSS = w.CSS || { escape: (s) => s }
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  // `getBoundingClientRect` renvoie des zéros dans jsdom : suffisant, tant
  // qu'il ne renvoie pas `undefined`.
  if (!w.Element.prototype.getBoundingClientRect) {
    w.Element.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 })
  }
  return dom
}

/** Attrape tout ce qui échoue en silence : une erreur jetée hors de la
 * pile d'appel (dans une promesse, un minuteur, un écouteur) ne fait pas
 * échouer un test — c'est précisément comme ça qu'une page blanche passe
 * inaperçue. */
function surveillerLesErreurs() {
  const erreurs = []
  const origine = console.error
  console.error = (...args) => {
    erreurs.push(args.map((a) => (a instanceof Error ? a.stack || a.message : String(a))).join(' '))
  }
  const surRejet = (e) => erreurs.push(`promesse rejetée : ${e && (e.stack || e.message || e)}`)
  process.on('unhandledRejection', surRejet)
  return {
    erreurs,
    fin() {
      console.error = origine
      process.off('unhandledRejection', surRejet)
      return erreurs
    },
  }
}

/** L'adresse en session est mise en cache dans le module `auth.js`, qui
 * vit une seule fois par processus : sans remise à zéro, le deuxième test
 * hérite de la session du premier et monte la mauvaise page. Une heure
 * perdue là-dessus vaut bien trois lignes de commentaire. */
async function oublierLaSession() {
  const { forgetSessionCache } = await import('../src/auth.js')
  forgetSessionCache()
}

/** Un `fetch` qui répond ce que l'application attend, sans réseau. */
function installerFetch(reponses = {}) {
  globalThis.fetch = async (url) => {
    const chemin = String(url)
    for (const [motif, corps] of Object.entries(reponses)) {
      if (chemin.includes(motif)) {
        return { ok: true, status: 200, json: async () => corps, text: async () => JSON.stringify(corps) }
      }
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }
  }
}

/** Laisse tourner les promesses et les minuteurs déjà programmés. */
const respirer = () => new Promise((r) => setTimeout(r, 30))

test('le menu du compte se monte, avec et sans couleur', async () => {
  installerDom()
  installerFetch({ '/api/auth/me': { email: 'moi@example.com', admin: false } })
  const guetteur = surveillerLesErreurs()
  const { monterMenuCompte } = await import('../src/compteMenu.js')

  // Les deux appels réels : la liste des documents n'a pas de couleur à
  // donner, l'éditeur en a une. C'est le second qui manquait son
  // paramètre et laissait toute page de document blanche.
  const sans = document.createElement('div')
  monterMenuCompte(sans)
  const avec = document.createElement('div')
  monterMenuCompte(avec, { couleur: () => '#e07a5f' })
  await respirer()

  assert.deepEqual(guetteur.fin(), [], 'une erreur au montage du menu du compte')
  assert.ok(sans.querySelector('.compte-pastille'))
  const pastille = avec.querySelector('.compte-pastille')
  assert.ok(pastille.classList.contains('compte-pastille-coloree'), 'la couleur n’est pas appliquée')
  assert.equal(pastille.style.getPropertyValue('--user-color'), '#e07a5f')
})

test('l’éditeur se monte sur un document, sans rien jeter', async () => {
  // Le test de fumée. Il ne vérifie pas que l'éditeur est **beau** mais
  // qu'il **existe** : bandeau, barre d'outils, panneaux, menus, tout le
  // code d'interface est exécuté pour de bon. C'est la vérification qui
  // manquait le 18/09.
  const dom = installerDom()
  await oublierLaSession()
  installerFetch({
    '/api/auth/me': { email: 'moi@example.com', admin: true },
    '/publication': { publiee: false, autorise: false, portee: 'admins' },
    '/style': { style: null, propre: false },
  })
  // Pas de WebSocket dans jsdom : le provider en ouvre un au montage.
  globalThis.WebSocket = class {
    constructor() {
      this.readyState = 0
    }
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() {}
  }
  const guetteur = surveillerLesErreurs()

  const { mountEditor } = await import('../src/editor.js')
  const racine = dom.window.document.getElementById('app')
  const editeur = mountEditor(
    racine,
    'abcdefgh1234',
    { name: 'Moi', color: '#e07a5f' },
    { title: 'Essai', myRole: 'editeur', myName: 'Moi', myColor: '#e07a5f', jeSuisProprietaire: true, owner: 'moi@example.com' }
  )
  await respirer()

  assert.deepEqual(guetteur.fin(), [], 'une erreur au montage de l’éditeur')

  // Les pièces du bandeau réorganisé le 18/09, dans leur zone.
  assert.ok(racine.querySelector('.banniere-gauche .doc-title'), 'le titre')
  assert.ok(racine.querySelector('.banniere-gauche .star-btn'), 'l’étoile, avant le titre')
  assert.ok(racine.querySelector('.banniere-centre .presence-bar'), 'les pastilles de présence')
  assert.ok(racine.querySelector('.banniere-droite .connection-status'), 'le voyant, à droite')
  assert.ok(racine.querySelector('.banniere-droite .compte-pastille'), 'la pastille du compte')
  // L'interrupteur du suivi est en tête de la colonne de droite, hors du
  // corps qui défile (19/09) : c'est ce qui le rend toujours visible.
  const suivi = racine.querySelector('.sidebar > .suivi-entete > .track-toggle')
  assert.ok(suivi, 'l’interrupteur du suivi, en tête de colonne et hors défilement')
  assert.match(suivi.textContent, /Suivi des modifications/)
  assert.ok(racine.querySelector('.sidebar > .sidebar-corps > .ai-section'), 'le corps qui défile')
  assert.ok(racine.querySelector('.ProseMirror'), 'la zone d’édition')

  if (editeur && editeur.destroy) editeur.destroy()
})

test('la liste des documents se monte pour une personne connectée', async () => {
  const dom = installerDom()
  await oublierLaSession()
  installerFetch({
    '/api/auth/me': { email: 'moi@example.com', admin: false },
    '/api/docs': {
      docs: [
        { id: 'abcdefgh1234', title: 'Un document', updatedAt: Date.now(), starred: false, myRole: 'editeur', owner: 'moi@example.com', jeSuisProprietaire: true },
        { id: 'ijklmnop5678', title: 'Chez quelqu’un', updatedAt: Date.now(), starred: true, myRole: 'correcteur', owner: 'autre@example.com', jeSuisProprietaire: false },
      ],
    },
  })
  const guetteur = surveillerLesErreurs()
  const { mountHome } = await import('../src/home.js')
  await mountHome(dom.window.document.getElementById('app'))
  await respirer()

  assert.deepEqual(guetteur.fin(), [], 'une erreur au montage de la liste')
  const racine = dom.window.document.getElementById('app')
  const badges = [...racine.querySelectorAll('.role-badge')].map((b) => b.textContent)
  assert.deepEqual(badges, ['propriétaire', 'correcteur'])
  const boutons = [...racine.querySelectorAll('.delete-doc-btn')].map((b) => b.textContent)
  assert.deepEqual(boutons, ['Supprimer', 'Quitter'], 'le propriétaire supprime, les autres quittent')
})

test('la page d’accueil publique se monte pour un visiteur', async () => {
  const dom = installerDom()
  await oublierLaSession()
  installerFetch({ '/api/auth/me': { email: null } })
  const guetteur = surveillerLesErreurs()
  const { mountHome } = await import('../src/home.js')
  await mountHome(dom.window.document.getElementById('app'))
  await respirer()

  assert.deepEqual(guetteur.fin(), [], 'une erreur au montage de la page d’accueil')
  const racine = dom.window.document.getElementById('app')
  assert.ok(racine.querySelector('.amend-logo'), 'le logo')
  assert.equal(racine.querySelectorAll('.landing-form').length, 2, 'liste d’attente et connexion')
})

test('la palette de contact se monte', async () => {
  const dom = installerDom()
  installerFetch()
  const guetteur = surveillerLesErreurs()
  const { monterPaletteContact } = await import('../src/contact.js')
  monterPaletteContact()
  await respirer()

  assert.deepEqual(guetteur.fin(), [], 'une erreur au montage de la palette')
  assert.ok(dom.window.document.querySelector('.contact-bouton'))
  assert.equal(dom.window.document.querySelectorAll('.contact-intention').length, 3)
})
