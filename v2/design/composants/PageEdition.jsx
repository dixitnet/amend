// Composant de présentation : la page d'un document. Conteneur générique, il
// ne sait rien de l'éditeur qu'il reçoit (revue R4) ; ses textes lui
// arrivent traduits.
export function PageEdition({ titre, etat, participants, editeur }) {
  return (
    <div className="page-edition">
      <header className="page-edition__entete">
        <h1 className="page-edition__titre">{titre}</h1>
        <p className="page-edition__info" role="status">
          {etat}
        </p>
        <p className="page-edition__info">{participants}</p>
      </header>
      <main className="page-edition__document" role="document">
        {editeur}
      </main>
    </div>
  )
}
