// T5 : le format S (téléphone, vertical) dans un vrai navigateur, d'après la
// maquette validée (docs/v2-format-S.md) : bandeau, lecture à l'ouverture,
// modification d'un appui, « Terminer », plan, menu « … », partage plein
// écran, titre modifiable, listes empilées.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import {
  lancerNavigateur,
  docTest,
  ouvrir as ouvrirSur,
  attendreTexte,
  attendre,
  panneau,
  defilerJusquEnBas,
  NAVIGATEUR,
} from './outils.mjs'

let pile, nav
/** Un téléphone en portrait (taille d'un iPhone 13). */
const TELEPHONE = { viewport: { width: 390, height: 844 }, hasTouch: true }
const ouvrir = (nom, docId, o = {}) => ouvrirSur(nav, pile.url, nom, docId, { ...o, contexte: TELEPHONE })

before(async () => {
  preparerServices()
  construireClient()
  pile = await demarrerPile({ port: 4380, portCollab: 4480 })
  nav = await lancerNavigateur()
})
after(async () => {
  await nav?.close()
  await pile?.arreter()
})

const modifiable = (page) => page.evaluate(() => document.querySelector('.bn-editor')?.contentEditable === 'true')

test('format S : bandeau, mode Éditer sans clavier à l’ouverture, un appui pour modifier, « Terminer » ferme le clavier', async () => {
  const doc = docTest('s-lecture')
  const p = await ouvrir('Paule', doc)
  await p.getByRole('button', { name: 'Plan et documents' }).waitFor()
  await p.getByRole('button', { name: 'Autres actions' }).waitFor()
  assert.equal(await p.getByRole('button', { name: 'Historique' }).count(), 0, 'pas d’historique sur téléphone (Docs)')
  assert.equal(await modifiable(p), false, 'sans clavier à l’ouverture')
  assert.equal(await p.locator('[data-amend-lecture]').count(), 0, 'le mode est Éditer, pas Lire')
  await p.click('.bn-editor')
  assert.equal(await modifiable(p), true, 'un appui passe en modification')
  await p.getByRole('button', { name: 'Terminer' }).waitFor()
  await p.keyboard.type('Écrit sur téléphone.')
  await attendreTexte(p, 'Écrit sur téléphone.')
  // Un second appui, au milieu du texte : le curseur va à l'endroit touché.
  await p.getByRole('button', { name: 'Terminer' }).click()
  const boite = await p.locator('.bn-inline-content').first().boundingBox()
  await p.mouse.click(boite.x + 3, boite.y + boite.height / 2)
  await p.keyboard.type('X')
  await attendreTexte(p, 'XÉcrit sur téléphone.')
  await p.getByRole('button', { name: 'Terminer' }).click()
  assert.equal(await modifiable(p), false, '« Terminer » ferme le clavier')
  assert.equal(await p.locator('[data-amend-lecture]').count(), 0, 'sans changer de mode : toujours Éditer')
  await p.getByRole('button', { name: 'Terminer' }).waitFor({ state: 'detached' })
  await attendre(1500)
  await p.reload()
  await attendreTexte(p, 'XÉcrit sur téléphone.')
  await p.context().close()
})

test('format S : le correcteur s’ouvre en Corriger sans clavier ; un appui l’ouvre, sa frappe est une suggestion ; « Terminer » ferme le clavier', async () => {
  const doc = docTest('s-correcteur')
  // L'éditrice, sur grand écran, écrit le texte.
  const p = await ouvrirSur(nav, pile.url, 'Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Il faisait nuit.')
  const c = await ouvrir('Carla', doc, { role: 'correcteur' })
  await attendreTexte(c, 'Il faisait nuit.')
  assert.equal(await modifiable(c), false, 'sans clavier à l’ouverture')
  assert.equal(await c.locator('[data-amend-lecture]').count(), 0, 'le mode est Corriger, pas Lire')
  const boite = await c.locator('.bn-inline-content').first().boundingBox()
  await c.mouse.click(boite.x + boite.width - 2, boite.y + boite.height / 2)
  assert.equal(await modifiable(c), true, 'un appui ouvre le clavier')
  await c.keyboard.press('End')
  await attendre(300)
  await c.keyboard.type(' Ajout')
  for (const t0 = Date.now(); Date.now() - t0 < 10000 && !/Carla ajoute/.test(await panneau(p));) await attendre(200)
  assert.match(await panneau(p), /Carla ajoute «\s?Ajout\s?»/, 'une suggestion, chez l’éditrice')
  await c.getByRole('button', { name: 'Terminer' }).click()
  assert.equal(await modifiable(c), false, '« Terminer » ferme le clavier')
  assert.equal(await c.locator('[data-amend-lecture]').count(), 0, 'toujours Corriger')
  // Toujours Corriger : sa suggestion reste visible dans le texte (en Lire, le texte de base seul).
  await attendreTexte(c, 'Il faisait nuit. Ajout')
  await p.context().close()
  await c.context().close()
})

