// La page « Gérer mes modèles » (01/10/2026, src/modeles.js), montée dans
// jsdom avec un faux serveur : les trois familles, ce que chacun peut faire
// (livré : dupliquer seulement ; modèle de l'instance : administrateurs ;
// les siens : tout), la duplication, le refus de supprimer un modèle
// utilisé, la suppression en deux clics, et l'avertissement avant de
// modifier un modèle partagé.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { mountModeles } from '../src/modeles.js'
import { fusionner } from '../../shared/style.js'

function installer() {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="racine"></div></body>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Event']) globalThis[k] = w[k]
}
const laisser = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r))
}

const modele = (id, nom, portee, extra = {}) => ({
  id,
  nom,
  categorie: '',
  portee,
  description: null,
  avertissements: [],
  defaut: false,
  style: fusionner({}),
  modifiable: false,
  supprimable: false,
  utilisePar: 0,
  ...extra,
})

function base(admin) {
  return [
    modele('defaut', 'Par défaut', 'instance', { defaut: true, modifiable: admin, utilisePar: 5 }),
    modele('livre', 'Livre', 'livre', { description: 'Un livre', style: fusionner({ page: { size: 'A5' } }) }),
    modele('maison', 'Maison', 'instance', { categorie: 'Aube', modifiable: admin, supprimable: admin }),
    modele('m-00000001', 'Mon essai', 'perso', { categorie: 'dixit', modifiable: true, supprimable: true }),
    modele('m-00000002', 'Utilisé', 'perso', { categorie: 'Aube', modifiable: true, supprimable: true, utilisePar: 2 }),
  ]
}

function fauxServeur({ admin = false, refus = null } = {}) {
  const etat = { modeles: base(admin), appels: [] }
  globalThis.fetch = async (url, options = {}) => {
    const methode = options.method || 'GET'
    const corps = options.body ? JSON.parse(options.body) : null
    etat.appels.push({ url, methode, corps })
    const rep = (status, data) => ({ ok: status < 400, status, json: async () => data })
    if (url === '/api/modeles' && methode === 'GET') return rep(200, { modeles: etat.modeles, admin })
    if (refus && methode !== 'GET') return rep(refus, { error: 'refus du serveur' })
    if (url === '/api/modeles' && methode === 'POST') {
      const m = modele('m-99999999', corps.nom, corps.portee === 'instance' ? 'instance' : 'perso', {
        categorie: corps.categorie,
        modifiable: true,
        supprimable: true,
      })
      etat.modeles.push(m)
      return rep(200, m)
    }
    if (methode === 'POST' && url.endsWith('/retablir')) {
      const m = etat.modeles.find((x) => x.id === url.replace('/api/modeles/', '').replace('/retablir', ''))
      Object.assign(m, { nom: 'Grand', ecartLivre: false, retablissable: false })
      return rep(200, m)
    }
    const id = url.replace('/api/modeles/', '')
    if (methode === 'DELETE') {
      etat.modeles = etat.modeles.filter((m) => m.id !== id)
      return rep(200, { ok: true })
    }
    if (methode === 'PUT') {
      const m = etat.modeles.find((x) => x.id === id)
      if (corps.nom) m.nom = corps.nom
      if (corps.categorie !== undefined) m.categorie = corps.categorie
      return rep(200, m)
    }
    return rep(404, {})
  }
  return etat
}

async function monter(options) {
  installer()
  const etat = fauxServeur(options)
  const racine = document.getElementById('racine')
  await mountModeles(racine)
  return { etat, racine }
}
const carte = (racine, id) => racine.querySelector(`[data-modele="${id}"]`)
const boutons = (c) => [...c.querySelectorAll('button')].map((b) => b.textContent)
const clic = (c, texte) => [...c.querySelectorAll('button')].find((b) => b.textContent === texte).click()
const appels = (etat, methode) => etat.appels.filter((a) => a.methode === methode)

test('trois familles, le format de chaque modèle et son usage', async () => {
  const { racine } = await monter()
  assert.deepEqual(
    [...racine.querySelectorAll('.modeles-liste > h2')].map((h) => h.textContent),
    ['Livré avec amend.ink', 'De l’instance', 'Mes modèles']
  )
  assert.ok(carte(racine, 'livre').textContent.includes('A5'))
  assert.ok(carte(racine, 'defaut').textContent.includes('Utilisé par 5 documents'))
  assert.ok(carte(racine, 'maison').textContent.includes('Aucun document ne l’utilise'))
})

