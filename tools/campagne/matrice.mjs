#!/usr/bin/env node
// Campagne de tests de l'éditeur — matrice « sélectionner puis taper ».
//
// Pour chaque combinaison de :
//   - mode     : sans suivi (Alice, éditrice), en suivi (Alice), correctrice (Chloé, suivi imposé) ;
//   - nature   : un mot, plusieurs mots, un bout de mot, début et fin de
//                paragraphe, deux ou trois paragraphes, gras partiel, titre,
//                citation ;
//   - geste de sélection : sélection posée (comme à la souris), double-clic,
//                glisser, Maj+Ctrl+→, triple-clic ;
//   - saisie   : frappe, frappe avec espaces, texte d'un bloc (dictée,
//                saisie prédictive), touche morte (ê), collage, retour arrière
//                puis frappe, suppression puis frappe, Entrée ;
// on vérifie, comme Google Docs en mode suggestion :
//   1. sans suivi : le passage sélectionné est remplacé, rien n'est marqué ;
//   2. en suivi : l'ancien passage est barré, le nouveau texte vient juste
//      après, au nom de la bonne personne, le curseur est derrière la frappe,
//      le panneau ne montre qu'une modification (pour un seul bloc) ;
//   3. « tout accepter » donne exactement le texte obtenu sans suivi ;
//   4. « tout rejeter » rend exactement le texte de départ ;
//   5. Ctrl+Z ramène au texte de départ, Ctrl+Maj+Z refait la proposition ;
//   6. les trois personnes connectées voient toujours le même texte ;
//   7. aucune erreur dans la console.
//
//   node tools/campagne/matrice.mjs [--filtre=regex] [--rapide] [--sortie=fichier.json]

import { writeFileSync } from 'node:fs'
import { demarrer, documentPartage, ouvrir, attendre, convergence, COMPOSITION, NAVIGATEUR } from './outils.mjs'

const args = process.argv.slice(2)
const option = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d
const FILTRE = option('filtre', '')
const RAPIDE = args.includes('--rapide')
const SORTIE = option('sortie', '')

const P1 = 'Le chat noir dort sur le canapé du salon.'
const P2 = 'Il fait beau ce matin, dit-elle.'
const P3 = 'La pluie reviendra demain soir.'
const STRUCTURES = {
  simple: `<p>${P1}</p><p>${P2}</p><p>${P3}</p>`,
  gras: `<p>Le chat <strong>noir dort</strong> sur le canapé du salon.</p><p>${P2}</p><p>${P3}</p>`,
  titre: `<h2>${P1}</h2><p>${P2}</p><p>${P3}</p>`,
  citation: `<p>${P1}</p><blockquote><p>${P2}</p></blockquote><p>${P3}</p>`,
}
const BASE = [P1, P2, P3].join('\n')

// Natures de sélection : [nom, structure, passage, jusqu'à, gestes possibles]
const NATURES = [
  ['mot', 'simple', 'noir', null, ['pose', 'double-clic', 'glisser', 'clavier']],
  ['mots', 'simple', 'chat noir dort', null, ['pose', 'glisser', 'clavier']],
  ['bout-de-mot', 'simple', 'anap', null, ['pose', 'glisser']],
  ['debut-paragraphe', 'simple', 'Le chat', null, ['pose', 'clavier']],
  ['fin-paragraphe', 'simple', 'du salon.', null, ['pose', 'glisser']],
  ['paragraphe-entier', 'simple', P2, null, ['pose', 'triple-clic']],
  ['deux-paragraphes', 'simple', 'salon.', 'Il fait', ['pose', 'glisser']],
  ['trois-paragraphes', 'simple', 'canapé', 'La pluie', ['pose']],
  ['gras-partiel', 'gras', 'chat noir', null, ['pose', 'glisser']],
  ['dans-titre', 'titre', 'noir', null, ['pose', 'double-clic']],
  ['titre-vers-paragraphe', 'titre', 'salon.', 'Il fait', ['pose']],
  ['dans-citation', 'citation', 'beau', null, ['pose', 'double-clic']],
  ['paragraphe-vers-citation', 'citation', 'salon.', 'Il fait', ['pose']],
]

// Saisies : [nom, fonction(personne), texte inséré attendu (null = pas de comparaison naïve)]
const SAISIES = [
  ['frappe', (p) => p.taper('blanc'), 'blanc'],
  ['frappe-espaces', (p) => p.taper('tout blanc et'), 'tout blanc et'],
  ['bloc', (p) => p.page.keyboard.insertText('gris'), 'gris'],
  ['touche-morte', (p) => p.composer(['^'], 'ê').then(() => p.taper('tre')), 'être'],
  ['collage', (p) => p.coller('vert'), 'vert'],
  ['retour-arriere-puis-frappe', (p) => p.touche('Backspace').then(() => p.taper('roux')), 'roux'],
  ['suppr-puis-frappe', (p) => p.touche('Delete').then(() => p.taper('roux')), 'roux'],
  ['entree', (p) => p.touche('Enter'), null],
]
const SAISIES_RAPIDES = new Set(['frappe', 'touche-morte', 'collage', 'retour-arriere-puis-frappe'])

