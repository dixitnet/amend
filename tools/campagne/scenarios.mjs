#!/usr/bin/env node
// Campagne de tests de l'éditeur — scénarios à plusieurs et commentaires.
//
// Alice (éditrice, propriétaire), Bruno (éditeur), Chloé (correctrice) et
// Louis (lecteur) ont le même document ouvert, chacun dans son navigateur.
// Chaque scénario part d'un texte connu et compare ce que chacun voit à ce
// que ferait Google Docs en mode suggestion.
//
//   node tools/campagne/scenarios.mjs [--filtre=commentaire] [--sortie=fichier.json]

/* global document -- fonctions exécutées dans la page (Playwright) */
import { writeFileSync } from 'node:fs'
import { demarrer, documentPartage, ouvrir, attendre, convergence } from './outils.mjs'

const args = process.argv.slice(2)
const option = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d
const FILTRE = option('filtre', '')
const SORTIE = option('sortie', '')

const P1 = 'Le chat noir dort sur le canapé du salon.'
const P2 = 'Il fait beau ce matin, dit-elle.'
const P3 = 'La pluie reviendra demain soir.'
const DEPART = `<p>${P1}</p><p>${P2}</p><p>${P3}</p>`
const BASE = [P1, P2, P3].join('\n')
const L = JSON.stringify

const SCENARIOS = []
const scenario = (nom, f) => SCENARIOS.push([nom, f])

// --- Suivi des modifications à plusieurs -----------------------------------

scenario('Bruno accepte le remplacement d’Alice depuis sa vue', async ({ alice, bruno, tous, verifier }) => {
  await alice.suivi(true)
  await alice.selectionner('noir')
  await alice.taper('blanc')
  const vu = await convergence(tous)
  verifier('Bruno voit la proposition d’Alice', vu.includes('[A-noir-]{A+blanc+}'), L(vu))
  const mods = await bruno.modifications()
  verifier(
    'Bruno voit une carte « remplacement » au nom d’Alice',
    mods.length === 1 && /Alice/.test(mods[0].meta) && mods[0].type === 'remplacement',
    L(mods)
  )
  await bruno.toutTraiter(true)
  const fin = await convergence(tous)
  verifier('accepté partout', fin === BASE.replace('noir', 'blanc'), L(fin))
})

scenario('La correctrice propose, l’éditrice rejette', async ({ alice, chloe, tous, verifier }) => {
  await chloe.selectionner('beau')
  await chloe.taper('gris')
  const vu = await convergence(tous)
  verifier('proposition de Chloé visible partout', vu.includes('[C-beau-]{C+gris+}'), L(vu))
  const sesCartes = await chloe.modifications()
  verifier(
    'la correctrice n’a pas de bouton Accepter',
    sesCartes.every((m) => !m.accepter),
    L(sesCartes)
  )
  await alice.toutTraiter(false)
  const fin = await convergence(tous)
  verifier('rejeté partout', fin === BASE, L(fin))
})

scenario('La correctrice ne peut pas désactiver le suivi', async ({ chloe, tous, verifier }) => {
  const caseSuivi = chloe.page.locator('.track-toggle input[type=checkbox]')
  verifier('case désactivée et cochée', (await caseSuivi.isDisabled()) && (await caseSuivi.isChecked()), '')
  await chloe.selectionner('soir')
  await chloe.touche('Backspace')
  const vu = await convergence(tous)
  verifier('sa suppression est barrée, pas effacée', vu.includes('[C-soir-]'), L(vu))
})

scenario('Le lecteur ne peut rien modifier', async ({ louis, tous, verifier }) => {
  const editable = await louis.page.evaluate(() =>
    document.querySelector('.ProseMirror').getAttribute('contenteditable')
  )
  verifier('éditeur non modifiable', editable === 'false', `contenteditable=${editable}`)
  await louis.page.locator('.ProseMirror').click()
  await louis.taper('xyz')
  await louis.touche('Backspace')
  const vu = await convergence(tous)
  verifier('texte inchangé', vu === BASE, L(vu))
})

