// « Gérer mes modèles » — page `#/modeles` (01/10/2026). Voir
// claude/etude-modeles-mise-en-page.md §0 pour les décisions.
//
// Trois familles, rangées comme dans Pages : les modèles **livrés** (dans
// le code, immuables), ceux de l'**instance** (créés par les
// administrateurs, vus de tous — « Par défaut » en est un), et **les
// miens**. On crée un modèle en **dupliquant** un existant, jamais d'une
// page blanche ni à partir d'un document. Un modèle utilisé par des
// documents ne se supprime pas, et le dit.
//
// Modifier un modèle, c'est modifier tous les documents qui l'utilisent
// (lien vivant) : la page l'écrit en toutes lettres avant l'enregistrement.
// Les gestes qui ne se défont pas (supprimer) demandent deux clics.

import { libelleFormat } from '../../shared/modeles.js'
import { chargerModeles, creerModele, modifierModele, supprimerModele, fusionner } from './styleConfig.js'
import { formulaireStyle } from './stylePanel.js'

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`

function el(balise, classe, texte) {
  const e = document.createElement(balise)
  if (classe) e.className = classe
  if (texte !== undefined) e.textContent = texte
  return e
}

function bouton(texte, classe = 'bo-action') {
  const b = el('button', classe, texte)
  b.type = 'button'
  return b
}

const FAMILLES = [
  { portee: 'livre', titre: 'Livrés avec amend.ink', aide: 'On ne les modifie pas : on les duplique pour partir de l’un d’eux.' },
  { portee: 'instance', titre: 'De l’instance', aide: 'Vus de tous. Seuls les administrateurs les modifient.' },
  { portee: 'perso', titre: 'Mes modèles', aide: 'Vous seul les voyez.' },
]

export async function mountModeles(root, info) {
  root.innerHTML = ''
  const wrap = el('div', 'home backoffice modeles')
  const retour = el('a', 'back-link', '← Mes documents')
  retour.href = '#/'
  const h1 = el('h1', '', 'Mes modèles')
  const sous = el('p', 'subtitle')
  sous.textContent =
    'Un modèle réunit la typographie, les marges et le format de page. Chaque document en choisit un dans son menu Exporter, et peut ensuite avoir quelques réglages à lui. Ils ne concernent que les exports (PDF, Word), pas l’éditeur.'
  wrap.append(retour, h1, sous)
  root.appendChild(wrap)

  let donnees
  try {
    donnees = await chargerModeles()
  } catch (err) {
    sous.textContent = err.status === 401 ? 'Connexion requise.' : 'Les modèles n’ont pas pu être chargés.'
    return
  }
  const { modeles, admin } = donnees

  if (info) {
    const ok = el('p', 'bo-note bo-ok', info)
    ok.setAttribute('role', 'status')
    wrap.appendChild(ok)
  }

  const recharger = (message) => mountModeles(root, message)

  for (const famille of FAMILLES) {
    const liste = modeles.filter((m) => m.portee === famille.portee)
    // « Mes modèles » s'affiche même vide : c'est là qu'on comprend qu'on peut en faire.
    if (!liste.length && famille.portee !== 'perso') continue
    wrap.appendChild(el('h2', '', famille.titre))
    wrap.appendChild(el('p', 'bo-note', famille.aide))
    if (!liste.length) wrap.appendChild(el('p', 'bo-note', 'Aucun pour l’instant. Dupliquez un modèle ci-dessus pour en créer un.'))
    for (const m of liste) wrap.appendChild(carte(m))
  }

  function carte(m) {
    const c = el('div', 'modele-carte')
    c.dataset.modele = m.id
    const tete = el('div', 'modele-tete')
    const nom = el('strong', 'modele-nom', m.nom)
    const format = el('span', 'bo-attente', libelleFormat(m.style.page))
    tete.append(nom, format)
    c.appendChild(tete)
    if (m.description) c.appendChild(el('p', 'bo-note', m.description))
    c.appendChild(
      el('p', 'bo-note modele-usage', m.utilisePar > 0 ? `Utilisé par ${pluriel(m.utilisePar, 'document')}.` : 'Aucun document ne l’utilise.')
    )

    const actions = el('div', 'modele-actions')
    const message = el('span', 'bo-note bo-embarquer-msg')
    message.setAttribute('role', 'status')
    const formulaire = el('div', 'modele-formulaire')
    formulaire.hidden = true

    const dire = (texte, erreur = false) => {
      message.textContent = texte
      message.classList.toggle('bo-erreur', erreur)
    }

    // Dupliquer : un champ de nom qui s'ouvre sous la carte.
    const dupliquer = bouton('Dupliquer')
    dupliquer.onclick = () => {
      formulaire.hidden = false
      formulaire.innerHTML = ''
      const champ = el('input')
      champ.type = 'text'
      champ.maxLength = 60
      champ.value = `${m.nom} (copie)`
      champ.setAttribute('aria-label', 'Nom du nouveau modèle')
      let portee = null
      if (admin) {
        portee = el('select')
        for (const [v, l] of [['perso', 'Personnel (vous seul)'], ['instance', 'De l’instance (tous)']]) {
          const o = el('option', '', l)
          o.value = v
          portee.appendChild(o)
        }
      }
      const creer = bouton('Créer')
      const annuler = bouton('Annuler', 'btn-texte')
      annuler.onclick = () => {
        formulaire.hidden = true
      }
      creer.onclick = async () => {
        creer.disabled = true
        try {
          const cree = await creerModele({ nom: champ.value, depuis: m.id, portee: portee ? portee.value : 'perso' })
          await recharger(`« ${cree.nom} » créé. Modifiez-le pour le régler.`)
        } catch (err) {
          creer.disabled = false
          dire(err.message, true)
        }
      }
      formulaire.append(champ, ...(portee ? [portee] : []), creer, annuler)
      champ.focus()
      champ.select()
    }
    actions.appendChild(dupliquer)

    if (m.modifiable) {
      const modifier = bouton('Modifier')
      modifier.onclick = () => editer(m)
      actions.appendChild(modifier)
      if (!m.defaut) {
        const renommer = bouton('Renommer')
        renommer.onclick = () => {
          formulaire.hidden = false
          formulaire.innerHTML = ''
          const champ = el('input')
          champ.type = 'text'
          champ.maxLength = 60
          champ.value = m.nom
          champ.setAttribute('aria-label', 'Nouveau nom')
          const ok = bouton('Renommer')
          const annuler = bouton('Annuler', 'btn-texte')
          annuler.onclick = () => {
            formulaire.hidden = true
          }
          ok.onclick = async () => {
            ok.disabled = true
            try {
              await modifierModele(m.id, { nom: champ.value })
              await recharger(`Renommé en « ${champ.value.trim()} ».`)
            } catch (err) {
              ok.disabled = false
              dire(err.message, true)
            }
          }
          formulaire.append(champ, ok, annuler)
          champ.focus()
          champ.select()
        }
        actions.appendChild(renommer)
      }
    }

    if (m.supprimable) {
      const supprimer = bouton('Supprimer')
      if (m.utilisePar > 0) {
        // Pas de bouton mort sans explication : il dit pourquoi.
        supprimer.disabled = true
        supprimer.title = `Utilisé par ${pluriel(m.utilisePar, 'document')} : changez d’abord leur modèle.`
      } else {
        let arme = null
        supprimer.onclick = async () => {
          if (!arme) {
            supprimer.textContent = 'Confirmer la suppression'
            arme = setTimeout(() => {
              supprimer.textContent = 'Supprimer'
              arme = null
            }, 5000)
            return
          }
          clearTimeout(arme)
          supprimer.disabled = true
          try {
            await supprimerModele(m.id)
            await recharger(`« ${m.nom} » supprimé.`)
          } catch (err) {
            supprimer.disabled = false
            supprimer.textContent = 'Supprimer'
            arme = null
            dire(err.message, true)
          }
        }
      }
      actions.appendChild(supprimer)
    }

    actions.appendChild(message)
    c.append(actions, formulaire)
    return c
  }

  /** L'édition d'un modèle : le formulaire complet, à la place de la liste. */
  function editer(m) {
    root.innerHTML = ''
    const page = el('div', 'home backoffice modeles')
    const retourListe = el('a', 'back-link', '← Mes modèles')
    retourListe.href = '#/modeles'
    retourListe.onclick = (e) => {
      e.preventDefault()
      recharger()
    }
    page.append(retourListe, el('h1', '', `Modifier « ${m.nom} »`))
    const avertissement = el(
      'p',
      'bo-note',
      m.utilisePar > 0
        ? `Ce modèle est utilisé par ${pluriel(m.utilisePar, 'document')} : ils prendront ces changements, sauf pour les réglages qu’ils se sont donnés eux-mêmes.`
        : 'Aucun document ne l’utilise pour l’instant.'
    )
    page.appendChild(avertissement)
    const form = formulaireStyle(fusionner(m.style))
    page.appendChild(form.el)
    const statut = el('p', 'style-status')
    const barre = el('div', 'style-actions')
    const enregistrer = bouton('Enregistrer', 'btn-primary')
    const annuler = bouton('Annuler', 'btn-texte')
    annuler.onclick = () => recharger()
    enregistrer.onclick = async () => {
      statut.textContent = 'Enregistrement…'
      enregistrer.disabled = true
      try {
        await modifierModele(m.id, { style: form.lire() })
        await recharger(`« ${m.nom} » enregistré.`)
      } catch (err) {
        enregistrer.disabled = false
        statut.textContent = `Échec de l'enregistrement : ${err.message}`
      }
    }
    barre.append(enregistrer, annuler)
    page.append(statut, barre)
    root.appendChild(page)
  }
}
