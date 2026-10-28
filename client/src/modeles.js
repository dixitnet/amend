// « Gérer mes modèles » — page `#/modeles` (01/10/2026). Voir
// claude/etude-modeles-mise-en-page.md §0 pour les décisions.
//
// Trois familles, rangées comme dans Pages : le modèle **livré** qui reste
// fixe (« Texte brut »), ceux de l'**instance** (créés par les
// administrateurs, vus de tous — « Par défaut » en est un, et les modèles
// livrés avec amend.ink y sont copiés : on les règle, et on peut les
// **rétablir** tels que le code les livre), et **les miens**. On crée un modèle en **dupliquant** un existant, jamais d'une
// page blanche ni à partir d'un document. Un modèle utilisé par des
// documents ne se supprime pas, et le dit.
//
// Chaque modèle porte une **catégorie** (une maison d'édition, un client, un
// type de document) et se lit « catégorie - nom » : « BOD - Livre poche ».
// Le serveur range la liste (sans catégorie, puis par catégorie) ; un filtre
// au-dessus la restreint à une catégorie.
//
// Modifier un modèle, c'est modifier tous les documents qui l'utilisent
// (lien vivant) : la page l'écrit en toutes lettres avant l'enregistrement.
// Les gestes qui ne se défont pas (supprimer) demandent deux clics.