test('un modèle livré : dupliquer seulement', async () => {
  const { racine } = await monter()
  assert.deepEqual(boutons(carte(racine, 'livre')), ['Dupliquer'])
})

test('un utilisateur ordinaire : rien à faire sur ceux de l’instance, sauf les dupliquer', async () => {
  const { racine } = await monter({ admin: false })
  assert.deepEqual(boutons(carte(racine, 'maison')), ['Dupliquer'])
  assert.deepEqual(boutons(carte(racine, 'defaut')), ['Dupliquer'])
})

test('un administrateur : modifie « Par défaut » sans pouvoir le renommer ni le supprimer, gère ceux de l’instance', async () => {
  const { racine } = await monter({ admin: true })
  assert.deepEqual(boutons(carte(racine, 'defaut')), ['Dupliquer', 'Modifier'])
  assert.deepEqual(boutons(carte(racine, 'maison')), ['Dupliquer', 'Modifier', 'Renommer', 'Supprimer'])
})

test('ses propres modèles : tout, mais pas supprimer s’il est utilisé — et le bouton dit pourquoi', async () => {
  const { racine } = await monter()
  assert.deepEqual(boutons(carte(racine, 'm-00000001')), ['Dupliquer', 'Modifier', 'Renommer', 'Supprimer'])
  const utilise = [...carte(racine, 'm-00000002').querySelectorAll('button')].find((b) => b.textContent === 'Supprimer')
  assert.equal(utilise.disabled, true)
  assert.ok(utilise.title.includes('2 documents'))
})

test('dupliquer : le nom proposé, puis création à partir du modèle choisi', async () => {
  const { etat, racine } = await monter()
  const c = carte(racine, 'livre')
  clic(c, 'Dupliquer')
  const champ = c.querySelector('input[type=text]')
  assert.equal(champ.value, 'Livre (copie)')
  champ.value = 'Mon livre'
  c.querySelectorAll('.modele-formulaire input[type=text]')[1].value = 'BOD'
  clic(c, 'Créer')
  await laisser()
  assert.deepEqual(
    appels(etat, 'POST').map((a) => a.corps),
    [{ nom: 'Mon livre', categorie: 'BOD', depuis: 'livre', portee: 'perso' }]
  )
  assert.ok(racine.textContent.includes('« BOD - Mon livre » créé'))
  assert.ok(racine.querySelector('[data-modele="m-99999999"]'))
})

test('un administrateur choisit la portée d’un nouveau modèle ; un autre ne la voit pas', async () => {
  const a = await monter({ admin: true })
  const c = carte(a.racine, 'livre')
  clic(c, 'Dupliquer')
  c.querySelector('select').value = 'instance'
  c.querySelectorAll('.modele-formulaire input[type=text]')[1].value = 'KDP'
  clic(c, 'Créer')
  await laisser()
  assert.equal(appels(a.etat, 'POST')[0].corps.portee, 'instance')

  const b = await monter({ admin: false })
  clic(carte(b.racine, 'livre'), 'Dupliquer')
  assert.equal(carte(b.racine, 'livre').querySelector('select'), null)
})

test('un nom refusé par le serveur se lit, sans rien perdre', async () => {
  const { racine } = await monter({ refus: 400 })
  const c = carte(racine, 'livre')
  clic(c, 'Dupliquer')
  c.querySelectorAll('.modele-formulaire input[type=text]')[1].value = 'KDP'
  clic(c, 'Créer')
  await laisser()
  assert.ok(c.textContent.includes('refus du serveur'))
  assert.equal(carte(racine, 'livre').querySelector('input[type=text]') !== null, true)
})

test('renommer : le formulaire ouvert sous la carte envoie le nouveau nom, et la liste se recharge', async () => {
  const { etat, racine } = await monter()
  const c = carte(racine, 'm-00000001')
  clic(c, 'Renommer') // ouvre le formulaire
  const champ = c.querySelector('.modele-formulaire input[type=text]')
  assert.equal(champ.value, 'Mon essai')
  champ.value = 'Nouveau nom'
  c.querySelector('.modele-formulaire').querySelector('button').click() // son bouton « Renommer »
  await laisser()
  assert.deepEqual(
    appels(etat, 'PUT').map((a) => [a.url, a.corps]),
    [['/api/modeles/m-00000001', { nom: 'Nouveau nom', categorie: 'dixit' }]]
  )
  assert.ok(racine.textContent.includes('Renommé en « dixit - Nouveau nom »'))
  assert.equal(carte(racine, 'm-00000001').querySelector('.modele-nom').textContent, 'dixit - Nouveau nom')
})

