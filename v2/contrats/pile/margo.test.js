// T5 : Margo dans un vrai navigateur (étape 8) : l'onglet Margo et le bouton
// « Corriger » pour l'éditeur, rien pour le correcteur ; sans modèle
// configuré, un message clair. Avec MARGO_ESSAI_REEL=1 (et la clé de
// Scaleway dans V2_SCALEWAY_CLE), un vrai « Corriger » avec DeepSeek : la
// correction arrive en suggestion signée « Margo (IA) ».
import { test, before, after } from 'node:test'
import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import { lancerNavigateur, docTest, ouvrir as ouvrirSur, attendreTexte, attendre, panneau } from './outils.mjs'

let pile, nav
const ouvrir = (nom, docId, o) => ouvrirSur(nav, pile.url, nom, docId, o)
const REEL = process.env.MARGO_ESSAI_REEL === '1'

// Le jeton interne de cette pile, pour poser une suggestion comme le fait le serveur de Margo.
const JETON = randomBytes(16).toString('hex')
before(async () => {
  process.env.V2_JETON_INTERNE = JETON
  preparerServices()
  construireClient()
  pile = await demarrerPile({ port: 4371, portCollab: 4471 })
  nav = await lancerNavigateur()
})
after(async () => {
  await nav?.close()
  await pile?.arreter()
})

/** Sélectionne tout le texte du premier paragraphe (la palette s'ouvre). */
async function selectionner(page) {
  await page.click('.bn-editor .bn-inline-content', { clickCount: 3 })
  await page.waitForSelector('.bn-formatting-toolbar')
}
const boutonCorriger = (page) => page.locator('.bn-formatting-toolbar button', { hasText: 'Corriger' })
const ongletMargo = (page) => page.getByRole('tab', { name: 'Margo (IA)' })

test('éditeur : onglet Margo et « Corriger » ; correcteur : ni l’un ni l’autre', async () => {
  const doc = docTest('margo-droits')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Les enfant jouent dans la cour.')
  const c = await ouvrir('Carla', doc, { role: 'correcteur' })
  await attendreTexte(c, 'Les enfant jouent dans la cour.')
  await selectionner(p)
  assert.equal(await boutonCorriger(p).count(), 1, 'le bouton est dans la palette de l’éditeur')
  await selectionner(c)
  assert.equal(await boutonCorriger(c).count(), 0, 'pas de « Corriger » pour le correcteur')
  // Le correcteur est en Corriger : ni lien ni gras dans sa palette ; l'éditrice
  // les a (Sylvain, 11/11/2026 : « le bouton ajouter un lien est encore accessible »).
  assert.equal(await c.locator('.bn-formatting-toolbar [data-test="createLink"]').count(), 0, 'pas de lien en Corriger')
  assert.equal(await c.locator('.bn-formatting-toolbar [data-test="bold"]').count(), 0, 'pas de gras en Corriger')
  assert.equal(await p.locator('.bn-formatting-toolbar [data-test="createLink"]').count(), 1, 'le lien pour l’éditrice')
  assert.equal(await p.locator('.bn-formatting-toolbar [data-test="bold"]').count(), 1, 'le gras pour l’éditrice')
  // Le volet droit est ouvert d'office (suggestions) ou s'ouvre par le bouton du bandeau.
  const ouvrirVolet = async (page) => {
    if (!(await page.getByRole('tab', { name: /^Corrections/ }).isVisible()))
      await page.getByRole('button', { name: 'Corrections, commentaires et Margo (IA)' }).click()
  }
  await ouvrirVolet(p)
  assert.equal(await ongletMargo(p).count(), 1)
  await ouvrirVolet(c)
  assert.equal(await ongletMargo(c).count(), 0, 'pas d’onglet Margo pour le correcteur')
  await p.context().close()
  await c.context().close()
})