test('format S : le plan liste les titres ; le menu « … » ; le partage en plein écran ; le titre se renomme', async () => {
  const doc = docTest('s-plan')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('# Chapitre un')
  await p.keyboard.press('Enter')
  await p.keyboard.type('Du texte.')
  await p.getByRole('button', { name: 'Terminer' }).click()
  // Titres réduits comme Docs à 560 px et moins (réglage css.telephone.titres) : 1,6 rem au niveau 1.
  // (mesurée une fois la transition de BlockNote finie : sinon 25,56 px).
  // Firefox arrondit au 1/60 de pixel (25,5938 px) : comparaison à 0,05 px près.
  const taille = () =>
    p.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector("[data-content-type='heading'] .bn-inline-content")).fontSize),
    )
  const juste = (t) => Math.abs(t - 25.6) < 0.05
  for (const t0 = Date.now(); Date.now() - t0 < 3000 && !juste(await taille());) await attendre(100)
  const t = await taille()
  assert.ok(juste(t), `taille du titre : ${t} px, attendu 25,6 px`)
  await p.getByRole('button', { name: 'Plan et documents' }).click()
  const titre = p.getByRole('dialog').getByRole('button', { name: 'Chapitre un' })
  await titre.waitFor()
  await titre.click()
  await p.getByRole('dialog').waitFor({ state: 'detached' })
  // Menu « … » : ce qui marche seulement (plan du format S, 3.1).
  await p.getByRole('button', { name: 'Autres actions' }).click()
  await p.getByRole('menuitem').first().waitFor()
  const elements = await p.getByRole('menuitem').allInnerTexts()
  assert.deepEqual(
    elements.map((e) => e.trim()),
    [
      'Ajouter aux favoris',
      'Copier le lien',
      'Passer en mode Corriger',
      'Passer en mode Lire',
      'Partager',
      'Exporter…',
      'Dupliquer',
      'Mes documents',
      '100\u202F%',
      '150\u202F%',
      '200\u202F%',
      'Supprimer',
      'Se déconnecter',
    ],
  )
  await p.getByRole('menuitem', { name: 'Partager' }).click()
  await p.getByRole('dialog', { name: 'Partage' }).getByLabel('Adresse de courriel').waitFor()
  await p.keyboard.press('Escape')
  await p.getByRole('dialog', { name: 'Partage' }).waitFor({ state: 'detached' })
  // Le titre, dans le bandeau, se renomme d'un appui.
  // (fenêtre de saisie, comme en L et M, plutôt que la boîte du navigateur).
  await p.getByRole('button', { name: 'Renommer' }).click()
  await p.getByRole('textbox', { name: 'Titre du document' }).fill('Mon livre')
  await p.getByRole('button', { name: 'Valider' }).click()
  await p.getByRole('banner').getByText('Mon livre').waitFor()
  await p.context().close()
})

test('format S : un lecteur ne passe pas en modification ; l’accueil ouvre le dernier document ; le volet « Documents »', async () => {
  const doc = docTest('s-lecteur')
  const p = await ouvrir('Paule', doc)
  const l = await ouvrir('Lucie', doc, { role: 'lecteur' })
  await l.click('.bn-editor')
  assert.equal(await modifiable(l), false)
  assert.equal(await l.getByRole('button', { name: 'Terminer' }).count(), 0)
  assert.equal(await l.getByRole('button', { name: 'Renommer' }).count(), 0, 'un lecteur ne renomme pas')
  // Plus de page « Mes documents » : l'accueil rouvre le dernier document.
  await p.goto(`${pile.url}/#`)
  await p.waitForFunction((d) => decodeURIComponent(location.hash.slice(1)) === d, doc)
  await p.getByRole('button', { name: 'Plan et documents' }).click()
  await p.getByRole('dialog').getByRole('tab', { name: 'Documents' }).click()
  await p.getByRole('dialog').getByRole('searchbox', { name: 'Rechercher un document' }).waitFor()
  await p.getByRole('dialog').getByRole('button', { name: 'Nouveau', exact: true }).waitFor()
  await l.context().close()
  await p.context().close()
})

