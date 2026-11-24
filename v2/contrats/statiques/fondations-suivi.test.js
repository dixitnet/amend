// Contrat des fondations du suivi des modifications (montage de l'exemple de
// BlockNote, 10/11/2026 ; audit partiel du 11/11/2026, A2 et A3) : ce que notre
// adaptateur utilise de Yjs, de `@y/prosemirror` et de BlockNote, épinglé ici
// pour qu'une montée de version qui le change échoue tout de suite, au lieu de
// casser le suivi en silence.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as Y from '@y/y'
import * as YP from '@y/prosemirror'

// Les déclarations publiées de BlockNote (ses types : l'API qu'il s'engage à tenir).
const typesDe = (fichier) =>
  readFileSync(new URL(`../../node_modules/@blocknote/core/${fichier}`, import.meta.url), 'utf8')

test('Yjs : l’afficheur des suggestions, sa couverture (`attributed`) et son mode', () => {
  const texte = new Y.Doc()
  const suggestions = new Y.Doc({ isSuggestionDoc: true })
  const r = Y.createDiffRenderer(texte, suggestions)
  assert.equal(typeof r.attributed?.isEmpty, 'function', 'attributed.isEmpty()')
  assert.equal(r.attributed.isEmpty(), true, 'rien à relire au départ')
  assert.ok('suggestionMode' in r)
  r.destroy()
  assert.equal(typeof Y.decodeContentMap, 'function', 'table des auteurs de y/hub')
})

test('Yjs : donner à l’afficheur les auteurs reçus après coup (couleur des corrections, 19/11/2026)', async () => {
  // Ce que `poserAuteurs` (adaptateurs/blocknote/suggestions.js) emploie de Yjs : l'option `attributions` de
  // l'afficheur, relue à chaque transaction ; ses tables `inserts` et `deletes` ; les fonctions sur les tables
  // d'identifiants ; l'événement `change`, qui fait redessiner les passages donnés. Tout est exporté et typé
  // par Yjs, mais poser des auteurs après coup n'est pas un usage documenté : ce contrat l'épingle (veille).
  const { creerAfficheur, poserAuteurs } = await import('../../adaptateurs/blocknote/suggestions.js')
  const doc = new Y.Doc()
  const suggestions = new Y.Doc({ isSuggestionDoc: true })
  const afficheur = creerAfficheur({ doc, suggestions: { doc: suggestions } }, true, () => {})
  // Une proposition : du texte écrit dans le document des suggestions seulement.
  suggestions.get('doc').insert(0, 'ajout')
  const propose = Y.createIdSetFromIdMap(afficheur.inserts)
  assert.ok(propose.clients.size > 0, 'la proposition est dans la table des ajouts de l’afficheur')
  // Le premier identifiant proposé, pour y lire les auteurs.
  let premier = null
  propose.forEach((plage, client) => (premier ??= { client, clock: plage.clock }))
  const auteursDe = () => afficheur.inserts.slice(premier.client, premier.clock, 1).flatMap((r) => r.attrs ?? [])
  assert.deepEqual(auteursDe(), [], 'sans auteur tant que y/hub ne l’a pas dit')
  // La table de y/hub arrive : l'auteur est posé, et l'afficheur annonce les passages à redessiner.
  const table = Y.createContentMap(
    Y.createIdMapFromIdSet(propose, [Y.createContentAttribute('insert', 'carla')]),
    Y.createIdMap(),
  )
  const annonces = []
  afficheur.on('change', (touches, origine, local) =>
    annonces.push([touches.clients.size, origine === poserAuteurs, local]),
  )
  poserAuteurs(afficheur, table)
  assert.deepEqual(
    auteursDe().map((a) => [a.name, a.val]),
    [['insert', 'carla']],
  )
  assert.deepEqual(annonces, [[1, true, false]])
  // Une seconde fois, la même table : rien à signer, rien à redessiner.
  poserAuteurs(afficheur, table)
  assert.equal(annonces.length, 1)
  // Une table incomplète est ignorée.
  assert.doesNotThrow(() => poserAuteurs(afficheur, { inserts: table.inserts }))
  afficheur.destroy()
})

test('@y/prosemirror : traduire une position du texte en position Yjs (auteur d’une suggestion)', () => {
  assert.equal(typeof YP.resolvedPositionToRelativePosition, 'function')
  assert.equal(typeof YP.configureYProsemirror, 'function')
})

test('BlockNote : les trois modes et l’arbitrage de l’extension des suggestions', () => {
  const t = typesDe('types/src/y/extensions/Suggestions.d.ts')
  for (const m of [
    'enableSuggestions',
    'viewSuggestions',
    'disableSuggestions',
    'applySuggestion',
    'revertSuggestion',
    'applyAllSuggestions',
    'revertAllSuggestions',
  ])
    assert.match(t, new RegExp(`\\b${m}\\b`), m)
})

test('BlockNote : l’historique sur y/hub accepte le regroupement des versions (`activityParams`)', () => {
  const t = typesDe('types/src/y/versioning/yhub.d.ts')
  assert.match(t, /activityParams\?:/)
  assert.match(t, /createYHubVersionStorage/)
})

