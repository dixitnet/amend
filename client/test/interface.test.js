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
  // jsdom ne connaît pas `matchMedia`. On le comble ici — l'application,
  // elle, ne doit pas s'y fier aveuglément non plus (voir `media()` dans
  // feuille.js) : c'est ce test qui a attrapé l'oubli.
  if (!w.matchMedia) {
    w.matchMedia = (requete) => ({ matches: false, media: requete, addEventListener() {}, removeEventListener() {} })
  }
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

  // La barre d'outils est découpée en trois groupes depuis le 20/09 : sur
  // ordinateur ils se suivent sur une ligne, sur téléphone ils deviennent
  // des onglets. Les trois doivent exister, et le bouton Plan avec eux —
  // c'est la seule porte vers le plan quand sa colonne disparaît.
  for (const groupe of ['texte', 'inserer', 'relire']) {
    assert.ok(
      racine.querySelector(`.format-toolbar .barre-groupe[data-groupe="${groupe}"]`),
      `le groupe ${groupe}`
    )
  }
  assert.equal(racine.querySelectorAll('.barre-onglet').length, 3, 'trois onglets')
  assert.ok(racine.querySelector('.banniere-gauche .btn-plan'), 'le bouton Plan')

  if (editeur && editeur.destroy) editeur.destroy()
})

test('sur iPhone : un en-tête de trois éléments, un crayon, et rien d’autre', async () => {
  // L'interface téléphone n'est pas l'interface de bureau en plus étroit :
  // on lit, ou on écrit (voir iphone.js). Ce test vérifie surtout des
  // **absences** — c'est là tout le propos.
  const dom = installerDom()
  await oublierLaSession()
  installerFetch({ '/api/auth/me': { email: 'moi@example.com', admin: false } })
  dom.window.matchMedia = (requete) => ({
    matches: /max-width: (700|1100)px/.test(requete),
    media: requete,
    addEventListener() {},
    removeEventListener() {},
  })
  globalThis.WebSocket = class {
    constructor() { this.readyState = 0 }
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
    { title: 'Essai', myRole: 'editeur', myName: 'Moi', myColor: '#e07a5f' }
  )
  await respirer()

  assert.deepEqual(guetteur.fin(), [], 'une erreur au montage sur téléphone')

  const entete = racine.querySelector('.tel-entete')
  assert.ok(entete, 'l’en-tête du téléphone')
  assert.equal(entete.children.length, 3, 'trois éléments, jamais plus')
  assert.equal(racine.querySelector('.tel-titre').textContent, 'Essai')
  assert.ok(racine.querySelector('.tel-crayon'), 'le crayon, porte d’entrée de l’écriture')

  // On ouvre en **lecture** : c'est la décision centrale.
  assert.ok(racine.querySelector('.app-shell').classList.contains('tel-lecture'))
  assert.equal(editeur.view.props.editable(), false, 'le document ne se modifie pas tant qu’on lit')

  // Le crayon fait passer en écriture, la coche en sort.
  racine.querySelector('.tel-crayon').dispatchEvent(new dom.window.Event('click', { bubbles: true }))
  assert.ok(racine.querySelector('.app-shell').classList.contains('tel-edition'))
  assert.equal(editeur.view.props.editable(), true)
  // Le passage en écriture rend la main au navigateur avant de reprendre le
  // focus (voir iphone.js) : sans ce tour de boucle, Safari continue de
  // traiter le texte comme non modifiable et toucher un mot ne déplace pas
  // le curseur. On vérifie donc que la mise au point arrive **après**, et
  // pas dans le même temps.
  await respirer()
  racine.querySelector('.tel-gauche').dispatchEvent(new dom.window.Event('click', { bubbles: true }))
  assert.ok(racine.querySelector('.app-shell').classList.contains('tel-lecture'))

  // L'interrupteur du suivi n'existe qu'une fois, et il est dans le menu.
  assert.equal(racine.querySelectorAll('.track-toggle').length, 0, 'pas dans la page')
  racine.querySelector('.tel-plus').dispatchEvent(new dom.window.Event('click', { bubbles: true }))
  const feuille = dom.window.document.querySelector('.feuille')
  assert.ok(feuille, 'le menu s’ouvre en feuille')
  assert.equal(feuille.querySelectorAll('.track-toggle').length, 1, 'un seul interrupteur, dans le menu')
  assert.match(feuille.textContent, /Plan du document/)
  assert.match(feuille.textContent, /Commentaires/)
  // Et rien de ce qui n'a pas sa place sur un téléphone.
  for (const absent of ['Mise en page', 'Partager', 'Historique', 'Exporter']) {
    assert.ok(!feuille.textContent.includes(absent), `${absent} n’a rien à faire ici`)
  }

  const { fermerFeuille } = await import('../src/feuille.js')
  fermerFeuille()
  // On laisse retomber les minuteurs **avant** de détruire la vue :
  // y-prosemirror diffère ses propres transactions (`updateMetas`), et une
  // transaction qui arrive après `destroy()` jette contre un DOM disparu.
  // C'est une course du banc d'essai, pas de l'application — mais l'ordre
  // compte, ici comme ailleurs.
  await new Promise((r) => setTimeout(r, 250))
  if (editeur && editeur.destroy) editeur.destroy()
})


test('sur iPhone, la liste des documents offre un bouton rond pour créer', async () => {
  // Le pendant du crayon de l'éditeur : on ouvre d'abord, on nomme ensuite.
  // Le formulaire titré reste dans la page pour le grand écran (masqué en
  // CSS), donc ce test vérifie la présence du bouton et son action, pas
  // l'absence du formulaire — une règle CSS ne se teste pas ici.
  const dom = installerDom()
  await oublierLaSession()
  let creation = null
  globalThis.fetch = async (url, options) => {
    const chemin = String(url)
    if (chemin.includes('/api/auth/me')) {
      return { ok: true, status: 200, json: async () => ({ email: 'moi@example.com', admin: false }) }
    }
    if (chemin === '/api/docs' && options && options.method === 'POST') {
      creation = JSON.parse(options.body)
      return { ok: true, status: 200, json: async () => ({ id: 'nouveau123456' }) }
    }
    if (chemin.includes('/api/docs')) {
      return { ok: true, status: 200, json: async () => ({ docs: [] }) }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  }
  const guetteur = surveillerLesErreurs()
  const { mountHome } = await import('../src/home.js')
  const racine = dom.window.document.getElementById('app')
  await mountHome(racine)
  await respirer()

  assert.deepEqual(guetteur.fin(), [], 'une erreur au montage de la liste')
  const fab = racine.querySelector('.doc-fab')
  assert.ok(fab, 'le bouton de création')
  assert.equal(fab.getAttribute('aria-label'), 'Nouveau document')

  fab.dispatchEvent(new dom.window.Event('click', { bubbles: true }))
  await respirer()
  assert.deepEqual(creation, { title: '' }, 'on crée sans titre, on nommera dans l’éditeur')
  assert.equal(dom.window.location.hash, '#/doc/nouveau123456', 'et le document s’ouvre')
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
