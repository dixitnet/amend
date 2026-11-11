// Le lint refuse ce que l'architecture interdit (critère de sortie 2 de
// l'étape 1) : on lui soumet des cas volontairement fautifs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESLint } from 'eslint'

const eslint = new ESLint({ cwd: new URL('../..', import.meta.url).pathname })
async function erreurs(chemin, code) {
  const [r] = await eslint.lintText(code, { filePath: chemin })
  return r.messages.filter((m) => m.severity === 2).map((m) => m.message)
}
const refuse = async (chemin, code, motif) => {
  const e = await erreurs(chemin, code)
  assert.ok(
    e.some((m) => motif.test(m)),
    `${chemin} devrait être refusé (${motif}) ; reçu : ${JSON.stringify(e)}`,
  )
}
const accepte = async (chemin, code) => assert.deepEqual(await erreurs(chemin, code), [], `${chemin} devrait passer`)

test('une fondation importée hors de son adaptateur est refusée', async () => {
  await refuse('application/client/X.jsx', "import { Doc } from '@y/y'\nexport const x = Doc", /fondation importée/)
  await refuse(
    'application/serveur/x.js',
    "import { createYHub } from '@y/hub'\nexport const x = createYHub",
    /fondation importée/,
  )
  await refuse(
    'design/X.jsx',
    "import { BlockNoteView } from '@blocknote/mantine'\nexport const x = BlockNoteView",
    /fondation importée/,
  )
  await refuse(
    'adaptateurs/yjs/x.js',
    "import { BlockNoteEditor } from '@blocknote/core'\nexport const x = BlockNoteEditor",
    /fondation importée/,
  )
  await accepte('adaptateurs/yjs/x.js', "import * as Y from '@y/y'\nexport const x = Y")
  await accepte('design/X.jsx', "import { Button } from '@mantine/core'\nexport const x = Button")
})

test('règle 1 révisée : les extensions importent ce qu’exigent les points d’extension de BlockNote, rien d’autre', async () => {
  await accepte('extensions/x.js', "import { Plugin } from 'prosemirror-state'\nexport const x = Plugin")
  await accepte('extensions/x.js', "import { Slice } from 'prosemirror-model'\nexport const x = Slice")
  await accepte(
    'extensions/x.js',
    "import { inputRules } from '@handlewithcare/prosemirror-inputrules'\nexport const x = inputRules",
  )
  await refuse(
    'extensions/x.js',
    "import { EditorView } from 'prosemirror-view'\nexport const x = EditorView",
    /fondation importée/,
  )
  await refuse(
    'extensions/x.js',
    "import { Editor } from '@tiptap/core'\nexport const x = Editor",
    /fondation importée/,
  )
  await refuse(
    'application/client/x.js',
    "import { Plugin } from 'prosemirror-state'\nexport const x = Plugin",
    /fondation importée/,
  )
  await refuse(
    'design/x.js',
    "import { Plugin } from 'prosemirror-state'\nexport const x = Plugin",
    /fondation importée/,
  )
})

test('graphe des dépendances (règles, § 2) : chaque arête permise passe, chaque arête interdite est refusée', async () => {
  const imp = (chemin) => `import { x } from '${chemin}'\nexport const y = x`
  // Permis.
  await accepte('adaptateurs/blocknote/x.js', imp('../../extensions/typographie/index.js'))
  await accepte('adaptateurs/blocknote/x.js', imp('../../domaine/index.js'))
  await accepte('extensions/x/index.js', imp('../../domaine/index.js'))
  await accepte('application/client/x.js', imp('../../design/index.js'))
  await accepte('application/client/x.js', imp('../../extensions/typographie/index.js'))
  // Interdit : seul l'adaptateur BlockNote branche les extensions (de BlockNote).
  await refuse('adaptateurs/yjs/x.js', imp('../../extensions/typographie/index.js'), /couches/)
  await refuse('adaptateurs/yhub/x.js', imp('../../extensions/typographie/index.js'), /couches/)
  await refuse('extensions/x.js', imp('../adaptateurs/blocknote/index.jsx'), /couches/)
  await refuse('extensions/x.js', imp('../application/client/App.jsx'), /couches/)
  await refuse('adaptateurs/blocknote/x.js', imp('../../application/client/App.jsx'), /couches/)
  await refuse('domaine/x.js', imp('../extensions/typographie/index.js'), /couches|ne dépend de rien/)
  await refuse('design/x.js', imp('../domaine/index.js'), /couches/)
})

test('le domaine ne dépend de rien', async () => {
  await refuse(
    'domaine/x.js',
    "import { readFile } from 'node:fs'\nexport const x = readFile",
    /le domaine ne dépend de rien/,
  )
  await refuse('domaine/x.js', "import { t } from '../i18n/index.js'\nexport const x = t", /couches/)
  await accepte('domaine/x.js', "import { y } from './y.js'\nexport const x = y")
})