test('format S : l’état de synchronisation est un picto du bandeau, les favoris et la taille du texte sont dans le menu « … »', async () => {
  const doc = docTest('s-synchro')
  const p = await ouvrir('Paule', doc)
  // Le picto dit l'état (nom accessible) ; ni étoile devant le titre, ni texte « Synchronisé » en bas de page.
  await p.getByRole('status', { name: 'Synchronisé' }).waitFor()
  assert.equal(
    await p
      .locator('header')
      .getByRole('button', { name: /favoris/ })
      .count(),
    0,
    'plus d’étoile dans le bandeau',
  )
  assert.equal(await p.getByText('Synchronisé', { exact: true }).count(), 0, 'plus de texte d’état en bas de page')
  await p.getByRole('button', { name: 'Autres actions' }).click()
  await p.getByRole('menuitem', { name: 'Ajouter aux favoris' }).waitFor()
  // Taille du texte : 100, 150 et 200 % au format S (plus de 50 %).
  assert.equal(await p.getByRole('menuitem', { name: '50\u202F%', exact: true }).count(), 0)
  await p.getByRole('menuitem', { name: '200\u202F%', exact: true }).click()
  const taille = () =>
    p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.bn-editor .bn-inline-content')).fontSize))
  for (const t0 = Date.now(); Date.now() - t0 < 3000 && (await taille()) < 30;) await attendre(100)
  assert.ok((await taille()) >= 30, 'le texte à 200 % est deux fois plus grand')
  // Les favoris se basculent depuis le menu.
  await p.getByRole('button', { name: 'Autres actions' }).click()
  await p.getByRole('menuitem', { name: 'Ajouter aux favoris' }).click()
  await p.getByRole('button', { name: 'Autres actions' }).click()
  await p.getByRole('menuitem', { name: 'Retirer des favoris' }).waitFor()
})

test('format S : un zoom mémorisé à 50 % (autre format) est ramené à 100 %, le palier le plus proche', async () => {
  const doc = docTest('s-zoom-memorise')
  const p = await ouvrir('Paule', doc)
  await p.evaluate(() => localStorage.setItem('amend.zoom', '50'))
  await p.reload()
  await p.getByRole('button', { name: 'Autres actions' }).click()
  const coche = p
    .getByRole('menuitemradio', { checked: true })
    .or(p.getByRole('menuitem', { name: '100\u202F%', exact: true }))
  await coche.first().waitFor()
  assert.equal(await p.locator('[data-amend-zoom]').first().getAttribute('data-amend-zoom'), '100')
})

test('format S : sans réseau (mode avion), le picto passe à « Hors ligne », puis revient à « Synchronisé »', async () => {
  const doc = docTest('s-avion')
  const p = await ouvrir('Paule', doc)
  await p.getByRole('status', { name: 'Synchronisé' }).waitFor()
  await p.context().setOffline(true)
  await p.getByRole('status', { name: 'Hors ligne' }).waitFor()
  await p.context().setOffline(false)
  await p.getByRole('status', { name: 'Synchronisé' }).waitFor({ timeout: 30000 })
})

test('format S : un serveur qui ne répond pas, au-delà de 10 secondes, est annoncé « Hors ligne »', async () => {
  const doc = docTest('s-serveur-muet')
  const p = await ouvrir('Paule', doc)
  await p.getByRole('status', { name: 'Synchronisé' }).waitFor()
  // Le réseau est là, mais le serveur de collaboration ne répond plus : les connexions sont refusées.
  let muet = true
  await p.routeWebSocket(/.*/, (ws) => (muet ? ws.close() : ws.connectToServer()))
  await p.reload()
  await p.getByRole('status', { name: 'Synchronisation…' }).waitFor()
  // Avant le délai, le picto dit encore « Synchronisation… » ; après, « Hors ligne ».
  assert.equal(await p.getByRole('status', { name: 'Hors ligne' }).count(), 0, 'pas avant le délai')
  await p.getByRole('status', { name: 'Hors ligne' }).waitFor({ timeout: 20000 })
  // Le serveur revient : le fournisseur se reconnecte, le picto repasse à « Synchronisé ».
  muet = false
  await p.getByRole('status', { name: 'Synchronisé' }).waitFor({ timeout: 60000 })
})

