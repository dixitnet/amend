// Les exports du document ouvert (couche 5) : Markdown et PDF, préparés par
// l'adaptateur de l'éditeur dans le navigateur, comme Docs, puis téléchargés.
import { MODELES_LIVRE } from '../../design/index.js'
import { nomDeFichier } from '../../domaine/index.js'

const TYPES = { markdown: 'text/markdown;charset=utf-8', pdf: 'application/pdf' }
const EXTENSIONS = { markdown: 'md', pdf: 'pdf' }

const octets = (url) => fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))

/**
 * Exporte le document et le propose au téléchargement.
 * @param {{ current: { exporter: Function } | null }} controle  la commande de l'éditeur
 * @param {'markdown' | 'pdf'} format
 * @param {{ titre: string, langue: string }} document
 */
export async function exporterDocument(controle, format, { titre, langue }) {
  const exporter = controle.current?.exporter
  // L'éditeur n'est pas encore prêt : c'est un échec, dit comme les autres.
  if (!exporter) throw Object.assign(new Error('éditeur pas prêt'), { code: 'export-impossible' })
  let contenu
  if (format === 'pdf') {
    // Le premier modèle de livre, tant qu'il n'y a pas de choix du modèle.
    const modele = MODELES_LIVRE[0]
    const polices = (await Promise.all(modele.polices.map(octets))).map((b) => new Uint8Array(b))
    contenu = await exporter('pdf', { modele, polices, titre, langue })
  } else contenu = await exporter('markdown')
  telecharger(new Blob([contenu], { type: TYPES[format] }), nomDeFichier(titre, EXTENSIONS[format]))
}

function telecharger(blob, nom) {
  const lien = document.createElement('a')
  lien.href = URL.createObjectURL(blob)
  lien.download = nom
  lien.click()
  setTimeout(() => URL.revokeObjectURL(lien.href), 1000)
}
