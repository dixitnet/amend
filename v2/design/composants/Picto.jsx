// Composant de présentation : le picto d'amend.ink, tiré tel quel du fichier
// de référence (design/picto/amend-ink.svg, ADR 0008), sans copie du dessin.
// Décoratif : le nom de l'application l'accompagne toujours en texte. Sa couleur
// et sa taille sont des réglages décidés (design/feuilles/picto.css).
import dessin from '../picto/amend-ink.svg?raw'

export function Picto() {
  return <span className="amend-picto" aria-hidden="true" dangerouslySetInnerHTML={{ __html: dessin }} />
}

/** Le picto suivi du nom de l'application, dans le texte qui les porte. */
export function Marque({ nom }) {
  return (
    <>
      <Picto /> {nom}
    </>
  )
}
