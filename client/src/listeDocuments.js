// La liste « Mes documents » (12/10/2026, claude/conception-dossiers-corbeille.md).
//
// Trois choses que le serveur tient séparément et que cette page réunit :
//   - /api/docs        les documents que la personne voit (avec, pour chacun,
//                      son favori et son dossier — personnels) ;
//   - /api/rangement   ses dossiers (jusqu'à trois niveaux) ;
//   - /api/corbeille   ses documents mis à la corbeille.
//
// Rien ici n'est une règle : le serveur refuse ce qui n'est pas permis, la
// page évite seulement de proposer ce qu'il refuserait. État en mémoire ;
// après tout geste qui change la structure on recharge les trois sources
// plutôt que de tenir deux copies à jour. Seul le tri choisi est mémorisé
// dans le navigateur, par confort.

import { boutonADeuxClics } from './deuxClics.js'
import { icone } from './interface/icones.js'
import { TRIS, construireVue, dateCorbeille, libelleRole, optionsDeplacement, peutCreerDans } from './rangementDocs.js'

const CLE_TRI = 'amend.liste.tri'

function triMemorise() {
  try {
    const tri = globalThis.localStorage && globalThis.localStorage.getItem(CLE_TRI)
    if (TRIS.some((t) => t.cle === tri)) return tri
  } catch {
    /* navigateur sans stockage : on garde le tri par défaut */
  }
  return 'recents'
}

function memoriserTri(tri) {
  try {
    if (globalThis.localStorage) globalThis.localStorage.setItem(CLE_TRI, tri)
  } catch {
    /* sans importance */
  }
}

/** Un appel au serveur dont on ne garde que ce qui sert : jamais d'exception,
 * le corps vaut {} s'il n'y en a pas. */
async function appeler(chemin, methode = 'GET', corps) {
  const options = { method: methode }
  if (corps !== undefined) {
    options.headers = { 'content-type': 'application/json' }
    options.body = JSON.stringify(corps)
  }
  try {
    const res = await fetch(chemin, options)
    let json = null
    try {
      json = await res.json()
    } catch {
      /* pas de corps */
    }
    return { ok: !!res.ok, status: res.status, json: json || {} }
  } catch {
    return { ok: false, status: 0, json: { error: 'le serveur ne répond pas' } }
  }
}

/** « 21 oct. 21:59 », avec l'année quand ce n'est pas l'année en cours. */
function dateCourte(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const options = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
  if (d.getFullYear() !== new Date().getFullYear()) options.year = 'numeric'
  return d.toLocaleString('fr-FR', options)
}

function el(nom, classe, texte) {
  const e = document.createElement(nom)
  if (classe) e.className = classe
  if (texte !== undefined) e.textContent = texte
  return e
}

function bouton(classe, texte, titre, surClic) {
  const b = el('button', classe, texte)
  b.type = 'button'
  if (titre) b.title = titre
  b.addEventListener('click', surClic)
  return b
}

