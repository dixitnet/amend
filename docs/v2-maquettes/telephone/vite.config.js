// Construction de la maquette en une seule page (tout en ligne), publiable
// comme page claude.ai. `dedupe` : le schéma et la feuille de la v2 sont
// importés depuis v2/, mais une seule copie de chaque fondation est chargée,
// celle de ce dossier.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['@blocknote/core', '@blocknote/react', '@blocknote/mantine', '@mantine/core', '@mantine/hooks', 'react', 'react-dom', 'prosemirror-model', 'prosemirror-state'],
  },
  build: {
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
