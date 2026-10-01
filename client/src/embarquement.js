// Embarquer un bêta-testeur — la partie commune au back-office (`#/admin`) et
// à la page de la liste d'attente (`#/inscrits`).
//
// Embarquer, c'est une action qui **écrit** et qui **envoie un courrier à
// quelqu'un d'autre** : le serveur crée un document de bienvenue dont la
// personne est propriétaire et lui envoie l'invitation. Un courrier parti ne
// se rattrape pas, d'où deux clics (le premier arme le bouton, le second
// agit), et d'où une adresse tapée à la main qui n'est jamais envoyée sur un
// seul geste : une faute de frappe écrirait à un inconnu.
//
// Un seul écouteur par racine, quel que soit le nombre de fois où la page est
// redessinée : `mountAdmin` se rappelle lui-même après chaque action, et des
// écouteurs empilés enverraient le courrier deux fois — la seconde fois
// serait refusée (409), mais le premier envoi, lui, serait déjà parti.

const DELAI_ARMEMENT = 5000

export const MESSAGES = {
  409: 'Cette adresse a déjà accès à un document.',
  400: 'Adresse invalide.',
  403: 'Réservé aux administrateurs.',
  502: "Le courrier n'est pas parti : rien n'a été créé, vous pouvez réessayer.",
  500: "Le document n'a pas pu être créé : rien n'a été envoyé.",
}

/** Appelle le serveur. Ne lève jamais : renvoie `{ ok, … }`. */
export async function embarquer(email) {
  try {
    const res = await fetch('/api/admin/embarquer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const donnees = await res.json().catch(() => ({}))
    if (res.ok) return { ok: true, ...donnees }
    return { ok: false, status: res.status, message: MESSAGES[res.status] || donnees.error || 'Refusé par le serveur.' }
  } catch {
    return { ok: false, status: 0, message: "Le serveur n'a pas répondu : rien n'est sûr, regardez la liste avant de réessayer." }
  }
}

const armes = new WeakMap() // bouton → { minuteur, libelle }

function armer(bouton, libelleConfirmation) {
  desarmer(bouton)
  const libelle = bouton.textContent
  const minuteur = setTimeout(() => desarmer(bouton), DELAI_ARMEMENT)
  armes.set(bouton, { minuteur, libelle })
  bouton.textContent = libelleConfirmation
  bouton.dataset.arme = 'oui'
}

function desarmer(bouton) {
  const etat = armes.get(bouton)
  if (!etat) return
  clearTimeout(etat.minuteur)
  bouton.textContent = etat.libelle
  delete bouton.dataset.arme
  armes.delete(bouton)
}

function zoneMessage(element) {
  const zone = element.closest('[data-embarquer-zone]') || element.parentElement
  return zone ? zone.querySelector('.bo-embarquer-msg') : null
}

function dire(element, texte, erreur) {
  const zone = zoneMessage(element)
  if (!zone) return
  zone.textContent = texte
  zone.classList.toggle('bo-erreur', Boolean(erreur))
}

const branches = new WeakMap() // racine → { apres }

/**
 * Branche (une fois) les écouteurs sur `racine` et enregistre ce qu'il faut
 * faire après un embarquement réussi — rappelé à chaque rendu, pour que la
 * dernière page montée soit celle qui se redessine.
 *
 * Boutons : `[data-embarquer="adresse"]`. Formulaire : `form[data-embarquer-form]`
 * avec un champ `input[name=email]` et un bouton `button[type=submit]`.
 * `apres({ email, docId })` est appelé après un succès.
 */
export function brancherEmbarquement(racine, apres) {
  const deja = branches.get(racine)
  if (deja) {
    deja.apres = apres
    return
  }
  const etat = { apres }
  branches.set(racine, etat)

  async function agir(bouton, email) {
    desarmer(bouton)
    bouton.disabled = true
    dire(bouton, 'Envoi en cours…', false)
    const r = await embarquer(email)
    if (r.ok) {
      await etat.apres({ email, docId: r.docId })
      return
    }
    bouton.disabled = false
    dire(bouton, r.message, true)
  }

  racine.addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-embarquer]')
    if (!bouton || bouton.disabled) return
    const email = bouton.dataset.embarquer
    if (bouton.dataset.arme !== 'oui') {
      armer(bouton, 'Confirmer ?')
      dire(bouton, `Créer le document et envoyer l'invitation à ${email}.`, false)
      return
    }
    agir(bouton, email)
  })

  racine.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-embarquer-form]')
    if (!form) return
    e.preventDefault()
    const champ = form.querySelector('input[name=email]')
    const bouton = form.querySelector('button[type=submit]')
    if (!champ || !bouton || bouton.disabled) return
    const email = champ.value.trim()
    if (!email || !champ.checkValidity()) {
      dire(bouton, 'Saisissez une adresse valide.', true)
      return
    }
    if (bouton.dataset.arme !== 'oui') {
      armer(bouton, "Confirmer l'envoi")
      dire(bouton, `Créer le document et envoyer l'invitation à ${email}.`, false)
      return
    }
    agir(bouton, email)
  })

  // Changer l'adresse après avoir armé le bouton annule l'armement : la
  // confirmation portait sur l'ancienne adresse, pas sur la nouvelle.
  racine.addEventListener('input', (e) => {
    const champ = e.target.closest && e.target.closest('form[data-embarquer-form] input[name=email]')
    if (!champ) return
    const bouton = champ.form.querySelector('button[type=submit]')
    if (bouton && bouton.dataset.arme === 'oui') {
      desarmer(bouton)
      dire(bouton, '', false)
    }
  })
}