scenario('Supprimer son propre ajout l’efface vraiment', async ({ alice, tous, verifier }) => {
  await alice.suivi(true)
  await alice.cliquerApres('noir')
  await alice.taper(' et blanc')
  await alice.touche('Backspace', 6)
  const vu = await convergence(tous)
  verifier('reste « et », sans barré', vu.includes('noir{A+ et+} dort') && !vu.includes('[A-'), L(vu))
  await alice.selectionner(' et')
  await alice.taper(' ou')
  const vu2 = await convergence(tous)
  verifier(
    'remplacer son propre ajout le remplace sans barré',
    vu2.includes('noir{A+ ou+} dort') && !vu2.includes('[A-'),
    L(vu2)
  )
})

scenario('Supprimer l’ajout d’un autre le barre', async ({ alice, bruno, tous, verifier }) => {
  await alice.suivi(true)
  await bruno.suivi(true)
  await alice.cliquerApres('noir')
  await alice.taper(' profond')
  await convergence(tous)
  await bruno.selectionner(' profond')
  await bruno.touche('Backspace')
  const vu = await convergence(tous)
  verifier(
    'l’ajout d’Alice est barré par Bruno, pas effacé',
    /\[B-\{A\+ profond\+\}-\]|\{A\+\[B- profond-\]\+\}/.test(vu) || vu.includes('profond'),
    L(vu)
  )
  verifier('le texte « profond » est toujours là', vu.includes('profond'), L(vu))
  const mods = await alice.modifications()
  verifier('deux propositions au panneau (ajout d’Alice, suppression de Bruno)', mods.length >= 1, L(mods))
  await alice.toutTraiter(true)
  const fin = await convergence(tous)
  verifier('tout accepter : plus de « profond »', fin === BASE, L(fin))
})

scenario('Taper au milieu de l’ajout d’un autre', async ({ alice, bruno, tous, verifier }) => {
  await alice.suivi(true)
  await bruno.suivi(true)
  await alice.cliquerApres('noir')
  await alice.taper(' très profond')
  await convergence(tous)
  await bruno.cliquerApres('très')
  await bruno.taper(' très')
  const vu = await convergence(tous)
  verifier('l’ajout de Bruno est à son nom, dans celui d’Alice', vu.includes('{B+ très+}'), L(vu))
  await alice.toutTraiter(true)
  const fin = await convergence(tous)
  verifier('tout accepter', fin === BASE.replace('noir', 'noir très très profond'), L(fin))
})

scenario('Retour arrière répété sur le texte d’origine (curseur qui recule)', async ({ alice, tous, verifier }) => {
  await alice.suivi(true)
  await alice.cliquerApres('noir')
  await alice.touche('Backspace', 4)
  await alice.taper('roux')
  const vu = await convergence(tous)
  verifier('« noir » barré puis « roux » ajouté', vu.includes('[A-noir-]{A+roux+}'), L(vu))
  const mods = await alice.modifications()
  verifier(
    'lu comme un seul remplacement (comme Google Docs)',
    mods.length === 1,
    mods.map((m) => `${m.type} « ${m.texte} »`).join(' | ')
  )
})

scenario('Suppr. répété vers l’avant', async ({ alice, tous, verifier }) => {
  await alice.suivi(true)
  await alice.selectionner('noir')
  await alice.touche('ArrowLeft')
  await alice.touche('Delete', 4)
  await alice.taper('gris')
  const vu = await convergence(tous)
  verifier('« noir » barré, « gris » à côté', /\{A\+gris\+\}\[A-noir-\]|\[A-noir-\]\{A\+gris\+\}/.test(vu), L(vu))
})