test('format S : la palette flottante est cachée pendant le défilement et réapparaît à son arrêt', async () => {
  const doc = docTest('s-palette-defile')
  const p = await ouvrir('Paule', doc)
  await p.getByRole('status', { name: 'Synchronisé' }).waitFor()
  // BlockNote ne monte sa barre mobile que clavier ouvert (iOS) : on en pose une
  // de même classe pour vérifier la règle de la feuille et l'attribut de la page.
  await p.evaluate(() => {
    const barre = document.createElement('div')
    barre.className = 'bn-mobile-formatting-toolbar'
    barre.textContent = 'barre'
    document.body.append(barre)
  })
  const palette = p.locator('.bn-mobile-formatting-toolbar')
  assert.equal(await palette.evaluate((e) => getComputedStyle(e).visibility), 'visible')
  await p.evaluate(() => document.dispatchEvent(new Event('scroll')))
  assert.equal(await p.evaluate(() => document.documentElement.hasAttribute('data-amend-defile')), true)
  assert.equal(await palette.evaluate((e) => getComputedStyle(e).visibility), 'hidden', 'cachée pendant le défilement')
  await p.waitForFunction(() => !document.documentElement.hasAttribute('data-amend-defile'), null, { timeout: 2000 })
  assert.equal(await palette.evaluate((e) => getComputedStyle(e).visibility), 'visible', 'revenue à l’arrêt')
})

test('format S : en Lire (choix du menu « … »), le texte seul : un appui n’ouvre pas le clavier, pas de volet de droite ; les corrections reviennent en Éditer', async () => {
  const doc = docTest('s-lire-choisi')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Du texte.')
  await p.getByRole('button', { name: 'Terminer' }).click()
  await p.getByRole('button', { name: 'Relecture' }).waitFor() // le volet de droite, en Éditer
  await p.getByRole('button', { name: 'Autres actions' }).click()
  await p.getByRole('menuitem', { name: 'Passer en mode Lire', exact: true }).click()
  await p.locator('[data-amend-lecture]').waitFor()
  assert.equal(await p.getByRole('button', { name: 'Relecture' }).count(), 0, 'pas de volet de droite en Lire')
  await p.click('.bn-editor')
  assert.equal(await modifiable(p), false, 'un appui n’ouvre pas le clavier en Lire')
  await p.getByRole('button', { name: 'Autres actions' }).click()
  await p.getByRole('menuitem', { name: 'Passer en mode Éditer', exact: true }).click()
  await p.getByRole('button', { name: 'Relecture' }).waitFor()
  await p.context().close()
})

test('format S : pas de poignées de bloc, marges de 10 px (Sylvain, 09/11/2026, maintenu le 14/11/2026)', async () => {
  const p = await ouvrir('Paule', docTest('s-poignees'))
  await p.locator('.bn-editor').waitFor()
  const mesure = await p.evaluate(() => {
    const sonde = document.createElement('div')
    sonde.className = 'bn-side-menu'
    document.querySelector('.bn-container').appendChild(sonde)
    const affichage = getComputedStyle(sonde).display
    sonde.remove()
    return { affichage, marge: getComputedStyle(document.querySelector('.bn-editor')).paddingLeft }
  })
  assert.equal(mesure.affichage, 'none', 'poignées masquées')
  assert.equal(mesure.marge, '10px', 'marges de 10 px')
  await p.context().close()
})

