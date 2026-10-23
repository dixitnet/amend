// Les invitations sans réponse, au back-office (23/10/2026) : les mêmes gestes
// que dans le panneau « Partager » d'un document — où en est le courrier,
// copier le lien, renvoyer — plus « supprimer ».
//
// Renvoyer écrit à quelqu'un, supprimer efface (pour un embarquement, le
// document de bienvenue avec) : ces deux gestes se font en deux clics, comme
// l'embarquement (le premier arme le bouton, le second agit). Copier le lien ne
// fait rien de définitif de plus que de rendre caduc l'ancien : un clic.
//
// Un seul écouteur par racine, comme embarquement.js : la page est redessinée
// d'un bloc après chaque action, et des écouteurs empilés agiraient plusieurs
// fois.

import { armer, desarmer } from './embarquement.js'
import { badgeCourrier, champLien, copierEnDiffere } from './invitationsPartage.js'
import { esc } from './adminCommun.js'

/** Le tableau des invitations sans réponse. `liste` vient de la vue d'ensemble
 * (`utilisateurs.invitationsEnAttente`) ; le badge du courrier se remplit après
 * coup (`chargerEtatsCourrier`), parce que le lire chez le fournisseur prend du
 * temps et ne doit pas retarder la page. */
export function tableInvitations(liste, { nbsp = ' ' } = {}) {
  if (!liste.length) return ''
  return `<h3>Invitations sans réponse</h3>
    <p class="bo-note">« Copier le lien » fabrique un nouveau lien à transmettre vous-même ; « Renvoyer » en fabrique un et réécrit à la personne. Dans les deux cas le lien du courrier déjà envoyé cesse de marcher. « Supprimer » retire l'invitation${' '}(et, pour une personne embarquée, son document de bienvenue, qui n'a jamais été ouvert).</p>
    <table class="bo-table bo-invitations">
      <thead><tr><th>Adresse</th><th>Invitation</th><th>Courrier</th><th></th></tr></thead>
      <tbody>${liste
        .map(
          (
            i
          ) => `<tr data-inv-doc="${esc(i.docId)}" data-inv-email="${esc(i.email)}" data-inv-bienvenue="${i.bienvenue ? 'oui' : ''}">
        <td>${esc(i.email)}</td>
        <td>${
          i.bienvenue ? 'document de bienvenue (embarquement)' : `${esc(i.role)} sur « ${esc(i.titre)} »`
        }${i.depuisJours !== null ? `, depuis ${i.depuisJours}${nbsp}j` : ''}${
          i.invitePar ? ` (invité·e par ${esc(i.invitePar)})` : ''
        }</td>
        <td data-inv-courrier></td>
        <td class="bo-inv-cellule">
          <div class="bo-inv-actions">
            <button type="button" class="bo-action" data-inv="copier">Copier le lien</button>
            <button type="button" class="bo-action" data-inv="renvoyer">Renvoyer</button>
            <button type="button" class="bo-action" data-inv="supprimer">Supprimer</button>
          </div>
          <span class="bo-inv-msg bo-note" role="status"></span>
        </td>
      </tr>`
        )
        .join('')}</tbody>
    </table>`
}

/** Remplit le badge « courrier remis / refusé / en cours » de chaque ligne.
 * Ne lève jamais : sans réponse, les cellules restent vides. */
export async function chargerEtatsCourrier(racine) {
  if (!racine.querySelector('[data-inv-courrier]')) return
  let etats
  try {
    const res = await fetch('/api/admin/invitations/courrier')
    if (!res.ok) return
    etats = (await res.json()).etats || {}
  } catch {
    return
  }
  for (const ligne of racine.querySelectorAll('tr[data-inv-doc]')) {
    const cellule = ligne.querySelector('[data-inv-courrier]')
    const badge = badgeCourrier(etats[`${ligne.dataset.invDoc}|${ligne.dataset.invEmail}`])
    if (cellule && badge) {
      cellule.textContent = ''
      cellule.append(badge)
    }
  }
}

async function appeler(methode, chemin, corps) {
  try {
    const res = await fetch(chemin, {
      method: methode,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps),
    })
    const donnees = await res.json().catch(() => ({}))
    if (res.ok) return { ok: true, ...donnees }
    return { ok: false, message: donnees.error || 'Refusé par le serveur.' }
  } catch {
    return { ok: false, message: "Le serveur n'a pas répondu : regardez la liste avant de réessayer." }
  }
}

const branches = new WeakMap() // racine → { apres }

/**
 * Branche (une fois) les boutons des lignes `tr[data-inv-doc]` de `racine`.
 * `apres(info)` redessine la page après un renvoi ou une suppression réussis ;
 * rappelé à chaque rendu pour que la dernière page montée soit celle qui se
 * redessine.
 */
export function brancherInvitations(racine, apres) {
  const deja = branches.get(racine)
  if (deja) {
    deja.apres = apres
    return
  }
  const etat = { apres }
  branches.set(racine, etat)

  racine.addEventListener('click', async (e) => {
    const bouton = e.target.closest('button[data-inv]')
    const ligne = bouton && bouton.closest('tr[data-inv-doc]')
    if (!ligne || bouton.disabled) return
    const { invDoc: docId, invEmail: email } = ligne.dataset
    const message = ligne.querySelector('.bo-inv-msg')
    const dire = (texte, erreur) => {
      message.textContent = texte
      message.classList.toggle('bo-erreur', Boolean(erreur))
      ligne.querySelector('.lien-copie')?.remove()
    }
    const geste = bouton.dataset.inv

    if (geste === 'copier') {
      bouton.disabled = true
      let r
      try {
        r = await copierEnDiffere(
          appeler('POST', '/api/admin/invitations/lien', { docId, email }).then((x) => {
            if (!x.ok) throw new Error(x.message)
            return x.lien
          })
        )
      } catch (err) {
        bouton.disabled = false
        dire(err.message, true)
        return
      }
      bouton.disabled = false
      if (r.copie) {
        dire('Lien copié. Celui du courrier déjà envoyé ne fonctionne plus.', false)
        return
      }
      dire('Copiez ce lien (celui du courrier déjà envoyé ne fonctionne plus) :', false)
      const champ = champLien(r.texte, `Lien d’invitation pour ${email}`)
      message.after(champ)
      champ.focus()
      champ.select()
      return
    }

    // Renvoyer et supprimer : deux clics.
    if (bouton.dataset.arme !== 'oui') {
      armer(bouton, 'Confirmer ?')
      dire(
        geste === 'renvoyer'
          ? `Écrire de nouveau à ${email} (l'ancien lien cessera de marcher).`
          : ligne.dataset.invBienvenue
            ? `Supprimer l'invitation et le document de bienvenue de ${email} ; l'adresse retournera dans la liste d'attente.`
            : `Supprimer l'invitation de ${email} : elle n'aura plus accès au document.`,
        false
      )
      return
    }
    desarmer(bouton)
    bouton.disabled = true
    dire(geste === 'renvoyer' ? 'Envoi en cours…' : 'Suppression…', false)
    const r =
      geste === 'renvoyer'
        ? await appeler('POST', '/api/admin/invitations/renvoyer', { docId, email })
        : await appeler('DELETE', '/api/admin/invitations', { docId, email })
    if (!r.ok) {
      bouton.disabled = false
      dire(r.message, true)
      return
    }
    await etat.apres(
      geste === 'renvoyer'
        ? `Invitation renvoyée à ${email}.`
        : r.remiseEnAttente
          ? `Invitation de ${email} supprimée ; l'adresse est de nouveau dans la liste d'attente.`
          : `Invitation de ${email} supprimée.`
    )
  })
}
