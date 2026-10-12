// Supprimer son compte (13/10/2026, point 7 de la feuille de route).
//
// La fenêtre commence par **dire ce qui va se passer** — ce que le serveur
// calcule sans rien toucher (GET /api/auth/compte/suppression) : les documents
// qui disparaissent, ceux qui passent à quelqu'un d'autre, ceux qu'on quitte.
// Elle ne laisse pas faire quand un document ne peut pas être confié sans
// décider à la place de quelqu'un (il n'y a que des lecteurs ou des
// correcteurs) : le serveur refuserait de toute façon, mieux vaut le dire
// avant. Et le geste exige l'adresse en toutes lettres.
//
// Les titres de documents viennent des autres : ils sont posés avec
// `textContent`, jamais comme du HTML.

import { equiperModale } from './modale.js'

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`

/** Une section « titre + liste de documents », ou rien s'il n'y en a pas. */
function section(titre, documents, ligne = (d) => d.title || 'Sans titre') {
  if (!documents.length) return null
  const bloc = document.createElement('div')
  bloc.className = 'suppression-section'
  const t = document.createElement('p')
  t.className = 'suppression-section-titre'
  t.textContent = titre
  const ul = document.createElement('ul')
  for (const d of documents.slice(0, 8)) {
    const li = document.createElement('li')
    li.textContent = ligne(d)
    ul.appendChild(li)
  }
  if (documents.length > 8) {
    const li = document.createElement('li')
    li.textContent = `… et ${documents.length - 8} autre${documents.length - 8 > 1 ? 's' : ''}`
    ul.appendChild(li)
  }
  bloc.append(t, ul)
  return bloc
}

/**
 * Ouvre la fenêtre. Renvoie une promesse : `true` si le compte est supprimé,
 * `false` si la personne a renoncé (ou si l'aperçu n'a pas pu être lu).
 * `apres()` est appelé une fois le compte supprimé ; par défaut, retour à
 * l'accueil.
 */
export function ouvrirSuppressionDeCompte({ apres } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'name-modal-overlay'
    overlay.innerHTML = `
      <form class="name-modal suppression-modal">
        <h2>Supprimer mon compte</h2>
        <div class="suppression-corps"><p class="suppression-chargement">Un instant…</p></div>
        <label class="suppression-confirmation" hidden>
          <span class="suppression-consigne"></span>
          <input type="text" autocomplete="off" spellcheck="false" />
        </label>
        <p class="name-modal-erreur" role="alert" hidden></p>
        <div class="name-modal-actions">
          <button type="button" class="name-modal-annuler">Annuler</button>
          <button type="submit" class="name-modal-ok suppression-ok" disabled>Supprimer définitivement</button>
        </div>
      </form>
    `
    const form = overlay.querySelector('form')
    const corps = overlay.querySelector('.suppression-corps')
    const confirmation = overlay.querySelector('.suppression-confirmation')
    const consigne = overlay.querySelector('.suppression-consigne')
    const champ = confirmation.querySelector('input')
    const erreur = overlay.querySelector('.name-modal-erreur')
    const ok = overlay.querySelector('.suppression-ok')
    let email = ''
    let possible = false
    let enCours = false

    let fini = false
    const fermerModale = equiperModale(overlay, {
      clic: false,
      surFermeture: () => {
        if (!fini) {
          fini = true
          resolve(false)
        }
      },
    })
    overlay.querySelector('.name-modal-annuler').onclick = () => {
      if (!enCours) fermerModale()
    }
    const dire = (texte) => {
      erreur.textContent = texte
      erreur.hidden = !texte
    }
    const majBouton = () => {
      ok.disabled = enCours || !possible || champ.value.trim().toLowerCase() !== email.toLowerCase()
    }
    champ.addEventListener('input', majBouton)

    function afficher(apercu) {
      email = String(apercu.email || '')
      possible = !!apercu.possible
      corps.textContent = ''
      const intro = document.createElement('p')
      intro.textContent =
        'Votre nom, votre couleur, vos réglages et vos modèles personnels sont effacés, vos connexions fermées. Cette action est définitive.'
      corps.appendChild(intro)

      if (apercu.bloquants.length) {
        const bloc = section(
          'Ces documents sont à vous, et seuls des lecteurs ou des correcteurs y ont accès. Confiez-les à un éditeur (menu « Partager »), ou supprimez-les, puis revenez ici :',
          apercu.bloquants
        )
        bloc.classList.add('suppression-bloquants')
        corps.appendChild(bloc)
      }
      const blocs = [
        section('Seront supprimés, parce que vous seul·e y travaillez :', apercu.supprimes, (d) =>
          d.corbeille ? `${d.title || 'Sans titre'} (dans la corbeille)` : d.title || 'Sans titre'
        ),
        section(
          'Seront confiés à un autre éditeur :',
          apercu.transferes,
          (d) => `${d.title || 'Sans titre'} → ${d.versNom || d.vers}`
        ),
        section('Vous les quitterez, ils restent aux autres :', apercu.quittes),
      ]
      for (const b of blocs) if (b) corps.appendChild(b)

      const notes = []
      if (apercu.agents)
        notes.push(
          `${pluriel(apercu.agents, 'invitation de Claude sera révoquée', 'invitations de Claude seront révoquées')}`
        )
      if (apercu.modeles)
        notes.push(
          `${pluriel(apercu.modeles, 'modèle de mise en page personnel sera supprimé', 'modèles de mise en page personnels seront supprimés')}`
        )
      if (notes.length) {
        const p = document.createElement('p')
        p.textContent = `${notes.join(' ; ')}.`
        corps.appendChild(p)
      }
      const garde = document.createElement('p')
      garde.className = 'suppression-garde'
      garde.textContent =
        'Dans les documents qui restent, vos commentaires et vos modifications en attente restent lisibles mais signés « Compte supprimé ». Les modifications déjà acceptées font désormais partie du texte, et les anciennes versions ou sauvegardes gardent l’état d’alors.'
      corps.appendChild(garde)

      if (possible) {
        consigne.textContent = `Pour confirmer, saisissez votre adresse (${email}) :`
        confirmation.hidden = false
        champ.focus()
      }
      majBouton()
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (ok.disabled) return
      enCours = true
      majBouton()
      dire('')
      try {
        const res = await fetch('/api/auth/compte/supprimer', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ confirmation: champ.value.trim() }),
        })
        const reponse = await res.json().catch(() => ({}))
        if (!res.ok) {
          enCours = false
          majBouton()
          dire(reponse && reponse.error ? `${reponse.error}.` : 'Le compte n’a pas pu être supprimé. Réessayez.')
          return
        }
        fini = true
        fermerModale()
        resolve(true)
        if (apres) apres(reponse)
        else {
          location.hash = '#/'
          location.reload()
        }
      } catch {
        enCours = false
        majBouton()
        dire('Le compte n’a pas pu être supprimé (connexion ?). Réessayez.')
      }
    })

    document.body.appendChild(overlay)
    fetch('/api/auth/compte/suppression')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        afficher(await res.json())
      })
      .catch(() => {
        corps.textContent = ''
        const p = document.createElement('p')
        p.textContent =
          'Impossible de savoir ce que deviendraient vos documents pour le moment. Réessayez dans un instant.'
        corps.appendChild(p)
      })
  })
}