test('format S : les onglets des tiroirs sont des pictos seuls, le nom de l’onglet ouvert est le titre (Sylvain, 14/11/2026)', async () => {
  const p = await ouvrir('Paule', docTest('s-onglets-pictos'))
  for (const [bouton, ouvert, autre] of [
    ['Plan et documents', 'Plan', 'Documents'],
    ['Relecture', 'Corrections', 'Commentaires'],
  ]) {
    await p.getByRole('button', { name: bouton }).click()
    const tiroir = p.getByRole('dialog')
    await tiroir.getByRole('tab', { name: ouvert }).waitFor()
    assert.equal(await tiroir.getByRole('heading').innerText(), ouvert, 'titre = onglet ouvert')
    for (const t of await tiroir.getByRole('tab').all()) {
      assert.equal((await t.innerText()).trim(), '', 'aucun libellé dans l’onglet')
      const c = await t.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const g = el.querySelector('svg').getBoundingClientRect()
        return Math.abs(r.left + r.width / 2 - (g.left + g.width / 2))
      })
      assert.ok(c < 3, `picto centré dans son onglet (écart ${c})`)
    }
    const { haut, sm } = await tiroir.locator('[role=tabpanel]:visible').evaluate((el) => {
      const sonde = document.createElement('div')
      sonde.style.paddingTop = 'var(--mantine-spacing-sm)'
      document.body.appendChild(sonde)
      const sm = parseFloat(getComputedStyle(sonde).paddingTop)
      sonde.remove()
      return { haut: parseFloat(getComputedStyle(el).paddingTop), sm }
    })
    assert.ok(
      sm > 0 && haut === sm,
      `le contenu est séparé du trait par l’espacement sm de Mantine (${haut} px, attendu ${sm})`,
    )
    await tiroir.getByRole('tab', { name: autre }).click()
    assert.equal(await tiroir.getByRole('heading').innerText(), autre, 'le titre suit l’onglet')
    await p.keyboard.press('Escape')
    await tiroir.waitFor({ state: 'detached' })
  }
  await p.context().close()
})

test('format S : la pastille de nombre du volet droit n’est pas rognée par son bouton (Sylvain, 14/11/2026)', async () => {
  const doc = docTest('s-pastille')
  const p = await ouvrirSur(nav, pile.url, 'Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Il faisait nuit.')
  const c = await ouvrirSur(nav, pile.url, 'Carla', doc, { role: 'correcteur' })
  await c.locator('.bn-editor').click()
  await c.keyboard.press('End')
  await c.keyboard.type(' Ajout')
  const e = await ouvrir('Edith', doc)
  await attendreTexte(e, 'Il faisait nuit. Ajout')
  const pastille = e.locator('.amend-bandeau-volet-droit .mantine-Indicator-indicator')
  await pastille.waitFor()
  const rogne = await e.evaluate(() => {
    const b = document.querySelector('.amend-bandeau-volet-droit')
    return getComputedStyle(b).overflow
  })
  assert.equal(rogne, 'visible', 'le bouton ne rogne pas sa pastille')
  const boite = await pastille.boundingBox()
  assert.ok(boite.x + boite.width <= 390 && boite.y >= 0, 'la pastille tient dans l’écran')
  const entiere = await e.evaluate(() => {
    const el = document.querySelector('.amend-bandeau-volet-droit .mantine-Indicator-indicator')
    const r = el.getBoundingClientRect()
    const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return el === t || el.contains(t)
  })
  assert.ok(entiere, 'la pastille est celle qui reçoit le point, aucun ancêtre ne la recouvre ni ne la rogne')
  for (const x of [p, c, e]) await x.context().close()
})

/** Ces deux essais passent par la barre mobile de BlockNote, qui n'est montée et placée que clavier
 * virtuel ouvert (`useVirtualKeyboard`) : Chromium en émulation tactile le simule, WebKit et Firefox
 * non (essai de réduire la fenêtre : la barre reste introuvable, CI du 18/11/2026). Contrôle réel :
 * iPhone (veille, 13/11/2026) et campagne WebKit. */
const SANS_BARRE_MOBILE = NAVIGATEUR !== 'chromium' && 'barre mobile liée au clavier virtuel, non simulé hors Chromium'

test(
  'format S : « Corriger » une sélection n’ouvre aucun volet et la portée reste « sur la sélection » (Sylvain, 14/11/2026)',
  { skip: SANS_BARRE_MOBILE },
  async () => {
    const doc = docTest('s-corriger')
    const p = await ouvrir('Paule', doc)
    await p.click('.bn-editor')
    await p.keyboard.type('Les enfant jouent dans la cour.')
    await attendre(500)
    await p.click('.bn-editor .bn-inline-content', { clickCount: 3 })
    await p.locator('button', { hasText: 'Corriger' }).first().click()
    await p.getByText('Margo corrige la sélection').waitFor()
    assert.equal(await p.getByRole('dialog').count(), 0, 'aucun tiroir ouvert')
    // La palette recouvre le bandeau tant que le texte est sélectionné : le
    // tiroir s'ouvre par un clic programmatique, qui prend le focus à l'éditeur.
    await p.getByRole('button', { name: 'Relecture' }).evaluate((b) => b.click())
    await p.getByRole('tab', { name: 'Margo (IA)' }).click()
    await p.getByText('Sur la sélection').waitFor()
    assert.equal(await p.getByText('Sur tout le texte').count(), 0, 'la portée n’est pas « tout le texte »')
    await p.context().close()
  },
)

