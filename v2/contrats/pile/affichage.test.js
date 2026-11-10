// T5 : vérifications d'affichage programmées (déterministes), en pseudo-langue,
// aux formats visés (L : Mac ; M : iPad, en portrait et en paysage ; le
// format S, iPhone, viendra plus tard), en clair et en sombre : aucun texte
// d'interface resté en dur, aucun débordement, rien hors de l'écran.
// (Le jugement de captures par Mistral s'est révélé peu fiable :
// docs/v2-tests/etape-1-captures.md.)
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import { lancerNavigateur, docTest, attendreEtat } from './outils.mjs'

let pile, nav
before(async () => {
  preparerServices()
  construireClient()
  pile = await demarrerPile({ port: 4340, portCollab: 4440 })
  nav = await lancerNavigateur()
})
after(async () => {
  await nav?.close()
  await pile?.arreter()
})

const TAILLES = {
  'L (Mac)': { width: 1440, height: 900 },
  'M (iPad, portrait)': { width: 820, height: 1180 },
  'M (iPad, paysage)': { width: 1180, height: 820 },
}

/** Problèmes d'affichage de la page, hors du texte du document (`.bn-editor`). */
const problemes = (page, pseudo) =>
  page.evaluate((pseudo) => {
    const p = []
    const largeur = document.documentElement.clientWidth
    if (document.documentElement.scrollWidth > largeur + 1)
      p.push(`défilement horizontal (${document.documentElement.scrollWidth} > ${largeur})`)
    // Un volet replié est inactif (`inert`) : il peut rester hors de l'écran.
    const interface_ = [...document.querySelectorAll('body *')].filter(
      (el) => !el.closest('.bn-container') && !el.closest('[inert]'),
    )
    for (const el of interface_) {
      const r = el.getBoundingClientRect()
      if (r.width && (r.right > largeur + 1 || r.left < -1))
        p.push(`hors de l'écran : <${el.tagName.toLowerCase()} class="${el.className}">`)
      // La piste d'un interrupteur de Mantine rogne son curseur par construction.
      if (el.closest('.mantine-Switch-track')) continue
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'hidden')
        p.push(`texte coupé : ${el.className}`)
    }
    if (pseudo) {
      const marcheur = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
        const t = n.textContent.trim()
        // Un symbole sans lettre (l'astérisque d'un champ obligatoire) n'a pas de langue.
        if (!/\p{L}/u.test(t) || n.parentElement.closest('.bn-container, script, style')) continue
        const bloc = n.parentElement.textContent
        if (!bloc.includes('⟦') || !bloc.includes('⟧')) p.push(`texte en dur : « ${t.slice(0, 40)} »`)
      }
    }
    return p
  }, pseudo)

for (const [taille, viewport] of Object.entries(TAILLES))
  for (const theme of ['light', 'dark'])
    test(`pseudo-langue, ${taille}, thème ${theme === 'dark' ? 'sombre' : 'clair'} : connexion et document sans défaut d'affichage`, async () => {
      const ctx = await nav.newContext({ viewport, colorScheme: theme, locale: 'fr-FR' })
      const page = await ctx.newPage()
      await page.goto(`${pile.url}/?langue=pseudo#${docTest('affichage')}`)
      await page.waitForSelector('input[name=nom]')
      assert.deepEqual(await problemes(page, true), [], 'écran de connexion')
      await page.fill('input[name=nom]', 'Camille Dupré')
      await page.click('button[type=submit]')
      await page.waitForSelector('.bn-editor')
      await attendreEtat(page, 'connecte')
      assert.deepEqual(await problemes(page, true), [], 'page du document')
      await ctx.close()
    })

