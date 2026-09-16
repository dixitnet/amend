import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    // `shared/` est hors de la racine du client : en développement, Vite
    // refuse par défaut de servir un fichier au-dessus d'elle. La
    // compilation, elle, suit les imports relatifs sans rien demander.
    fs: { allow: ['..', '../shared'] },
    // In dev mode, proxy API/WebSocket calls to the Node server so you can
    // run `npm run dev` here and `npm start` at the project root together.
    proxy: {
      '/api': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
})
