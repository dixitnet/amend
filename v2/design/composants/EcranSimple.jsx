// Composants de présentation : écrans simples (attente, erreur, connexion de
// développement). Ils n'appellent rien : la connexion remonte par `surEntrer`.
export function EcranMessage({ titre, texte }) {
  return (
    <section className="ecran-simple">
      {titre ? <h1 className="ecran-simple__titre">{titre}</h1> : null}
      <p className="ecran-simple__texte" role="status">
        {texte}
      </p>
    </section>
  )
}

export function EcranConnexion({ titre, explication, libelleNom, libelleBouton, surEntrer }) {
  const soumettre = (e) => {
    e.preventDefault()
    const nom = new FormData(e.currentTarget).get('nom')
    if (String(nom || '').trim()) surEntrer(String(nom).trim())
  }
  return (
    <section className="ecran-simple">
      <h1 className="ecran-simple__titre">{titre}</h1>
      <p className="ecran-simple__texte">{explication}</p>
      <form onSubmit={soumettre}>
        <label className="champ">
          <span>{libelleNom}</span>
          <input name="nom" autoComplete="name" required autoFocus />
        </label>
        <button className="bouton-principal" type="submit">
          {libelleBouton}
        </button>
      </form>
    </section>
  )
}