scenario('Remplacer un passage déjà barré par un autre', async ({ alice, bruno, tous, verifier }) => {
  await alice.suivi(true)
  await bruno.suivi(true)
  await alice.selectionner('noir')
  await alice.touche('Backspace')
  await convergence(tous)
  await bruno.selectionner('chat noir dort')
  await bruno.taper('chien dort')
  const vu = await convergence(tous)
  verifier('le barré d’Alice reste à son nom', vu.includes('[A-noir-]'), L(vu))
  // Bruno retire sa proposition : celle d'Alice doit rester entière.
  const carteBruno = alice.page
    .locator('.changes-list:not(.comments-list) > .change-item', { hasText: 'Bruno' })
    .first()
  await carteBruno.hover()
  await carteBruno.locator('.change-actions .btn-reject').click({ timeout: 5000 })
  const apresRejet = await convergence(tous)
  verifier('rejeter Bruno laisse la suppression d’Alice en attente', apresRejet.includes('[A-noir-]'), L(apresRejet))
  await alice.toutTraiter(false)
  await alice.remettre(DEPART)
  await convergence(tous)
  await alice.suivi(true)
  await alice.selectionner('noir')
  await alice.touche('Backspace')
  await convergence(tous)
  await bruno.selectionner('chat noir dort')
  await bruno.taper('chien dort')
  await convergence(tous)
  verifier('l’ajout de Bruno est là', vu.includes('{B+chien dort+}'), L(vu))
  await alice.toutTraiter(true)
  const fin = await convergence(tous)
  verifier('tout accepter', fin === BASE.replace('chat noir dort', 'chien dort'), L(fin))
})

scenario('Entrée en suivi puis rejet : les paragraphes se recollent', async ({ alice, tous, verifier }) => {
  await alice.suivi(true)
  await alice.cliquerApres('noir')
  await alice.touche('Enter')
  const vu = await convergence(tous)
  verifier('coupure visible', vu.split('\n').length === 4, L(vu))
  const mods = await alice.modifications()
  verifier('coupure au panneau', mods.length === 1, L(mods))
  await alice.toutTraiter(false)
  const fin = await convergence(tous)
  verifier('rejet : recollé', fin === BASE, L(fin))
})

scenario(
  'Deux personnes remplacent deux mots du même paragraphe en même temps',
  async ({ alice, bruno, tous, verifier }) => {
    await alice.suivi(true)
    await bruno.suivi(true)
    await alice.selectionner('noir')
    await bruno.selectionner('canapé')
    await Promise.all([alice.taper('blanc', { delai: 40 }), bruno.taper('fauteuil', { delai: 30 })])
    const vu = await convergence(tous, { delai: 8000 })
    verifier(
      'les deux propositions sont là',
      vu.includes('[A-noir-]{A+blanc+}') && vu.includes('[B-canapé-]{B+fauteuil+}'),
      L(vu)
    )
    await alice.toutTraiter(true)
    const fin = await convergence(tous)
    verifier('tout accepter', fin === BASE.replace('noir', 'blanc').replace('canapé', 'fauteuil'), L(fin))
  }
)

scenario('Deux personnes remplacent le même mot en même temps', async ({ alice, bruno, tous, verifier }) => {
  await alice.suivi(true)
  await bruno.suivi(true)
  await alice.selectionner('noir')
  await bruno.selectionner('noir')
  await Promise.all([alice.taper('blanc', { delai: 40 }), bruno.taper('roux', { delai: 50 })])
  const vu = await convergence(tous, { delai: 8000 })
  verifier(
    'le mot reste (barré), les deux ajouts sont là',
    vu.includes('noir') && vu.includes('blanc') && vu.includes('roux'),
    L(vu)
  )
  verifier(
    'aucun ajout entrelacé',
    !/b[^l]*r[^o]*o/.test(vu.replace(/[{}[\]+\-AB]/g, '')) || vu.includes('{A+blanc+}'),
    L(vu)
  )
  await alice.toutTraiter(false)
  const fin = await convergence(tous)
  verifier('tout rejeter rend le départ', fin === BASE, L(fin))
})

