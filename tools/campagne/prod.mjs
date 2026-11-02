#!/usr/bin/env node
// Campagne de tests de l'éditeur — contrôle en production, avec le compte de
// test de Claude (tools/prod.mjs, CLAUDE.md). Un seul compte : les cas à un
// auteur, et deux onglets du même compte pour la synchronisation. Le document
// « TEST — campagne éditeur » est créé au premier passage, puis réutilisé.
// Pas d'IA, pas d'invitation, pas de publication.
//
//   node tools/campagne/prod.mjs

import { createRequire } from 'node:module'
import {
  contexteProd,
  creerDocumentTest,
  documents,
  relancerAvecProxySiBesoin,
  verifierCompte,
  BASE,
} from '../prod.mjs'
import { Personne, attendre, convergence } from './outils.mjs'

relancerAvecProxySiBesoin()
const { chromium } = createRequire(import.meta.url)('playwright')

const TITRE = 'TEST — campagne éditeur'
const P1 = 'Le chat noir dort sur le canapé du salon.'
const P2 = 'Il fait beau ce matin, dit-elle.'
const P3 = 'La pluie reviendra demain soir.'
const DEPART = `<p>${P1}</p><p>${P2}</p><p>${P3}</p>`
const BASE_TEXTE = [P1, P2, P3].join('\n')
const L = JSON.stringify

const moi = await verifierCompte()
const doc =
  (await documents()).find((d) => d.jeSuisProprietaire && d.title === TITRE) || (await creerDocumentTest(TITRE))
const navigateur = await chromium.launch()
const resultats = []
const verifier = (cas, v, ok, detail = '') => {
  resultats.push({ cas, v, ok, detail })
  console.log(`${ok ? '  ✓' : '  ✗'} ${v}${ok ? '' : ` — ${detail}`}`)
}

async function onglet() {
  const contexte = await contexteProd(navigateur, { viewport: { width: 1280, height: 900 }, locale: 'fr-FR' })
  const page = await contexte.newPage()
  const erreurs = []
  page.on('pageerror', (e) => erreurs.push(String(e.message || e)))
  await page.goto(`${BASE}/#/doc/${doc.id}`)
  // Le masque de chargement peut déjà avoir quitté le DOM : on attend l'éditeur.
  await page.waitForSelector('.ProseMirror[contenteditable=true]', { timeout: 60000 })
  await attendre(1500)
  return new Personne('test', { nom: moi.nom || 'test' }, contexte, page, erreurs)
}

try {
  const a = await onglet()
  const b = await onglet()
  const tous = [a, b]
  const I = (moi.nom || 'test')[0]
  const cas = async (nom, f) => {
    console.log(nom)
    try {
      await a.remettre(DEPART)
      const lu = await convergence(tous, { delai: 10000 })
      if (lu !== BASE_TEXTE) throw new Error(`remise à zéro ratée : ${L(lu)}`)
      await a.suivi(true)
      await f()
    } catch (e) {
      verifier(nom, 'déroulement', false, e.message.split('\n')[0])
    }
  }

  await cas('Sélection d’un mot puis frappe', async () => {
    await a.doubleClic('noir')
    await a.taper('blanc')
    const vu = await convergence(tous, { delai: 10000 })
    verifier('mot', 'barré puis ajout', vu.includes(`[${I}-noir-]{${I}+blanc+}`), L(vu))
    const m = await a.modifications()
    verifier('mot', 'un seul remplacement au panneau', m.length === 1 && m[0].type === 'remplacement', L(m))
    await a.toutTraiter(true)
    verifier('mot', 'accepté', (await convergence(tous, { delai: 10000 })) === BASE_TEXTE.replace('noir', 'blanc'))
  })

  await cas('Sélection puis touche morte (ê)', async () => {
    await a.selectionner('beau')
    await a.composer(['^'], 'ê')
    await a.taper('tre')
    const vu = await convergence(tous, { delai: 10000 })
    verifier('touche morte', 'barré puis « être »', vu.includes(`[${I}-beau-]{${I}+être+}`), L(vu))
    const m = await a.modifications()
    verifier('touche morte', 'un seul remplacement au panneau', m.length === 1, m.map((x) => x.type).join(', '))
  })

  await cas('Sélection puis Entrée (défaut trouvé en local)', async () => {
    await a.selectionner('noir')
    await a.touche('Enter')
    const vu = await convergence(tous, { delai: 10000 })
    verifier('entrée', 'le mot reste, barré', vu.includes('noir'), L(vu))
    await a.toutTraiter(false)
    const fin = await convergence(tous, { delai: 10000 })
    verifier('entrée', 'tout rejeter rend le départ', fin === BASE_TEXTE, L(fin))
  })

  await cas('Sélection sur deux paragraphes, frappe, acceptation', async () => {
    await a.selectionner('salon.', { jusqua: 'Il fait' })
    await a.taper('blanc')
    const vu = await convergence(tous, { delai: 10000 })
    verifier('deux paragraphes', 'ajout après le barré', vu.indexOf(`{${I}+blanc+}`) > vu.indexOf(`[${I}-`), L(vu))
    await a.toutTraiter(true)
    const fin = await convergence(tous, { delai: 10000 })
    const attendu = `Le chat noir dort sur le canapé du blanc beau ce matin, dit-elle.\n${P3}`
    verifier('deux paragraphes', 'accepté = paragraphes fusionnés', fin === attendu, L(fin))
  })

  await cas('Ctrl+Z après un remplacement', async () => {
    await a.selectionner('canapé')
    await a.taper('fauteuil')
    await attendre(300)
    let lu = ''
    for (let i = 0; i < 6; i++) {
      await a.touche('Control+z')
      await attendre(150)
      lu = await a.lire({ auteurs: true })
      if (lu === BASE_TEXTE) break
    }
    verifier('annuler', 'retour au départ', lu === BASE_TEXTE, L(lu))
  })

  await cas('Commentaire vu dans l’autre onglet', async () => {
    await a.commenter('chat noir', 'TEST — commentaire de campagne')
    await attendre(1000)
    const c = await b.commentaires()
    verifier('commentaire', 'vu dans le second onglet', c.fils.length === 1 || c.marge.length === 1, L(c))
    await a.resoudreTout()
  })

  verifier(
    'console',
    'sans erreur',
    [...a.erreurs, ...b.erreurs].length === 0,
    [...a.erreurs, ...b.erreurs].join(' | ').slice(0, 300)
  )
  await a.remettre(DEPART)
  await attendre(800)
} finally {
  await navigateur.close()
}
const echecs = resultats.filter((r) => !r.ok)
console.log(`\nproduction : ${resultats.length} vérifications, ${echecs.length} échecs (document ${doc.id})`)
process.exitCode = echecs.length ? 1 : 0