test(
  'format S : la pastille du volet droit s’anime pendant que Margo travaille, volet fermé (Sylvain, 14/11/2026)',
  { skip: SANS_BARRE_MOBILE },
  async () => {
    const doc = docTest('s-margo-occupe')
    const p = await ouvrir('Paule', doc)
    // Une réponse de Margo retardée : le temps de voir l'animation.
    await p.route('**/margo', async (route) => {
      await attendre(2500)
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"margo-indisponible"}' })
    })
    await p.click('.bn-editor')
    await p.keyboard.type('Les enfant jouent dans la cour.')
    await attendre(500)
    await p.click('.bn-editor .bn-inline-content', { clickCount: 3 })
    await p.locator('button', { hasText: 'Corriger' }).first().click()
    const pastille = p.locator('.amend-bandeau-volet-droit .mantine-Indicator-indicator')
    await pastille.waitFor()
    assert.equal(await p.getByRole('dialog').count(), 0, 'volet fermé')
    assert.ok(
      await pastille.evaluate(
        (el) => el.hasAttribute('data-processing') || getComputedStyle(el).animationName !== 'none',
      ),
      'la pastille est animée',
    )
    await pastille.waitFor({ state: 'detached', timeout: 10000 })
    await p.getByRole('alert').filter({ hasText: 'Margo est indisponible' }).waitFor()
    await p.context().close()
  },
)

test('format S : « Tout accepter » et « Tout refuser » restent sous l’en-tête du tiroir quand la liste défile (Sylvain, 15/11/2026)', async () => {
  const doc = docTest('s-suggestions-collees')
  const p = await ouvrirSur(nav, pile.url, 'Paule', doc)
  await p.click('.bn-editor')
  const n = 14
  for (let i = 0; i < n; i++) {
    await p.keyboard.type(`Ligne numero ${i}.`)
    if (i < n - 1) await p.keyboard.press('Enter')
  }
  const c = await ouvrirSur(nav, pile.url, 'Carla', doc, { role: 'correcteur' })
  await attendre(3000)
  await c.click('.bn-editor .bn-block-content >> nth=0')
  await c.keyboard.press('Control+Home')
  for (let i = 0; i < n; i++) {
    await c.keyboard.press('End')
    await c.keyboard.type(' x')
    if (i < n - 1) await c.keyboard.press('ArrowDown')
  }
  await attendre(2500)
  const e = await ouvrir('Edith', doc)
  await e.getByRole('button', { name: 'Relecture' }).click()
  const bouton = e.getByRole('button', { name: 'Tout accepter' })
  await bouton.waitFor()
  await defilerJusquEnBas(bouton)
  await attendre(400)
  const entete = await e.locator('.mantine-Drawer-header').boundingBox()
  const apres = await bouton.boundingBox()
  assert.ok(
    apres.y >= entete.y + entete.height - 1 && apres.y < entete.y + entete.height + 40,
    `sous l’en-tête (${apres.y} px)`,
  )
  assert.ok(await e.getByRole('button', { name: 'Tout refuser' }).isVisible(), '« Tout refuser » aussi')
  for (const x of [p, c, e]) await x.context().close()
})

