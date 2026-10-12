// La liste « Mes documents » montée dans jsdom, contre un faux serveur qui
// tient en mémoire les documents, les dossiers et la corbeille : favoris en
// haut, ouverture d'un dossier, création, déplacement, recherche, mise à la
// corbeille, restauration et suppression définitive.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const attendre = (ms = 15) => new Promise((r) => setTimeout(r, ms))
const rep = (corps, status = 200) => ({ ok: status < 400, status, json: async () => corps })

function fauxServeur({ docs, dossiers = [], corbeille = [], quotaPlein = false }) {
  const s = { docs, dossiers, corbeille, appels: [], quotaPlein, suivant: 1 }
  s.fetch = async (chemin, opts = {}) => {
    const methode = opts.method || 'GET'
    const corps = opts.body ? JSON.parse(opts.body) : null
    s.appels.push({ chemin, methode, corps })
    if (chemin === '/api/docs') return rep({ docs: JSON.parse(JSON.stringify(s.docs)) })
    if (chemin === '/api/rangement') return rep({ dossiers: s.dossiers, placement: {}, favoris: [] })
    if (chemin === '/api/corbeille' && methode === 'GET') return rep({ documents: s.corbeille })
    if (chemin === '/api/corbeille' && methode === 'DELETE') {
      const n = s.corbeille.length
      s.corbeille = []
      return rep({ ok: true, supprimes: n })
    }
    let m
    if ((m = chemin.match(/^\/api\/docs\/(\w+)\/star$/))) {
      s.docs.find((d) => d.id === m[1]).starred = corps.starred
      return rep({ ok: true })
    }
    if ((m = chemin.match(/^\/api\/docs\/(\w+)$/)) && methode === 'DELETE') {
      const i = s.docs.findIndex((d) => d.id === m[1])
      const [d] = s.docs.splice(i, 1)
      s.corbeille.push({ id: d.id, title: d.title, updatedAt: d.updatedAt, corbeille: { le: Date.UTC(2026, 9, 12, 12), par: 'moi@x.fr' } })
      return rep({ ok: true, corbeille: true })
    }
    if ((m = chemin.match(/^\/api\/docs\/(\w+)\/access\/moi$/))) {
      s.docs = s.docs.filter((d) => d.id !== m[1])
      return rep({ ok: true })
    }
    if ((m = chemin.match(/^\/api\/corbeille\/(\w+)\/restauration$/))) {
      if (s.quotaPlein) return rep({ error: 'limite de 50 documents par compte atteinte' }, 403)
      const i = s.corbeille.findIndex((d) => d.id === m[1])
      const [e] = s.corbeille.splice(i, 1)
      s.docs.push({ id: e.id, title: e.title, updatedAt: e.updatedAt, jeSuisProprietaire: true, owner: 'moi@x.fr', myRole: 'editeur', dossier: null, starred: false })
      return rep({ id: e.id, title: e.title })
    }
    if ((m = chemin.match(/^\/api\/corbeille\/(\w+)$/)) && methode === 'DELETE') {
      s.corbeille = s.corbeille.filter((d) => d.id !== m[1])
      return rep({ ok: true })
    }
    if (chemin === '/api/rangement/dossiers' && methode === 'POST') {
      const d = { id: `n${s.suivant++}`, nom: corps.nom, parent: corps.parent || null }
      s.dossiers.push(d)
      return rep({ dossier: d }, 201)
    }
    if ((m = chemin.match(/^\/api\/rangement\/dossiers\/(\w+)$/))) {
      const d = s.dossiers.find((x) => x.id === m[1])
      if (methode === 'PATCH') {
        d.nom = corps.nom
        return rep({ dossier: d })
      }
      if (methode === 'DELETE') {
        for (const doc of s.docs) if (doc.dossier === d.id) doc.dossier = d.parent
        s.dossiers = s.dossiers.filter((x) => x.id !== d.id)
        return rep({ dossiers: s.dossiers })
      }
    }
    if ((m = chemin.match(/^\/api\/rangement\/documents\/(\w+)$/)) && methode === 'PUT') {
      s.docs.find((d) => d.id === m[1]).dossier = corps.dossier
      return rep({ dossiers: s.dossiers })
    }
    return rep({ error: 'inconnu' }, 404)
  }
  return s
}

const doc = (id, title, extra = {}) => ({
  id,
  title,
  updatedAt: 1000,
  createdAt: 1000,
  starred: false,
  dossier: null,
  jeSuisProprietaire: true,
  owner: 'moi@x.fr',
  myRole: 'editeur',
  ...extra,
})