import { libelleFormat, libelleModele, cleCategorie, categorieReservee, CATEGORIE_MAX } from '../../shared/modeles.js'
import { assainir } from '../../shared/style.js'
import {
  chargerModeles,
  creerModele,
  modifierModele,
  supprimerModele,
  retablirModele,
  fusionner,
  police,
} from './styleConfig.js'
import { creerSpecimen } from './specimen.js'
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
  {
    portee: 'livre',
    titre: 'Livré avec amend.ink',
    aide: 'Il ne se modifie pas : on le duplique pour partir de lui.',
  },
  {
    portee: 'instance',
    titre: 'De l’instance',
    aide: 'Vus de tous. Seuls les administrateurs les modifient. Ceux qui viennent d’amend.ink peuvent être rétablis tels qu’il les livre.',
  },
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

  // Les catégories connues, une par clé (ni casse ni accents), dans l'ordre du
  // serveur : elles alimentent le filtre et les suggestions des champs.
  const categories = []
  for (const m of modeles) {
    if (m.categorie && !categories.some((c) => cleCategorie(c) === cleCategorie(m.categorie)))
      categories.push(m.categorie)
  }
  const suggestions = el('datalist')
  suggestions.id = 'modeles-categories'
  for (const c of categories) {
    const o = el('option')
    o.value = c
    suggestions.appendChild(o)
  }
  wrap.appendChild(suggestions)

  const SANS = '__sans__'
  let filtre = ''
  const retenu = (m) => !filtre || (filtre === SANS ? !m.categorie : cleCategorie(m.categorie) === filtre)
  const liste = el('div', 'modeles-liste')

  if (categories.length) {
    const barre = el('label', 'modeles-filtre', 'Catégorie ')
    const choix = el('select')
    choix.setAttribute('aria-label', 'Filtrer par catégorie')
    const options = [['', 'Toutes les catégories']]
    if (modeles.some((m) => !m.categorie)) options.push([SANS, 'Sans catégorie'])
    for (const c of categories) options.push([cleCategorie(c), c])
    for (const [v, l] of options) {
      const o = el('option', '', l)
      o.value = v
      choix.appendChild(o)
    }
    choix.onchange = () => {
      filtre = choix.value
      afficher()
    }
    barre.appendChild(choix)
    wrap.appendChild(barre)
  }
  wrap.appendChild(liste)

  function afficher() {
    liste.innerHTML = ''
    for (const famille of FAMILLES) {
      const dedans = modeles.filter((m) => m.portee === famille.portee && retenu(m))
      // « Mes modèles » s'affiche même vide : c'est là qu'on comprend qu'on peut en faire.
      if (!dedans.length && (famille.portee !== 'perso' || filtre)) continue
      liste.appendChild(el('h2', '', famille.titre))
      liste.appendChild(el('p', 'bo-note', famille.aide))
      if (!dedans.length)
        liste.appendChild(el('p', 'bo-note', 'Aucun pour l’instant. Dupliquez un modèle ci-dessus pour en créer un.'))
      for (const m of dedans) liste.appendChild(carte(m))
    }
  }
  afficher()

  /** Le champ de catégorie des formulaires : texte court, avec les
   * catégories déjà employées en suggestion. */
  function champCategorie(valeur) {
    // « amend.ink » est la catégorie des modèles livrés : on ne la propose pas
    // à qui range le sien.
    if (categorieReservee(valeur)) valeur = ''
    const champ = el('input')
    champ.type = 'text'
    champ.maxLength = CATEGORIE_MAX
    champ.value = valeur || ''
    champ.placeholder = 'Catégorie (obligatoire)'
    champ.required = true
    champ.setAttribute('list', 'modeles-categories')
    champ.setAttribute('aria-label', 'Catégorie du modèle')
    return champ
  }

  function carte(m) {
    const c = el('div', 'modele-carte')
    c.dataset.modele = m.id
    const vignette = el('div', 'modele-vignette')
    vignette.appendChild(creerSpecimen(m.style, { largeur: 104 }).el)
    const corps = el('div', 'modele-corps')
    const tete = el('div', 'modele-tete')
    const nom = el('strong', 'modele-nom', libelleModele(m))
    const format = el('span', 'bo-attente', libelleFormat(m.style.page))
    tete.append(nom, format)
    corps.appendChild(tete)
    const base = (m.style.blocs && m.style.blocs.body) || {}
    corps.appendChild(
      el('p', 'bo-note modele-resume', `${police(base.font).typst[0]} · ${String(base.size).replace('.', ',')} pt`)
    )
    if (m.description) corps.appendChild(el('p', 'bo-note', m.description))
    if (m.origine)
      corps.appendChild(
        el(
          'p',
          'bo-note modele-origine',
          m.ecartLivre ? 'Livré avec amend.ink, puis modifié.' : 'Livré avec amend.ink, valeurs d’origine.'
        )
      )
    // Ce que la lecture du CSS du modèle n'a pas compris : une police absente
    // de l'instance, une règle ignorée. Le modèle s'exporte quand même.
    if (m.avertissements && m.avertissements.length) {
      const av = el('p', 'bo-note bo-erreur modele-avertissements', `À vérifier : ${m.avertissements.join(' ')}`)
      corps.appendChild(av)
    }
    corps.appendChild(
      el(
        'p',
        'bo-note modele-usage',
        m.utilisePar > 0 ? `Utilisé par ${pluriel(m.utilisePar, 'document')}.` : 'Aucun document ne l’utilise.'
      )
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
      const categorie = champCategorie(m.categorie)
      let portee = null
      if (admin) {
        portee = el('select')
        for (const [v, l] of [
          ['perso', 'Personnel (vous seul)'],
          ['instance', 'De l’instance (tous)'],
        ]) {
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
        if (!categorie.value.trim()) return dire('La catégorie est obligatoire.', true)
        creer.disabled = true
        try {
          const cree = await creerModele({
            nom: champ.value,
            categorie: categorie.value,
            depuis: m.id,
            portee: portee ? portee.value : 'perso',
          })
          await recharger(`« ${libelleModele(cree)} » créé. Modifiez-le pour le régler.`)
        } catch (err) {
          creer.disabled = false
          dire(err.message, true)
        }
      }
      formulaire.append(champ, categorie, ...(portee ? [portee] : []), creer, annuler)
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
          const categorie = champCategorie(m.categorie)
          const ok = bouton('Renommer')
          const annuler = bouton('Annuler', 'btn-texte')
          annuler.onclick = () => {
            formulaire.hidden = true
          }
          ok.onclick = async () => {
            if (!categorie.value.trim()) return dire('La catégorie est obligatoire.', true)
            ok.disabled = true
            try {
              await modifierModele(m.id, { nom: champ.value, categorie: categorie.value })
              await recharger(
                `Renommé en « ${libelleModele({ nom: champ.value.trim(), categorie: categorie.value.trim() })} ».`
              )
            } catch (err) {
              ok.disabled = false
              dire(err.message, true)
            }
          }
          formulaire.append(champ, categorie, ok, annuler)
          champ.focus()
          champ.select()
        }
        actions.appendChild(renommer)
      }
    }

    // Un modèle copié d'un livré, qui s'en est écarté : le remettre tel que
    // le code le livre. Il perd ses réglages — deux clics, comme supprimer.
    if (m.retablissable) {
      const retablir = bouton('Rétablir les valeurs d’origine')
      let arme = null
      retablir.onclick = async () => {
        if (!arme) {
          retablir.textContent = 'Confirmer le rétablissement'
          arme = setTimeout(() => {
            retablir.textContent = 'Rétablir les valeurs d’origine'
            arme = null
          }, 5000)
          return
        }
        clearTimeout(arme)
        retablir.disabled = true
        try {
          await retablirModele(m.id)
          await recharger(`« ${libelleModele(m)} » rétabli tel qu’amend.ink le livre.`)
        } catch (err) {
          retablir.disabled = false
          retablir.textContent = 'Rétablir les valeurs d’origine'
          arme = null
          dire(err.message, true)
        }
      }
      actions.appendChild(retablir)
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
            await recharger(`« ${libelleModele(m)} » supprimé.`)
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
    corps.append(actions, formulaire)
    c.append(vignette, corps)
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
    page.append(retourListe, el('h1', '', `Modifier « ${libelleModele(m)} »`))
    const avertissement = el(
      'p',
      'bo-note',
      m.utilisePar > 0
        ? `Ce modèle est utilisé par ${pluriel(m.utilisePar, 'document')} : ils prendront ces changements, sauf pour les réglages qu’ils se sont donnés eux-mêmes.`
        : 'Aucun document ne l’utilise pour l’instant.'
    )
    page.appendChild(avertissement)
    const specimen = creerSpecimen(fusionner(m.style), { largeur: 260 })
    const form = formulaireStyle(fusionner(m.style), { surChangement: (st) => specimen.maj(assainir(st)) })
    const apercu = el('aside', 'modele-apercu')
    apercu.append(specimen.el, el('p', 'bo-note', 'Aperçu indicatif : le PDF fait foi.'))
    const dispo = el('div', 'modele-editeur')
    dispo.append(form.el, apercu)
    page.appendChild(dispo)
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
        await recharger(`« ${libelleModele(m)} » enregistré.`)
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