test('« Corriger » : aucun volet ne s’ouvre, un message dit le début ; sans modèle, Margo se dit indisponible', async (t) => {
  if (REEL) return t.skip('essai réel demandé : le modèle est configuré')
  const doc = docTest('margo-indisponible')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Les enfant jouent dans la cour.')
  await selectionner(p)
  await boutonCorriger(p).click()
  await p.getByText('Margo corrige la sélection').waitFor()
  await p.getByRole('alert').filter({ hasText: 'Margo est indisponible' }).waitFor()
  // Docs : l'IA travaille dans le texte, sans panneau (Sylvain, 14/11/2026).
  assert.equal(
    await p.getByRole('tab', { name: 'Margo (IA)', selected: true }).count(),
    0,
    'aucun volet ouvert sur Margo',
  )
  // La demande est dans le fil de Margo, portée « sur la sélection ».
  await p.getByRole('button', { name: 'Corrections, commentaires et Margo (IA)' }).click()
  await p.getByRole('tab', { name: 'Margo (IA)' }).click()
  await p.getByText('Corriger la sélection').waitFor()
  await p.getByText('Sur la sélection').waitFor()
  await p.context().close()
})

test('la sélection reste visible quand le focus passe dans « Votre demande » (17/11/2026)', async () => {
  const p = await ouvrir('Paule', docTest('margo-selection-gardee'))
  await p.click('.bn-editor')
  await p.keyboard.type('Un passage choisi pour la demande.')
  await selectionner(p)
  await p.getByRole('button', { name: 'Corrections, commentaires et Margo (IA)' }).click()
  await p.getByRole('tab', { name: 'Margo (IA)' }).click()
  await p.getByLabel('Votre demande').click()
  const gardee = () =>
    p.evaluate(() => CSS.highlights.has('amend-selection') && CSS.highlights.get('amend-selection').size)
  await p.waitForFunction(() => CSS.highlights.has('amend-selection'))
  assert.equal(await gardee(), 1, 'la sélection est inscrite comme surlignage')
  // Le focus revient dans le texte : la sélection du navigateur reprend, plus de surlignage.
  await p.click('.bn-editor .bn-inline-content', { clickCount: 3 })
  await p.waitForFunction(() => !CSS.highlights.has('amend-selection'))
  await p.context().close()
})

test('« Corriger » : une réponse simulée de Margo, le bilan s’affiche dans un message (sans modèle réel)', async (t) => {
  if (REEL) return t.skip('essai réel demandé')
  const doc = docTest('margo-bilan')
  const p = await ouvrir('Paule', doc)
  await p.route('**/margo', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: [
        { type: 'debut', blocs: [] },
        { type: 'texte', texte: 'J’ai corrigé le passage.' },
        { type: 'fin', corrections: 1, commentaires: 0, refus: 0, arret: 'longueur' },
      ]
        .map((e) => JSON.stringify(e))
        .join('\n'),
    }),
  )
  await p.click('.bn-editor')
  await p.keyboard.type('Les enfant jouent dans la cour.')
  await selectionner(p)
  await boutonCorriger(p).click()
  const messages = p.locator('.mantine-Notification-root')
  await messages.filter({ hasText: /1 correction/ }).waitFor()
  await messages.filter({ hasText: 'Réponse coupée' }).waitFor()
  await p.context().close()
})

test('Margo au travail, volet ouvert : trois points dans une bulle de Margo (Sylvain, 15/11/2026)', async (t) => {
  if (REEL) return t.skip('essai réel demandé')
  const doc = docTest('margo-points')
  const p = await ouvrir('Paule', doc)
  await p.route('**/margo', async (route) => {
    await attendre(3000)
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"margo-indisponible"}' })
  })
  await p.click('.bn-editor')
  await p.keyboard.type('Les enfant jouent dans la cour.')
  await selectionner(p)
  await boutonCorriger(p).click()
  await p.getByRole('button', { name: 'Corrections, commentaires et Margo (IA)' }).click()
  await p.getByRole('tab', { name: 'Margo (IA)' }).click()
  await p.locator('[role=status] .mantine-Loader-root').waitFor()
  await p.context().close()
})

