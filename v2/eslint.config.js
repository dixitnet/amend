// Lint de la v2 : les frontières entre couches, la séparation design /
// technique (aucune valeur de design hors de v2/design/, aucun réglage de
// design non décidé dedans) et l'interdiction des textes en dur
// (docs/v2-regles-developpement.md, règles 1 à 4, 17, 18, 20 et 23). Une
// violation bloque le lot.
import js from '@eslint/js'
import globals from 'globals'

/** Les fondations : on ne les importe que dans leur adaptateur (règle 1).
 * Des expressions ancrées sur le nom du paquet : un dossier `adaptateurs/yjs/`
 * ne doit pas être pris pour le paquet `yjs`. */
const FONDATIONS = {
  blocknote: '@blocknote/.*',
  y: '@y/.*',
  yjs13: 'yjs|y-prosemirror|y-protocols(/.*)?|y-websocket',
  prosemirror: '(?!(?:prosemirror-state|prosemirror-model|prosemirror-transform)$)prosemirror-.*|@tiptap/.*',
  // Ce qu'exige la pose d'une ancre de commentaire par le serveur (règle 1,
  // seconde révision, 09/11/2026) : permis à la partie serveur de
  // l'adaptateur BlockNote seulement.
  transformation: 'prosemirror-transform',
  // Ce qu'exigent les points d'extension publics de BlockNote (règle 1
  // révisée le 08/11/2026) : permis aux seules extensions.
  pointsExtension: 'prosemirror-state|prosemirror-model|@handlewithcare/prosemirror-inputrules',
  mantine: '@mantine/.*',
  // Les pictos de l'interface (ADR 0008) : réservés au design.
  tabler: '@tabler/.*',
  lib0: 'lib0(/.*)?',
  icu: 'intl-messageformat|@formatjs/.*',
  serveur: 'uws|postgres|redis',
  // Le SDK d'Anthropic : réservé à l'adaptateur IA (étape 8).
  ia: '@anthropic-ai/.*',
}
const COUCHES = ['domaine', 'adaptateurs', 'extensions', 'application', 'design', 'i18n']

/** Interdit l'import des fondations (sauf `permises`, des clés de FONDATIONS)
 * et des couches nommées. `css` : aucune feuille de style (hors du design) ;
 * `cssDesign` : seulement celles des fondations, livrées telles quelles
 * (le design n'a pas de feuille à lui, ADR 0008). */
function imports({ permises = [], couches = [], css = false, cssDesign = false }) {
  const interdites = Object.entries(FONDATIONS)
    .filter(([cle]) => !permises.includes(cle))
    .map(([, motif]) => motif)
  const patterns = [
    {
      regex: cssDesign ? `^(?!.*\\.css$)(${interdites.join('|')})$` : `^(${interdites.join('|')})$`,
      message: 'fondation importée hors de son adaptateur (règle 1)',
    },
  ]
  if (cssDesign)
    patterns.push({
      // Seules les feuilles de design/feuilles/, dont chaque règle est un
      // réglage décidé noté dans l'ADR 0008 (contrat statique).
      regex: '^\\.{1,2}/(?!feuilles/[\\w-]+\\.css$).*\\.css$',
      message: 'feuille de style maison : Mantine et BlockNote tels quels, réglages décidés seulement (ADR 0008)',
    })
  if (cssDesign)
    patterns.push({
      // Les feuilles d'un paquet : seulement celles de Mantine et de BlockNote.
      regex: '^(?!\\.)(?!(@mantine|@blocknote)/).*\\.css$',
      message: 'feuille de style d’un paquet autre que Mantine ou BlockNote (ADR 0008)',
    })
  if (couches.length)
    patterns.push({
      regex: `(^|/)(${couches.join('|')})(/|$)`,
      message: 'dépendance interdite entre couches (règles 1 à 3, 16)',
    })
  if (css) patterns.push({ regex: '\\.css$', message: 'feuille de style hors de v2/design/ (règle 17)' })
  return ['error', { patterns }]
}

/** Les adaptateurs : aucun n'importe un autre (règle 2), y compris un adaptateur
 * à venir ajouté à cette liste (audit du 10/11/2026). */
const ADAPTATEURS = ['yjs', 'blocknote', 'yhub', 'courrier', 'postgres', 'ia']
const autresAdaptateurs = (soi) => ADAPTATEURS.filter((a) => a !== soi)
/** Le même interdit pour les imports dynamiques (la fonction import), que
 * no-restricted-imports ne voit pas. */