async function monter(serveur) {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="app"></div></body>')
  globalThis.document = dom.window.document
  globalThis.fetch = serveur.fetch
  const { monterListeDocuments } = await import('../src/listeDocuments.js')
  const racine = dom.window.document.getElementById('app')
  const liste = monterListeDocuments(racine)
  await liste.prete
  await attendre()
  const clic = async (e) => {
    e.dispatchEvent(new dom.window.Event('click', { bubbles: true }))
    await attendre(25)
  }
  const titres = (sel) => [...racine.querySelectorAll(`${sel} li .doc-list-title a`)].map((a) => a.textContent)
  const bouton = (texte) => [...racine.querySelectorAll('button')].find((b) => b.textContent === texte)
  return { racine, dom, clic, titres, bouton }
}

const PRINCIPALE = '.liste-zone > ul.doc-list:not(.favoris-list)'

test('les favoris sont en haut, et la liste principale suit', async () => {
  const s = fauxServeur({ docs: [doc('d1', 'Un favori', { starred: true }), doc('d2', 'Ordinaire', { updatedAt: 2000 })] })
  const { titres, racine } = await monter(s)
  assert.deepEqual(titres('.favoris-list'), ['Un favori'])
  assert.deepEqual(titres(PRINCIPALE), ['Ordinaire', 'Un favori'])
  assert.equal(racine.querySelector('.favoris-titre').textContent, 'Favoris')
})

test('l’étoile est utilisable par un simple lecteur : le favori est personnel', async () => {
  const s = fauxServeur({ docs: [doc('d1', 'Chez un autre', { jeSuisProprietaire: false, owner: 'a@x.fr', myRole: 'lecteur' })] })
  const { racine, clic } = await monter(s)
  const etoile = racine.querySelector(`${PRINCIPALE} .star-btn`)
  assert.equal(etoile.disabled, false)
  await clic(etoile)
  assert.deepEqual(s.appels.find((a) => a.chemin === '/api/docs/d1/star'), { chemin: '/api/docs/d1/star', methode: 'PATCH', corps: { starred: true } })
  assert.equal(racine.querySelectorAll('.favoris-list li').length, 1)
})

test('ouvrir un dossier montre son contenu et un fil d’Ariane pour remonter ; les favoris restent en haut', async () => {
  const s = fauxServeur({
    dossiers: [{ id: 'f1', nom: 'Thèse', parent: null }],
    docs: [doc('d1', 'Dans la thèse', { dossier: 'f1' }), doc('d2', 'Libre'), doc('d3', 'Favori ailleurs', { starred: true })],
  })
  const { racine, clic, titres } = await monter(s)
  assert.deepEqual(titres(PRINCIPALE).sort(), ['Favori ailleurs', 'Libre'])
  assert.equal(racine.querySelector('.dossier-ouvrir .dossier-titre').textContent, 'Thèse')
  assert.equal(racine.querySelector('.dossier-effectif').textContent, '1 document')

  await clic(racine.querySelector('.dossier-ouvrir'))
  assert.deepEqual(titres(PRINCIPALE), ['Dans la thèse'])
  assert.deepEqual(titres('.favoris-list'), ['Favori ailleurs'], 'les favoris restent en haut dans un dossier')
  assert.equal(racine.querySelector('.fil-courant').textContent, 'Thèse')

  await clic(racine.querySelector('.fil-lien'))
  assert.equal(racine.querySelector('.fil-lien'), null, 'à la racine, plus de lien de retour')
  assert.equal(titres(PRINCIPALE).length, 2)
})

