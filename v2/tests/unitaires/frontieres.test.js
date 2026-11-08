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
    "import { PageEdition } from '../../design/index.js'\nexport const x = PageEdition",
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
  // Le seul fichier où une valeur est permise : les réglages décidés.
  await accepte('design/reglages.js', "export const REGLAGES = { theme: { primaryColor: 'red' } }")
})

test('aucun texte en dur dans un rendu', async () => {
  await refuse('application/client/X.jsx', 'export const X = () => <p>Bonjour</p>', /texte en dur/)
  await refuse('design/X.jsx', 'export const X = () => <button aria-label="Fermer" />', /texte en dur/)
  await accepte('design/X.jsx', 'export const X = ({ texte }) => <p>{texte}</p>')
})