test('BlockNote : le curseur distant porte le nom de la personne dans ces classes (clic sur la présence ; 18/11/2026)', () => {
  // `allerAuCurseur` (adaptateur) retrouve le curseur d'une personne par ces classes de rendu, sans API
  // publique : une montée de version qui les renomme doit échouer ici, pas casser le clic en silence.
  const rendu = readFileSync(new URL('../../node_modules/@blocknote/core/dist/y.js', import.meta.url), 'utf8')
  for (const classe of ['bn-collaboration-cursor__base', 'bn-collaboration-cursor__label'])
    assert.ok(rendu.includes(classe), classe)
})

test('BlockNote : un passage commenté et la carte du fil choisi portent ces classes (clic sur un commentaire ; 20/11/2026)', () => {
  // L'adaptateur reconnaît un clic sur un passage commenté (`.bn-thread-mark`) et retrouve la carte du fil
  // choisi dans la liste (`.bn-thread.selected`) par ces classes de rendu, faute d'événement public ; notre
  // feuille s'en sert aussi (`css.commentaires.filChoisi`). Une montée de version qui les renomme échoue ici.
  const lire = (chemin) => readFileSync(new URL(`../../node_modules/@blocknote/${chemin}`, import.meta.url), 'utf8')
  assert.ok(lire('core/dist/comments.js').includes('bn-thread-mark'), 'bn-thread-mark')
  assert.ok(lire('react/dist/blocknote-react.js').includes('"bn-thread"'), 'bn-thread')
  assert.ok(lire('react/dist/style.css').includes('.bn-threads-sidebar .bn-thread.selected'), 'bn-thread.selected')
})

test('BlockNote : une correction du texte porte ces classes (clic sur une correction ; 22/11/2026)', () => {
  // L'adaptateur reconnaît un clic sur une correction par ces classes de rendu, faute d'événement public ;
  // notre feuille s'en sert aussi (`css.editeur.suggestions`). Une montée de version qui les renomme échoue ici.
  const rendu = readFileSync(new URL('../../node_modules/@blocknote/core/dist/y.js', import.meta.url), 'utf8')
  for (const classe of ['bn-suggestion-mark', 'bn-suggestion-mark--delete', 'bn-suggestion-node'])
    assert.ok(rendu.includes(classe), classe)
})

test('@y/websocket : la fermeture définitive s’annonce par « closed », avec le code (adaptateur Yjs, `surFermeture`)', () => {
  // `tests/unitaires/yjs-fermeture.test.js` émet lui-même cet événement : ce contrat vérifie que la
  // version épinglée l'émet toujours sous ce nom et avec cette forme (audit partiel du 19/11/2026).
  const source = readFileSync(new URL('../../node_modules/@y/websocket/src/y-websocket.js', import.meta.url), 'utf8')
  assert.match(source, /provider\.emit\('closed', \[terminalClose, provider\]\)/)
  assert.match(source, /'closed': \(event: \{ code: number, reason: string \}/)
})

test('Yjs : savoir, d’après les deux documents seuls, s’il reste une correction en attente (24/11/2026)', async () => {
  // `rienEnAttente` (adaptateurs/blocknote/suggestions.js) compare ce qui est écrit et supprimé dans le
  // document principal et dans celui des corrections, par les tables d'identifiants que Yjs exporte : c'est
  // le filet qui remonte l'éditeur quand il montre une correction qui n'existe plus.
  const { creerAfficheur, rienEnAttente, affichagePerime } = await import('../../adaptateurs/blocknote/suggestions.js')
  const doc = new Y.Doc()
  const corrections = new Y.Doc({ isSuggestionDoc: true })
  const contexte = { doc, suggestions: { doc: corrections } }
  const afficheur = creerAfficheur(contexte, true, () => {})
  doc.get('doc').insert(0, 'Les enfant jouent.')
  assert.equal(rienEnAttente(contexte), true, 'le texte seul, recopié dans les corrections')
  // Un ajout proposé, puis accepté.
  corrections.get('doc').insert(10, 's')
  assert.equal(rienEnAttente(contexte), false, 'un ajout en attente')
  assert.equal(affichagePerime(1, contexte), false, 'une correction affichée et bien en attente')
  afficheur.acceptAllChanges()
  assert.equal(rienEnAttente(contexte), true, 'accepté')
  assert.equal(affichagePerime(1, contexte), true, 'l’écran en montre encore une : affichage périmé')
  assert.equal(affichagePerime(0, contexte), false, 'rien d’affiché : rien à faire')
  // Une suppression proposée, puis refusée ; un ajout proposé, puis refusé (il reste écrit et supprimé
  // dans le document des corrections : ce n'est plus une attente).
  corrections.get('doc').delete(0, 4)
  assert.equal(rienEnAttente(contexte), false, 'une suppression en attente')
  afficheur.rejectAllChanges()
  assert.equal(rienEnAttente(contexte), true, 'suppression refusée')
  corrections.get('doc').insert(0, 'Oui. ')
  assert.equal(rienEnAttente(contexte), false)
  afficheur.rejectAllChanges()
  assert.equal(rienEnAttente(contexte), true, 'ajout refusé')
  assert.equal(doc.get('doc').toString(), corrections.get('doc').toString())
  afficheur.destroy()
})
