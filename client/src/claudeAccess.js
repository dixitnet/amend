// La section « Claude » du panneau Gérer les accès (30/09/2026, voir
// claude/etude-inviter-claude.md, marche 3).
//
// Inviter Claude, c'est créer une **adresse de connecteur** propre à ce
// document. Cette adresse est un mot de passe : le serveur ne la rend qu'à
// la création et à la régénération, n'en garde que l'empreinte, et cette
// section ne la garde que le temps que le panneau reste ouvert — jamais
// dans le stockage du navigateur. La liste, elle, dit qui a invité, jusqu'à
// quand, et quand l'adresse a servi pour la dernière fois : un usage
// inattendu se voit.
//
// Qui peut créer vient du serveur (`CLAUDE_AGENT`, les admins pendant la
// phase de test) : cette section ne devine rien, elle affiche ce que la
// route lui dit (`autorise`). Retirer une invitation reste ouvert à tous
// ceux qui gèrent les accès.

const LIBELLES_ROLE = { correcteur: 'correcteur', lecteur: 'lecteur' }
const DUREES = [
  [1, '24 heures'],
  [7, '7 jours'],
  [30, '30 jours'],
]

const MINUTE = 60_000
const HEURE = 60 * MINUTE
const JOUR = 24 * HEURE

/** « expire le 6 octobre », « expire demain à 14 h 30 », « expirée ». */
export function formaterEcheance(ts, maintenant = Date.now()) {
  if (ts <= maintenant) return 'expirée'
  const reste = ts - maintenant
  const d = new Date(ts)
  if (reste < JOUR) {
    const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    return `expire ${d.getDate() === new Date(maintenant).getDate() ? '' : 'demain '}à ${heure}`
  }
  return `expire le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
}

/** « jamais utilisée », « utilisée à l’instant », « utilisée il y a 3 h ». */
export function formaterUsage(ts, maintenant = Date.now()) {
  if (!ts) return 'jamais utilisée'
  const ecart = Math.max(0, maintenant - ts)
  if (ecart < 2 * MINUTE) return 'utilisée à l’instant'
  if (ecart < HEURE) return `utilisée il y a ${Math.round(ecart / MINUTE)} min`
  if (ecart < JOUR) return `utilisée il y a ${Math.round(ecart / HEURE)} h`
  return `utilisée il y a ${Math.round(ecart / JOUR)} j`
}

/**
 * Monte la section dans `parent`. Elle reste cachée tant qu'elle n'a rien
 * à dire : ni invitation, ni droit d'en créer.
 */
export function monterSectionClaude(parent, docId, { maintenant = () => Date.now() } = {}) {
  const section = document.createElement('section')
  section.className = 'claude-section'
  section.hidden = true
  section.innerHTML = `
    <h3>Claude</h3>
    <p class="claude-aide">Claude lit ce document et propose des corrections en suivi de modifications, depuis une conversation avec vous : c’est vous qui acceptez ou refusez. Le texte du document est transmis à cette conversation.</p>
    <form class="invite-form claude-form">
      <select class="claude-role" aria-label="Rôle de Claude">
        <option value="correcteur">Correcteur</option>
        <option value="lecteur">Lecteur</option>
      </select>
      <select class="claude-duree" aria-label="Durée de l’invitation"></select>
      <button type="submit">Inviter Claude</button>
    </form>
    <p class="invite-message claude-message" hidden></p>
    <div class="claude-adresse" hidden>
      <p class="claude-adresse-titre"></p>
      <div class="claude-adresse-champ">
        <input type="text" readonly spellcheck="false" autocomplete="off" aria-label="Adresse du connecteur" />
        <button type="button" class="claude-copier">Copier</button>
      </div>
      <p class="claude-adresse-alerte">Cette adresse est un mot de passe : quiconque la connaît lit ce document tant qu’elle est valable. Ne la partagez pas ; en cas de doute, révoquez-la ou régénérez-la.</p>
      <details class="claude-mode-emploi">
        <summary>Comment l’ajouter à Claude</summary>
        <p>Dans l’application Claude : dans les connecteurs, « Ajouter un connecteur personnalisé », donnez-lui un nom, collez l’adresse, laissez les champs d’authentification vides. Ouvrez ensuite une nouvelle conversation et activez le connecteur.</p>
        <p>Dans Claude Code : <code>claude mcp add --transport http un-nom adresse</code>.</p>
      </details>
    </div>
    <ul class="access-list claude-list"></ul>
  `
  parent.appendChild(section)

  const form = section.querySelector('.claude-form')
  const roleSelect = section.querySelector('.claude-role')
  const dureeSelect = section.querySelector('.claude-duree')
  const message = section.querySelector('.claude-message')
  const boite = section.querySelector('.claude-adresse')
  const titreAdresse = section.querySelector('.claude-adresse-titre')
  const champAdresse = section.querySelector('.claude-adresse-champ input')
  const boutonCopier = section.querySelector('.claude-copier')
  const liste = section.querySelector('.claude-list')

  for (const [jours, libelle] of DUREES) {
    const o = document.createElement('option')
    o.value = String(jours)
    o.textContent = libelle
    if (jours === 7) o.selected = true
    dureeSelect.appendChild(o)
  }

  let etat = { autorise: false, agents: [] }
  /** L'invitation dont l'adresse est affichée, s'il y en a une. */
  let idAdresse = null

  function dire(texte, type) {
    message.textContent = texte
    message.className = `invite-message claude-message ${type}`
    message.hidden = !texte
  }

  async function appeler(chemin, methode = 'GET', corps) {
    const options = { method: methode }
    if (corps) {
      options.headers = { 'content-type': 'application/json' }
      options.body = JSON.stringify(corps)
    }
    const res = await fetch(`/api/docs/${docId}/agents${chemin}`, options)
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, data }
  }

  function montrerAdresse(id, adresse, titre) {
    idAdresse = id
    champAdresse.value = adresse
    titreAdresse.textContent = titre
    boutonCopier.textContent = 'Copier'
    boite.hidden = false
  }

  function cacherAdresse() {
    idAdresse = null
    champAdresse.value = ''
    boite.hidden = true
  }

  boutonCopier.onclick = async () => {
    let ok = false
    try {
      await navigator.clipboard.writeText(champAdresse.value)
      ok = true
    } catch {
      champAdresse.select()
      try {
        ok = document.execCommand('copy')
      } catch {}
    }
    boutonCopier.textContent = ok ? 'Copiée' : 'Sélectionnée : Ctrl+C'
  }
  champAdresse.addEventListener('focus', () => champAdresse.select())

  /** Deux clics à trois secondes d'écart : ce qui coupe l'accès de Claude,
   * ou change son adresse, ne doit pas partir d'un geste distrait. */
  function avecConfirmation(bouton, libelle, action) {
    let minuteur = null
    bouton.textContent = libelle
    bouton.onclick = async () => {
      if (!minuteur) {
        bouton.textContent = 'Confirmer ?'
        minuteur = setTimeout(() => {
          minuteur = null
          bouton.textContent = libelle
        }, 3000)
        return
      }
      clearTimeout(minuteur)
      minuteur = null
      bouton.disabled = true
      await action()
    }
  }

  function ligne(agent) {
    const li = document.createElement('li')
    li.className = 'claude-ligne'
    const nom = document.createElement('span')
    nom.textContent = agent.nom
    const badge = document.createElement('span')
    badge.className = `role-badge role-${agent.role}`
    badge.textContent = LIBELLES_ROLE[agent.role] || agent.role
    nom.appendChild(badge)
    if (agent.etat === 'expirée') {
      const expiree = document.createElement('span')
      expiree.className = 'access-pending'
      expiree.textContent = 'expirée'
      nom.appendChild(expiree)
    }
    li.appendChild(nom)

    if (etat.autorise) {
      const prolonger = document.createElement('button')
      prolonger.type = 'button'
      prolonger.className = 'claude-prolonger'
      prolonger.textContent = 'Prolonger'
      prolonger.title = 'Repart d’aujourd’hui, pour la durée choisie plus haut ; l’adresse ne change pas'
      prolonger.onclick = async () => {
        prolonger.disabled = true
        const r = await appeler(`/${agent.id}/prolonger`, 'POST', { jours: Number(dureeSelect.value) })
        if (!r.ok) dire(r.data.error || 'la prolongation a échoué', 'erreur')
        else dire('Invitation prolongée. Son adresse n’a pas changé.', 'ok')
        await charger()
      }
      li.appendChild(prolonger)

      const regenerer = document.createElement('button')
      regenerer.type = 'button'
      regenerer.className = 'claude-regenerer'
      regenerer.title = 'Nouvelle adresse ; l’ancienne cesse de marcher tout de suite'
      avecConfirmation(regenerer, 'Régénérer', async () => {
        const r = await appeler(`/${agent.id}/regenerer`, 'POST', { jours: Number(dureeSelect.value) })
        if (!r.ok) {
          dire(r.data.error || 'la régénération a échoué', 'erreur')
        } else {
          dire('', 'ok')
          montrerAdresse(r.data.id, r.data.adresse, 'Nouvelle adresse — l’ancienne ne marche plus. Copiez-la maintenant : elle ne sera plus affichée.')
        }
        await charger()
      })
      li.appendChild(regenerer)
    }

    const revoquer = document.createElement('button')
    revoquer.type = 'button'
    revoquer.className = 'claude-revoquer'
    revoquer.title = 'Coupe l’accès de Claude à ce document, tout de suite'
    avecConfirmation(revoquer, 'Révoquer', async () => {
      const r = await appeler(`/${agent.id}`, 'DELETE')
      if (!r.ok) dire(r.data.error || 'la révocation a échoué', 'erreur')
      else {
        if (idAdresse === agent.id) cacherAdresse()
        dire('Accès de Claude retiré.', 'ok')
      }
      await charger()
    })
    li.appendChild(revoquer)

    const detail = document.createElement('p')
    detail.className = 'claude-detail'
    const invite = agent.par ? `invité par ${agent.par} · ` : ''
    detail.textContent = `${invite}${formaterEcheance(agent.expiresAt, maintenant())} · ${formaterUsage(agent.dernierUsage, maintenant())}`
    li.appendChild(detail)
    return li
  }

  function rendre() {
    section.hidden = !(etat.autorise || etat.agents.length)
    form.hidden = !etat.autorise
    liste.innerHTML = ''
    for (const agent of etat.agents) liste.appendChild(ligne(agent))
    // L'adresse montrée disparaît si son invitation n'existe plus.
    if (idAdresse && !etat.agents.some((a) => a.id === idAdresse)) cacherAdresse()
  }

  async function charger() {
    const r = await appeler('')
    if (!r.ok) {
      section.hidden = true
      return
    }
    etat = { autorise: !!r.data.autorise, agents: r.data.agents || [] }
    rendre()
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const bouton = form.querySelector('button')
    bouton.disabled = true
    const r = await appeler('', 'POST', { role: roleSelect.value, jours: Number(dureeSelect.value) })
    bouton.disabled = false
    if (!r.ok) {
      dire(r.data.error || 'l’invitation a échoué', 'erreur')
      return
    }
    dire('', 'ok')
    montrerAdresse(r.data.id, r.data.adresse, 'Invitation créée. Copiez l’adresse maintenant : elle ne sera plus affichée.')
    await charger()
  })

  charger()
  return { recharger: charger, section }
}