test('fil de Margo en bulles : la personne à droite, Margo à gauche ; « Nouvelle conversation » dans le menu « … » (Sylvain, 15/11/2026)', async (t) => {
  if (REEL) return t.skip('essai réel demandé')
  const doc = docTest('margo-bulles')
  const p = await ouvrir('Paule', doc)
  await p.route('**/margo', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: [
        { type: 'debut', blocs: [] },
        { type: 'texte', texte: 'J’ai corrigé le passage.' },
        { type: 'fin', corrections: 1, commentaires: 0, refus: 0, arret: null },
      ]
        .map((e) => JSON.stringify(e))
        .join('\n'),
    }),
  )
  await p.click('.bn-editor')
  await p.keyboard.type('Les enfant jouent dans la cour.')
  await selectionner(p)
  await boutonCorriger(p).click()
  await p.getByRole('button', { name: 'Corrections, commentaires et Margo (IA)' }).click()
  await p.getByRole('tab', { name: 'Margo (IA)' }).click()
  const moi = p.locator('li').filter({ hasText: 'Corriger la sélection' }).locator('.mantine-Paper-root')
  const elle = p.locator('li').filter({ hasText: 'J’ai corrigé le passage.' }).locator('.mantine-Paper-root')
  const [a, b] = [await moi.boundingBox(), await elle.boundingBox()]
  assert.ok(a.x + a.width > b.x + b.width, 'la bulle de la personne finit plus à droite que celle de Margo')
  assert.ok(b.x < a.x, 'la bulle de Margo commence plus à gauche')
  // La portée au-dessus de la saisie (4a).
  await p.getByText('Sur la sélection').waitFor()
  await p.getByRole('region', { name: 'Margo (IA)' }).getByRole('button', { name: 'Autres actions' }).click()
  await p.getByRole('menuitem', { name: 'Nouvelle conversation' }).click()
  await p.getByText('Demandez à Margo').waitFor()
  await p.context().close()
})

test('essai réel (MARGO_ESSAI_REEL=1) : « Corriger » pose une suggestion signée Margo (IA)', async (t) => {
  if (!REEL) return t.skip('essai réel non demandé (MARGO_ESSAI_REEL=1)')
  const doc = docTest('margo-reel')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Les enfant jouent dans la cour.')
  await attendre(1500)
  await selectionner(p)
  await boutonCorriger(p).click()
  await p.getByText(/1 correction/).waitFor({ timeout: 120000 })
  await p.getByRole('tab', { name: /^Corrections/ }).click()
  // Yjs garde les lettres communes : « enfant » → « enfants » est un ajout de « s ».
  const ligne = p.getByText(/Margo \(IA\) (ajoute|remplace)/)
  try {
    await ligne.waitFor({ timeout: 20000 })
  } finally {
    console.log(await p.evaluate(() => document.querySelector('aside')?.innerText.replace(/\n+/g, ' / ')))
  }
  // L'auteur et le contenu de la ligne (A10 de l'audit) : Margo ajoute le « s » manquant.
  assert.match(await ligne.first().innerText(), /^Margo \(IA\) ajoute «\s?s\s?»$/)
  await p.context().close()
})