test('les couches ne se mélangent pas', async () => {
  await refuse('design/X.jsx', "import { App } from '../application/client/App.jsx'\nexport const x = App", /couches/)
  await refuse(
    'design/X.jsx',
    "import { ouvrirDocument } from '../adaptateurs/yjs/index.js'\nexport const x = ouvrirDocument",
    /couches/,
  )
  await refuse(
    'adaptateurs/blocknote/x.js',
    "import { Coquille } from '../../design/index.js'\nexport const x = Coquille",
    /couches/,
  )
})

test('aucun style dans le code technique, aucune feuille hors du design', async () => {
  await refuse('application/client/X.jsx', 'export const X = () => <div style={{ color: "red" }} />', /style en dur/)
  await refuse('application/client/x.js', "import './joli.css'", /feuille de style/)
  await refuse('adaptateurs/blocknote/x.js', "import '@blocknote/mantine/style.css'", /feuille de style/)
})

test('aucune valeur de design hors de v2/design/ : couleur, taille, variable CSS, classe', async () => {
  const valeur = /valeur de design/
  for (const [chemin, code] of [
    ['application/client/x.js', "export const c = '#8a3b12'"],
    ['application/client/x.js', "export const c = 'rgb(1, 2, 3)'"],
    ['adaptateurs/blocknote/x.js', "export const c = 'oklch(0.5 0.1 30)'"],
    ['adaptateurs/yjs/x.js', "export const c = 'var(--auteur-1)'"],
    ['adaptateurs/yhub/x.js', "export const t = '12px'"],
    ['domaine/x.js', "export const t = '1.5rem'"],
    ['i18n/x.js', 'export const t = (n) => `${n} : 4px`'],
  ])
    await refuse(chemin, code, valeur)
  await refuse('application/client/X.jsx', 'export const X = () => <p className="rouge" />', /classe d’apparence/)
  // Le texte ordinaire passe : un nom de document, une adresse.
  await accepte('application/client/x.js', "export const a = location.hash.slice(1) + '#essai'")
})

test('dans le design : Mantine tel quel, aucune valeur ni réglage non décidé', async () => {
  const nonDecide = /réglage de design non décidé/
  await refuse('design/X.jsx', 'export const X = () => <Button color="red" />', nonDecide)
  await refuse('design/X.jsx', 'export const X = () => <Stack gap="xs" />', nonDecide)
  await refuse('design/X.jsx', 'export const X = () => <Paper p="lg" withBorder />', nonDecide)
  await refuse('design/x.js', "export const c = '#ffffff'", nonDecide)
  await refuse('design/x.js', "export const c = 'var(--ma-couleur)'", nonDecide)
  await refuse('design/X.jsx', 'export const X = () => <div style={{ margin: 0 }} />', /style en dur/)
  await refuse('design/x.js', "import './jetons.css'", /feuille de style maison/)
  // Les feuilles des fondations, livrées telles quelles, et les variables de Mantine.
  await accepte('design/x.js', "import '@mantine/core/styles.css'\nimport '@blocknote/mantine/style.css'")
  await accepte('design/x.js', "export const c = 'var(--mantine-color-blue-filled)'")
  await accepte(
    'design/X.jsx',
    "import { Title } from '@mantine/core'\nexport const X = ({ t }) => <Title order={1}>{t}</Title>",
  )
  // Les feuilles d'un paquet : seulement Mantine et BlockNote.
  await refuse('design/x.js', "import 'autre-paquet/dist/style.css'", /paquet autre que Mantine ou BlockNote/)
  await accepte('design/x.js', "import '@mantine/core/styles.css'")
  // Une valeur en pourcentage ou en ch est une valeur de design.
  await refuse('design/x.js', "export const c = '50%'", nonDecide)
  await refuse('application/client/x.js', "export const c = '60ch'", /valeur de design/)
  // Dans reglages.js, les valeurs sont permises, pas les textes ni les styles en dur.
  await refuse('design/reglages.js', 'export const X = () => <p>Bonjour</p>', /texte en dur/)
  // Le seul fichier où une valeur est permise : les réglages décidés.
  await accepte('design/reglages.js', "export const REGLAGES = { theme: { primaryColor: 'red' } }")
})

test('aucun texte en dur dans un rendu', async () => {
  await refuse('application/client/X.jsx', 'export const X = () => <p>Bonjour</p>', /texte en dur/)
  await refuse('design/X.jsx', 'export const X = () => <button aria-label="Fermer" />', /texte en dur/)
  await accepte('design/X.jsx', 'export const X = ({ texte }) => <p>{texte}</p>')
})

