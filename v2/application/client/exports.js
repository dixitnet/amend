// Les exports du document ouvert (couche 5) : Markdown et PDF, préparés par
// l'adaptateur de l'éditeur dans le navigateur, comme Docs, puis téléchargés.
// Le PDF se compose avec le modèle de mise en page choisi dans la fenêtre
// « Exporter » : le serveur envoie chaque modèle complet (modèle du code,
// de l'instance ou d'équipe, calculé par le domaine) ; le client y joint les
// fichiers de sa police (12/11/2026, docs/v2-modeles-pdf-plan.md).
import { MODELES_LIVRE, REGLES_MODELES } from '../../design/index.js'
import { nomDeFichier } from '../../domaine/index.js'

const TYPES = { markdown: 'text/markdown;charset=utf-8', pdf: 'application/pdf' }
const EXTENSIONS = { markdown: 'md', pdf: 'pdf' }

const octets = (url) => fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
const echec = (code) => Object.assign(new Error(code), { code })

/**
 * Le modèle prêt à composer d'une entrée de la liste des modèles (son modèle
 * `complet`, envoyé par le serveur), avec les fichiers de sa police. Lève
 * une erreur de code `modele-introuvable` (modèle qui ne se calcule plus,
 * police hors du catalogue).
 */
export function modeleComplet(entree) {
  const complet = entree?.complet
  // Une police fournie avec amend.ink : ses fichiers sont dans le catalogue du
  // client ; une police de l'instance : le serveur a joint leurs adresses.
  const fournie = complet && REGLES_MODELES.polices.find((p) => p.famille === complet.police)
  const fichiers = fournie?.fichiers ?? (complet?.polices?.length ? complet.polices : null)
  if (!fichiers) throw echec('modele-introuvable')
  return { ...complet, polices: fichiers }
}

/**
 * Exporte le document et le propose au téléchargement.
 * @param {{ current: { exporter: Function } | null }} controle  la commande de l'éditeur
 * @param {'markdown' | 'pdf'} format
 * @param {{ titre: string, langue: string, modele?: object, auteur?: string }} document  `modele` :
 *   le modèle complet, pour le PDF ; `auteur` : dans les propriétés du PDF
 */
export async function exporterDocument(controle, format, { titre, langue, modele, auteur }) {
  const exporter = controle.current?.exporter
  // L'éditeur n'est pas encore prêt : c'est un échec, dit comme les autres.
  if (!exporter) throw echec('export-impossible')
  let contenu
  if (format === 'pdf') {
    const leModele = modele ?? MODELES_LIVRE[0]
    const polices = (await Promise.all(leModele.polices.map(octets))).map((b) => new Uint8Array(b))
    contenu = await exporter('pdf', { modele: leModele, polices, titre, langue, auteur })
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
