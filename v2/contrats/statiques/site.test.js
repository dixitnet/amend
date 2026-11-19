// Les pages publiques (exploitation/site/) sont produites à partir du catalogue i18n/site/ :
// les fichiers commités, que Caddy sert tels quels, doivent correspondre à ce que le catalogue
// donne aujourd'hui (Sylvain, 19/11/2026 : plus de texte en dur dans ces pages). Après un
// changement du catalogue : `node exploitation/site/construire.mjs`, puis prettier.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { accueil, aide } from '../../exploitation/site/construire.mjs'

/** Sans la mise en page de prettier : les blancs ne comptent pas. */
const net = (html) =>
  html
    .replace(/\s+/g, ' ')
    .replace(/\s*(<[^>]+>)\s*/g, '$1')
    .trim()
const commis = (chemin) => readFileSync(new URL(`../../exploitation/site/${chemin}`, import.meta.url), 'utf8')

test('site : l’accueil commité est celui du catalogue', () => {
  assert.equal(net(commis('index.html')), net(accueil('fr')))
})

test('site : l’aide commitée est celle du catalogue', () => {
  assert.equal(net(commis('aide/index.html')), net(aide('fr')))
})

test('site : ni script ni ressource externe, un texte piégé est échappé', () => {
  for (const html of [accueil('fr'), aide('fr')]) {
    assert.doesNotMatch(html, /<script|<link|<img|style=/i)
    assert.doesNotMatch(html, /[\u00A0\u202F]/, 'les espaces insécables sont en entités')
  }
})