test('tableau : une correction de Margo dans une cellule s’affiche dans la cellule et dans le volet ; « Corriger » envoie le tableau (19/11/2026)', async (t) => {
  if (REEL) return t.skip('essai réel demandé')
  const { clientCollaboration } = await import('../../adaptateurs/yhub/client.js')
  const { blocsATexteDe, suggererRemplacements } = await import('../../adaptateurs/blocknote/serveur.js')
  const interne = clientCollaboration({ url: `${pile.collab}/collaboration`, jeton: JETON })
  const doc = docTest('margo-tableau')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Avant le tableau.')
  await p.keyboard.press('Enter')
  await p.keyboard.type('/tableau')
  await p.locator('.bn-suggestion-menu-item').first().waitFor()
  await p.keyboard.press('Enter')
  await p.locator('.bn-editor table').waitFor()
  await p.keyboard.type('Les enfant')
  // Le serveur lit le document dans y/hub : on attend que la cellule y soit.
  let cellule = null
  let texte = null
  for (const t0 = Date.now(); Date.now() - t0 < 15000 && !cellule; await attendre(300)) {
    texte = await interne.lireTexte(doc).catch(() => null)
    cellule = texte ? blocsATexteDe(texte).find((b) => b.type === 'tableCell' && b.texte === 'Les enfant') : null
  }
  assert.ok(cellule, 'la cellule est une unité de texte pour Margo')
  assert.match(cellule.id, /\/1\.1$/, 'adressée « tableau/1.1 »')
  // La correction, posée comme le fait le serveur : en suggestion, au nom de Margo.
  const { resultats, mise } = suggererRemplacements(texte, await interne.lireSuggestions(doc), [
    { blocId: cellule.id, debut: 4, fin: 10, apres: 'enfants' },
  ])
  assert.deepEqual(resultats, ['posee'])
  await interne.ecrireSuggestions(doc, mise)
  // Dans le navigateur : la cellule montre la correction, le volet la liste.
  await p.locator('.bn-editor table').getByText('enfants').waitFor({ timeout: 15000 })
  // Le volet ne cite que ce qui change : le « s » ajouté, signé Margo.
  for (const t0 = Date.now(); Date.now() - t0 < 10000 && !/Margo/.test(await panneau(p));) await attendre(200)
  assert.match(await panneau(p), /Margo \(IA\) ajoute «\s?s\s?»/, 'la suggestion est dans le volet, signée Margo')
  // « Corriger » sur une sélection dans le tableau : la demande porte le tableau.
  let envoye = null
  await p.route('**/margo', (route) => {
    envoye = route.request().postDataJSON()
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"margo-indisponible"}' })
  })
  const idTableau = await p.locator('.bn-editor table').evaluate((e) => e.closest('[data-id]').getAttribute('data-id'))
  await p.locator('.bn-editor table td, .bn-editor table th').nth(1).click()
  await p.keyboard.type('jouent')
  await p.keyboard.press('Shift+Home')
  await boutonCorriger(p).click()
  for (const t0 = Date.now(); Date.now() - t0 < 5000 && !envoye;) await attendre(100)
  assert.deepEqual(envoye?.selection, { de: idTableau, a: idTableau }, 'la sélection envoyée est le tableau')
  // « Tout accepter » traite aussi la correction posée dans la cellule (24/11/2026).
  await p.getByRole('tab', { name: /Corrections/ }).click()
  await p.getByRole('button', { name: 'Tout accepter' }).click()
  await attendre(5000)
  const restesTableau = await p.evaluate(() => ({
    cartes: document.querySelectorAll('.amend-suggestions-liste > li').length,
    marques: [...document.querySelectorAll('.bn-editor ins, .bn-editor del')].map(
      (e) => `${e.tagName} « ${e.textContent} »`,
    ),
  }))
  assert.deepEqual(restesTableau, { cartes: 0, marques: [] })
  await p.context().close()
})

