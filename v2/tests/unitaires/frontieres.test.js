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
  await refuse(
    'application/client/X.jsx',
    'export const X = () => <div style={{ color: "red" }} />',
    /style dans le code technique/,
  )
  await refuse('application/client/x.js', "import './joli.css'", /feuille de style/)
  await accepte('design/x.js', "import './jetons.css'")
})

test('aucun texte en dur dans un rendu', async () => {
  await refuse('application/client/X.jsx', 'export const X = () => <p>Bonjour</p>', /texte en dur/)
  await refuse('design/X.jsx', 'export const X = () => <button aria-label="Fermer" />', /texte en dur/)
  await accepte('design/X.jsx', 'export const X = ({ texte }) => <p>{texte}</p>')
})
