import { demarrerEssai, convergenceV2 } from './piloter.mjs'
import { attendre } from '../campagne/outils.mjs'
const e = await demarrerEssai()
let salle = 100
const essai = async (nom, modeQ, geste) => {
  const res = []
  for (let k = 0; k < 3; k++) {
    salle++
    const a = await e.ouvrir('A', `&init=1&salle=${salle}&mode=${modeQ}`)
    const b = await e.ouvrir('B', `&salle=${salle}&mode=${modeQ}`)
    await attendre(400)
    await convergenceV2([a, b])
    await a.focus()
    await geste(a, b)
    await attendre(500)
    res.push((await convergenceV2([a, b])).split('\n')[0])
    await a.page.close()
    await b.page.close()
  }
  console.log(`■ ${nom}\n   ${res.map((r) => JSON.stringify(r)).join('\n   ')}`)
}
try {
  await essai('touche morte sur sélection, SANS suggestion', 'off', (a) =>
    a
      .selectionner('noir')
      .then(() => a.composer(['^'], 'ê'))
      .then(() => a.taper('tre'))
  )
  await essai('touche morte sans sélection, en suggestion', 'edit', (a) =>
    a
      .cliquerApres('noir')
      .then(() => a.taper(' '))
      .then(() => a.composer(['^'], 'ê'))
      .then(() => a.taper('tre'))
  )
  await essai('touche morte sur sélection, en suggestion', 'edit', (a) =>
    a
      .selectionner('noir')
      .then(() => a.composer(['^'], 'ê'))
      .then(() => a.taper('tre'))
  )
  await essai('Ctrl+Z après un remplacement, en suggestion', 'edit', async (a) => {
    await a.selectionner('noir')
    await a.taper('blanc')
    await attendre(700)
    for (let i = 0; i < 3; i++) {
      await a.touche('Control+z')
      await attendre(150)
    }
  })
} finally {
  await e.fermer()
}
