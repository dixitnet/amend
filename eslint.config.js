// ESLint minimal (point 54 de la feuille de route) : il cherche ce qui est
// faux ou mort, pas à imposer un style. Prettier s'en charge pour la forme.
import globals from 'globals'

export default [
  { ignores: ['client/dist/**', 'node_modules/**', 'client/node_modules/**', 'data/**', 'tests/**', '_a_supprimer/**', 'client/vite.config.js.timestamp-*'] },
  {
    files: ['server/**/*.js', 'shared/**/*.js', 'tools/**/*.{js,mjs}', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    rules: baseRules(),
  },
  {
    files: ['client/src/**/*.js', 'client/vite.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } },
    rules: baseRules(),
  },
  {
    files: ['server/test/**/*.js', 'client/test/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: baseRules(),
  },
]

function baseRules() {
  return {
    'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
    'no-undef': 'error',
    'no-control-regex': 'error',
    'no-unreachable': 'error',
    'no-dupe-keys': 'error',
    'no-dupe-else-if': 'error',
    'no-duplicate-case': 'error',
    'no-self-assign': 'error',
    'no-redeclare': 'error',
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-fallthrough': 'error',
    'no-unsafe-finally': 'error',
    'eqeqeq': ['error', 'smart'],
  }
}
