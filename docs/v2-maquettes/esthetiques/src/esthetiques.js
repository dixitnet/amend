// Scénarios d'esthétique de la maquette (propositions, aucune n'est décidée).
// Chaque esthétique est exprimée avec les outils de style des fondations, et
// rien d'autre :
//   - `theme` : l'objet de thème de Mantine (createTheme) ;
//   - `variables` : le `cssVariablesResolver` de Mantine (fond, texte, filets),
//     en clair et en sombre ;
//   - `feuille` : les variables de thème de BlockNote (`--bn-*`) et quelques
//     règles, toutes limitées à `html[data-esthetique='…']`.
// L'accent (couleur principale) est un axe séparé : voir ACCENTS.
import { DEFAULT_THEME } from '@mantine/core'

const INTER = 'Inter, "Inter fallback", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

// Les couleurs d'accent, toutes en palettes de 10 nuances comme Mantine.
// `nuance` : la nuance principale en clair et en sombre.
export const ACCENTS = {
  vertA: {
    nom: 'Vert foncé (actuel)',
    palette: [...DEFAULT_THEME.colors.green.slice(0, 9), '#237032'],
    nuance: { light: 9, dark: 9 },
  },
  encre: { nom: 'Encre noire', palette: DEFAULT_THEME.colors.dark, nuance: { light: 8, dark: 0 } },
  indigo: { nom: 'Bleu encre', palette: DEFAULT_THEME.colors.indigo, nuance: { light: 8, dark: 4 } },
  bleu: { nom: 'Bleu bureau', palette: DEFAULT_THEME.colors.blue, nuance: { light: 7, dark: 5 } },
  vermillon: {
    nom: 'Vermillon (encre de correction)',
    palette: ['#fff0ee', '#ffdcd6', '#fbb4a8', '#f78a77', '#f3654d', '#f14e33', '#e5442a', '#c9381f', '#b03018', '#962611'],
    nuance: { light: 7, dark: 4 },
  },
  violet: { nom: 'Violet', palette: DEFAULT_THEME.colors.violet, nuance: { light: 7, dark: 4 } },
  petrole: { nom: 'Pétrole', palette: DEFAULT_THEME.colors.cyan, nuance: { light: 9, dark: 5 } },
  sepia: {
    nom: 'Sépia',
    palette: ['#f8f3ee', '#ece3da', '#d9c5b1', '#c6a686', '#b68b62', '#ac7a4b', '#a7713f', '#925f31', '#7c4f27', '#66401e'],
    nuance: { light: 8, dark: 4 },
  },
}

