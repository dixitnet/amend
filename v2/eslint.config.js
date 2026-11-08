// Lint de la v2 : les frontières entre couches, la séparation design /
// technique et l'interdiction des textes en dur (docs/v2-regles-developpement.md,
// règles 1 à 4, 17, 20 et 23). Une violation bloque le lot.
import js from '@eslint/js'
import globals from 'globals'

/** Les fondations : on ne les importe que dans leur adaptateur (règle 1).
 * Des expressions ancrées sur le nom du paquet : un dossier `adaptateurs/yjs/`
 * ne doit pas être pris pour le paquet `yjs`. */
const FONDATIONS = {
  blocknote: '@blocknote/.*',
  y: '@y/.*',
  yjs13: 'yjs|y-prosemirror|y-protocols(/.*)?|y-websocket',
  prosemirror: 'prosemirror-.*|@tiptap/.*',
  mantine: '@mantine/.*',
  lib0: 'lib0(/.*)?',
  icu: 'intl-messageformat|@formatjs/.*',
  serveur: 'uws|postgres|redis',
}
const COUCHES = ['domaine', 'adaptateurs', 'extensions', 'application', 'design', 'i18n']

/** Interdit l'import des fondations (sauf `permises`, des clés de FONDATIONS)
 * et des couches nommées. */
function imports({ permises = [], couches = [], css = false }) {
  const interdites = Object.entries(FONDATIONS)
    .filter(([cle]) => !permises.includes(cle))
    .map(([, motif]) => motif)
  const patterns = [
    { regex: `^(${interdites.join('|')})$`, message: 'fondation importée hors de son adaptateur (règle 1)' },
  ]
  if (couches.length)
    patterns.push({
      regex: `(^|/)(${couches.join('|')})(/|$)`,
      message: 'dépendance interdite entre couches (règles 1 à 3, 16)',
    })
  if (css) patterns.push({ regex: '\\.css$', message: 'feuille de style hors de v2/design/ (règle 17)' })
  return ['error', { patterns }]
}

const TEXTE_EN_DUR = [
  {
    selector: 'JSXText[value=/\\p{L}/u]',
    message: 'texte en dur : passer par v2/i18n/ (règle 23)',
  },
  {
    selector: 'JSXAttribute[name.name=/^(title|alt|placeholder|aria-label|label)$/] > Literal',
    message: 'texte en dur dans un attribut : passer par v2/i18n/ (règle 23)',
  },
]
const STYLE_EN_DUR = { selector: "JSXAttribute[name.name='style']", message: 'style dans le code technique (règle 17)' }

const navigateur = { ...globals.browser }
const jsx = { ecmaFeatures: { jsx: true } }

export default [
  { ignores: ['node_modules/**', 'dist/**', '.mesures/**', '.captures/**'] },
  js.configs.recommended,
  {
    // ESLint ne lit les .jsx que si on les déclare : sans cette ligne, les
    // composants échapperaient à toutes les règles ci-dessous.
    files: ['**/*.{js,mjs,jsx}'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'module', parserOptions: jsx, globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^[A-Z]' }] },
  },
  // Couche 4 : le domaine ne dépend de rien, pas même d'un module de Node.
  {
    files: ['domaine/**'],
    rules: {
      'no-restricted-imports': imports({ couches: COUCHES.filter((c) => c !== 'domaine'), css: true }),
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportDeclaration[source.value=/^(?!\\.{1,2}\\/)/]',
          message: 'le domaine ne dépend de rien (règle 3)',
        },
      ],
    },
  },
  // Couche 2 : chaque adaptateur n'importe que sa fondation.
  {
    files: ['adaptateurs/yjs/**'],
    languageOptions: { globals: navigateur },
    rules: {
      'no-restricted-imports': imports({
        permises: ['y'],
        couches: ['application', 'design', 'i18n', 'extensions', 'blocknote', 'yhub'],
        css: true,
      }),
    },
  },
  {
    files: ['adaptateurs/blocknote/**'],
    languageOptions: { globals: navigateur },
    rules: {
      'no-restricted-imports': imports({
        permises: ['blocknote', 'y'],
        couches: ['application', 'design', 'i18n', 'yjs', 'yhub'],
      }),
      'no-restricted-syntax': ['error', STYLE_EN_DUR, ...TEXTE_EN_DUR],
    },
  },
  {
    files: ['adaptateurs/yhub/**'],
    rules: {
      'no-restricted-imports': imports({
        permises: ['y'],
        couches: ['application', 'design', 'i18n', 'extensions', 'yjs', 'blocknote'],
        css: true,
      }),
    },
  },
  // Couche 3 : les extensions se branchent sur BlockNote, et sur rien d'autre.
  {
    files: ['extensions/**'],
    languageOptions: { globals: navigateur },
    rules: {
      'no-restricted-imports': imports({
        permises: ['blocknote'],
        couches: ['application', 'design', 'i18n', 'adaptateurs'],
        css: true,
      }),
      'no-restricted-syntax': ['error', STYLE_EN_DUR, ...TEXTE_EN_DUR],
    },
  },
  // Couche 5 : l'application technique n'importe aucune fondation, aucun style,
  // et n'écrit aucun texte.
  {
    files: ['application/**'],
    rules: {
      'no-restricted-imports': imports({ css: true }),
      'no-restricted-syntax': ['error', STYLE_EN_DUR, ...TEXTE_EN_DUR],
    },
  },
  { files: ['application/client/**'], languageOptions: { globals: navigateur } },
  // Couche 6 : le design n'appelle rien et ne décide rien ; il reçoit ses
  // textes déjà traduits. Mantine lui est réservé (ADR 0008).
  {
    files: ['design/**'],
    languageOptions: { globals: navigateur },
    rules: {
      'no-restricted-imports': imports({
        permises: ['mantine'],
        couches: ['application', 'adaptateurs', 'extensions', 'domaine', 'i18n'],
      }),
      'no-restricted-syntax': ['error', ...TEXTE_EN_DUR],
    },
  },
  // Les traductions : le format ICU et rien d'autre (ADR 0009).
  {
    files: ['i18n/**'],
    rules: {
      'no-restricted-imports': imports({ permises: ['icu'], couches: COUCHES.filter((c) => c !== 'i18n'), css: true }),
    },
  },
  {
    files: ['tests/**', 'contrats/**', 'exploitation/**'],
    languageOptions: { globals: { ...globals.node, ...navigateur } },
  },
]