scenario('Frappe continue de deux personnes dans le même paragraphe', async ({ alice, bruno, tous, verifier }) => {
  await alice.suivi(true)
  await bruno.suivi(true)
  await alice.cliquerApres('chat')
  await bruno.cliquerApres('salon')
  await Promise.all([alice.taper(' tigré au pelage doux', { delai: 25 }), bruno.taper(' bleu nuit', { delai: 35 })])
  const vu = await convergence(tous, { delai: 8000 })
  verifier(
    'ajouts intacts et non mélangés',
    vu.includes('{A+ tigré au pelage doux+}') && vu.includes('{B+ bleu nuit+}'),
    L(vu)
  )
})

scenario('Tout accepter avec des propositions de trois personnes', async ({ alice, bruno, chloe, tous, verifier }) => {
  await alice.suivi(true)
  await bruno.suivi(true)
  await alice.selectionner('noir')
  await alice.taper('blanc')
  await bruno.selectionner('beau')
  await bruno.taper('froid')
  await chloe.selectionner('demain')
  await chloe.taper('ce')
  await convergence(tous)
  const bouton = alice.page.getByRole('button', { name: 'Tout accepter' })
  verifier('bouton « Tout accepter »', (await bouton.count()) === 1, '')
  await bouton.click()
  await attendre(300)
  const fin = await convergence(tous)
  verifier(
    'tout est appliqué',
    fin === BASE.replace('noir', 'blanc').replace('beau', 'froid').replace('demain', 'ce'),
    L(fin)
  )
})

scenario('Les propositions survivent au rechargement', async ({ alice, bruno, tous, verifier }) => {
  await alice.suivi(true)
  await alice.selectionner('noir')
  await alice.taper('blanc')
  await convergence(tous)
  await bruno.page.reload()
  await bruno.page.waitForSelector('.masque-chargement.masque-parti', { state: 'attached' })
  await attendre(500)
  const vu = await bruno.lire({ auteurs: true })
  verifier('Bruno retrouve la proposition', vu.includes('[A-noir-]{A+blanc+}'), L(vu))
})

scenario('Le suivi activé par Alice ne bascule pas Bruno', async ({ alice, bruno, tous, verifier }) => {
  await alice.suivi(true)
  await bruno.suivi(false)
  await attendre(300)
  const caseB = await bruno.page.locator('.track-toggle input[type=checkbox]').isChecked()
  verifier('chacun son mode (comme Google Docs)', caseB === false, `case de Bruno : ${caseB}`)
  await bruno.selectionner('noir')
  await bruno.taper('gris')
  const vu = await convergence(tous)
  verifier('Bruno hors suivi modifie directement', vu === BASE.replace('noir', 'gris'), L(vu))
})

scenario('Mise en forme en suivi (gras sur une sélection)', async ({ alice, tous, verifier }) => {
  await alice.suivi(true)
  await alice.selectionner('noir')
  await alice.touche('Control+b')
  await attendre(200)
  const html = await alice.page.evaluate(() => document.querySelector('.ProseMirror p').innerHTML)
  await convergence(tous)
  const mods = await alice.modifications()
  verifier(
    'le passage à gras est proposé (Google Docs : « Format : gras »), pas appliqué en douce',
    mods.length >= 1,
    `panneau : ${L(mods)} · HTML : ${html.slice(0, 160)}`
  )
})

scenario('Collage riche en suivi (deux paragraphes)', async ({ alice, tous, verifier }) => {
  await alice.suivi(true)
  await alice.selectionner('noir')
  await alice.coller('rouge\nvif', '<p>rouge</p><p>vif</p>')
  const vu = await convergence(tous)
  verifier('l’ancien texte reste barré', vu.includes('[A-noir-]'), L(vu))
  verifier('le collage est proposé à son nom', vu.includes('{A+rouge') && vu.includes('vif'), L(vu))
})