export const ESTHETIQUES = {
  actuel: {
    nom: '0. Actuelle',
    accent: 'vertA',
    inspirations: 'Mantine et BlockNote tels quels (v2 du 11/11/2026)',
    principe: 'Référence : rien ne change.',
    theme: {},
    variables: { light: {}, dark: {} },
    feuille: '',
  },

  encre: {
    nom: '1. Encre',
    accent: 'encre',
    inspirations: 'Notion, iA Writer, Things',
    principe:
      "Noir, blanc et gris neutres ; aucune couleur dans l'interface. La couleur est réservée à ce qui porte un sens : suivi des modifications, personnes, erreurs.",
    theme: {
      fontFamily: INTER,
      headings: { fontFamily: INTER, fontWeight: '600' },
      defaultRadius: 'sm',
      components: {
        Badge: { defaultProps: { variant: 'outline', color: 'gray' } },
        Tabs: { defaultProps: { color: 'dark' } },
        NavLink: { defaultProps: { color: 'gray', variant: 'light' } },
      },
    },
    variables: {
      light: { '--mantine-color-text': '#1a1a1a' },
      dark: { '--mantine-color-body': '#191919', '--mantine-color-text': '#e8e8e8' },
    },
    feuille: `
      & .bn-root { --bn-colors-editor-text: #1a1a1a; }
      &[data-mantine-color-scheme='dark'] .bn-root { --bn-colors-editor-text: #e8e8e8; --bn-colors-editor-background: #191919; }
      & .mantine-AppShell-header, & .mantine-AppShell-navbar, & .mantine-AppShell-aside { --app-shell-border-color: var(--mantine-color-gray-2); }
      &[data-mantine-color-scheme='dark'] .mantine-AppShell-header, &[data-mantine-color-scheme='dark'] .mantine-AppShell-navbar, &[data-mantine-color-scheme='dark'] .mantine-AppShell-aside { --app-shell-border-color: #2a2a2a; }
      &[data-mantine-color-scheme='dark'] .mantine-AppShell-header, &[data-mantine-color-scheme='dark'] .mantine-AppShell-navbar, &[data-mantine-color-scheme='dark'] .mantine-AppShell-aside { background: #191919; }
    `,
  },

  papier: {
    nom: '2. Papier',
    accent: 'indigo',
    inspirations: 'Ulysses, iA Writer (Duo), Medium, Reedsy, Apple Livres',
    principe:
      "Le texte en caractères à empattements dessinés pour l'écran, plus grand et plus aéré ; l'interface reste en linéale. Fond légèrement chaud, gris tirant vers le brun. Une seule couleur, discrète.",
    theme: {
      fontFamily: INTER,
      headings: { fontFamily: 'Literata, Georgia, serif', fontWeight: '600' },
      defaultRadius: 'md',
      colors: {
        // Gris chauds (proposition) à la place des gris bleutés de Mantine.
        gray: ['#faf8f5', '#f3f0eb', '#e9e4dc', '#ddd6cb', '#c9c0b3', '#a89f92', '#857c70', '#5c544a', '#3f3931', '#29241f'],
      },
    },
    variables: {
      light: { '--mantine-color-body': '#fbf9f5', '--mantine-color-text': '#2b2620', '--mantine-color-default-border': '#e4ddd2' },
      dark: { '--mantine-color-body': '#1d1b18', '--mantine-color-text': '#e7e1d6', '--mantine-color-default-border': '#3a352e' },
    },
    feuille: `
      & .bn-root { --bn-colors-editor-background: #fbf9f5; --bn-colors-editor-text: #2b2620; --bn-colors-menu-background: #fffdf9; --bn-colors-hovered-background: #f1ece4; --bn-colors-border: #e9e2d6; }
      &[data-mantine-color-scheme='dark'] .bn-root { --bn-colors-editor-background: #1d1b18; --bn-colors-editor-text: #e7e1d6; --bn-colors-menu-background: #26231f; --bn-colors-hovered-background: #2f2b26; --bn-colors-border: #3a352e; }
      & .bn-default-styles { font-family: Literata, Georgia, serif; font-size: 18px; }
      & .bn-block-outer { line-height: 1.65; }
      & .mantine-AppShell-header, & .mantine-AppShell-navbar, & .mantine-AppShell-aside { --app-shell-border-color: #e4ddd2; background: #f6f3ee; }
      &[data-mantine-color-scheme='dark'] .mantine-AppShell-header, &[data-mantine-color-scheme='dark'] .mantine-AppShell-navbar, &[data-mantine-color-scheme='dark'] .mantine-AppShell-aside { --app-shell-border-color: #3a352e; background: #221f1b; }
      & .mantine-AppShell-header { background: var(--mantine-color-body); }
    `,
  },

  atelier: {
    nom: '3. Atelier',
    accent: 'bleu',
    inspirations: 'Word, Google Docs, Pages, Vellum',
    principe:
      "Une page posée sur un plan de travail gris : on voit la feuille, donc le livre. Ombre légère sous la page, interface sur le gris. C'est le modèle le plus familier aux auteurs.",
    theme: {
      fontFamily: INTER,
      headings: { fontFamily: '"Source Serif 4", Georgia, serif', fontWeight: '600' },
      defaultRadius: 'sm',
    },
    variables: {
      light: {},
      dark: {},
    },
    feuille: `
      & .amend-page { width: min(816px, calc(100% - 64px)); box-sizing: border-box; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.06); padding: 56px 48px 80px; margin-block: 32px; border-radius: 2px; }
      &[data-mantine-color-scheme='dark'] .amend-page { background: var(--mantine-color-dark-6); box-shadow: var(--mantine-shadow-sm); }
      & .bn-editor { background-color: transparent; color: var(--mantine-color-dark-7); }
      &[data-mantine-color-scheme='dark'] .bn-editor { color: var(--mantine-color-dark-0); }
      & .amend-page .bn-default-styles { font-family: "Source Serif 4", Georgia, serif; font-size: 17px; }
      & .amend-page .bn-block-outer { line-height: 1.6; }
      & .mantine-AppShell-main { background: var(--mantine-color-gray-1); }
      &[data-mantine-color-scheme='dark'] .mantine-AppShell-main { background: var(--mantine-color-dark-8); }
    `,
    page: true,
  },

  signature: {
    nom: '4. Signature',
    accent: 'vermillon',
    inspirations: 'Bear, Craft, Things, Ulysses',
    principe:
      "Interface neutre et claire, une couleur vive et assumée, utilisée avec parcimonie (bouton principal, onglet actif, curseur, sélection). La couleur devient la marque, comme le rouge de Bear.",
    theme: {
      fontFamily: INTER,
      headings: { fontFamily: INTER, fontWeight: '700' },
      defaultRadius: 'lg',
      components: {
        Button: { defaultProps: { radius: 'xl' } },
        Paper: { defaultProps: { shadow: 'xs', withBorder: false } },
      },
    },
    variables: { light: {}, dark: { '--mantine-color-body': '#1c1c1e' } },
    feuille: `
      & .bn-editor { caret-color: var(--mantine-primary-color-filled); }
      & .bn-editor ::selection { background: var(--mantine-primary-color-light); }
      & .mantine-AppShell-navbar, & .mantine-AppShell-aside { background: var(--mantine-color-gray-0); }
      &[data-mantine-color-scheme='dark'] .mantine-AppShell-navbar, &[data-mantine-color-scheme='dark'] .mantine-AppShell-aside { background: #232325; }
      &[data-mantine-color-scheme='dark'] .bn-root { --bn-colors-editor-background: #1c1c1e; }
    `,
  },

  silence: {
    nom: '5. Silence',
    accent: 'petrole',
    inspirations: 'iA Writer (mode concentration), Ulysses, Typora',
    principe:
      "L'interface s'efface : pas de filets, bandeau et volets du même fond que la page, pictos estompés tant qu'on ne les survole pas. Texte en chasse quasi fixe, comme une machine à écrire, très aéré.",
    theme: {
      fontFamily: INTER,
      headings: { fontFamily: '"IBM Plex Mono", ui-monospace, monospace', fontWeight: '600' },
      defaultRadius: 'xs',
      components: {
        Paper: { defaultProps: { withBorder: false } },
      },
    },
    variables: { light: {}, dark: { '--mantine-color-body': '#1a1a1a' } },
    feuille: `
      & .mantine-AppShell-header, & .mantine-AppShell-navbar, & .mantine-AppShell-aside { --app-shell-border-color: transparent; }
      &[data-mantine-color-scheme='dark'] .bn-root { --bn-colors-editor-background: #1a1a1a; }
      & .mantine-AppShell-header .mantine-ActionIcon-root, & .mantine-AppShell-header .mantine-Avatar-root, & .mantine-AppShell-header .mantine-Button-root { opacity: .45; transition: opacity .2s; }
      & .mantine-AppShell-header:hover .mantine-ActionIcon-root, & .mantine-AppShell-header:hover .mantine-Avatar-root, & .mantine-AppShell-header:hover .mantine-Button-root { opacity: 1; }
      & .bn-default-styles { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 16.5px; }
      & .bn-block-outer { line-height: 1.8; }
      & .mantine-Tabs-list::before { display: none; }
    `,
  },
}

// Construit le thème Mantine d'une esthétique avec un accent.
export function themeDe(cle, cleAccent) {
  const e = ESTHETIQUES[cle]
  const a = ACCENTS[cleAccent]
  return {
    ...e.theme,
    colors: { ...(e.theme.colors || {}), accent: a.palette },
    primaryColor: 'accent',
    primaryShade: a.nuance,
    autoContrast: true,
  }
}

// Le `cssVariablesResolver` de Mantine pour une esthétique.
export function variablesDe(cle) {
  const e = ESTHETIQUES[cle]
  return () => ({ variables: {}, light: e.variables.light, dark: e.variables.dark })
}

// Toutes les feuilles, chacune limitée à son esthétique.
export function feuilles() {
  return Object.entries(ESTHETIQUES)
    .map(([cle, e]) => e.feuille.replaceAll('&', `html[data-esthetique='${cle}']`))
    .join('\n')
}
