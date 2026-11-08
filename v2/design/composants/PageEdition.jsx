// Composant de présentation : la page d'un document. Conteneur générique, il
// ne sait rien de l'éditeur qu'il reçoit (revue R4) ; ses textes lui
// arrivent traduits. `mention` (facultative) signale un mode particulier de la
// page, par exemple la lecture seule.
export function PageEdition({ titre, etat, participants, mention, editeur }) {
  return (
    <div className="page-edition">
      <header className="page-edition__entete">
        <h1 className="page-edition__titre">{titre}</h1>
        {mention ? <p className="page-edition__mention">{mention}</p> : null}
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
