// Ce que le panneau « Partager » d'un document et le back-office ont en commun
// pour une invitation en attente (23/10/2026) : le badge qui dit où en est le
// courrier, et le geste « copier le lien ».

const LIBELLES = { remis: 'courrier remis', refuse: 'courrier refusé', en_cours: 'envoi en cours' }
const AIDES = {
  remis:
    'Le serveur de messagerie de la personne a accepté le courrier. S’il n’arrive pas, il est sans doute dans ses indésirables ou en quarantaine : copiez le lien pour le lui transmettre autrement.',
  refuse: 'Le serveur de la personne a refusé le courrier. Copiez le lien pour le lui transmettre autrement.',
  en_cours: 'Le courrier est parti ; le serveur de la personne ne l’a pas encore accepté.',
}

/** Le badge « courrier remis / refusé / en cours » (et, pour un refus, la raison
 * donnée par le serveur distant), ou `null` quand on ne sait pas. `c` est
 * l'objet `courrier` que le serveur joint à chaque invitation en attente. */
export function badgeCourrier(c) {
  if (!c || !LIBELLES[c.etat]) return null
  const badge = document.createElement('span')
  badge.className = `access-courrier courrier-${c.etat}`
  badge.textContent = LIBELLES[c.etat]
  badge.title = AIDES[c.etat]
  if (!c.detail) return badge
  const bloc = document.createDocumentFragment()
  const detail = document.createElement('span')
  detail.className = 'access-courrier-detail'
  detail.textContent = c.detail
  bloc.append(badge, detail)
  return bloc
}

/**
 * Met dans le presse-papiers un texte qu'on n'a pas encore : `promesse` est la
 * réponse du serveur. Le presse-papiers n'accepte une écriture qu'en réponse à
 * un geste ; on lui passe donc la promesse (Chrome, Safari) plutôt que
 * d'attendre le serveur avant de l'appeler. Renvoie `{ copie, texte }` :
 * `copie` vaut `false` quand le presse-papiers a refusé (à l'appelant de
 * montrer le texte). Lève l'erreur de `promesse` quand c'est le serveur qui a
 * refusé.
 */
export async function copierEnDiffere(promesse) {
  promesse.catch(() => {})
  const presse = navigator.clipboard
  try {
    if (presse && typeof ClipboardItem !== 'undefined' && presse.write) {
      await presse.write([
        new ClipboardItem({ 'text/plain': promesse.then((t) => new Blob([t], { type: 'text/plain' })) }),
      ])
    } else {
      await presse.writeText(await promesse)
    }
    return { copie: true, texte: await promesse }
  } catch {
    return { copie: false, texte: await promesse }
  }
}

/** Un champ en lecture seule, déjà sélectionné : le repli quand le
 * presse-papiers est inaccessible. */
export function champLien(texte, libelle) {
  const champ = document.createElement('input')
  champ.type = 'text'
  champ.readOnly = true
  champ.className = 'lien-copie'
  champ.value = texte
  champ.setAttribute('aria-label', libelle)
  return champ
}
