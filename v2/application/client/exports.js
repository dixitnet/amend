// Les exports du document ouvert (couche 5) : Markdown et PDF, préparés par
// l'adaptateur de l'éditeur dans le navigateur, comme Docs, puis téléchargés.
// Le PDF se compose avec le modèle de mise en page choisi dans la fenêtre
// « Exporter » : un modèle d'amend.ink, ou un modèle d'équipe calculé à partir
// de sa base et de ses écarts (domaine, ADR 0011).
import { MODELES_LIVRE, REGLES_MODELES } from '../../design/index.js'
import { nomDeFichier, appliquerEcarts } from '../../domaine/index.js'

const TYPES = { markdown: 'text/markdown;charset=utf-8', pdf: 'application/pdf' }
const EXTENSIONS = { markdown: 'md', pdf: 'pdf' }

const octets = (url) => fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
const echec = (code) => Object.assign(new Error(code), { code })

/** Un modèle d'amend.ink, par son identifiant. */
export const modeleMaison = (id) => MODELES_LIVRE.find((m) => m.id === id) ?? null

/**
 * Le modèle complet d'une entrée de la liste des modèles d'un document
 * (`{ id, maison: true }` ou `{ id, nom, base, ecarts }`). Lève une erreur de
 * code `modele-introuvable` ou `modele-impossible`.
 */
export function modeleComplet(entree) {
  const base = modeleMaison(entree?.maison ? entree.id : entree?.base)
  if (entree?.maison && base) return base
  if (!base) throw echec('modele-introuvable')
  const r = appliquerEcarts(base, entree.ecarts ?? {}, REGLES_MODELES)
  if (!r.ok) throw echec(r.code)
  return { ...r.modele, id: entree.id }
}

/**
 * Exporte le document et le propose au téléchargement.
 * @param {{ current: { exporter: Function } | null }} controle  la commande de l'éditeur
 * @param {'markdown' | 'pdf'} format
 * @param {{ titre: string, langue: string, modele?: object }} document  `modele` :
 *   le modèle complet, pour le PDF
 */
export async function exporterDocument(controle, format, { titre, langue, modele }) {
  const exporter = controle.current?.exporter
  // L'éditeur n'est pas encore prêt : c'est un échec, dit comme les autres.
  if (!exporter) throw echec('export-impossible')
  let contenu
  if (format === 'pdf') {
    const leModele = modele ?? MODELES_LIVRE[0]
    const polices = (await Promise.all(leModele.polices.map(octets))).map((b) => new Uint8Array(b))
    contenu = await exporter('pdf', { modele: leModele, polices, titre, langue })
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