test('créer un dossier dans le dossier ouvert, puis le renommer', async () => {
  const s = fauxServeur({ dossiers: [{ id: 'f1', nom: 'Thèse', parent: null }], docs: [] })
  const { racine, clic, bouton, dom } = await monter(s)
  await clic(racine.querySelector('.dossier-ouvrir'))
  await clic(bouton('Nouveau dossier'))
  const champ = racine.querySelector('.dossier-nom')
  champ.value = 'Chapitres'
  racine.querySelector('.dossier-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
  await attendre(40)
  const creation = s.appels.find((a) => a.chemin === '/api/rangement/dossiers' && a.methode === 'POST')
  assert.deepEqual(creation.corps, { nom: 'Chapitres', parent: 'f1' })
  assert.equal(racine.querySelector('.dossier-ouvrir .dossier-titre').textContent, 'Chapitres')
  assert.equal(racine.querySelector('.dossier-form'), null, 'le formulaire se referme')

  await clic(bouton('Renommer'))
  racine.querySelector('.dossier-nom').value = 'Thèse finale'
  racine.querySelector('.dossier-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
  await attendre(40)
  assert.equal(racine.querySelector('.fil-courant').textContent, 'Thèse finale')
})

test('au troisième niveau, plus de « Nouveau dossier »', async () => {
  const s = fauxServeur({
    dossiers: [
      { id: 'a', nom: 'A', parent: null },
      { id: 'b', nom: 'B', parent: 'a' },
      { id: 'c', nom: 'C', parent: 'b' },
    ],
    docs: [],
  })
  const { racine, clic, bouton } = await monter(s)
  await clic(racine.querySelector('.dossier-ouvrir'))
  assert.ok(bouton('Nouveau dossier'))
  await clic(racine.querySelector('.dossier-ouvrir'))
  assert.ok(bouton('Nouveau dossier'))
  await clic(racine.querySelector('.dossier-ouvrir'))
  assert.equal(bouton('Nouveau dossier'), undefined)
})

test('un message du serveur est montré quand la création échoue', async () => {
  const s = fauxServeur({ dossiers: [], docs: [] })
  const brut = s.fetch
  s.fetch = async (chemin, opts = {}) => (chemin === '/api/rangement/dossiers' ? rep({ error: 'un dossier porte déjà ce nom ici' }, 409) : brut(chemin, opts))
  const { racine, clic, bouton, dom } = await monter(s)
  await clic(bouton('Nouveau dossier'))
  racine.querySelector('.dossier-nom').value = 'Doublon'
  racine.querySelector('.dossier-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
  await attendre(40)
  assert.equal(racine.querySelector('.liste-message').textContent, 'un dossier porte déjà ce nom ici')
  assert.equal(racine.querySelector('.liste-message').hidden, false)
})

test('supprimer un dossier fait remonter ses documents', async () => {
  const s = fauxServeur({ dossiers: [{ id: 'f1', nom: 'Thèse', parent: null }], docs: [doc('d1', 'Dedans', { dossier: 'f1' })] })
  const { racine, clic, bouton, titres } = await monter(s)
  await clic(racine.querySelector('.dossier-ouvrir'))
  const supprimer = bouton('Supprimer le dossier')
  await clic(supprimer)
  assert.equal(supprimer.textContent, 'Confirmer ?')
  await clic(supprimer)
  await attendre(30)
  assert.equal(racine.querySelector('.fil-lien'), null, 'retour à la racine')
  assert.deepEqual(titres(PRINCIPALE), ['Dedans'])
})

test('déplacer un document vers un dossier', async () => {
  const s = fauxServeur({ dossiers: [{ id: 'f1', nom: 'Thèse', parent: null }, { id: 'f2', nom: 'Sous', parent: 'f1' }], docs: [doc('d1', 'À ranger')] })
  const { racine, clic, bouton, titres, dom } = await monter(s)
  await clic(bouton('Déplacer'))
  const choix = racine.querySelector('.deplacer-select')
  assert.deepEqual([...choix.options].map((o) => o.textContent.trim()), ['Mes documents (hors dossier)', 'Thèse', 'Sous'])
  choix.value = 'f2'
  choix.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  await attendre(40)
  assert.deepEqual(s.appels.find((a) => a.methode === 'PUT').corps, { dossier: 'f2' })
  assert.deepEqual(titres(PRINCIPALE), [], 'le document a quitté la racine')
  assert.equal(racine.querySelector('.dossier-effectif').textContent, '1 document')
})

test('la recherche traverse les dossiers et indique l’emplacement', async () => {
  const s = fauxServeur({
    dossiers: [{ id: 'f1', nom: 'Thèse', parent: null }],
    docs: [doc('d1', 'Été 2025', { dossier: 'f1' }), doc('d2', 'Autre')],
  })
  const { racine, titres, dom } = await monter(s)
  const champ = racine.querySelector('.liste-recherche')
  champ.value = 'ete'
  champ.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  await attendre()
  assert.equal(racine.querySelector('.resultats-titre').textContent, '1 document trouvé')
  assert.deepEqual(titres('.liste-zone > ul.doc-list'), ['Été 2025'])
  assert.equal(racine.querySelector('.doc-emplacement').textContent, 'Thèse')
  assert.equal(racine.querySelector('.dossier-list'), null, 'pas de dossiers pendant une recherche')

  champ.value = 'zzz'
  champ.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  await attendre()
  assert.equal(racine.querySelector('.resultats-titre').textContent, 'Aucun document ne correspond.')
})

test('le tri par titre réordonne la liste', async () => {
  const s = fauxServeur({ docs: [doc('d1', 'Zèbre', { updatedAt: 3000 }), doc('d2', 'Abeille', { updatedAt: 1000 })] })
  const { racine, titres, dom } = await monter(s)
  assert.deepEqual(titres(PRINCIPALE), ['Zèbre', 'Abeille'])
  const tri = racine.querySelector('.liste-tri')
  tri.value = 'titre'
  tri.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  await attendre()
  assert.deepEqual(titres(PRINCIPALE), ['Abeille', 'Zèbre'])
})

test('mettre à la corbeille, la consulter, restaurer', async () => {
  const s = fauxServeur({ docs: [doc('d1', 'À jeter'), doc('d2', 'Reste')] })
  const { racine, clic, bouton, titres } = await monter(s)
  assert.equal(bouton('Corbeille (1)'), undefined, 'pas de corbeille tant qu’elle est vide')

  const boutonCorbeille = racine.querySelector('.doc-list li .delete-doc-btn')
  assert.equal(boutonCorbeille.textContent, 'Corbeille')
  await clic(boutonCorbeille)
  assert.equal(boutonCorbeille.textContent, 'Confirmer ?', 'un premier clic ne suffit pas')
  assert.equal(s.corbeille.length, 0)
  await clic(boutonCorbeille)
  await attendre(30)
  assert.equal(s.corbeille.length, 1)
  assert.equal(titres(PRINCIPALE).includes('À jeter'), false)

  await clic(bouton('Corbeille (1)'))
  assert.match(racine.querySelector('.corbeille-doc').textContent, /À jeter/)
  assert.match(racine.querySelector('.corbeille-list .doc-date').textContent, /12\/10\/2026/)

  await clic(bouton('Restaurer'))
  await attendre(30)
  assert.equal(s.docs.some((d) => d.id === 'd1'), true)
  assert.match(racine.querySelector('.liste-message').textContent, /restauré/)
  assert.equal(racine.querySelector('.corbeille-list'), null, 'corbeille vidée : retour à la liste')
  assert.ok(titres(PRINCIPALE).includes('À jeter'))
})

test('une restauration refusée (quota) dit pourquoi et laisse le document dans la corbeille', async () => {
  const s = fauxServeur({ docs: [], corbeille: [{ id: 'd1', title: 'Gros', updatedAt: 1, corbeille: { le: 0, par: 'x' } }], quotaPlein: true })
  const { racine, clic, bouton } = await monter(s)
  await clic(bouton('Corbeille (1)'))
  await clic(bouton('Restaurer'))
  assert.match(racine.querySelector('.liste-message').textContent, /limite de 50 documents/)
  assert.equal(s.corbeille.length, 1)
})

test('supprimer pour de bon, puis vider la corbeille : deux clics chaque fois', async () => {
  const s = fauxServeur({
    docs: [],
    corbeille: [
      { id: 'd1', title: 'Un', updatedAt: 1, corbeille: { le: 0, par: 'x' } },
      { id: 'd2', title: 'Deux', updatedAt: 1, corbeille: { le: 0, par: 'x' } },
    ],
  })
  const { racine, clic, bouton } = await monter(s)
  await clic(bouton('Corbeille (2)'))
  const un = racine.querySelector('.corbeille-list .delete-doc-btn')
  assert.equal(un.textContent, 'Supprimer pour de bon')
  await clic(un)
  assert.equal(s.corbeille.length, 2, 'rien avant la confirmation')
  await clic(un)
  await attendre(30)
  assert.equal(s.corbeille.length, 1)

  const vider = bouton('Vider la corbeille')
  await clic(vider)
  assert.equal(s.corbeille.length, 1)
  await clic(vider)
  await attendre(30)
  assert.equal(s.corbeille.length, 0)
  assert.equal(racine.querySelector('.corbeille-list'), null, 'corbeille vide : on retourne à la liste')
})

test('les autres quittent un document, ils ne le mettent pas à la corbeille', async () => {
  const s = fauxServeur({ docs: [doc('d1', 'Partagé', { jeSuisProprietaire: false, owner: 'a@x.fr', myRole: 'correcteur' })] })
  const { racine, clic } = await monter(s)
  const b = racine.querySelector(`${PRINCIPALE} .delete-doc-btn`)
  assert.equal(b.textContent, 'Quitter')
  await clic(b)
  await clic(b)
  await attendre(30)
  assert.ok(s.appels.some((a) => a.chemin === '/api/docs/d1/access/moi' && a.methode === 'DELETE'))
  assert.equal(s.docs.length, 0)
})

test('rien à afficher : un message, pas une page cassée', async () => {
  const { racine } = await monter(fauxServeur({ docs: [] }))
  assert.equal(racine.querySelector('.doc-list-empty').textContent, 'Aucun document pour le moment.')
})
