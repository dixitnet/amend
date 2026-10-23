// Les images orphelines, au back-office (23/10/2026) : celles que plus rien ne
// référence — ni le texte, ni une version enregistrée, ni une page publiée
// (voir server/imagesOrphelines.js pour ce que « référencer » veut dire).
//
// L'analyse lit tous les journaux : elle ne se lance pas avec la page, mais sur
// demande. La suppression est définitive et se fait en deux clics, comme
// l'embarquement ; elle refait l'analyse côté serveur avant d'agir, donc ce qui
// est supprimé peut différer de ce qui s'affiche si un document a changé entre
// les deux (jamais dans le sens dangereux : un fichier devenu référencé est
// gardé).
//
// Un seul écouteur par racine : la page est redessinée d'un bloc.

import { armer, desarmer } from './embarquement.js'
import { esc, nombre, octets } from './adminCommun.js'

/** Le bloc, dans son état de départ. */
export function blocImagesOrphelines() {
  return `<h2>Images orphelines</h2>
    <p class="bo-note">Une image supprimée du texte reste sur le disque, et compte dans la
    limite d'images de son propriétaire. Ce nettoyage retire celles que <strong>plus rien ne
    référence</strong> : ni le texte (y compris une suppression encore en attente de
    décision), ni une version enregistrée, ni une page publiée, ni un autre document. Une image
    de moins de sept jours n'est jamais retirée.</p>
    <div data-orphelines>
      <p><button type="button" class="bo-action" data-orph="analyser">Analyser</button>
      <span class="bo-note" data-orph-msg role="status"></span></p>
      <div data-orph-resultat></div>
    </div>`
}

function resultat(a) {
  if (a.illisibles && a.illisibles.length) {
    return `<p class="bo-note bo-erreur">Une source n'a pas pu être lue (${a.illisibles.length}) : par prudence, rien ne peut être supprimé tant que ce n'est pas réglé.</p>`
  }
  const resume = `${nombre(a.fichiers)} image(s) stockées (${octets(a.octets)}) ; <strong>${nombre(
    a.orphelines
  )} orpheline(s)</strong>${a.orphelines ? ` pesant ${octets(a.octetsOrphelines)}` : ''}.`
  if (!a.orphelines) return `<p class="bo-note">${resume} Rien à nettoyer.</p>`
  const lignes = a.documents
    .filter((d) => d.orphelines.length)
    .slice(0, 15)
    .map((d) => {
      const poids = d.orphelines.reduce((s, o) => s + o.octets, 0)
      const age = Math.max(...d.orphelines.map((o) => o.ageJours))
      return `<tr><td>${d.titre ? esc(d.titre) : `<em>document supprimé</em> (${esc(d.docId)})`}</td><td>${nombre(
        d.orphelines.length
      )}</td><td>${octets(poids)}</td><td>jusqu'à ${nombre(age)} j</td></tr>`
    })
    .join('')
  const plus = a.documents.filter((d) => d.orphelines.length).length - 15
  return `<p class="bo-note">${resume}</p>
    <table class="bo-table"><thead><tr><th>Document</th><th>Orphelines</th><th>Poids</th><th>Âge</th></tr></thead>
    <tbody>${lignes}</tbody></table>
    ${plus > 0 ? `<p class="bo-note">… et ${plus} autre(s) document(s).</p>` : ''}
    <p><button type="button" class="bo-action" data-orph="supprimer">Supprimer ces images</button></p>`
}

const branches = new WeakSet()

/** Branche (une fois) les boutons du bloc de `racine`. */
export function brancherImagesOrphelines(racine) {
  if (branches.has(racine)) return
  branches.add(racine)
  racine.addEventListener('click', async (e) => {
    const bouton = e.target.closest('button[data-orph]')
    const bloc = bouton && bouton.closest('[data-orphelines]')
    if (!bloc || bouton.disabled) return
    const message = bloc.querySelector('[data-orph-msg]')
    const zone = bloc.querySelector('[data-orph-resultat]')
    const dire = (texte, erreur = false) => {
      message.textContent = texte
      message.classList.toggle('bo-erreur', erreur)
    }

    if (bouton.dataset.orph === 'analyser') {
      bouton.disabled = true
      dire('Analyse en cours…')
      try {
        const res = await fetch('/api/admin/images-orphelines')
        if (!res.ok) throw new Error()
        zone.innerHTML = resultat(await res.json())
        dire('')
        bouton.textContent = 'Analyser de nouveau'
      } catch {
        dire("L'analyse a échoué.", true)
      }
      bouton.disabled = false
      return
    }

    // Supprimer : deux clics.
    if (bouton.dataset.arme !== 'oui') {
      armer(bouton, 'Confirmer la suppression ?')
      dire('Les fichiers seront effacés du disque, sans corbeille.')
      return
    }
    desarmer(bouton)
    bouton.disabled = true
    dire('Suppression…')
    try {
      const res = await fetch('/api/admin/images-orphelines', { method: 'POST' })
      const donnees = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(donnees.error || 'Refusé par le serveur.')
      zone.innerHTML = `<p class="bo-note">${nombre(donnees.supprimees)} image(s) supprimée(s), ${octets(
        donnees.octets
      )} libérés.${donnees.echecs ? ` ${donnees.echecs} n'ont pas pu l'être.` : ''}</p>`
      dire('')
    } catch (err) {
      bouton.disabled = false
      dire(err.message || 'La suppression a échoué.', true)
    }
  })
}