const MODES = [
  ['sans-suivi', 'alice'],
  ['suivi', 'alice'],
  ['correctrice', 'chloe'],
]

async function selectionner(p, geste, passage, jusqua) {
  if (geste === 'pose') return p.selectionner(passage, { jusqua })
  if (geste === 'double-clic') return p.doubleClic(passage)
  if (geste === 'glisser') return p.glisser(passage, jusqua || passage)
  if (geste === 'triple-clic') {
    // Au rythme d'une main (60 ms entre les clics) : le raccourci
    // `clickCount: 3` de Playwright ne sélectionne parfois qu'un mot.
    const b = await p.boiteDe(passage.slice(0, 6))
    await p.page.mouse.move(b.x + 2, b.y + b.height / 2)
    for (const n of [1, 2, 3]) {
      await p.page.mouse.down({ clickCount: n })
      await attendre(30)
      await p.page.mouse.up({ clickCount: n })
      await attendre(60)
    }
    return attendre(150)
  }
  if (geste === 'clavier') {
    // Curseur devant le passage, puis Maj+Ctrl+→ autant de fois qu'il y a de mots.
    await p.selectionner(passage)
    await p.touche('ArrowLeft')
    return p.touche('Control+Shift+ArrowRight', passage.split(' ').length)
  }
  throw new Error(geste)
}

const lisible = (s) => JSON.stringify(s)
const sansMarques = (s) => s.replace(/\{.?\+[^]*?\+\}/g, '').replace(/\[.?-([^]*?)-\]/g, '$1')

const resultats = []
function noter(cas, verif, ok, detail = '') {
  resultats.push({ ...cas, verif, ok, detail })
  if (!ok) console.log(`  ✗ ${verif} — ${detail}`)
}