test('français et anglais, iPad en portrait : aucun débordement', async () => {
  for (const langue of ['fr', 'en']) {
    const ctx = await nav.newContext({ viewport: TAILLES['M (iPad, portrait)'], locale: 'fr-FR' })
    const page = await ctx.newPage()
    await page.goto(`${pile.url}/?langue=${langue}#${docTest('affichage')}`)
    await page.waitForSelector('input[name=nom]')
    await page.fill('input[name=nom]', 'Camille Dupré')
    await page.click('button[type=submit]')
    await page.waitForSelector('.bn-editor')
    if (langue === 'fr') await attendreEtat(page, 'connecte')
    assert.deepEqual(await problemes(page, false), [], langue)
    await ctx.close()
  }
})

test('le détecteur trouve bien un texte en dur et un débordement plantés exprès', async () => {
  const ctx = await nav.newContext({ viewport: TAILLES['M (iPad, portrait)'], locale: 'fr-FR' })
  const page = await ctx.newPage()
  await page.goto(`${pile.url}/?langue=pseudo#${docTest('affichage')}`)
  await page.waitForSelector('input[name=nom]')
  await page.evaluate(() => {
    const p = document.createElement('p')
    p.textContent = 'Texte resté en dur'
    const large = document.createElement('div')
    large.className = 'trop-large'
    large.setAttribute('style', 'width: 2000px; height: 1px')
    document.body.append(p, large)
  })
  const trouves = await problemes(page, true)
  assert.ok(
    trouves.some((x) => x.includes('Texte resté en dur')),
    JSON.stringify(trouves),
  )
  assert.ok(
    trouves.some((x) => x.includes('défilement horizontal')),
    JSON.stringify(trouves),
  )
  assert.ok(
    trouves.some((x) => x.includes('trop-large')),
    JSON.stringify(trouves),
  )
  await ctx.close()
})

// Clôture de l'étape 6 (10/11/2026) : les autres écrans, en pseudo-langue, aux
// formats L et S : listes, Partagé avec moi, une équipe, la fenêtre de partage,
// le refus du back-office.
for (const [taille, viewport] of Object.entries({
  'L (Mac)': TAILLES['L (Mac)'],
  'S (iPhone)': { width: 390, height: 844 },
}))
  test(`pseudo-langue, ${taille} : listes, équipe, partage et back-office sans texte en dur`, async () => {
    const ctx = await nav.newContext({ viewport, locale: 'fr-FR' })
    const page = await ctx.newPage()
    const doc = docTest('affichage-ecrans')
    await page.goto(`${pile.url}/?langue=pseudo#${doc}`)
    await page.fill('input[name=nom]', 'Camille Dupré')
    await page.click('button[type=submit]')
    await page.waitForSelector('.bn-editor')
    await attendreEtat(page, 'connecte')
    const equipe = await page.evaluate(async () => {
      const r = await fetch('/api/equipes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nom: 'Équipe d’essai' }),
      })
      return (await r.json()).id
    })
    for (const [ecran, adresse] of [
      ['mes documents', '#'],
      ['partagé avec moi', '#/partages'],
      ['équipe', `#/equipes/${equipe}`],
      ['back-office refusé', '#/admin'],
    ]) {
      await page.goto(`${pile.url}/?langue=pseudo${adresse}`)
      // (Le réseau n'est jamais au repos : flux des commentaires, collaboration.)
      await page.waitForTimeout(1200)
      // Les noms saisis (document, équipe, personne) et les dates (Intl) ne sont
      // pas des textes d'interface.
      const p = (await problemes(page, true)).filter(
        (x) => !/Équipe d’essai|Camille|⟦/.test(x) && !/« \d{1,2} \p{L}+\.? \d{4} »$/u.test(x),
      )
      assert.deepEqual(p, [], ecran)
    }
    if (taille.startsWith('L')) {
      await page.goto(`${pile.url}/?langue=pseudo#${doc}`)
      await page.waitForSelector('.bn-editor')
      await page.locator('button:has(.tabler-icon-share)').first().click()
      await page.getByRole('dialog').waitFor()
      assert.deepEqual(
        (await problemes(page, true)).filter((x) => !/Camille|Équipe d’essai/.test(x)),
        [],
        'fenêtre de partage',
      )
    }
    await ctx.close()
  })