test('couleurs (19/11/2026) : une correction a la couleur de son auteur, sa couleur de personne ; Margo a le vert réservé ; une pastille par carte', async (t) => {
  if (REEL) return t.skip('essai réel demandé')
  const { clientCollaboration } = await import('../../adaptateurs/yhub/client.js')
  const { blocsATexteDe, suggererRemplacements } = await import('../../adaptateurs/blocknote/serveur.js')
  const interne = clientCollaboration({ url: `${pile.collab}/collaboration`, jeton: JETON })
  const doc = docTest('couleurs')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Les enfant jouent.')
  const c = await ouvrir('Carla', doc, { role: 'correcteur' })
  await attendreTexte(c, 'Les enfant jouent.')
  await c.click('.bn-editor .bn-inline-content')
  await c.keyboard.press('End')
  await c.keyboard.type(' Dehors.')
  // La correction de Margo, posée comme le fait le serveur.
  let bloc = null
  let texte = null
  for (const t0 = Date.now(); Date.now() - t0 < 15000 && !bloc; await attendre(300)) {
    texte = await interne.lireTexte(doc).catch(() => null)
    bloc = texte ? blocsATexteDe(texte).find((b) => b.texte.startsWith('Les enfant')) : null
  }
  const { mise } = suggererRemplacements(texte, await interne.lireSuggestions(doc), [
    { blocId: bloc.id, debut: 4, fin: 10, apres: 'enfants' },
  ])
  await interne.ecrireSuggestions(doc, mise)
  for (const t0 = Date.now(); Date.now() - t0 < 15000 && !/Margo[\s\S]*Carla|Carla[\s\S]*Margo/.test(await panneau(p));)
    await attendre(200)
  // La couleur d'une correction dans le texte (le trait sous un ajout), par son texte.
  const couleurDuTrait = (texteAjoute) =>
    p.evaluate((x) => {
      const marque = [...document.querySelectorAll('.bn-editor ins .bn-suggestion-mark')].find(
        (e) => e.textContent.trim() === x,
      )
      return marque ? getComputedStyle(marque).borderBottomColor : null
    }, texteAjoute)
  // Les auteurs arrivent de y/hub un peu après les corrections : on attend que Margo ait sa couleur,
  // le vert du picto d'amend.ink (nuance 8 du vert de Mantine, #2f9e44).
  const VERT = 'rgb(47, 158, 68)'
  for (const t0 = Date.now(); Date.now() - t0 < 15000 && (await couleurDuTrait('s')) !== VERT;) await attendre(300)
  const couleurs = { carla: await couleurDuTrait('Dehors.'), margo: await couleurDuTrait('s') }
  assert.equal(
    couleurs.margo,
    VERT,
    'la correction de Margo n’a pas pris le vert réservé (auteurs non reçus de y/hub ?)',
  )
  assert.ok(couleurs.carla)
  assert.notEqual(couleurs.carla, couleurs.margo, 'Margo ne se confond pas avec une personne')
  // Carla : sa couleur de personne, celle de son curseur et de son rond (même teinte de la palette).
  const { couleurAuteur } = await import('../../design/auteurs.js')
  const idCarla = await p.evaluate(
    () =>
      JSON.parse(
        [...document.querySelectorAll('.bn-editor ins')].find((e) => e.textContent.includes('Dehors')).dataset.userIds,
      )[0],
  )
  const rond = couleurAuteur(idCarla)
  // La variable de Mantine prend sa valeur là où elle est lue : BlockNote a son propre thème dans le texte,
  // le volet est dans celui de l'application (même teinte, parfois une nuance d'écart).
  const enRgb = (couleur, ou) =>
    p.evaluate(
      ([v, selecteur]) => {
        const e = document.createElement('i')
        e.style.color = v
        document.querySelector(selecteur).append(e)
        const r = getComputedStyle(e).color
        e.remove()
        return r
      },
      [couleur, ou],
    )
  assert.equal(await enRgb(rond, '.bn-container'), couleurs.carla, 'la correction de Carla a sa couleur de personne')
  // Le volet : une pastille par carte, à la couleur de l'auteur.
  const pastilles = await p
    .locator('.amend-suggestions-liste .mantine-ColorSwatch-root')
    .evaluateAll((l) =>
      l.map((e) => getComputedStyle(e.querySelector('.mantine-ColorSwatch-colorOverlay') ?? e).backgroundColor),
    )
  assert.deepEqual([...pastilles].sort(), [await enRgb(rond, '.amend-suggestions-liste'), couleurs.margo].sort())
  if (process.env.CAPTURE) {
    await p.screenshot({ path: `${process.env.CAPTURE}/couleurs-clair.png` })
    await p.evaluate(() => document.documentElement.setAttribute('data-mantine-color-scheme', 'dark'))
    await attendre(300)
    await p.screenshot({ path: `${process.env.CAPTURE}/couleurs-sombre.png` })
  }
  await p.context().close()
  await c.context().close()
})