const { inst, navigateur } = await demarrer({ port: Number(option('port', 19400)) })
const t0 = Date.now()
try {
  const id = await documentPartage(inst)
  const gens = {
    alice: await ouvrir(navigateur, inst, 'alice', id),
    bruno: await ouvrir(navigateur, inst, 'bruno', id),
    chloe: await ouvrir(navigateur, inst, 'chloe', id),
  }
  const tous = Object.values(gens)
  const { alice } = gens

  async function preparer(structure) {
    await alice.remettre(STRUCTURES[structure])
    const lu = await convergence(tous, { delai: 8000 })
    if (lu !== BASE) throw new Error(`remise à zéro ratée : ${lisible(lu)}`)
  }

  /** Joue le geste ; rend ce que voit la personne et l'état du curseur. */
  async function jouer(p, mode, structure, geste, passage, jusqua, saisie) {
    await preparer(structure)
    if (p === alice) await alice.suivi(mode !== 'sans-suivi')
    await p.focus()
    await selectionner(p, geste, passage, jusqua)
    const avant = await p.curseur()
    await saisie[1](p)
    await attendre(250)
    return { selection: avant?.selection ?? '', lu: await p.lire({ auteurs: true }), curseur: await p.curseur() }
  }

  const sansSuiviObtenu = new Map()
  for (const [nature, structure, passage, jusqua, gestes] of NATURES) {
    for (const geste of gestes) {
      for (const saisie of SAISIES) {
        if (RAPIDE && !SAISIES_RAPIDES.has(saisie[0])) continue
        if (saisie[0] === 'touche-morte' && !COMPOSITION) continue
        for (const [mode, qui] of MODES) {
          const cas = { mode, nature, geste, saisie: saisie[0] }
          const nom = `${mode} · ${nature} · ${geste} · ${saisie[0]}`
          if (FILTRE && !new RegExp(FILTRE).test(nom)) continue
          console.log(nom)
          const p = gens[qui]
          const initiale = p.compte.nom[0]
          const erreursAvant = tous.map((x) => x.erreurs.length)
          try {
            const r = await jouer(p, mode, structure, geste, passage, jusqua, saisie)
            const attenduSel = jusqua ? null : passage
            if (attenduSel && r.selection.replace(/\n/g, '') !== attenduSel)
              noter(cas, 'sélection', false, `sélectionné ${lisible(r.selection)} au lieu de ${lisible(attenduSel)}`)
            const vu = await convergence(tous, { delai: 6000 }).catch((e) => {
              noter(cas, 'convergence', false, e.message)
              return r.lu
            })
            const cle = `${nature}·${geste}·${saisie[0]}`
            if (mode === 'sans-suivi') {
              sansSuiviObtenu.set(cle, vu)
              noter(cas, 'aucune marque', !/[{[].?[+-]/.test(vu), lisible(vu))
              if (saisie[2] !== null) {
                const sel = r.selection.replace(/\n/g, '')
                const naif = jusqua ? null : BASE.replace(sel || passage, saisie[2])
                if (naif)
                  noter(cas, 'remplacement direct', vu === naif, `obtenu ${lisible(vu)}, attendu ${lisible(naif)}`)
              }
              if (saisie[2]) {
                noter(
                  cas,
                  'curseur après la frappe',
                  (r.curseur?.avant || '').endsWith(saisie[2].slice(-4)),
                  `avant le curseur : ${lisible(r.curseur?.avant)}`
                )
              }
            } else {
              // En suivi.
              const avantMarques = sansMarques(vu)
              noter(cas, 'rien de perdu (le texte barré reste)', avantMarques === BASE, `${lisible(vu)}`)
              if (saisie[2]) {
                const ins = `{${initiale}+${saisie[2]}+}`
                noter(cas, 'ajout au nom de la personne', vu.includes(ins), `${lisible(vu)} ne contient pas ${ins}`)
                if (!jusqua && r.selection) {
                  const sel = r.selection.replace(/\n/g, '')
                  noter(
                    cas,
                    'barré puis ajout, côte à côte',
                    vu.includes(`[${initiale}-${sel}-]${ins}`),
                    `${lisible(vu)}`
                  )
                } else if (jusqua) {
                  const iDel = vu.indexOf(`[${initiale}-`)
                  const iIns = vu.indexOf(ins)
                  noter(cas, 'ajout après le barré (multi-blocs)', iIns > iDel && iDel >= 0, `${lisible(vu)}`)
                }
                noter(
                  cas,
                  'curseur après la frappe',
                  (r.curseur?.avant || '').endsWith(saisie[2].slice(-4)) && r.curseur?.vide,
                  `avant le curseur : ${lisible(r.curseur?.avant)}, sélection ${lisible(r.curseur?.selection)}`
                )
                if (!jusqua) {
                  const mods = await p.modifications()
                  noter(
                    cas,
                    'une seule modification au panneau',
                    mods.length === 1,
                    `${mods.length} : ${mods.map((m) => `${m.type} « ${m.texte} »`).join(' | ')}`
                  )
                }
              }
              // Annuler / refaire, par la personne qui a tapé.
              let pas = 0
              let lu = vu
              while (lu !== BASE && pas < 8) {
                await p.touche('Control+z')
                await attendre(120)
                lu = await p.lire({ auteurs: true })
                pas++
              }
              noter(cas, 'Ctrl+Z ramène au départ', lu === BASE, `après ${pas} Ctrl+Z : ${lisible(lu)}`)
              if (lu === BASE) {
                for (let i = 0; i < pas; i++) await p.touche('Control+Shift+z')
                await attendre(200)
                const refait = await p.lire({ auteurs: true })
                noter(
                  cas,
                  'Ctrl+Maj+Z refait la proposition',
                  refait === vu,
                  `${lisible(refait)} au lieu de ${lisible(vu)}`
                )
              }
              await convergence(tous, { delai: 6000 }).catch((e) =>
                noter(cas, 'convergence après annulation', false, e.message)
              )
              // Tout rejeter, par Alice.
              await attendre(150)
              await alice.toutTraiter(false)
              const rejete = await convergence(tous, { delai: 6000 }).catch((e) => e.message)
              noter(cas, 'tout rejeter rend le départ', rejete === BASE, lisible(rejete))
              // Le même geste, puis tout accepter.
              const r2 = await jouer(p, mode, structure, geste, passage, jusqua, saisie)
              await convergence(tous, { delai: 6000 }).catch(() => {})
              await attendre(150)
              await alice.toutTraiter(true)
              const accepte = await convergence(tous, { delai: 6000 }).catch((e) => e.message)
              const reference = sansSuiviObtenu.get(cle)
              noter(
                cas,
                'tout accepter = geste sans suivi',
                accepte === reference,
                `accepté ${lisible(accepte)}, sans suivi ${lisible(reference)} (proposé : ${lisible(r2.lu)})`
              )
            }
          } catch (e) {
            noter(cas, 'déroulement', false, e.message.split('\n').slice(0, 6).join(' ⏎ '))
          }
          const nouvelles = tous.flatMap((x, i) => x.erreurs.slice(erreursAvant[i]).map((m) => `${x.qui} : ${m}`))
          noter(cas, 'console sans erreur', nouvelles.length === 0, nouvelles.join(' | ').slice(0, 400))
        }
      }
    }
  }
} finally {
  await navigateur.close()
  await inst.arreter()
}

const echecs = resultats.filter((r) => !r.ok)
// Bilan compact, à recopier : échecs par vérification et par mode.
const bilan = {}
for (const r of resultats) {
  const b = (bilan[r.verif] ??= {})
  const m = (b[r.mode] ??= [0, 0])
  m[1]++
  if (!r.ok) m[0]++
}
console.log(`\nbilan (${NAVIGATEUR}) — échecs / vérifications :`)
for (const [v, parMode] of Object.entries(bilan)) {
  const t = Object.entries(parMode)
    .map(([m, [e, n]]) => `${m} ${e}/${n}`)
    .join('  ')
  console.log(`  ${v.padEnd(40)} ${t}`)
}
console.log(
  `\n${NAVIGATEUR} : ${resultats.length} vérifications, ${echecs.length} échecs, ${Math.round((Date.now() - t0) / 1000)} s`
)
if (SORTIE) writeFileSync(SORTIE, JSON.stringify(resultats, null, 1))
process.exitCode = echecs.length ? 1 : 0
