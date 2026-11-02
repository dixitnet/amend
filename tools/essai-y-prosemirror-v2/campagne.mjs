// Essai v2 : les gestes qui posent problème dans amend.ink, rejoués avec le mode
// suggestion natif de @y/prosemirror 2 + Yjs 14. Chaque cas dans une salle neuve.
import { demarrerEssai, convergenceV2 } from './piloter.mjs'
import { attendre } from '../campagne/outils.mjs'

const P1 = 'Le chat noir dort sur le canapé du salon.'
const P2 = 'Il fait beau ce matin, dit-elle.'
const P3 = 'La pluie reviendra demain soir.'
const BASE = [P1, P2, P3].join('\n')
const L = JSON.stringify
let salle = 0
const filtre = process.argv[2] ? new RegExp(process.argv[2]) : null

const e = await demarrerEssai()
const resultats = []
async function cas(nom, geste, { attenduAccepte = null, deux = false } = {}) {
  if (filtre && !filtre.test(nom)) return
  salle++
  const a = await e.ouvrir('A', `&init=1&salle=${salle}`)
  const b = await e.ouvrir('B', `&salle=${salle}`)
  await attendre(400)
  const ligne = { nom }
  try {
    const depart = await convergenceV2([a, b])
    if (depart !== BASE) throw new Error(`départ : ${L(depart)}`)
    await a.focus()
    await geste(a, b)
    await attendre(500)
    ligne.propose = await convergenceV2([a, b])
    // Rien de perdu : retirer les ajouts proposés et garder les barrés doit rendre le départ.
    const sansAjouts = ligne.propose
      .replace(/\{\+[^]*?\+\}/g, '')
      .replace(/\[-([^]*?)-\]/g, '$1')
      .replace(/\(\*([^]*?)\*\)/g, '$1')
      .replace(/\*\*/g, '')
    ligne.rienPerdu = sansAjouts === BASE
    await a.cmd('toutRejeter')
    await attendre(400)
    ligne.rejete = await convergenceV2([a, b])
    ligne.rejetOk = ligne.rejete === BASE
    ligne.erreurs = [...a.erreurs, ...b.erreurs].slice(0, 3)
  } catch (err) {
    ligne.erreur = err.message.split('\n')[0]
  }
  await a.page.close()
  await b.page.close()
  // Même geste, puis tout accepter.
  if (attenduAccepte && !ligne.erreur) {
    salle++
    const a2 = await e.ouvrir('A', `&init=1&salle=${salle}`)
    const b2 = await e.ouvrir('B', `&salle=${salle}`)
    await attendre(400)
    await convergenceV2([a2, b2])
    await a2.focus()
    await geste(a2, b2)
    await attendre(500)
    await a2.cmd('toutAccepter')
    await attendre(400)
    ligne.accepte = await convergenceV2([a2, b2])
    ligne.accepteOk = ligne.accepte === attenduAccepte
    await a2.page.close()
    await b2.page.close()
  }
  resultats.push(ligne)
  console.log(`\n■ ${nom}`)
  for (const [k, v] of Object.entries(ligne))
    if (k !== 'nom') console.log(`   ${k} : ${typeof v === 'string' ? L(v) : L(v)}`)
}

try {
  await cas('1. sélection d’un mot puis frappe', (a) => a.selectionner('noir').then(() => a.taper('blanc')), {
    attenduAccepte: BASE.replace('noir', 'blanc'),
  })
  await cas('2. sélection puis Entrée', (a) => a.selectionner('noir').then(() => a.touche('Enter')), {
    attenduAccepte: BASE.replace('noir ', '\n '),
  })
  await cas('3. Ctrl+A puis frappe', (a) => a.touche('Control+a').then(() => a.taper('Nouveau')), {
    attenduAccepte: 'Nouveau',
  })
  await cas(
    '4. sélection sur deux paragraphes puis frappe',
    (a) => a.selectionner('salon.', { jusqua: 'Il fait' }).then(() => a.taper('blanc')),
    {
      attenduAccepte: `Le chat noir dort sur le canapé du blanc beau ce matin, dit-elle.\n${P3}`,
    }
  )
  await cas(
    '5. texte d’un bloc (dictée) sur deux paragraphes',
    (a) => a.selectionner('salon.', { jusqua: 'Il fait' }).then(() => a.page.keyboard.insertText('gris')),
    {
      attenduAccepte: `Le chat noir dort sur le canapé du gris beau ce matin, dit-elle.\n${P3}`,
    }
  )
  await cas(
    '6. collage sur deux paragraphes',
    (a) => a.selectionner('salon.', { jusqua: 'Il fait' }).then(() => a.coller('vert')),
    {
      attenduAccepte: `Le chat noir dort sur le canapé du vert beau ce matin, dit-elle.\n${P3}`,
    }
  )
  await cas('7. gras sur une sélection', (a) => a.selectionner('noir').then(() => a.touche('Control+b')), {
    attenduAccepte: BASE.replace('noir', '**noir**'),
  })
  await cas(
    '8. retour arrière puis frappe',
    (a) =>
      a
        .selectionner('noir')
        .then(() => a.touche('Backspace'))
        .then(() => a.taper('roux')),
    {
      attenduAccepte: BASE.replace('noir', 'roux'),
    }
  )
  await cas(
    '9. touche morte sur une sélection',
    (a) =>
      a
        .selectionner('noir')
        .then(() => a.composer(['^'], 'ê'))
        .then(() => a.taper('tre')),
    {
      attenduAccepte: BASE.replace('noir', 'être'),
    }
  )
  await cas(
    '10. fusion de paragraphes (retour arrière en début de bloc)',
    (a) =>
      a
        .selectionner('Il fait')
        .then(() => a.touche('ArrowLeft'))
        .then(() => a.touche('Backspace')),
    {
      attenduAccepte: `${P1}${P2}\n${P3}`,
    }
  )
  await cas('11. Ctrl+Z après un remplacement', async (a) => {
    await a.selectionner('noir')
    await a.taper('blanc')
    await attendre(600)
    for (let i = 0; i < 4; i++) await a.touche('Control+z')
  })
  await cas('12. supprimer l’ajout proposé par l’autre', async (a, b) => {
    await a.cliquerApres('noir')
    await a.taper(' profond')
    await attendre(500)
    await b.focus()
    await b.selectionner(' profond')
    await b.touche('Backspace')
  })
  await cas('13. deux personnes, endroits différents, même paragraphe', async (a, b) => {
    await a.cliquerApres('chat')
    await b.focus()
    await b.cliquerApres('salon')
    await Promise.all([
      a.taper(' tigré au pelage doux et soyeux', { delai: 20 }),
      b.taper(' bleu nuit, près de la fenêtre', { delai: 25 }),
    ])
  })
  await cas('14. deux personnes au même endroit, au même instant', async (a, b) => {
    await a.cliquerApres('noir')
    await b.focus()
    await b.cliquerApres('noir')
    await Promise.all([a.taper(' et blanc', { delai: 40 }), b.taper(' ou roux', { delai: 50 })])
  })
  await cas('15. touche morte contre le curseur de l’autre', async (a, b) => {
    await b.focus()
    await b.selectionner('noir')
    await b.touche('ArrowLeft')
    await attendre(400)
    await a.focus()
    await a.selectionner('noir')
    await a.composer(['^'], 'ê')
    await a.taper('tre')
  })
} finally {
  await e.fermer()
}