test('supprimer : deux clics, le premier ne part pas', async () => {
  const { etat, racine } = await monter()
  const c = carte(racine, 'm-00000001')
  clic(c, 'Supprimer')
  await laisser()
  assert.equal(appels(etat, 'DELETE').length, 0)
  clic(c, 'Confirmer la suppression')
  await laisser()
  assert.deepEqual(
    appels(etat, 'DELETE').map((a) => a.url),
    ['/api/modeles/m-00000001']
  )
  assert.equal(racine.querySelector('[data-modele="m-00000001"]'), null)
  assert.ok(racine.textContent.includes('supprimé'))
})

test('modifier : l’avertissement dit combien de documents suivront', async () => {
  const { racine } = await monter()
  clic(carte(racine, 'm-00000002'), 'Modifier')
  assert.ok(racine.textContent.includes('utilisé par 2 documents'))
  assert.ok(racine.querySelector('.style-form'), 'le formulaire complet')
})

test('modifier puis enregistrer envoie la feuille complète, et revient à la liste', async () => {
  const { etat, racine } = await monter()
  clic(carte(racine, 'm-00000001'), 'Modifier')
  assert.ok(racine.textContent.includes('Aucun document ne l’utilise'))
  const enregistrer = [...racine.querySelectorAll('button')].find((b) => b.textContent === 'Enregistrer')
  enregistrer.click()
  await laisser()
  const put = appels(etat, 'PUT')[0]
  assert.equal(put.url, '/api/modeles/m-00000001')
  assert.ok(put.corps.style.page && put.corps.style.blocs.body)
  assert.ok(racine.querySelector('.modele-carte'), 'retour à la liste')
})

test('non connecté : un message, pas une page vide', async () => {
  installer()
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) })
  const racine = document.getElementById('racine')
  await mountModeles(racine)
  assert.ok(racine.textContent.includes('Connexion requise'))
})

const nomsAffiches = (racine) =>
  [...racine.querySelectorAll('.modele-carte')].map((c) => c.querySelector('.modele-nom').textContent)
const choisir = (select, valeur) => {
  select.value = valeur
  select.dispatchEvent(new globalThis.Event('change'))
}

test('chaque modèle se lit « catégorie - nom », sans catégorie : le nom seul', async () => {
  const { racine } = await monter()
  assert.equal(carte(racine, 'maison').querySelector('.modele-nom').textContent, 'Aube - Maison')
  assert.equal(carte(racine, 'm-00000001').querySelector('.modele-nom').textContent, 'dixit - Mon essai')
  assert.equal(carte(racine, 'livre').querySelector('.modele-nom').textContent, 'Livre')
})

test('le filtre par catégorie : les catégories connues, « sans catégorie », et le retour à tout', async () => {
  const { racine } = await monter()
  const filtre = racine.querySelector('.modeles-filtre select')
  assert.deepEqual(
    [...filtre.options].map((o) => o.textContent),
    ['Toutes les catégories', 'Sans catégorie', 'Aube', 'dixit']
  )

  choisir(filtre, 'aube')
  assert.deepEqual(nomsAffiches(racine), ['Aube - Maison', 'Aube - Utilisé'])
  assert.deepEqual(
    [...racine.querySelectorAll('.modeles-liste > h2')].map((h) => h.textContent),
    ['De l’instance', 'Mes modèles']
  )

  choisir(filtre, '__sans__')
  assert.deepEqual(nomsAffiches(racine), ['Livre', 'Par défaut'])
  assert.deepEqual(
    [...racine.querySelectorAll('.modeles-liste > h2')].map((h) => h.textContent),
    ['Livré avec amend.ink', 'De l’instance']
  )

  choisir(filtre, '')
  assert.equal(nomsAffiches(racine).length, 5)
})

test('pas de filtre tant qu’aucun modèle n’a de catégorie', async () => {
  installer()
  const etat = fauxServeur()
  etat.modeles = etat.modeles.map((m) => ({ ...m, categorie: '' }))
  const racine = document.getElementById('racine')
  await mountModeles(racine)
  assert.equal(racine.querySelector('.modeles-filtre'), null)
})

