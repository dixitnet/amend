// Panneau « Partager » d'un document : invitations nominatives par email et
// liste des accès — réservé aux éditeurs (voir editor.js,
// server/server.js). Les liens partagés par rôle ont été retirés le
// 15/09/2026 : on invite désormais une adresse précise, qui reçoit un mail
// nommant le document, et son lien ouvre le document directement. Voir
// claude/conception-gestion-utilisateurs.md (projet Amend).

import { monterSectionClaude } from './claudeAccess.js'
import { equiperModale } from './modale.js'
import { libelleDuRole } from '../../shared/identite.js'

export function openAccessPanel(docId, { jeSuisProprietaire = false } = {}) {
  const overlay = document.createElement('div')
  overlay.className = 'name-modal-overlay'
  overlay.innerHTML = `
    <div class="name-modal access-modal">
      <h2>Partager ce document</h2>
      <p>Invitez une personne par son adresse email : elle recevra un lien qui ouvre ce document directement, valable 14 jours.</p>
      <form class="invite-form">
        <input type="email" name="email" autocomplete="off" required placeholder="personne@exemple.fr" aria-label="Adresse de la personne à inviter" />
        <select>
          <option value="editeur">Éditeur</option>
          <option value="correcteur">Correcteur</option>
          <option value="lecteur">Lecteur</option>
        </select>
        <button type="submit">Inviter</button>
      </form>
      <p class="invite-message" hidden></p>
      <h3>Accès</h3>
      <ul class="access-list"></ul>
      <div class="claude-mount"></div>
      <button type="button" class="close-btn">Fermer</button>
    </div>
  `
  document.body.appendChild(overlay)
  const fermer = equiperModale(overlay, { libelle: 'Partager le document' })
  overlay.querySelector('.close-btn').onclick = fermer

  const accessList = overlay.querySelector('.access-list')
  const form = overlay.querySelector('.invite-form')
  const emailInput = form.querySelector('input')
  const roleSelect = form.querySelector('select')
  const message = overlay.querySelector('.invite-message')

  function dire(texte, type) {
    message.textContent = texte
    message.className = `invite-message ${type}`
    message.hidden = false
  }

  function renderAccess(access) {
    accessList.innerHTML = ''
    if (access.length === 0) {
      const li = document.createElement('li')
      li.textContent = 'Personne pour le moment (à part vous).'
      accessList.appendChild(li)
      return
    }
    for (const entry of access) {
      const li = document.createElement('li')
      const label = document.createElement('span')
      label.textContent = entry.email
      li.appendChild(label)

      // Un seul badge par personne, comme dans « Mes documents » : la
      // propriété l'emporte sur le rôle, puisqu'un propriétaire est
      // éditeur de toute façon. Même forme, même couleur par rôle d'un
      // écran à l'autre.
      const cle = entry.proprietaire ? 'proprietaire' : entry.role
      const roleBadge = document.createElement('span')
      roleBadge.className = `role-badge role-${cle}`
      roleBadge.textContent = entry.proprietaire ? 'propriétaire' : libelleDuRole(entry.role)
      li.appendChild(roleBadge)

      // « En attente » = invitée, jamais venue. L'accès existe déjà côté
      // serveur ; ce badge dit seulement que la personne n'a pas encore
      // ouvert son lien, pour qu'un éditeur sache qui relancer.
      if (entry.status === 'invite') {
        const badge = document.createElement('span')
        badge.className = 'access-pending'
        badge.textContent = 'en attente'
        li.appendChild(badge)

        // Où en est le courrier (lu chez le fournisseur d'envoi par le
        // serveur) : « en attente » seul ne distingue pas « pas encore lue »
        // de « jamais arrivée ». Rien n'est affiché quand on ne sait pas.
        const courrier = courrierDe(entry.courrier)
        if (courrier) li.appendChild(courrier)

        const resend = document.createElement('button')
        resend.type = 'button'
        resend.textContent = 'Renvoyer'
        resend.onclick = async () => {
          resend.disabled = true
          const ok = await inviter(entry.email, entry.role)
          resend.disabled = false
          if (ok) dire(`Invitation renvoyée à ${entry.email}.`, 'ok')
        }
        li.appendChild(resend)

        // Le lien à transmettre soi-même (Signal, SMS, autre courrier) quand
        // le courrier n'arrive pas. Il n'est gardé nulle part en clair : on en
        // fabrique un nouveau, et celui du courrier cesse de marcher.
        const copier = document.createElement('button')
        copier.type = 'button'
        copier.className = 'copier-lien'
        copier.textContent = 'Copier le lien'
        copier.title =
          'Fabrique un nouveau lien à transmettre vous-même. Le lien du courrier déjà envoyé cessera de fonctionner.'
        copier.onclick = async () => {
          copier.disabled = true
          await copierLien(entry.email)
          copier.disabled = false
        }
        li.appendChild(copier)
      }

      // Le propriétaire n'est ni retirable ni rétrogradable : le document
      // deviendrait orphelin — plus personne pour le porter, ni pour le
      // supprimer. Le serveur refuse de toute façon ; le bouton est absent
      // pour ne pas proposer un geste qui échouera.
      if (!entry.proprietaire) {
        const removeBtn = document.createElement('button')
        removeBtn.type = 'button'
        removeBtn.textContent = entry.status === 'invite' ? 'Annuler' : 'Retirer'
        removeBtn.onclick = async () => {
          removeBtn.disabled = true
          await fetch(`/api/docs/${docId}/access/${encodeURIComponent(entry.email)}`, { method: 'DELETE' })
          load()
        }
        li.appendChild(removeBtn)

        // Transmettre le document — droit exclusif du propriétaire, et
        // seule façon pour lui de s'en défaire. À deux clics : ça ne se
        // reprend pas tout seul.
        if (jeSuisProprietaire && entry.status !== 'invite') {
          const passer = document.createElement('button')
          passer.type = 'button'
          passer.className = 'btn-texte'
          passer.textContent = 'Transmettre'
          passer.title = `Faire de ${entry.email} le propriétaire de ce document`
          let minuteur = null
          passer.onclick = async () => {
            if (!minuteur) {
              passer.textContent = 'Confirmer ?'
              minuteur = setTimeout(() => {
                minuteur = null
                passer.textContent = 'Transmettre'
              }, 3000)
              return
            }
            clearTimeout(minuteur)
            minuteur = null
            passer.disabled = true
            const res = await fetch(`/api/docs/${docId}/owner`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ email: entry.email }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
              passer.disabled = false
              passer.textContent = 'Transmettre'
              dire(data.error || 'le transfert a échoué', 'erreur')
              return
            }
            dire(`${entry.email} porte désormais ce document.`, 'ok')
            // On ne l'est plus : recharger la page remet toute l'interface
            // (bouton Supprimer, droits) d'accord avec la réalité.
            location.reload()
          }
          li.appendChild(passer)
        }
      }
      accessList.appendChild(li)
    }
  }

  const LIBELLES_COURRIER = { remis: 'courrier remis', refuse: 'courrier refusé', en_cours: 'envoi en cours' }
  const AIDES_COURRIER = {
    remis:
      'Le serveur de messagerie de la personne a accepté le courrier. S’il n’arrive pas, il est sans doute dans ses indésirables ou en quarantaine : copiez le lien pour le lui transmettre autrement.',
    refuse: 'Le serveur de la personne a refusé le courrier. Copiez le lien pour le lui transmettre autrement.',
    en_cours: 'Le courrier est parti ; le serveur de la personne ne l’a pas encore accepté.',
  }

  /** Le badge « courrier remis / refusé / en cours », ou rien. */
  function courrierDe(c) {
    if (!c || !LIBELLES_COURRIER[c.etat]) return null
    const badge = document.createElement('span')
    badge.className = `access-courrier courrier-${c.etat}`
    badge.textContent = LIBELLES_COURRIER[c.etat]
    badge.title = AIDES_COURRIER[c.etat]
    if (!c.detail) return badge
    const bloc = document.createDocumentFragment()
    const detail = document.createElement('span')
    detail.className = 'access-courrier-detail'
    detail.textContent = c.detail
    bloc.append(badge, detail)
    return bloc
  }

  /** Obtient un nouveau lien pour l'invitation en attente de `email` et le met
   * dans le presse-papiers. Le presse-papiers n'accepte une écriture qu'en
   * réponse à un geste : on lui passe donc une promesse (Chrome, Safari) plutôt
   * que d'attendre la réponse du serveur. S'il refuse, le lien est montré dans
   * un champ à copier à la main. */
  async function copierLien(email) {
    const obtenir = async () => {
      const res = await fetch(`/api/docs/${docId}/invitations/lien`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.lien) throw new Error(data.error || 'le lien n’a pas pu être créé')
      return data.lien
    }
    const promesse = obtenir()
    promesse.catch(() => {})
    const presse = navigator.clipboard
    try {
      if (presse && typeof ClipboardItem !== 'undefined' && presse.write) {
        await presse.write([
          new ClipboardItem({ 'text/plain': promesse.then((l) => new Blob([l], { type: 'text/plain' })) }),
        ])
      } else {
        await presse.writeText(await promesse)
      }
      await promesse
      retirerLienAffiche()
      dire(`Lien copié pour ${email}. Celui du courrier déjà envoyé ne fonctionne plus.`, 'ok')
    } catch {
      let lien
      try {
        lien = await promesse
      } catch (err) {
        dire(err.message, 'erreur')
        return
      }
      afficherLien(email, lien)
    }
  }

  function retirerLienAffiche() {
    overlay.querySelector('.lien-copie')?.remove()
  }

  /** Repli quand le presse-papiers est inaccessible : le lien dans un champ,
   * déjà sélectionné. */
  function afficherLien(email, lien) {
    retirerLienAffiche()
    dire(`Copiez ce lien pour ${email} (celui du courrier déjà envoyé ne fonctionne plus) :`, 'ok')
    const champ = document.createElement('input')
    champ.type = 'text'
    champ.readOnly = true
    champ.className = 'lien-copie'
    champ.value = lien
    champ.setAttribute('aria-label', `Lien d’invitation pour ${email}`)
    message.after(champ)
    champ.focus()
    champ.select()
  }

  async function inviter(email, role) {
    const res = await fetch(`/api/docs/${docId}/invitations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, role }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      dire(data.error || "l'invitation n'a pas pu être envoyée", 'erreur')
      return false
    }
    await load()
    return true
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = form.querySelector('button')
    btn.disabled = true
    const email = emailInput.value.trim()
    const ok = await inviter(email, roleSelect.value)
    btn.disabled = false
    if (ok) {
      dire(`Invitation envoyée à ${email}.`, 'ok')
      emailInput.value = ''
    }
  })

  async function load() {
    const res = await fetch(`/api/docs/${docId}/access`)
    if (!res.ok) return
    const data = await res.json()
    renderAccess(data.access)
  }

  // Inviter Claude (30/09/2026) : une section à part, qui ne se montre que
  // s'il y a quelque chose à y faire.
  monterSectionClaude(overlay.querySelector('.claude-mount'), docId)

  load()
}