/** Monte la liste dans `conteneur`. Renvoie `{ recharger }` pour les tests. */
export function monterListeDocuments(conteneur) {
  const etat = {
    docs: [],
    dossiers: [],
    corbeille: [],
    courant: null,
    recherche: '',
    tri: triMemorise(),
    enCorbeille: false,
    saisie: null, // 'creer' | 'renommer' | null : le petit formulaire ouvert
    deplacement: null, // id du document dont on choisit la destination
    message: '',
  }

  // La barre reste en place d'un affichage à l'autre : la refaire ferait
  // perdre le focus au champ de recherche à chaque lettre.
  const barre = el('div', 'liste-barre')
  const champRecherche = el('label', 'liste-recherche-champ')
  const recherche = el('input', 'liste-recherche')
  recherche.type = 'search'
  recherche.placeholder = 'Rechercher un titre'
  recherche.autocomplete = 'off'
  recherche.setAttribute('aria-label', 'Rechercher parmi mes documents')
  recherche.addEventListener('input', () => {
    etat.recherche = recherche.value
    dessiner()
  })
  const choixTri = el('select', 'liste-tri')
  choixTri.setAttribute('aria-label', 'Trier les documents')
  for (const t of TRIS) {
    const o = el('option', '', t.libelle)
    o.value = t.cle
    choixTri.appendChild(o)
  }
  choixTri.value = etat.tri
  choixTri.addEventListener('change', () => {
    etat.tri = choixTri.value
    memoriserTri(etat.tri)
    dessiner()
  })
  champRecherche.append(icone('recherche', 16), recherche)
  // Le geste de création d'un dossier est dans la barre : toujours au même
  // endroit, qu'on soit à la racine ou dans un dossier (voir `dessiner`).
  const nouveauDossier = bouton('btn-contour liste-nouveau-dossier', '', 'Créer un dossier ici', () => {
    etat.saisie = 'creer'
    dessiner()
  })
  nouveauDossier.append(icone('dossierPlus', 16), el('span', '', 'Nouveau dossier'))
  barre.append(champRecherche, choixTri, nouveauDossier)

  const message = el('p', 'liste-message')
  message.setAttribute('role', 'status')
  message.hidden = true
  const zone = el('div', 'liste-zone')
  conteneur.append(barre, message, zone)

  function dire(texte) {
    etat.message = texte || ''
    message.textContent = etat.message
    message.hidden = !etat.message
  }

  async function recharger() {
    const [docs, rangement, corbeille] = await Promise.all([
      appeler('/api/docs'),
      appeler('/api/rangement'),
      appeler('/api/corbeille'),
    ])
    if (docs.status === 401) {
      location.hash = '#/login'
      return
    }
    etat.docs = Array.isArray(docs.json.docs) ? docs.json.docs : []
    etat.dossiers = Array.isArray(rangement.json.dossiers) ? rangement.json.dossiers : []
    etat.corbeille = Array.isArray(corbeille.json.documents) ? corbeille.json.documents : []
    // Le dossier ouvert a pu disparaître (supprimé d'un autre onglet).
    if (etat.courant && !etat.dossiers.some((d) => d.id === etat.courant)) etat.courant = null
    if (etat.enCorbeille && !etat.corbeille.length) etat.enCorbeille = false
    dessiner()
  }

  /** Un geste du serveur : en cas d'échec, on dit pourquoi, sinon on recharge. */
  async function geste(chemin, methode, corps) {
    const res = await appeler(chemin, methode, corps)
    if (!res.ok) {
      dire(res.json.error || 'Cela n’a pas pu se faire.')
      return res
    }
    dire('')
    await recharger()
    return res
  }

  // ------------------------------------------------------------------ lignes

  function etoile(doc) {
    const b = el('button', 'star-btn')
    b.type = 'button'
    b.append(icone('etoile', 18))
    b.classList.toggle('starred', !!doc.starred)
    b.title = doc.starred ? 'Retirer de mes favoris' : 'Ajouter à mes favoris'
    b.setAttribute('aria-pressed', doc.starred ? 'true' : 'false')
    b.addEventListener('click', async () => {
      b.disabled = true
      const res = await appeler(`/api/docs/${doc.id}/star`, 'PATCH', { starred: !doc.starred })
      if (res.ok) {
        doc.starred = !doc.starred
        dessiner()
      } else {
        b.disabled = false
        dire(res.json.error || 'Le favori n’a pas pu être changé.')
      }
    })
    return b
  }

  function ligneDocument({ doc, emplacement }, avecEmplacement) {
    const item = el('li', 'doc-ligne')

    const lien = el('a', '', doc.title || 'Sans titre')
    lien.href = `#/doc/${doc.id}`
    const date = el('span', 'doc-date', dateCourte(doc.updatedAt))
    date.title = new Date(doc.updatedAt).toLocaleString('fr-FR')
    const titreEtBadge = el('span', 'doc-list-title')
    titreEtBadge.append(etoile(doc), lien)
    const badge = libelleRole(doc)
    if (badge) titreEtBadge.appendChild(el('span', `role-badge role-${badge.cle}`, badge.libelle))
    if (avecEmplacement && emplacement) titreEtBadge.appendChild(el('span', 'doc-emplacement', emplacement))

    const actions = el('span', 'doc-actions')
    actions.appendChild(
      bouton('deplacer-btn', 'Déplacer', 'Ranger ce document dans un dossier', () => {
        etat.deplacement = etat.deplacement === doc.id ? null : doc.id
        dessiner()
      })
    )
    // Mettre à la corbeille ou quitter — jamais les deux, et jamais l'un
    // déguisé en l'autre. Le propriétaire met le document à la corbeille
    // pour tout le monde : il se restaure, sa page publiée est retirée et
    // les invitations de Claude sont révoquées. Les autres le quittent : ils
    // retirent leur propre accès et ne touchent à rien chez personne. Le
    // propriétaire ne peut pas quitter le sien — le document deviendrait
    // orphelin ; il transfère d'abord (panneau Partager).
    if (doc.jeSuisProprietaire) {
      actions.appendChild(
        boutonADeuxClics({
          libelle: 'Corbeille',
          titre: 'Mettre ce document à la corbeille, pour tout le monde — vous pourrez le restaurer',
          classe: 'delete-doc-btn',
          action: () => appeler(`/api/docs/${doc.id}`, 'DELETE'),
          surSucces: () => recharger(),
        })
      )
    } else if (!doc.owner) {
      actions.appendChild(
        boutonADeuxClics({
          libelle: 'Supprimer',
          titre: 'Supprimer définitivement ce document, qui n’a plus de propriétaire',
          classe: 'delete-doc-btn',
          action: () => appeler(`/api/docs/${doc.id}`, 'DELETE'),
          surSucces: () => recharger(),
        })
      )
    } else {
      actions.appendChild(
        boutonADeuxClics({
          libelle: 'Quitter',
          titre: 'Retirer mon accès à ce document — il n’est pas supprimé',
          classe: 'delete-doc-btn',
          action: () => appeler(`/api/docs/${doc.id}/access/moi`, 'DELETE'),
          surSucces: () => recharger(),
        })
      )
    }
    item.append(titreEtBadge, date, actions)

    if (etat.deplacement === doc.id) {
      const rang = el('div', 'deplacement')
      const libelle = el('label', '', 'Déplacer vers ')
      const choix = el('select', 'deplacer-select')
      for (const o of optionsDeplacement(etat.dossiers)) {
        const opt = el('option', '', o.libelle)
        opt.value = o.id
        choix.appendChild(opt)
      }
      choix.value = doc.dossier && etat.dossiers.some((d) => d.id === doc.dossier) ? doc.dossier : ''
      choix.addEventListener('change', async () => {
        choix.disabled = true
        etat.deplacement = null
        const res = await appeler(`/api/rangement/documents/${doc.id}`, 'PUT', { dossier: choix.value || null })
        if (!res.ok) dire(res.json.error || 'Le document n’a pas pu être déplacé.')
        else dire('')
        await recharger()
      })
      libelle.appendChild(choix)
      rang.appendChild(libelle)
      item.appendChild(rang)
    }
    return item
  }

  function listeDeDocuments(lignes, avecEmplacement, classe = '') {
    const ul = el('ul', `doc-list ${classe}`.trim())
    for (const l of lignes) ul.appendChild(ligneDocument(l, avecEmplacement))
    return ul
  }

  // ------------------------------------------------------------ formulaires

  function formulaireNom({ valeur = '', libelleBouton, surEnvoi }) {
    const form = el('form', 'dossier-form')
    const champ = el('input', 'dossier-nom')
    champ.name = 'nom'
    champ.value = valeur
    champ.maxLength = 60
    champ.required = true
    champ.autocomplete = 'off'
    champ.placeholder = 'Nom du dossier'
    champ.setAttribute('aria-label', 'Nom du dossier')
    const ok = el('button', 'dossier-valider', libelleBouton)
    ok.type = 'submit'
    const non = bouton('dossier-annuler', 'Annuler', '', () => {
      etat.saisie = null
      dessiner()
    })
    form.append(champ, ok, non)
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      ok.disabled = true
      const res = await surEnvoi(champ.value)
      if (res && res.ok) etat.saisie = null
      else ok.disabled = false
      if (res && res.ok) dessiner()
    })
    setTimeout(() => champ.focus(), 0)
    return form
  }

  // ------------------------------------------------------------------ vues

  function dessinerDossiers(vue) {
    const frag = document.createDocumentFragment()
    const ouvert = vue.ouvert
    const ici = vue.fil[vue.fil.length - 1] || null

    // Le fil d'Ariane et les gestes sur le dossier ouvert.
    const entete = el('div', 'fil-barre')
    const fil = el('nav', 'fil')
    fil.setAttribute('aria-label', 'Emplacement')
    const racine = ouvert
      ? bouton('fil-lien', 'Mes documents', '', () => aller(null))
      : el('span', 'fil-courant', 'Mes documents')
    fil.appendChild(racine)
    vue.fil.forEach((d, i) => {
      fil.appendChild(el('span', 'fil-sep', '›'))
      fil.appendChild(
        i === vue.fil.length - 1 ? el('span', 'fil-courant', d.nom) : bouton('fil-lien', d.nom, '', () => aller(d.id))
      )
    })
    if (ouvert) entete.appendChild(fil)

    const gestes = el('span', 'fil-gestes')
    if (ici) {
      gestes.appendChild(
        bouton('dossier-geste', 'Renommer', 'Renommer ce dossier', () => {
          etat.saisie = 'renommer'
          dessiner()
        })
      )
      gestes.appendChild(
        boutonADeuxClics({
          libelle: 'Supprimer le dossier',
          titre: 'Supprimer ce dossier — rien n’est supprimé : ses documents et sous-dossiers remontent d’un niveau',
          classe: 'dossier-geste dossier-supprimer',
          action: async () => {
            const res = await appeler(`/api/rangement/dossiers/${ici.id}`, 'DELETE')
            if (!res.ok) dire(res.json.error || 'Le dossier n’a pas pu être supprimé.')
            return res
          },
          surSucces: () => {
            etat.courant = ici.parent || null
            recharger()
          },
        })
      )
    }
    entete.appendChild(gestes)
    if (ouvert) frag.appendChild(entete)

    if (etat.saisie === 'creer') {
      frag.appendChild(
        formulaireNom({
          libelleBouton: 'Créer',
          surEnvoi: (nom) => geste('/api/rangement/dossiers', 'POST', { nom, parent: ouvert }),
        })
      )
    } else if (etat.saisie === 'renommer' && ici) {
      frag.appendChild(
        formulaireNom({
          valeur: ici.nom,
          libelleBouton: 'Renommer',
          surEnvoi: (nom) => geste(`/api/rangement/dossiers/${ici.id}`, 'PATCH', { nom }),
        })
      )
    }

    if (vue.sousDossiers.length) {
      const ul = el('ul', 'dossier-list')
      for (const { dossier, effectif } of vue.sousDossiers) {
        const li = el('li', 'dossier-ligne')
        const ouvrir = bouton('dossier-ouvrir', '', `Ouvrir le dossier ${dossier.nom}`, () => aller(dossier.id))
        const pic = el('span', 'dossier-icone')
        pic.append(icone('dossier', 20))
        ouvrir.append(pic, el('span', 'dossier-titre', dossier.nom))
        const n = el(
          'span',
          'dossier-effectif',
          effectif === 0 ? 'vide' : `${effectif} document${effectif > 1 ? 's' : ''}`
        )
        li.append(ouvrir, n)
        ul.appendChild(li)
      }
      frag.appendChild(ul)
    }

    if (vue.documents.length) {
      frag.appendChild(listeDeDocuments(vue.documents, false))
    } else if (!vue.sousDossiers.length) {
      const vide = el('p', 'doc-list-empty', ouvert ? 'Ce dossier est vide.' : 'Aucun document pour le moment.')
      frag.appendChild(vide)
    }
    return frag
  }

  function aller(id) {
    etat.courant = id
    etat.saisie = null
    etat.deplacement = null
    dire('')
    dessiner()
  }

  function dessinerCorbeille() {
    const frag = document.createDocumentFragment()
    const entete = el('div', 'fil-barre')
    entete.appendChild(
      bouton('fil-lien', '← Mes documents', '', () => {
        etat.enCorbeille = false
        dire('')
        dessiner()
      })
    )
    const gestes = el('span', 'fil-gestes')
    gestes.appendChild(
      boutonADeuxClics({
        libelle: 'Vider la corbeille',
        titre: 'Supprimer définitivement tout ce que contient la corbeille',
        classe: 'dossier-geste dossier-supprimer',
        action: () => appeler('/api/corbeille', 'DELETE'),
        surSucces: () => recharger(),
      })
    )
    entete.appendChild(gestes)
    frag.appendChild(entete)
    frag.appendChild(el('h3', 'corbeille-titre', 'Corbeille'))
    frag.appendChild(
      el(
        'p',
        'corbeille-aide',
        'Ces documents n’apparaissent plus chez vous ni chez les personnes invitées, et leur page publiée est retirée. Restaurez-les, ou supprimez-les pour de bon : la suppression définitive ne se défait pas.'
      )
    )
    const ul = el('ul', 'doc-list corbeille-list')
    for (const entree of etat.corbeille) {
      const li = el('li', 'doc-ligne')
      const intitule = el('span', 'doc-list-title')
      intitule.appendChild(el('span', 'corbeille-doc', entree.title || 'Sans titre'))
      const date = el('span', 'doc-date', `à la corbeille le ${dateCorbeille(entree)}`)
      const actions = el('span', 'doc-actions')
      actions.appendChild(
        bouton('restaurer-btn', 'Restaurer', 'Remettre ce document parmi mes documents', async () => {
          const res = await appeler(`/api/corbeille/${entree.id}/restauration`, 'POST')
          if (!res.ok) {
            dire(res.json.error || 'Le document n’a pas pu être restauré.')
            return
          }
          dire('Document restauré. S’il était publié, il est à republier.')
          await recharger()
        })
      )
      actions.appendChild(
        boutonADeuxClics({
          libelle: 'Supprimer pour de bon',
          titre: 'Supprimer définitivement ce document',
          classe: 'delete-doc-btn',
          action: () => appeler(`/api/corbeille/${entree.id}`, 'DELETE'),
          surSucces: () => recharger(),
        })
      )
      li.append(intitule, date, actions)
      ul.appendChild(li)
    }
    frag.appendChild(ul)
    return frag
  }

  function dessiner() {
    zone.innerHTML = ''
    barre.hidden = etat.enCorbeille
    // Le bouton quitte la barre (au lieu d'être masqué) quand on ne peut pas
    // créer de dossier ici : au troisième niveau, ou pendant une recherche.
    const peutCreer = peutCreerDans(etat.dossiers, etat.courant) && !etat.recherche.trim()
    if (peutCreer && !nouveauDossier.isConnected) barre.append(nouveauDossier)
    else if (!peutCreer && nouveauDossier.isConnected) nouveauDossier.remove()
    if (etat.enCorbeille) {
      zone.appendChild(dessinerCorbeille())
      return
    }
    const vue = construireVue({
      docs: etat.docs,
      dossiers: etat.dossiers,
      courant: etat.courant,
      recherche: etat.recherche,
      tri: etat.tri,
    })

    if (vue.favoris.length) {
      const section = el('section', 'favoris')
      section.appendChild(el('h3', 'favoris-titre', 'Favoris'))
      section.appendChild(listeDeDocuments(vue.favoris, true, 'favoris-list'))
      zone.appendChild(section)
    }

    if (vue.recherche) {
      const n = vue.documents.length
      zone.appendChild(
        el(
          'h3',
          'resultats-titre',
          n === 0 ? 'Aucun document ne correspond.' : `${n} document${n > 1 ? 's' : ''} trouvé${n > 1 ? 's' : ''}`
        )
      )
      if (n) zone.appendChild(listeDeDocuments(vue.documents, true))
    } else {
      zone.appendChild(dessinerDossiers(vue))
    }

    // La corbeille n'est un lieu que si elle contient quelque chose.
    if (etat.corbeille.length && !vue.recherche) {
      const pied = el('div', 'corbeille-pied')
      const ouvrirCorbeille = bouton('corbeille-ouvrir', '', 'Voir les documents mis à la corbeille', () => {
        etat.enCorbeille = true
        etat.saisie = null
        etat.deplacement = null
        dire('')
        dessiner()
      })
      ouvrirCorbeille.append(icone('corbeille', 16), el('span', '', `Corbeille (${etat.corbeille.length})`))
      pied.appendChild(ouvrirCorbeille)
      zone.appendChild(pied)
    }
  }

  const prete = recharger()
  return { recharger, prete }
}