test('format S : un clic sur une carte (correction ou commentaire), hors boutons, ferme le tiroir et mène au passage (Sylvain, 15/11/2026)', async () => {
  const doc = docTest('s-carte-cliquable')
  const p = await ouvrirSur(nav, pile.url, 'Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Il faisait nuit sur la ville.')
  const c = await ouvrirSur(nav, pile.url, 'Carla', doc, { role: 'correcteur' })
  await attendre(2500)
  await c.click('.bn-editor .bn-inline-content')
  await c.keyboard.press('End')
  await c.keyboard.type(' Ajout.')
  await attendre(1000)
  await c
    .getByText('Il faisait nuit', { exact: false })
    .first()
    .dblclick({ position: { x: 100, y: 5 } })
  const bouton = c.locator('.bn-formatting-toolbar button[aria-label="Ajouter un commentaire"]')
  await bouton.click()
  await attendre(400)
  await c.keyboard.type('Pourquoi la nuit ?')
  await c.keyboard.press('Control+Enter')
  await attendre(1500)
  const e = await ouvrir('Edith', doc)
  await attendre(2500)
  // La carte de correction : un coin, hors nom, passage et boutons.
  await e.getByRole('button', { name: 'Relecture' }).click()
  const carte = e.locator('.amend-suggestions-liste > li').first()
  await carte.waitFor()
  await attendre(800) // le tiroir finit de glisser
  const b1 = await carte.boundingBox()
  await e.mouse.click(b1.x + 3, b1.y + b1.height - 3)
  await e.getByRole('dialog').waitFor({ state: 'detached' })
  // La carte de commentaire.
  await e.getByRole('button', { name: 'Relecture' }).click()
  await e.locator('[role=tab][aria-label="Commentaires"]').click()
  const fil = e.locator('.bn-thread').first()
  await fil.waitFor()
  await attendre(800)
  const b2 = await fil.boundingBox()
  await e.mouse.click(b2.x + 3, b2.y + 3)
  await e.getByRole('dialog').waitFor({ state: 'detached' })
  for (const x of [p, c, e]) await x.context().close()
})

test('format S : « Se déconnecter » du menu « … » ferme la session et revient à la connexion (18/11/2026)', async () => {
  const p = await ouvrir('Paule', docTest('s-deconnexion'))
  await p.getByRole('button', { name: 'Autres actions' }).click()
  await p.getByRole('menuitem', { name: 'Se déconnecter' }).click()
  await p.getByRole('button', { name: 'Entrer' }).waitFor()
  assert.equal(await p.locator('.bn-editor').count(), 0, 'le document n’est plus affiché')
  await p.context().close()
})

test('page de connexion : au milieu de l’écran, sans défilement de côté ; titres plus petits au format S, colonne étroite au format L (21/11/2026)', async () => {
  const relever = async (contexte) => {
    const ctx = await nav.newContext({ ...contexte, locale: 'fr-FR' })
    const page = await ctx.newPage()
    await page.goto(pile.url)
    const titre = page.getByRole('heading', { name: 'Connexion', exact: true })
    await titre.waitFor()
    const r = await page.evaluate(() => {
      const cadre = document.querySelector('.amend-connexion')
      const b = cadre.getBoundingClientRect()
      const pile = cadre.firstElementChild.getBoundingClientRect()
      const marque = [...cadre.querySelectorAll('h1')].find((h) => h.textContent.includes('amend.ink'))
      // En développement comme en ligne, la page porte la marque (sur l'entrée par un nom, ou sur le lien).
      if (!marque) throw new Error('la marque « amend.ink » est absente de la page de connexion')
      return {
        defileDeCote: document.documentElement.scrollWidth > innerWidth,
        largeur: Math.round(b.width),
        ecran: innerWidth,
        // Le contenu est à égale distance du haut et du bas, ou plus haut que l'écran (alors il défile).
        dessus: Math.round(pile.top - b.top),
        dessous: Math.round(b.bottom - pile.bottom),
        marque: parseFloat(getComputedStyle(marque).fontSize),
      }
    })
    r.titre = await titre.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))
    await ctx.close()
    return r
  }
  const s = await relever(TELEPHONE)
  const l = await relever({ viewport: { width: 1280, height: 800 } })
  for (const r of [s, l]) {
    assert.equal(r.defileDeCote, false)
    assert.ok(Math.abs(r.dessus - r.dessous) <= 1, `centré en hauteur (${r.dessus} / ${r.dessous})`)
    assert.ok(r.dessus >= 30, 'une marge en haut')
  }
  assert.ok(s.marque < l.marque && s.titre < l.titre, `titres plus petits au format S (${JSON.stringify([s, l])})`)
  assert.equal(s.largeur, s.ecran, 'toute la largeur du téléphone')
  assert.ok(l.largeur <= 600, `une colonne étroite sur grand écran (${l.largeur} px)`)
})
