#!/usr/bin/env node
// Campagne de tests de l'éditeur — endurance des touches mortes (^ puis e → ê),
// en suivi, sur une sélection faite au clavier. Cherche deux défauts vus une
// fois dans la matrice : un « ^ » qui reste dans le texte, et des personnes qui
// ne voient plus le même document (la vue d'Alice décrochée de Yjs).
//
//   node tools/campagne/composition.mjs [--tours=40]

import { demarrer, documentPartage, ouvrir, attendre, convergence, COMPOSITION, NAVIGATEUR } from './outils.mjs'

if (!COMPOSITION) {
  console.log(`composition non pilotable dans ${NAVIGATEUR} : Chromium seulement`)
  process.exit(0)
}

const args = process.argv.slice(2)
const TOURS = Number(args.find((a) => a.startsWith('--tours='))?.split('=')[1] ?? 40)
const P1 = 'Le chat noir dort sur le canapé du salon.'
const P2 = 'Il fait beau ce matin, dit-elle.'
const BASE = `${P1}\n${P2}`
const CIBLES = [
  ['Le chat', 2],
  ['noir dort', 2],
  ['salon.', 1],
  ['Il fait', 2],
  ['beau', 1],
]
const { inst, navigateur } = await demarrer({ port: 19800 })
let accents = 0
let divergences = 0
try {
  const id = await documentPartage(inst)
  const alice = await ouvrir(navigateur, inst, 'alice', id)
  const bruno = await ouvrir(navigateur, inst, 'bruno', id)
  const tous = [alice, bruno]
  for (let t = 0; t < TOURS; t++) {
    const [passage, mots] = CIBLES[t % CIBLES.length]
    await alice.remettre(`<p>${P1}</p><p>${P2}</p>`)
    try {
      await convergence(tous, { delai: 6000 })
    } catch (e) {
      console.log(
        `✗ tour ${t + 1} : remise à zéro impossible, arrêt\n    ${e.message.split('\n').slice(1).join('\n    ')}`
      )
      divergences++
      break
    }
    await alice.suivi(t % 3 !== 2)
    await alice.selectionner(passage)
    await alice.touche('ArrowLeft')
    await alice.touche('Control+Shift+ArrowRight', mots)
    await alice.composer(['^'], 'ê')
    await alice.taper('tre')
    await attendre(200)
    const vu = await alice.lire({ auteurs: true })
    if (vu.includes('^')) accents++
    let ok = !vu.includes('^')
    try {
      await convergence(tous, { delai: 4000 })
      await alice.toutTraiter(true)
      await convergence(tous, { delai: 4000 })
    } catch (e) {
      ok = false
      divergences++
      console.log(`✗ tour ${t + 1} (${passage}) : ${e.message.split('\n').slice(1).join(' | ')}`)
    }
    console.log(
      `${ok ? '✓' : '✗'} tour ${t + 1} (${passage}, ${t % 3 !== 2 ? 'suivi' : 'hors suivi'}) : ${JSON.stringify(vu)}`
    )
    if (alice.erreurs.length) console.log('    console :', alice.erreurs.splice(0).join(' | ').slice(0, 300))
  }
} finally {
  await navigateur.close()
  await inst.arreter()
}
console.log(
  `\n${accents} « ^ » restés dans le texte, ${divergences} divergence(s), sur ${TOURS} tours (base ${JSON.stringify(BASE.slice(0, 10))}…)`
)
process.exitCode = accents || divergences ? 1 : 0
