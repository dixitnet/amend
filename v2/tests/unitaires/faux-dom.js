// Un DOM minimal pour les extensions de BlockNote qui construisent des
// éléments (`document.createElement`) : assez pour appeler leur rendu sans
// navigateur et lire ce qu'il a construit. Rien de plus ; le vrai rendu est
// vérifié par la pile complète (contrats/pile).

class FauxElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase()
    this.attributs = {}
    this.enfants = []
    this.ecouteurs = {}
    this.textContent = ''
    this.className = ''
    this.style = {}
    this.dataset = {}
  }
  setAttribute(nom, valeur) {
    this.attributs[nom] = String(valeur)
  }
  getAttribute(nom) {
    return this.attributs[nom] ?? null
  }
  removeAttribute(nom) {
    delete this.attributs[nom]
  }
  append(...enfants) {
    this.enfants.push(...enfants)
  }
  appendChild(enfant) {
    this.enfants.push(enfant)
    return enfant
  }
  /** Le premier descendant (lui compris) qui répond au test. */
  trouver(test) {
    if (test(this)) return this
    for (const e of this.enfants) {
      const r = e.trouver?.(test)
      if (r) return r
    }
    return null
  }
  replaceChildren(...enfants) {
    this.enfants = enfants
  }
  addEventListener(type, f) {
    ;(this.ecouteurs[type] ??= []).push(f)
  }
  declencher(type) {
    for (const f of this.ecouteurs[type] ?? []) f({ target: this })
  }
}

/** Installe `document` le temps d'un test ; rend la fonction qui le retire. */
export function installerFauxDom() {
  const avant = globalThis.document
  globalThis.document = { createElement: (tag) => new FauxElement(tag) }
  return () => {
    if (avant === undefined) delete globalThis.document
    else globalThis.document = avant
  }
}