test('le SDK d’Anthropic ne s’importe que dans l’adaptateur IA (étape 8)', async () => {
  const imp = "import Anthropic from '@anthropic-ai/sdk'\nexport const x = Anthropic"
  await accepte('adaptateurs/ia/x.js', imp)
  await refuse('application/serveur/x.js', imp, /fondation importée/)
  await refuse('adaptateurs/yhub/x.js', imp, /fondation importée/)
  await refuse('adaptateurs/ia/x.js', "import { x } from '../yhub/index.js'\nexport const y = x", /couches/)
})

test('import dynamique : chaque couche se voit refuser ce que import … from lui refuse (audit du 11/11/2026)', async () => {
  const dyn = (chemin) => `export const x = () => import('${chemin}')`
  // Une fondation chargée hors de son adaptateur.
  await refuse('application/serveur/x.js', dyn('@y/hub'), /fondation importée/)
  await refuse('application/client/x.js', dyn('@blocknote/core'), /fondation importée/)
  await refuse('extensions/x/index.js', dyn('@y/y'), /fondation importée/)
  await refuse('extensions/x/index.js', dyn('prosemirror-view'), /fondation importée/)
  await refuse('design/x.js', dyn('@blocknote/core'), /fondation importée/)
  await refuse('i18n/x.js', dyn('@mantine/core'), /fondation importée/)
  await refuse('adaptateurs/yjs/x.js', dyn('@blocknote/core'), /fondation importée/)
  await refuse('adaptateurs/yhub/x.js', dyn('yjs'), /fondation importée/)
  // Une couche atteinte par un import dynamique.
  await refuse('extensions/x/index.js', dyn('../../adaptateurs/blocknote/index.jsx'), /couches/)
  await refuse('design/x.js', dyn('../application/client/App.jsx'), /couches/)
  await refuse('i18n/x.js', dyn('../design/index.js'), /couches/)
  await refuse('domaine/x.js', dyn('../extensions/typographie/index.js'), /couches|ne dépend de rien/)
  await refuse('domaine/x.js', dyn('node:fs'), /le domaine ne dépend de rien/)
  await refuse('adaptateurs/blocknote/x.js', dyn('../../application/client/App.jsx'), /couches/)
  await refuse('adaptateurs/blocknote/serveur.js', dyn('../yhub/index.js'), /couches/)
  await refuse('adaptateurs/courrier/x.js', dyn('../ia/index.js'), /couches/)
  // Une feuille de style hors du design.
  await refuse('application/client/x.js', dyn('./joli.css'), /feuille de style/)
  await refuse('extensions/x/index.js', dyn('./joli.css'), /feuille de style/)
  // Permis : un adaptateur charge sa fondation, l'application charge un adaptateur.
  await accepte('adaptateurs/blocknote/x.js', dyn('@blocknote/xl-typst-compiler'))
  await accepte('adaptateurs/yjs/x.js', dyn('@y/y'))
  await accepte('application/serveur/x.js', dyn('../../adaptateurs/blocknote/serveur.js'))
  await accepte('application/client/x.js', dyn('../../design/index.js'))
  await accepte('design/x.js', dyn('@mantine/core'))
  await accepte('domaine/x.js', dyn('./y.js'))
})

test('les sous-chemins de Yjs 13 sont interceptés comme le paquet', async () => {
  for (const chemin of ['yjs/dist/yjs.mjs', 'y-prosemirror/src/plugins/sync-plugin.js', 'y-websocket/bin/utils']) {
    await refuse('application/client/x.js', `import x from '${chemin}'\nexport const y = x`, /fondation importée/)
    await refuse('adaptateurs/yjs/x.js', `import x from '${chemin}'\nexport const y = x`, /fondation importée/)
  }
  // Un fichier voisin qui porte un nom proche n'est pas le paquet.
  await accepte('application/client/x.js', "import x from './yjs-voisin.js'\nexport const y = x")
})

test('une extension n’en importe pas une autre', async () => {
  const imp = (chemin) => `import { x } from '${chemin}'\nexport const y = x`
  await refuse(
    'extensions/exposant/index.js',
    imp('../typographie/index.js'),
    /une extension n’en importe pas une autre/,
  )
  await refuse('extensions/exposant/index.js', imp('../../extensions/typographie/index.js'), /couches/)
  await refuse(
    'extensions/exposant/index.js',
    "export const x = () => import('../typographie/index.js')",
    /une extension n’en importe pas une autre/,
  )
  // Ses propres fichiers et le domaine restent permis.
  await accepte('extensions/exposant/index.js', imp('./aide.js'))
  await accepte('extensions/exposant/index.js', imp('../../domaine/index.js'))
})