test('« Tout accepter » ne laisse aucune correction, ni dans le volet ni dans le texte (24/11/2026)', async (t) => {
  if (REEL) return t.skip('essai réel demandé')
  const { clientCollaboration } = await import('../../adaptateurs/yhub/client.js')
  const { blocsATexteDe, suggererRemplacements } = await import('../../adaptateurs/blocknote/serveur.js')
  const interne = clientCollaboration({ url: `${pile.collab}/collaboration`, jeton: JETON })
  const doc = docTest('tout-accepter')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  const LIGNES = [
    'Les enfant jouent.',
    'Il fais beau dehors.',
    'Nous avont le temps.',
    'Elle chantes bien.',
    'Ils sont partit tôt.',
  ]
  for (let i = 0; i < LIGNES.length; i++) {
    await p.keyboard.type(LIGNES[i])
    if (i < LIGNES.length - 1) await p.keyboard.press('Enter')
  }
  // Une série de corrections de Margo (des remplacements : une suppression et un ajout chacune), posées
  // comme le fait le serveur, puis une correction d'une correctrice.
  const FAUTES = [
    ['enfant', 'enfants'],
    ['fais', 'fait'],
    ['avont', 'avons'],
    ['chantes', 'chante'],
    ['partit', 'partis'],
  ]
  let texte = null
  let blocs = []
  for (const t0 = Date.now(); Date.now() - t0 < 15000 && blocs.length < LIGNES.length; await attendre(300)) {
    texte = await interne.lireTexte(doc).catch(() => null)
    blocs = texte ? blocsATexteDe(texte).filter((b) => LIGNES.includes(b.texte)) : []
  }
  assert.equal(blocs.length, LIGNES.length)
  const demandes = blocs.map((b) => {
    const [faute, juste] = FAUTES[LIGNES.indexOf(b.texte)]
    const debut = b.texte.indexOf(faute)
    return { blocId: b.id, debut, fin: debut + faute.length, apres: juste }
  })
  const { resultats, mise } = suggererRemplacements(texte, await interne.lireSuggestions(doc), demandes)
  assert.deepEqual(
    resultats,
    demandes.map(() => 'posee'),
  )
  await interne.ecrireSuggestions(doc, mise)
  const c = await ouvrir('Carla', doc, { role: 'correcteur' })
  await attendre(2500)
  await c.click('.bn-editor .bn-inline-content >> nth=0')
  await c.keyboard.press('End')
  await c.keyboard.type(' Vraiment.')
  const cartes = p.locator('.amend-suggestions-liste > li')
  for (const t0 = Date.now(); Date.now() - t0 < 15000 && (await cartes.count()) < FAUTES.length + 1;)
    await attendre(300)
  assert.equal(await cartes.count(), FAUTES.length + 1, await panneau(p))
  // Le temps que les auteurs arrivent de y/hub et soient donnés à l'afficheur (couleurs).
  await attendre(3000)
  await p.getByRole('button', { name: 'Tout accepter' }).click()
  for (const t0 = Date.now(); Date.now() - t0 < 10000 && (await cartes.count()) > 0;) await attendre(300)
  await attendre(4000)
  const restes = await p.evaluate(() => ({
    cartes: [...document.querySelectorAll('.amend-suggestions-liste > li')].map((e) =>
      e.innerText.replace(/\s+/g, ' '),
    ),
    marques: [...document.querySelectorAll('.bn-editor ins, .bn-editor del')].map(
      (e) => `${e.tagName} « ${e.textContent} »`,
    ),
    texte: [...document.querySelectorAll('.bn-editor .bn-inline-content')].map((e) => e.textContent),
  }))
  assert.deepEqual(
    { cartes: restes.cartes, marques: restes.marques },
    { cartes: [], marques: [] },
    JSON.stringify(restes),
  )
  // Le texte, sans l'étiquette du curseur de la correctrice.
  assert.deepEqual(
    restes.texte.slice(0, 5).map((x) => x.replace(/\u2060[^\u2060]*\u2060/g, '')),
    [
      'Les enfants jouent. Vraiment.',
      'Il fait beau dehors.',
      'Nous avons le temps.',
      'Elle chante bien.',
      'Ils sont partis tôt.',
    ],
  )
  await p.context().close()
  await c.context().close()
})
