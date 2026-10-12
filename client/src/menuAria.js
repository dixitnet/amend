// Annonce l'état d'un menu déroulant aux lecteurs d'écran (point 57 de la
// feuille de route) : `aria-expanded` sur le bouton suit l'attribut `hidden`
// de la liste, quel que soit le code qui l'ouvre ou la ferme (clic ailleurs,
// autre menu, démontage). Un observateur plutôt qu'une mise à jour à chaque
// endroit qui touche `liste.hidden`.

export function lierMenuAria(bouton, liste) {
  const maj = () => bouton.setAttribute('aria-expanded', String(!liste.hidden))
  bouton.setAttribute('aria-haspopup', 'true')
  maj()
  if (typeof MutationObserver === 'function') {
    new MutationObserver(maj).observe(liste, { attributes: true, attributeFilter: ['hidden'] })
  }
}
