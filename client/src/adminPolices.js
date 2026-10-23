// Les polices de l'instance, au back-office (24/10/2026) : déposer un fichier
// TrueType ou OpenType, voir ce que le serveur en a lu (famille, styles,
// licence), supprimer une famille. Voir server/polices.js pour les règles.
//
// Un fichier par requête (octets bruts). Une famille se dépose en choisissant
// plusieurs fichiers d'un coup : on les envoie l'un après l'autre et l'on
// affiche un compte rendu par fichier. La suppression se fait en deux clics.
//
// Un seul écouteur par racine : la page est redessinée d'un bloc.

import { armer, desarmer } from './embarquement.js'
import { esc, nombre, octets } from './adminCommun.js'
import { assurerPolices, rechargerPolices } from './polices.js'

/** Le bloc, dans son état de départ : la liste se remplit dès la page affichée. */
export function blocPolices() {
  return `<h2>Polices</h2>
    <p class="bo-note">Les polices de base sont celles du serveur. Celles que vous déposez ici
    servent <strong>au PDF</strong> (composé avec le fichier lui-même), <strong>à l'écran</strong> et,
    par leur nom, à Word — le destinataire doit l'avoir installée pour la voir dans Word. Fichiers
    <code>.ttf</code> ou <code>.otf</code> (pas de WOFF, pas de police variable) ; vous devez en avoir
    le droit : les polices sous licence libre (OFL) s'y prêtent. Une famille se dépose en
    sélectionnant ses fichiers (normal, gras, italique…) ensemble.</p>
    <div data-polices>
      <div data-polices-liste><p class="bo-note">Chargement…</p></div>
      <p><label class="bo-action">Déposer des polices…
        <input type="file" data-polices-fichier accept=".ttf,.otf,font/ttf,font/otf" multiple hidden></label>
        <span class="bo-note" data-polices-msg role="status"></span></p>
    </div>`
}

const STYLES = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
}
const nomStyle = (f) => `${STYLES[f.poids] || f.poids}${f.italique ? ' italique' : ''}`

const court = (t) => (t.length > 110 ? `${t.slice(0, 110).trimEnd()}…` : t)

function liste(d) {
  if (!d.polices.length) {
    return `<p class="bo-note">Aucune police déposée : seules les polices de base sont proposées.</p>`
  }
  const lignes = d.polices
    .map(
      (p) => `<tr>
        <td><strong style="font-family:'${esc(p.famille)}', ${esc(p.generique)}">${esc(p.famille)}</strong></td>
        <td>${p.fichiers.map((f) => esc(nomStyle(f))).join(', ')}</td>
        <td>${octets(p.fichiers.reduce((s, f) => s + f.octets, 0))}</td>
        <td class="bo-note" title="${esc(p.licence || '')}">${esc(court(p.licence || 'licence non indiquée dans le fichier'))}</td>
        <td><button type="button" class="bo-action" data-police-supprimer="${esc(p.id)}">Supprimer</button></td>
      </tr>`
    )
    .join('')
  return `<table class="bo-table"><thead><tr><th>Famille</th><th>Styles</th><th>Poids</th><th>Licence</th><th></th></tr></thead>
    <tbody>${lignes}</tbody></table>
    <p class="bo-note">${nombre(d.polices.length)} famille(s) sur ${nombre(d.familles)} au plus, ${octets(d.octets)} sur ${octets(
      d.octetsMax
    )}. Un document dont la police est supprimée retombe sur la police de base.</p>`
}

/** Remplit la liste du bloc (si la page l'affiche). Ne lève jamais. */
export async function remplirPolices(racine) {
  await assurerPolices()
  const zone = racine.querySelector('[data-polices-liste]')
  if (!zone) return
  try {
    const res = await fetch('/api/admin/polices')
    if (!res.ok) throw new Error()
    zone.innerHTML = liste(await res.json())
  } catch {
    zone.innerHTML = '<p class="bo-note bo-erreur">La liste des polices n’a pas pu être chargée.</p>'
  }
}

const branches = new WeakSet()

/** Branche (une fois) le bloc de `racine`, et remplit la liste. */
export function brancherPolices(racine) {
  remplirPolices(racine)
  if (branches.has(racine)) return
  branches.add(racine)

  racine.addEventListener('change', async (e) => {
    const champ = e.target.closest('input[data-polices-fichier]')
    const bloc = champ && champ.closest('[data-polices]')
    if (!bloc || !champ.files || !champ.files.length) return
    const message = bloc.querySelector('[data-polices-msg]')
    const fichiers = [...champ.files]
    champ.value = ''
    const comptes = []
    let erreurs = 0
    for (const [i, fichier] of fichiers.entries()) {
      message.classList.remove('bo-erreur')
      message.textContent = `Envoi ${i + 1}/${fichiers.length} : ${fichier.name}…`
      try {
        const res = await fetch('/api/admin/polices', {
          method: 'POST',
          headers: { 'content-type': 'application/octet-stream' },
          body: fichier,
        })
        const donnees = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(donnees.error || `refusé (${res.status})`)
        comptes.push(
          `${fichier.name} : ${donnees.police.famille} ${nomStyle(donnees.fichier)}${donnees.remplace ? ' (remplace)' : ''}`
        )
      } catch (err) {
        erreurs++
        comptes.push(`${fichier.name} : ${err.message || 'échec'}`)
      }
    }
    message.classList.toggle('bo-erreur', erreurs > 0)
    message.textContent = comptes.join(' — ')
    await rechargerPolices()
    await remplirPolices(racine)
  })

  racine.addEventListener('click', async (e) => {
    const bouton = e.target.closest('button[data-police-supprimer]')
    const bloc = bouton && bouton.closest('[data-polices]')
    if (!bloc || bouton.disabled) return
    const message = bloc.querySelector('[data-polices-msg]')
    if (bouton.dataset.arme !== 'oui') {
      armer(bouton, 'Confirmer ?')
      message.classList.remove('bo-erreur')
      message.textContent = 'Les documents qui l’utilisent retomberont sur la police de base.'
      return
    }
    desarmer(bouton)
    bouton.disabled = true
    try {
      const res = await fetch(`/api/admin/polices/${encodeURIComponent(bouton.dataset.policeSupprimer)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `refusé (${res.status})`)
      message.textContent = ''
      await rechargerPolices()
      await remplirPolices(racine)
    } catch (err) {
      bouton.disabled = false
      message.classList.add('bo-erreur')
      message.textContent = err.message || 'La suppression a échoué.'
    }
  })
}
