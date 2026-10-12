// Une erreur qui sait quel code HTTP elle mérite (point 54 de la feuille de
// route, 11/10/2026). Le gestionnaire de requêtes de server.js répond
// `err.status` quand elle existe : lever `new ErreurHttp(413, '…')` suffit,
// là où l'on assemblait `Object.assign(new Error(…), { status })` ou
// définissait une classe par module.
//
// `AIRequestError`, `TypstError` et `DialogueErreur` en descendent : elles
// gardent leur nom et leurs signatures, mais se reconnaissent d'un seul
// `instanceof ErreurHttp`.

export class ErreurHttp extends Error {
  /** @param {number} status  le code HTTP à répondre
   * @param {string} message  ce que la personne lira */
  constructor(status, message) {
    super(message)
    this.name = new.target.name
    this.status = status
  }
}
