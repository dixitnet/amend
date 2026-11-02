#!/usr/bin/env node
// Campagne de tests de l'éditeur — endurance : deux personnes tapent en même
// temps, en suivi, dans le même paragraphe. Tout ce qui est tapé doit rester
// une proposition (marque d'ajout) : retirer les ajouts doit rendre le texte
// de départ. Mesure la fréquence des fuites hors suivi.
//
//   node tools/campagne/endurance.mjs [--tours=10] [--qui=alice,chloe]

import { demarrer, documentPartage, ouvrir, convergence } from './outils.mjs'

const args = process.argv.slice(2)
const option = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d
const TOURS = Number(option('tours', 10))
const [QUI1, QUI2] = option('qui', 'alice,bruno').split(',')
const P1 = 'Le chat noir dort sur le canapé du salon.'
const BASE = P1
const sansAjouts = (s) => s.replace(/\{.?\+[^]*?\+\}/g, '').replace(/\[.?-([^]*?)-\]/g, '$1')

const { inst, navigateur } = await demarrer({ port: 19600 })
let fuites = 0
try {
  const id = await documentPartage(inst)
  const a = await ouvrir(navigateur, inst, QUI1, id)
  const b = await ouvrir(navigateur, inst, QUI2, id)
  const alice = QUI1 === 'alice' ? a : await ouvrir(navigateur, inst, 'alice', id)
  const tous = [...new Set([a, b, alice])]
  for (let t = 0; t < TOURS; t++) {
    await alice.remettre(`<p>${P1}</p>`)
    await convergence(tous)
    for (const p of [a, b]) if (p.qui !== 'chloe') await p.suivi(true)
    await a.cliquerApres(t % 2 ? 'noir' : 'chat')
    await b.cliquerApres(t % 2 ? 'noir' : 'salon')
    await Promise.all([
      a.taper(' tigré au pelage doux et soyeux', { delai: 20 + (t % 3) * 15 }),
      b.taper(' bleu nuit, près de la fenêtre', { delai: 25 + (t % 4) * 10 }),
    ])
    const vu = await convergence(tous, { delai: 8000 })
    const reste = sansAjouts(vu)
    const ok = reste === BASE
    if (!ok) fuites++
    console.log(
      `${ok ? '✓' : '✗'} tour ${t + 1} : ${JSON.stringify(vu)}${ok ? '' : `\n    hors suivi : ${JSON.stringify(reste)}`}`
    )
  }
  const signalements = inst.journal
    .join('')
    .split('\n')
    .filter((l) => l.includes('[amend] correcteur'))
  console.log(`\njournal du serveur : ${signalements.length} signalement(s) « correcteur »`)
  for (const l of signalements.slice(0, 3)) console.log('   ', l.slice(0, 220))
} finally {
  await navigateur.close()
  await inst.arreter()
}
console.log(`\n${fuites} tour(s) sur ${TOURS} avec du texte entré hors suivi`)
process.exitCode = fuites ? 1 : 0