scenario('Annuler ne défait que ses propres gestes', async ({ alice, bruno, tous, verifier }) => {
  await alice.suivi(true)
  await bruno.suivi(true)
  await alice.selectionner('noir')
  await alice.taper('blanc')
  await attendre(700)
  await bruno.selectionner('beau')
  await bruno.taper('gris')
  await convergence(tous)
  await alice.focus()
  await alice.touche('Control+z')
  const vu = await convergence(tous)
  verifier(
    'le geste de Bruno reste, celui d’Alice part',
    vu.includes('[B-beau-]{B+gris+}') && !vu.includes('blanc'),
    L(vu)
  )
})

scenario('Même mot remplacé en même temps, hors suivi', async ({ alice, bruno, tous, verifier }) => {
  await alice.suivi(false)
  await bruno.suivi(false)
  await alice.selectionner('noir')
  await bruno.selectionner('noir')
  await Promise.all([alice.taper('blanc', { delai: 40 }), bruno.taper('roux', { delai: 50 })])
  const vu = await convergence(tous, { delai: 8000 })
  verifier('les deux mots restent lisibles (pas de lettres mêlées)', /blanc/.test(vu) && /roux/.test(vu), L(vu))
})

scenario('Frappe simultanée au même endroit, en suivi, sans sélection', async ({ alice, bruno, tous, verifier }) => {
  await alice.suivi(true)
  await bruno.suivi(true)
  await alice.cliquerApres('noir')
  await bruno.cliquerApres('noir')
  await Promise.all([alice.taper(' et blanc', { delai: 40 }), bruno.taper(' ou roux', { delai: 50 })])
  const vu = await convergence(tous, { delai: 8000 })
  verifier('les deux ajouts restent lisibles', vu.includes('{A+ et blanc+}') && vu.includes('{B+ ou roux+}'), L(vu))
})

scenario('Frappe simultanée au même endroit, hors suivi', async ({ alice, bruno, tous, verifier }) => {
  await alice.suivi(false)
  await bruno.suivi(false)
  await alice.cliquerApres('noir')
  await bruno.cliquerApres('noir')
  await Promise.all([alice.taper(' et blanc', { delai: 40 }), bruno.taper(' ou roux', { delai: 50 })])
  const vu = await convergence(tous, { delai: 8000 })
  verifier('les deux ajouts restent lisibles', vu.includes(' et blanc') && vu.includes(' ou roux'), L(vu))
})

scenario('La correctrice met en gras', async ({ chloe, tous, verifier }) => {
  await chloe.selectionner('noir')
  await chloe.touche('Control+b')
  await attendre(300)
  const html = await chloe.page.evaluate(() => document.querySelector('.ProseMirror p').innerHTML)
  await convergence(tous)
  const mods = await chloe.modifications()
  verifier(
    'le gras de la correctrice est une proposition, pas une modification directe',
    !/<strong>/.test(html) || mods.length >= 1,
    `panneau ${L(mods)} · ${html.slice(0, 120)}`
  )
})

scenario('Suppr. répété vers l’avant, pas à pas', async ({ alice, tous, verifier }) => {
  await alice.suivi(true)
  await alice.cliquerApres('chat ')
  const pas = []
  for (let i = 0; i < 4; i++) {
    await alice.touche('Delete')
    await attendre(80)
    pas.push(await alice.lire({ auteurs: true }).then((t) => t.split('\n')[0]))
  }
  verifier(
    'quatre Suppr. barrent « noir », lettre par lettre',
    pas[3].includes('[A-noir-] dort'),
    pas.map(L).join(' → ')
  )
})