test('dupliquer propose la catégorie de la source, avec les catégories connues en suggestion', async () => {
  const { etat, racine } = await monter()
  const suggestions = [...racine.querySelectorAll('#modeles-categories option')].map((o) => o.value)
  assert.deepEqual(suggestions, ['Aube', 'dixit'])

  const c = carte(racine, 'maison')
  clic(c, 'Dupliquer')
  const [nom, categorie] = c.querySelectorAll('.modele-formulaire input[type=text]')
  assert.equal(nom.value, 'Maison (copie)')
  assert.equal(categorie.value, 'Aube')
  assert.equal(categorie.getAttribute('list'), 'modeles-categories')
  assert.equal(categorie.maxLength, 40)
  categorie.value = 'BOD'
  clic(c, 'Créer')
  await laisser()
  assert.deepEqual(
    appels(etat, 'POST').map((a) => [a.corps.nom, a.corps.categorie, a.corps.depuis]),
    [['Maison (copie)', 'BOD', 'maison']]
  )
  assert.ok(racine.textContent.includes('« BOD - Maison (copie) » créé'))
})

test('la catégorie est obligatoire : sans elle rien ne part, dupliquer comme renommer', async () => {
  const { etat, racine } = await monter()
  const c = carte(racine, 'livre') // « Livre » n'a pas de catégorie à proposer
  clic(c, 'Dupliquer')
  const [, categorie] = c.querySelectorAll('.modele-formulaire input[type=text]')
  assert.equal(categorie.value, '')
  assert.equal(categorie.required, true)
  clic(c, 'Créer')
  await laisser()
  assert.ok(c.textContent.includes('La catégorie est obligatoire'))
  assert.equal(appels(etat, 'POST').length, 0)

  const mien = carte(racine, 'm-00000001')
  clic(mien, 'Renommer')
  const [, cat] = mien.querySelectorAll('.modele-formulaire input[type=text]')
  assert.equal(cat.value, 'dixit')
  cat.value = '  '
  mien.querySelector('.modele-formulaire').querySelector('button').click()
  await laisser()
  assert.ok(mien.textContent.includes('La catégorie est obligatoire'))
  assert.equal(appels(etat, 'PUT').length, 0)
})

test('renommer change aussi la catégorie', async () => {
  const { etat, racine } = await monter()
  const c = carte(racine, 'm-00000001')
  clic(c, 'Renommer')
  const [nom, categorie] = c.querySelectorAll('.modele-formulaire input[type=text]')
  categorie.value = 'Autre'
  c.querySelector('.modele-formulaire').querySelector('button').click()
  await laisser()
  assert.deepEqual(
    appels(etat, 'PUT').map((a) => a.corps),
    [{ nom: nom.value, categorie: 'Autre' }]
  )
  assert.equal(carte(racine, 'm-00000001').querySelector('.modele-nom').textContent, 'Autre - Mon essai')
})

test('« amend.ink » n’est pas proposée à qui range un modèle', async () => {
  installer()
  const etat = fauxServeur()
  etat.modeles[1].categorie = 'amend.ink'
  const racine = document.getElementById('racine')
  await mountModeles(racine)
  const c = carte(racine, 'livre')
  assert.equal(c.querySelector('.modele-nom').textContent, 'amend.ink - Livre')
  clic(c, 'Dupliquer')
  assert.equal(c.querySelectorAll('.modele-formulaire input[type=text]')[1].value, '')
})

test('chaque carte montre un spécimen de page au format du modèle, et son résumé', async () => {
  const { racine } = await monter()
  const livre = carte(racine, 'livre') // A5
  const page = livre.querySelector('.modele-vignette .specimen')
  assert.ok(page, 'un spécimen')
  // 104 px de large, proportions A5 (148 × 210) : hauteur ≈ 148
  assert.equal(page.style.width, '104px')
  assert.equal(page.style.height, `${Math.round((210 / 148) * 104)}px`)
  assert.ok(livre.querySelector('.specimen-page h1'), 'un titre, du texte, une citation')
  assert.match(livre.querySelector('.modele-resume').textContent, /^DejaVu Sans · 11 pt$/)
  // Le spécimen suit le style : A4 pour « Par défaut ».
  const defaut = carte(racine, 'defaut').querySelector('.specimen')
  assert.equal(defaut.style.height, `${Math.round((297 / 210) * 104)}px`)
})