const sansImportDynamique = (couches) => ({
  selector: `ImportExpression > Literal[value=/(^|\\/)(${couches.join('|')})(\\/|$)/]`,
  message: 'dépendance interdite entre couches, par un import dynamique (règles 1 à 3)',
})

const TEXTE_EN_DUR = [
  {
    selector: 'JSXText[value=/\\p{L}/u]',
    message: 'texte en dur : passer par v2/i18n/ (règle 23)',
  },
  {
    selector:
      'JSXAttribute[name.name=/^(title|alt|placeholder|aria-label|aria-roledescription|aria-valuetext|label)$/] > Literal',
    message: 'texte en dur dans un attribut : passer par v2/i18n/ (règle 23)',
  },
  // Un texte écrit dans une expression, entre les balises : {'Bonjour'},
  // {ok ? 'Oui' : ''} (audit du 10/11/2026). Les attributs (clés, codes) n'en sont pas.
  {
    selector: ':matches(JSXElement, JSXFragment) > JSXExpressionContainer > Literal[value=/\\p{L}/u]',
    message: 'texte en dur : passer par v2/i18n/ (règle 23)',
  },
  {
    selector:
      ':matches(JSXElement, JSXFragment) > JSXExpressionContainer > ConditionalExpression > Literal[value=/\\p{L}/u]',
    message: 'texte en dur : passer par v2/i18n/ (règle 23)',
  },
]
const STYLE_EN_DUR = { selector: "JSXAttribute[name.name='style']", message: 'style en dur (règle 17)' }

/** Une valeur de design écrite dans une chaîne : couleur, variable CSS, taille. */
const VALEUR_VISUELLE =
  '#[0-9a-fA-F]{3,8}\\b|\\b(rgba?|hsla?|hwb|oklch|oklab|lab|lch|color-mix)\\(|var\\(--|\\b[0-9]+(\\.[0-9]+)?(px|rem|em|ex|ch|vh|vw|vmin|vmax|pt|cm|mm|in|fr)\\b|\\b[0-9]+(\\.[0-9]+)?%'
/** Dans le design, une variable de Mantine n'est pas une valeur inventée. */
const VALEUR_VISUELLE_DESIGN = VALEUR_VISUELLE.replace('var\\(--', 'var\\(--(?!mantine-)')
const valeursVisuelles = (message, motif = VALEUR_VISUELLE) => [
  { selector: `Literal[value=/${motif}/]`, message },
  { selector: `TemplateElement[value.raw=/${motif}/]`, message },
]
/** Hors du design : ni valeur de design, ni classe d'apparence (règle 17). */
const DESIGN_HORS_DESIGN = [
  ...valeursVisuelles('valeur de design (couleur, taille, variable CSS) hors de v2/design/ (règle 17)'),
  { selector: "JSXAttribute[name.name='className']", message: 'classe d’apparence hors de v2/design/ (règle 17)' },
]
/** Dans le design : Mantine sans réglage ; toute valeur passe par
 * design/reglages.js, sur décision notée dans l'ADR 0008 (règle 18). */
const REGLAGE_NON_DECIDE = 'réglage de design non décidé : passer par design/reglages.js et l’ADR 0008 (règle 18)'
const PROPS_DE_STYLE_MANTINE =
  '^(p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|w|h|miw|maw|mih|mah|c|bg|bd|bdrs|opacity|ff|fz|fw|lts|ta|lh|fs|tt|td|pos|top|left|bottom|right|inset|display|flex|size|color|variant|radius|gap|rowGap|columnGap|justify|align|wrap|shadow|withBorder|gradient|autoContrast|fullWidth|styles|classNames|vars|hiddenFrom|visibleFrom|lightHidden|darkHidden|span|offset|cols|spacing|fluid)$'
