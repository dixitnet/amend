// Page « Versions » d'un document (11/10/2026, claude/conception-compactage-versions.md).
//
// Ce qu'on y fait : voir les états que le serveur a gardés (ceux qu'on a
// nommés, et ceux qu'il garde seul), nommer l'état actuel, **comparer** deux
// états paragraphe par paragraphe et mot à mot, et **restaurer** une version.
//
// Restaurer ne revient pas en arrière : le serveur propose, en suivi de
// modifications, les changements qui ramènent le texte à cette version. Les
// personnes qui travaillent dans le document les voient arriver, un éditeur
// les accepte ou les refuse une à une. Avant de rien écrire, la page montre
// ce qui sera proposé ; l'état d'avant est gardé dans la foulée.

import {
  dateLisible,
  libelleVersion,
  phraseRestauration,
  resumeComparaison,
  segmentsDeDiff,
} from './versionsAffichage.js'

function el(tag, classe, texte) {
  const e = document.createElement(tag)
  if (classe) e.className = classe
  if (texte != null) e.textContent = texte
  return e
}

function bouton(texte, classe, surClic) {
  const b = el('button', `vr-btn ${classe || ''}`.trim(), texte)
  b.type = 'button'
  b.addEventListener('click', surClic)
  return b
}

async function appel(chemin, { methode = 'GET', corps } = {}) {
  const res = await fetch(chemin, {
    method: methode,
    headers: corps ? { 'content-type': 'application/json' } : undefined,
    body: corps ? JSON.stringify(corps) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  if (!res.ok) throw new Error((json && json.error) || `erreur ${res.status}`)
  return json
}

export async function mountVersions(root, docId) {
  root.innerHTML = ''
  const wrap = el('div', 'home versions-page')
  const retour = el('a', 'back-link', '← Document')
  retour.href = `#/doc/${docId}`
  const h1 = el('h1', null, 'Versions')
  const sousTitre = el(
    'p',
    'subtitle',
    'Les états de ce document que le serveur a gardés. Comparez-les, nommez ceux qui comptent, et restaurez-en un : la restauration est proposée en suivi de modifications, rien n’est effacé.'
  )
  const statut = el('p', 'style-status')
  statut.setAttribute('role', 'status')
  const nommer = el('form', 'vr-nommer')
  const layout = el('div', 'versions-layout')
  const liste = el('ul', 'versions-list')
  const panneau = el('div', 'versions-preview')
  layout.append(liste, panneau)
  wrap.append(retour, h1, sousTitre, statut, nommer, layout)
  root.appendChild(wrap)

  const base = `/api/docs/${docId}`
  let meta
  try {
    meta = await appel(base)
  } catch (err) {
    statut.textContent = err.message === 'erreur 404' ? 'Document introuvable.' : err.message
    return
  }
  h1.textContent = `Versions — ${meta.title || 'Sans titre'}`

  let versions = []
  let peutEcrire = false
  let selection = null // ts (nombre) d'une version, ou 'courante'
  let vers = 'courante' // l'autre côté de la comparaison
  let mode = 'comparer' // 'comparer' | 'texte'

  async function charger() {
    const r = await appel(`${base}/versions`)
    versions = r.versions
    peutEcrire = r.peutEcrire
  }

  // --- Nommer l'état actuel ---------------------------------------------------
  function dessinerNommer() {
    nommer.innerHTML = ''
    if (!peutEcrire) return
    const champ = el('input')
    champ.type = 'text'
    champ.name = 'nom-de-version'
    champ.maxLength = 80
    champ.placeholder = 'Nommer l’état actuel : « Envoi au comité », « Avant relecture »…'
    champ.setAttribute('aria-label', 'Nom de la version')
    champ.autocomplete = 'off'
    const envoyer = el('button', 'vr-btn primaire', 'Nommer cette version')
    envoyer.type = 'submit'
    nommer.append(champ, envoyer)
    nommer.onsubmit = async (e) => {
      e.preventDefault()
      const nom = champ.value.trim()
      if (!nom) return champ.focus()
      envoyer.disabled = true
      try {
        const v = await appel(`${base}/versions`, { methode: 'POST', corps: { nom } })
        await charger()
        selection = v.ts
        vers = 'courante'
        champ.value = ''
        statut.textContent = `Version « ${v.nom} » enregistrée.`
        dessiner()
      } catch (err) {
        statut.textContent = err.message
      } finally {
        envoyer.disabled = false
      }
    }
  }

  // --- La liste -----------------------------------------------------------------
  function dessinerListe() {
    liste.innerHTML = ''
    const ajouterLigne = (ts, titre, detail, nommee) => {
      const li = el('li', `versions-list-item${selection === ts ? ' active' : ''}`)
      const b = el('button', 'versions-list-link')
      b.type = 'button'
      const texte = el('span', 'vr-ligne')
      texte.append(el('span', `vr-titre${nommee ? ' nommee' : ''}`, titre), el('span', 'vr-detail', detail))
      b.appendChild(texte)
      if (selection === ts) b.setAttribute('aria-current', 'true')
      b.addEventListener('click', () => {
        selection = ts
        if (vers === ts) vers = 'courante'
        mode = ts === 'courante' ? 'texte' : 'comparer'
        dessiner()
      })
      li.appendChild(b)
      liste.appendChild(li)
    }
    ajouterLigne('courante', 'Version actuelle', 'Le document tel qu’il est maintenant', false)
    for (const v of versions) {
      const l = libelleVersion(v)
      ajouterLigne(v.ts, l.titre, l.detail, l.nommee)
    }
    if (!versions.length) {
      const vide = el(
        'li',
        'vr-vide',
        'Aucune version enregistrée pour l’instant. Le serveur en garde une quand la dernière personne quitte le document après l’avoir modifié.'
      )
      liste.appendChild(vide)
    }
  }

  // --- Le panneau ------------------------------------------------------------------
  const intitule = (ts) => {
    if (ts === 'courante') return 'la version actuelle'
    const v = versions.find((x) => x.ts === ts)
    return v ? `« ${libelleVersion(v).titre} » (${dateLisible(v.ts)})` : 'une version'
  }

  function dessinerBlocs(conteneur, blocs) {
    if (!blocs.length) conteneur.appendChild(el('p', 'vr-vide', 'Ce document est vide.'))
    for (const b of blocs) {
      const p = el('p', `vr-bloc${b.nom === 'heading' ? ' titre' : ''}`)
      p.textContent = b.texte || ' '
      conteneur.appendChild(p)
    }
  }

  function dessinerComparaison(conteneur, c) {
    conteneur.appendChild(el('p', 'vr-resume', resumeComparaison(c)))
    if (c.approximatif) {
      conteneur.appendChild(
        el(
          'p',
          'vr-avertissement',
          'Le document est très différent : la comparaison est approximative, paragraphe par paragraphe dans l’ordre.'
        )
      )
    }
    for (const x of c.changements) {
      const carte = el('div', `vr-changement ${x.type}`)
      const n = (x.apres || x.avant).n
      carte.appendChild(
        el(
          'span',
          'vr-etiquette',
          { modifie: 'Modifié', ajoute: 'Ajouté', supprime: 'Supprimé' }[x.type] + ` — bloc ${n}`
        )
      )
      const texte = el('p', 'vr-bloc')
      if (x.type === 'modifie') {
        for (const s of segmentsDeDiff(x.avant.texte, x.apres.texte)) {
          if (s.type === 'equal') texte.appendChild(document.createTextNode(s.text))
          else texte.appendChild(el(s.type === 'insert' ? 'ins' : 'del', null, s.text))
        }
      } else if (x.type === 'ajoute') {
        texte.appendChild(el('ins', null, x.apres.texte || ' '))
      } else {
        texte.appendChild(el('del', null, x.avant.texte || ' '))
      }
      carte.appendChild(texte)
      conteneur.appendChild(carte)
    }
  }

  async function dessinerPanneau() {
    panneau.innerHTML = ''
    if (selection === null) {
      panneau.appendChild(
        el(
          'p',
          'versions-preview-placeholder',
          'Choisissez une version dans la liste pour la comparer à l’état actuel, la lire ou la restaurer.'
        )
      )
      return
    }
    const courante = selection === 'courante'
    const v = courante ? null : versions.find((x) => x.ts === selection)
    if (!courante && !v) {
      selection = null
      return dessinerPanneau()
    }

    const tete = el('div', 'vr-tete')
    if (courante) {
      tete.appendChild(el('p', 'versions-preview-label', 'Version actuelle'))
    } else {
      const l = libelleVersion(v)
      tete.append(el('p', 'versions-preview-label', l.titre), el('p', 'vr-detail', l.detail))
    }
    panneau.appendChild(tete)

    const actions = el('div', 'vr-actions')
    if (!courante) {
      actions.append(
        bouton('Comparer', mode === 'comparer' ? 'actif' : '', () => {
          mode = 'comparer'
          dessinerPanneau()
        }),
        bouton('Lire le texte', mode === 'texte' ? 'actif' : '', () => {
          mode = 'texte'
          dessinerPanneau()
        })
      )
      if (mode === 'comparer') {
        const choix = el('select', 'vr-choix')
        choix.name = 'comparer-avec'
        choix.setAttribute('aria-label', 'Comparer avec')
        const options = [
          ['courante', 'avec la version actuelle'],
          ...versions
            .filter((x) => x.ts !== selection)
            .map((x) => [x.ts, `avec ${libelleVersion(x).titre} (${dateLisible(x.ts)})`]),
        ]
        for (const [valeur, libelle] of options) {
          const o = el('option', null, libelle)
          o.value = String(valeur)
          if (String(vers) === String(valeur)) o.selected = true
          choix.appendChild(o)
        }
        choix.addEventListener('change', () => {
          vers = choix.value === 'courante' ? 'courante' : Number(choix.value)
          dessinerPanneau()
        })
        actions.appendChild(choix)
      }
    }
    panneau.appendChild(actions)

    if (!courante && peutEcrire) panneau.appendChild(dessinerGestes(v))

    const zone = el('div', 'vr-zone')
    zone.setAttribute('aria-busy', 'true')
    zone.appendChild(el('p', 'versions-preview-placeholder', 'Chargement…'))
    panneau.appendChild(zone)
    const jeton = selection
    try {
      if (courante || mode === 'texte') {
        const r = await appel(`${base}/versions/${selection}`)
        if (jeton !== selection) return
        zone.innerHTML = ''
        dessinerBlocs(zone, r.blocs)
      } else {
        const r = await appel(`${base}/comparaison?de=${selection}&vers=${vers}`)
        if (jeton !== selection) return
        zone.innerHTML = ''
        zone.appendChild(el('p', 'vr-sens', `Ce qui change de ${intitule(selection)} à ${intitule(vers)}.`))
        dessinerComparaison(zone, r)
      }
    } catch (err) {
      zone.innerHTML = ''
      zone.appendChild(el('p', 'vr-avertissement', err.message))
    }
    zone.removeAttribute('aria-busy')
  }

  // --- Renommer, supprimer, restaurer ------------------------------------------------
  function dessinerGestes(v) {
    const boite = el('div', 'vr-gestes')
    const ligne = el('div', 'vr-actions')
    const zoneDialogue = el('div', 'vr-dialogue')

    const renommer = bouton(v.nom ? 'Renommer' : 'Donner un nom', '', () => {
      zoneDialogue.innerHTML = ''
      const f = el('form', 'vr-nommer')
      const champ = el('input')
      champ.type = 'text'
      champ.name = 'nouveau-nom'
      champ.maxLength = 80
      champ.value = v.nom || ''
      champ.autocomplete = 'off'
      champ.setAttribute('aria-label', 'Nom de la version')
      const ok = el('button', 'vr-btn primaire', 'Enregistrer')
      ok.type = 'submit'
      f.append(champ, ok)
      f.onsubmit = async (e) => {
        e.preventDefault()
        try {
          await appel(`${base}/versions/${v.ts}`, { methode: 'PATCH', corps: { nom: champ.value } })
          await charger()
          dessiner()
        } catch (err) {
          statut.textContent = err.message
        }
      }
      zoneDialogue.appendChild(f)
      champ.focus()
    })

    const supprimer = bouton('Supprimer', 'danger', () => {
      zoneDialogue.innerHTML = ''
      zoneDialogue.appendChild(
        el('p', null, 'Cette version sera définitivement supprimée. Le document n’en est pas modifié.')
      )
      zoneDialogue.append(
        bouton('Confirmer la suppression', 'danger', async () => {
          try {
            await appel(`${base}/versions/${v.ts}`, { methode: 'DELETE' })
            selection = null
            await charger()
            statut.textContent = 'Version supprimée.'
            dessiner()
          } catch (err) {
            statut.textContent = err.message
          }
        }),
        bouton('Annuler', '', () => (zoneDialogue.innerHTML = ''))
      )
    })

    const restaurer = bouton('Restaurer cette version…', 'primaire', async () => {
      zoneDialogue.innerHTML = ''
      zoneDialogue.appendChild(el('p', 'vr-detail', 'Calcul de ce qui serait proposé…'))
      try {
        const r = await appel(`${base}/versions/${v.ts}/restauration`, { methode: 'POST', corps: { simuler: true } })
        zoneDialogue.innerHTML = ''
        zoneDialogue.appendChild(el('p', 'vr-phrase', phraseRestauration(r)))
        if (r.rien) {
          zoneDialogue.appendChild(bouton('Fermer', '', () => (zoneDialogue.innerHTML = '')))
          return
        }
        zoneDialogue.appendChild(
          el(
            'p',
            'vr-detail',
            'Rien n’est effacé : les changements arrivent dans le document comme des propositions, que vous acceptez ou refusez une à une. L’état actuel est gardé avant. Mises en forme, images, tableaux et notes de bas de page ne sont pas restaurés — seul le texte l’est.'
          )
        )
        notes(zoneDialogue, r)
        zoneDialogue.append(
          bouton('Proposer ces changements', 'primaire', async () => {
            try {
              const fait = await appel(`${base}/versions/${v.ts}/restauration`, { methode: 'POST', corps: {} })
              await charger()
              dessiner()
              statut.textContent = `${phraseRestauration(fait, { auFutur: false })} Ouvrez le document pour les relire.`
              const lien = el('a', 'vr-lien', 'Ouvrir le document')
              lien.href = `#/doc/${docId}`
              statut.append(' ', lien)
            } catch (err) {
              statut.textContent = err.message
            }
          }),
          bouton('Annuler', '', () => (zoneDialogue.innerHTML = ''))
        )
      } catch (err) {
        zoneDialogue.innerHTML = ''
        zoneDialogue.appendChild(el('p', 'vr-avertissement', err.message))
      }
    })

    ligne.append(restaurer, renommer, supprimer)
    boite.append(ligne, zoneDialogue)
    return boite
  }

  /** Ce que le moteur n'a pas pu proposer, et pourquoi. */
  function notes(conteneur, r) {
    const lignes = [
      ...r.refuses.map((x) => `bloc ${x.bloc} : ${x.raison}`),
      ...r.ignores.map((x) => `bloc ${x.bloc} : ${x.raison}`),
    ]
    if (r.approximatif)
      lignes.push('les deux états sont très différents : l’appariement des paragraphes est approximatif')
    if (!lignes.length) return
    const p = el('p', 'vr-avertissement', 'À reprendre à la main :')
    const ul = el('ul', 'vr-notes')
    for (const l of lignes.slice(0, 12)) ul.appendChild(el('li', null, l))
    if (lignes.length > 12) ul.appendChild(el('li', null, `… et ${lignes.length - 12} autres.`))
    conteneur.append(p, ul)
  }

  function dessiner() {
    dessinerNommer()
    dessinerListe()
    dessinerPanneau()
  }

  try {
    await charger()
  } catch (err) {
    statut.textContent = err.message
    return
  }
  statut.textContent = versions.length
    ? `${versions.length} version${versions.length > 1 ? 's' : ''} enregistrée${versions.length > 1 ? 's' : ''}.`
    : ''
  selection = versions.length ? versions[0].ts : 'courante'
  mode = versions.length ? 'comparer' : 'texte'
  dessiner()
}