test('l’éditeur de modèle : des volets, un spécimen qui suit les réglages, le CSS en lecture seule', async () => {
  const { racine } = await monter()
  clic(carte(racine, 'm-00000001'), 'Modifier')
  const volets = [...racine.querySelectorAll('.style-volet > summary')].map((s) => s.textContent)
  assert.deepEqual(volets, ['Format et reliure', 'Texte', 'Titres et chapitres', 'Pages', 'Éléments', 'Avancé (CSS)'])
  const ouverts = [...racine.querySelectorAll('.style-volet')].filter((d) => d.open)
  assert.equal(ouverts.length, 1, 'un seul volet ouvert au départ')
  // Tous les réglages d'avant sont là : sept blocs, les quatre marges, le format…
  assert.equal(racine.querySelectorAll('.style-bloc').length, 7)
  assert.ok(racine.querySelectorAll('.style-volet input[type=number]').length >= 40, 'les réglages numériques sont là')

  const apercu = racine.querySelector('.modele-apercu .specimen')
  assert.equal(apercu.style.width, '260px')
  const avant = apercu.style.height // A4
  const taille = racine.querySelector('.style-volet select') // « Format »
  taille.value = 'A5'
  taille.dispatchEvent(new globalThis.Event('change', { bubbles: true }))
  assert.notEqual(racine.querySelector('.modele-apercu .specimen').style.height, avant, 'le spécimen suit le format')

  // Le CSS : lecture seule, rempli à l'ouverture, avec le format choisi.
  const voletCss = [...racine.querySelectorAll('.style-volet')].pop()
  const pre = voletCss.querySelector('pre.style-css')
  assert.ok(pre)
  voletCss.open = true
  voletCss.dispatchEvent(new globalThis.Event('toggle'))
  assert.match(pre.textContent, /@page \{\n {2}size: A5;/)
  assert.match(pre.textContent, /--amend-profil: 1;/)
  assert.equal(voletCss.querySelector('textarea, input'), null, 'rien à y saisir')
})

test('un livré copié parmi ceux de l’instance : son origine, et le rétablir en deux clics', async () => {
  installer()
  const etat = fauxServeur({ admin: true })
  etat.modeles.push(
    modele('tat-grand', 'Grand modifié', 'instance', {
      categorie: 'Aube',
      modifiable: true,
      supprimable: true,
      origine: 'tat-grand',
      ecartLivre: true,
      retablissable: true,
    }),
    modele('bod-12x19', '12 × 19 cm', 'instance', {
      categorie: 'BOD',
      description: 'Un des formats de BoD.',
      modifiable: true,
      supprimable: true,
      origine: 'bod-12x19',
      ecartLivre: false,
      retablissable: false,
    })
  )
  const racine = document.getElementById('racine')
  await mountModeles(racine)

  const modifie = carte(racine, 'tat-grand')
  assert.ok(modifie.textContent.includes('Livré avec amend.ink, puis modifié.'))
  assert.deepEqual(boutons(modifie), [
    'Dupliquer',
    'Modifier',
    'Renommer',
    'Rétablir les valeurs d’origine',
    'Supprimer',
  ])
  const origine = carte(racine, 'bod-12x19')
  assert.ok(origine.textContent.includes('valeurs d’origine'))
  assert.ok(!boutons(origine).includes('Rétablir les valeurs d’origine'), 'rien à rétablir')
  assert.ok(
    carte(racine, 'maison').textContent.indexOf('Livré avec amend.ink') === -1,
    'un modèle à nous n’en vient pas'
  )

  // Un clic arme, le second rétablit.
  clic(modifie, 'Rétablir les valeurs d’origine')
  assert.equal(appels(etat, 'POST').length, 0)
  clic(modifie, 'Confirmer le rétablissement')
  await laisser()
  assert.deepEqual(
    appels(etat, 'POST').map((a) => a.url),
    ['/api/modeles/tat-grand/retablir']
  )
  assert.ok(racine.textContent.includes('rétabli tel qu’amend.ink le livre'))
})

test('un utilisateur ordinaire ne voit pas le bouton de rétablissement', async () => {
  installer()
  const etat = fauxServeur({ admin: false })
  etat.modeles.push(
    modele('tat-poche', 'Poche', 'instance', { origine: 'tat-poche', ecartLivre: true, retablissable: false })
  )
  const racine = document.getElementById('racine')
  await mountModeles(racine)
  assert.deepEqual(boutons(carte(racine, 'tat-poche')), ['Dupliquer'])
})

test('ce que la lecture du CSS n’a pas compris est dit sur la carte', async () => {
  installer()
  const etat = fauxServeur()
  etat.modeles[2].avertissements = [
    '« Garamond Premier » n’est pas dans les polices de l’instance : repli sur Libertinus Serif.',
  ]
  const racine = document.getElementById('racine')
  await mountModeles(racine)
  assert.ok(carte(racine, 'maison').querySelector('.modele-avertissements').textContent.includes('Garamond Premier'))
  assert.equal(carte(racine, 'livre').querySelector('.modele-avertissements'), null)
})

test('fin : nettoyage', () => {
  setTimeout(() => process.exit(0), 100)
})
