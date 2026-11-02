// Pilote de l'essai v2 : serveur statique, onglets A et B, gestes de la campagne.
/* global window -- fonctions exécutées dans la page (Playwright) */
import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { Personne, attendre } from '../campagne/outils.mjs'

const RACINE = dirname(fileURLToPath(import.meta.url))
const { chromium } = createRequire(import.meta.url)('playwright')

export async function demarrerEssai() {
  const serveur = http.createServer((req, res) => {
    const chemin = join(RACINE, decodeURIComponent(new URL(req.url, 'http://x').pathname))
    const f = existsSync(chemin) && !chemin.endsWith('/') ? chemin : join(RACINE, 'index.html')
    res.writeHead(200, {
      'content-type': { '.js': 'text/javascript', '.html': 'text/html' }[extname(f)] || 'text/plain',
    })
    res.end(readFileSync(f))
  })
  await new Promise((r) => serveur.listen(19990, r))
  const navigateur = await chromium.launch()
  const contexte = await navigateur.newContext({ viewport: { width: 1000, height: 700 } })
  const ouvrir = async (qui, extra = '') => {
    const page = await contexte.newPage()
    const erreurs = []
    page.on('pageerror', (e) => erreurs.push(String(e.message || e)))
    page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()))
    await page.goto(`http://127.0.0.1:19990/?u=${qui}${extra}`)
    await page.waitForSelector('.ProseMirror')
    await attendre(400)
    const p = new Personne(qui, { nom: qui }, contexte, page, erreurs)
    p.lireV2 = () => page.evaluate(() => window.essai.lire())
    p.cmd = (nom) => page.evaluate((n) => window.essai[n](), nom)
    return p
  }
  return {
    ouvrir,
    async fermer() {
      await navigateur.close()
      serveur.close()
    },
  }
}

export async function convergenceV2(gens, delai = 5000) {
  const t0 = Date.now()
  for (;;) {
    const lus = await Promise.all(gens.map((p) => p.lireV2()))
    if (lus.every((l) => l === lus[0])) return lus[0]
    if (Date.now() - t0 > delai)
      return `DIVERGENCE\n${gens.map((p, i) => `${p.qui}: ${JSON.stringify(lus[i])}`).join('\n')}`
    await attendre(100)
  }
}