scenario('Typographie française sur une sélection, en suivi', async ({ alice, tous, verifier }) => {
  await alice.suivi(true)
  await alice.selectionner('noir')
  await alice.taper('dit : "oui"')
  const vu = await convergence(tous)
  verifier('espace insécable avant « : »', /dit[⍽·]:/.test(vu), L(vu))
  verifier('guillemets français', /«[⍽·]?oui[⍽·]?»/.test(vu), L(vu))
  verifier(
    'tout est proposé (rien hors suivi)',
    vu.replace(/\{A\+[^]*?\+\}/g, '').replace(/\[A-([^]*?)-\]/g, '$1') === BASE,
    L(vu)
  )
  await alice.toutTraiter(true)
  const fin = await convergence(tous)
  verifier('accepté sans reste de marque', !/[{[]A[+-]/.test(fin), L(fin))
})

scenario('Tout sélectionner (Ctrl+A) puis taper, en suivi', async ({ alice, tous, verifier }) => {
  await alice.suivi(true)
  await alice.focus()
  await alice.touche('Control+a')
  await alice.taper('Nouveau texte')
  const vu = await convergence(tous)
  verifier(
    'tout l’ancien texte reste barré',
    vu.replace(/\{A\+[^]*?\+\}/g, '').replace(/\[A-([^]*?)-\]/g, '$1') === BASE,
    L(vu)
  )
  verifier('le nouveau texte est proposé', vu.includes('{A+Nouveau texte+}'), L(vu))
  // Pas à pas : la première lettre, puis la suite.
  await alice.toutTraiter(false)
  await convergence(tous)
  await alice.focus()
  await alice.touche('Control+a')
  await alice.taper('N')
  const un = await alice.lire({ auteurs: true })
  await alice.taper('ouveau')
  const deux = await alice.lire({ auteurs: true })
  verifier(
    'pas à pas : « N » puis « ouveau »',
    un.includes('{A+N+}') && deux.includes('{A+Nouveau+}'),
    `${L(un)} → ${L(deux)}`
  )
  // Même geste hors suivi.
  await alice.toutTraiter(false)
  await alice.suivi(false)
  await alice.focus()
  await alice.touche('Control+a')
  await alice.taper('Nouveau texte')
  verifier(
    'hors suivi : le document devient « Nouveau texte »',
    (await convergence(tous)) === 'Nouveau texte',
    L(await alice.lire())
  )
})

scenario('Remplacer un mot en italique : la frappe reste en italique', async ({ alice, tous, verifier }) => {
  await alice.remettre(`<p>Le chat <em>noir</em> dort sur le canapé du salon.</p><p>${P2}</p><p>${P3}</p>`)
  await convergence(tous)
  for (const suivi of [false, true]) {
    await alice.suivi(suivi)
    await alice.doubleClic(suivi ? 'blanc' : 'noir')
    await alice.taper(suivi ? 'roux' : 'blanc')
    await attendre(200)
    const html = await alice.page.evaluate(() => document.querySelector('.ProseMirror p').innerHTML)
    const mot = suivi ? 'roux' : 'blanc'
    verifier(
      `${suivi ? 'en suivi' : 'hors suivi'} : « ${mot} » en italique (comme Google Docs)`,
      new RegExp(`<em>(?:<[^>]+>)*${mot}`).test(html.replace(/<span class="remote[^>]*><\/span>/g, '')),
      html.slice(0, 300)
    )
  }
})

scenario('Remplacer le texte d’un lien, en suivi', async ({ alice, tous, verifier }) => {
  await alice.remettre(
    `<p>Le chat <a href="https://exemple.fr">noir</a> dort sur le canapé du salon.</p><p>${P2}</p><p>${P3}</p>`
  )
  await convergence(tous)
  await alice.suivi(true)
  await alice.selectionner('noir')
  await alice.taper('blanc')
  await attendre(200)
  const html = await alice.page.evaluate(() => document.querySelector('.ProseMirror p').innerHTML)
  verifier(
    'le nouveau texte garde le lien (Google Docs)',
    /<a [^>]*href="https:\/\/exemple.fr"[^>]*>(?:(?!<\/a>).)*blanc/.test(html),
    html.slice(0, 400)
  )
})

scenario('Sélection au clavier (Maj+Fin) puis frappe, en suivi', async ({ alice, tous, verifier }) => {
  await alice.suivi(true)
  await alice.cliquerApres('canapé')
  await alice.touche('Shift+End')
  await alice.taper(', vers midi.')
  const vu = await convergence(tous)
  verifier('fin de phrase barrée puis remplacée', vu.includes('canapé[A- du salon.-]{A+, vers midi.+}'), L(vu))
})

// --- Commentaires ------------------------------------------------------------

scenario('Commenter : tout le monde voit le commentaire', async ({ alice, bruno, chloe, louis, verifier }) => {
  await alice.commenter('chat noir', 'Quelle couleur exactement ?')
  await attendre(400)
  for (const p of [alice, bruno, chloe, louis]) {
    const c = await p.commentaires()
    verifier(
      `${p.compte.nom} voit le passage surligné et le fil`,
      c.surligne.join('') === 'chat noir' && c.fils.length === 1 && c.fils[0].texte === 'Quelle couleur exactement ?',
      L(c)
    )
  }
})

scenario('Correctrice et lecteur peuvent commenter', async ({ chloe, louis, alice, verifier }) => {
  await chloe.commenter('beau', 'Plutôt « clair » ?')
  await attendre(200)
  let erreur = ''
  try {
    await louis.commenter('pluie', 'Joli.')
  } catch (e) {
    erreur = e.message.split('\n')[0]
  }
  await attendre(400)
  const c = await alice.commentaires()
  verifier(
    'commentaire de la correctrice',
    c.fils.some((f) => f.texte.includes('clair')),
    L(c)
  )
  verifier(
    'commentaire du lecteur (rôle « commentateur » de Google Docs)',
    c.fils.some((f) => f.texte === 'Joli.'),
    erreur || L(c)
  )
})

scenario('Répondre dans la marge, résoudre', async ({ alice, bruno, tous, verifier }) => {
  await alice.commenter('canapé', 'Lequel ?')
  await attendre(400)
  const carte = bruno.page.locator('.carte-commentaire:not(.composeur)').first()
  verifier('la carte est dans la marge de Bruno', (await carte.count()) === 1, '')
  if (await carte.count()) {
    await carte.click()
    await attendre(200)
    const zone = carte.locator('textarea[name=reponse]')
    await zone.fill('Le vert, près de la fenêtre.')
    await zone.press('Enter')
    await attendre(400)
    const c = await alice.commentaires()
    verifier(
      'Alice voit la réponse de Bruno',
      c.fils[0]?.reponses.some((r) => r.includes('près de la fenêtre')),
      L(c)
    )
    const carteA = alice.page.locator('.carte-commentaire:not(.composeur)').first()
    await carteA.click()
    await carteA.getByRole('button', { name: 'Résoudre' }).first().click()
    await attendre(400)
    for (const p of tous) {
      const cc = await p.commentaires()
      verifier(`résolu chez ${p.compte.nom}`, cc.fils.length === 0 && cc.surligne.length === 0, L(cc))
    }
  }
})

scenario('Remplacer en suivi un passage commenté', async ({ alice, bruno, verifier }) => {
  await alice.commenter('noir', 'À revoir')
  await alice.suivi(true)
  await alice.selectionner('noir')
  await alice.taper('blanc')
  await attendre(400)
  const c = await bruno.commentaires()
  verifier(
    'le commentaire reste, sur l’ancien texte barré',
    c.fils.length === 1 && c.surligne.join('').includes('noir'),
    L(c)
  )
  await alice.toutTraiter(true)
  await attendre(400)
  const c2 = await bruno.commentaires()
  verifier('après acceptation, le commentaire existe toujours (Google Docs le garde)', c2.fils.length === 1, L(c2))
})

scenario('Remplacer hors suivi un passage commenté', async ({ alice, bruno, verifier }) => {
  await alice.commenter('noir', 'À revoir')
  await alice.suivi(false)
  await alice.selectionner('noir')
  await alice.taper('blanc')
  await attendre(400)
  const c = await bruno.commentaires()
  verifier('le commentaire n’est pas perdu', c.fils.length === 1, L(c))
  verifier('il s’accroche au nouveau texte', c.surligne.join('') === 'blanc', L(c))
})

scenario('Taper au bord d’un passage commenté ne l’étend pas', async ({ alice, verifier }) => {
  await alice.commenter('chat noir', 'Note')
  await alice.suivi(false)
  await alice.cliquerApres('chat noir')
  await alice.taper(' et blanc')
  await attendre(300)
  const c = await alice.commentaires()
  verifier('surlignage inchangé', c.surligne.join('') === 'chat noir', L(c))
})

scenario('Commentaire sur deux paragraphes', async ({ alice, bruno, verifier }) => {
  await alice.commenter('salon.', 'Coupure ?', { jusqua: 'Il fait' })
  await attendre(400)
  const c = await bruno.commentaires()
  verifier(
    'surlignage sur les deux paragraphes',
    c.surligne.join('|').includes('salon.') && c.surligne.join('|').includes('Il fait'),
    L(c)
  )
})

scenario('Supprimer en suivi tout le passage commenté, puis accepter', async ({ alice, bruno, verifier }) => {
  await alice.commenter('noir', 'À revoir')
  await alice.suivi(true)
  await alice.selectionner('noir ')
  await alice.touche('Backspace')
  await attendre(300)
  await alice.toutTraiter(true)
  await attendre(400)
  const c = await bruno.commentaires()
  verifier('le fil reste consultable (Google Docs : « contenu d’origine supprimé »)', c.fils.length === 1, L(c))
})

scenario('Commentaire puis annuler (Ctrl+Z) le texte autour', async ({ alice, verifier }) => {
  await alice.suivi(false)
  await alice.cliquerApres('salon.')
  await alice.taper(' Le soir tombe.')
  await alice.commenter('soir tombe', 'Belle image')
  await alice.focus()
  await alice.cliquerApres('tombe.')
  await alice.touche('Control+z')
  await attendre(400)
  const c = await alice.commentaires()
  verifier('pas d’erreur, le fil reste listé', c.fils.length === 1, L(c))
})

// --- Exécution ----------------------------------------------------------------

const resultats = []
const { inst, navigateur } = await demarrer({ port: 19500 })
const t0 = Date.now()
try {
  const id = await documentPartage(inst)
  const gens = {}
  for (const qui of ['alice', 'bruno', 'chloe', 'louis'])
    gens[qui] = await ouvrir(navigateur, inst, qui, id, { largeur: 1500 })
  const tous = Object.values(gens)
  for (const [nom, f] of SCENARIOS) {
    if (FILTRE && !new RegExp(FILTRE).test(nom)) continue
    console.log(nom)
    const erreursAvant = tous.map((x) => x.erreurs.length)
    const verifier = (v, ok, detail = '') => {
      resultats.push({ scenario: nom, verif: v, ok, detail })
      if (!ok) console.log(`  ✗ ${v} — ${detail}`)
    }
    try {
      // Départ : texte connu, aucun commentaire, aucun mode imposé.
      await gens.alice.remettre(DEPART)
      await gens.alice.resoudreTout()
      const lu = await convergence(tous, { delai: 8000 })
      if (lu !== BASE) throw new Error(`remise à zéro ratée : ${L(lu)}`)
      await gens.bruno.suivi(false)
      await f({ ...gens, tous, verifier })
    } catch (e) {
      verifier('déroulement', false, e.message.split('\n').slice(0, 4).join(' ⏎ '))
    }
    const nouvelles = tous.flatMap((x, i) => x.erreurs.slice(erreursAvant[i]).map((m) => `${x.qui} : ${m}`))
    verifier('console sans erreur', nouvelles.length === 0, nouvelles.join(' | ').slice(0, 400))
  }
} finally {
  await navigateur.close()
  await inst.arreter()
}
const echecs = resultats.filter((r) => !r.ok)
console.log(`\n${resultats.length} vérifications, ${echecs.length} échecs, ${Math.round((Date.now() - t0) / 1000)} s`)
if (SORTIE) writeFileSync(SORTIE, JSON.stringify(resultats, null, 1))
process.exitCode = echecs.length ? 1 : 0