const DESIGN_SANS_REGLAGE = [
  ...valeursVisuelles(REGLAGE_NON_DECIDE, VALEUR_VISUELLE_DESIGN),
  { selector: `JSXAttribute[name.name=/${PROPS_DE_STYLE_MANTINE}/]`, message: REGLAGE_NON_DECIDE },
]

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
        ...DESIGN_HORS_DESIGN,
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
        couches: ['application', 'design', 'i18n', 'extensions', ...autresAdaptateurs('yjs')],
        css: true,
      }),
      'no-restricted-syntax': ['error', ...DESIGN_HORS_DESIGN, sansImportDynamique(autresAdaptateurs('yjs'))],
    },
  },
  {
    files: ['adaptateurs/blocknote/**'],
    languageOptions: { globals: navigateur },
    rules: {
      'no-restricted-imports': imports({
        permises: ['blocknote', 'y'],
        couches: ['application', 'design', 'i18n', ...autresAdaptateurs('blocknote')],
        css: true,
      }),
      'no-restricted-syntax': [
        'error',
        STYLE_EN_DUR,
        ...TEXTE_EN_DUR,
        ...DESIGN_HORS_DESIGN,
        sansImportDynamique(autresAdaptateurs('blocknote')),
      ],
    },
  },
  {
    files: ['adaptateurs/blocknote/serveur.js'],
    rules: {
      'no-restricted-imports': imports({
        permises: ['blocknote', 'y', 'transformation', 'lib0'],
        couches: ['application', 'design', 'i18n', ...autresAdaptateurs('blocknote')],
        css: true,
      }),
    },
  },
  {
    files: ['adaptateurs/yhub/**'],
    rules: {
      'no-restricted-imports': imports({
        permises: ['y', 'lib0'],
        couches: ['application', 'design', 'i18n', 'extensions', ...autresAdaptateurs('yhub')],
        css: true,
      }),
      'no-restricted-syntax': ['error', ...DESIGN_HORS_DESIGN, sansImportDynamique(autresAdaptateurs('yhub'))],
    },
  },
  {
    files: ['adaptateurs/courrier/**'],
    rules: {
      'no-restricted-imports': imports({
        couches: ['application', 'design', 'i18n', 'extensions', ...autresAdaptateurs('courrier')],
        css: true,
      }),
      'no-restricted-syntax': ['error', ...DESIGN_HORS_DESIGN, sansImportDynamique(autresAdaptateurs('courrier'))],
    },
  },
  {
    files: ['adaptateurs/postgres/**'],
    rules: {
      'no-restricted-imports': imports({
        permises: ['serveur'],
        couches: ['application', 'design', 'i18n', 'extensions', ...autresAdaptateurs('postgres')],
        css: true,
      }),
      'no-restricted-syntax': ['error', ...DESIGN_HORS_DESIGN, sansImportDynamique(autresAdaptateurs('postgres'))],
    },
  },
  {
    files: ['adaptateurs/ia/**'],
    rules: {
      'no-restricted-imports': imports({
        permises: ['ia'],
        couches: ['application', 'design', 'i18n', 'extensions', ...autresAdaptateurs('ia')],
        css: true,
      }),
      'no-restricted-syntax': ['error', ...DESIGN_HORS_DESIGN, sansImportDynamique(autresAdaptateurs('ia'))],
    },
  },
  // Couche 3 : les extensions se branchent sur BlockNote, et sur rien d'autre.
  {
    files: ['extensions/**'],
    languageOptions: { globals: navigateur },
    rules: {
      'no-restricted-imports': imports({
        permises: ['blocknote', 'pointsExtension'],
        couches: ['application', 'design', 'i18n', 'adaptateurs'],
        css: true,
      }),
      'no-restricted-syntax': ['error', STYLE_EN_DUR, ...TEXTE_EN_DUR, ...DESIGN_HORS_DESIGN],
    },
  },
  // Couche 5 : l'application technique n'importe aucune fondation, aucun style,
  // et n'écrit aucun texte.
  {
    files: ['application/**'],
    rules: {
      'no-restricted-imports': imports({ css: true }),
      'no-restricted-syntax': ['error', STYLE_EN_DUR, ...TEXTE_EN_DUR, ...DESIGN_HORS_DESIGN],
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
        permises: ['mantine', 'tabler'],
        couches: ['application', 'adaptateurs', 'extensions', 'domaine', 'i18n'],
        cssDesign: true,
      }),
      'no-restricted-syntax': ['error', STYLE_EN_DUR, ...TEXTE_EN_DUR, ...DESIGN_SANS_REGLAGE],
    },
  },
  // Le seul fichier où une valeur de design est permise : les réglages
  // décidés par Sylvain, chacun noté dans l'ADR 0008 (contrat statique).
  {
    files: ['design/reglages.js'],
    rules: { 'no-restricted-syntax': ['error', STYLE_EN_DUR, ...TEXTE_EN_DUR] },
  },
  // Les traductions : le format ICU et rien d'autre (ADR 0009).
  {
    files: ['i18n/**'],
    rules: {
      'no-restricted-imports': imports({ permises: ['icu'], couches: COUCHES.filter((c) => c !== 'i18n'), css: true }),
      'no-restricted-syntax': ['error', ...DESIGN_HORS_DESIGN],
    },
  },
  {
    files: ['tests/**', 'contrats/**', 'exploitation/**'],
    languageOptions: { globals: { ...globals.node, ...navigateur } },
  },
]
