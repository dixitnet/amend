// Les menus Partager et Exporter du bandeau (point 23 de la feuille de route,
// 13/10/2026 : sortis de `mountEditor`).
//
// **Partager** = à qui (accès, publication sur le web) ; **Exporter** = sous
// quelle forme (modèle de mise en page, variante, formats). Ce module
// construit les deux menus et câble leurs gestes ; il ne connaît de l'éditeur
// que deux fonctions — le document courant et le titre courant — lues au
// moment du clic, jamais à la construction (la vue n'existe pas encore).

import { lierMenuAria } from './menuAria.js'
import { openAccessPanel } from './accessPanel.js'
import { ouvrirPanneauPublication } from './publicationPanel.js'
import { ouvrirPanneauStyle } from './stylePanel.js'
import { monterModeleDocument } from './modeleDocument.js'
import { loadDocStyle } from './styleConfig.js'
import { docToMarkdown, markdownFilename, downloadText } from './mdExport.js'
import { documentPourExport, VARIANTES, FINAL } from './exportVariante.js'
import { messageFugace } from './images.js'

/** La fabrique de menus déroulants du bandeau. `ecouteursGlobaux` reçoit ce
 * qu'il faut retirer au démontage (les écouteurs posés sur `document`). */
export function creerFabriqueMenus(ecouteursGlobaux) {
  const menusDeroulants = []
  /** Un menu déroulant : un bouton, une liste flottante, fermée au clic
   * ailleurs. Plusieurs usages (Partager, Exporter, et le compte dans
   * compteMenu.js) — d'où la fabrique plutôt que des copies du même
   * mécanisme. */
  function menuDeroulant(libelle, { classe = '', titre = '' } = {}) {
    const menu = document.createElement('div')
    menu.className = `menu-flottant ${classe}`.trim()
    const bouton = document.createElement('button')
    bouton.type = 'button'
    bouton.className = 'btn-preset menu-flottant-bouton'
    bouton.textContent = libelle
    if (titre) bouton.title = titre
    const liste = document.createElement('div')
    liste.className = 'menu-flottant-liste menu-flottant-droite'
    liste.hidden = true
    menu.append(bouton, liste)
    lierMenuAria(bouton, liste)
    // Le clic sur le bouton ne remonte pas au document (sinon le menu se
    // fermerait aussitôt) : c'est donc à lui de fermer les **autres** menus
    // — avec Partager et Exporter côte à côte, deux listes ouvertes à la fois
    // se recouvriraient.
    bouton.onclick = (e) => {
      e.stopPropagation()
      const ouvrir = liste.hidden
      for (const autre of menusDeroulants) autre.fermer()
      liste.hidden = !ouvrir
      // Un menu peut avoir quelque chose à relire à chaque ouverture (le
      // modèle de mise en page, que le menu Exporter montre).
      if (ouvrir && ref.surOuverture) ref.surOuverture()
    }
    // Sur `document`, donc à retirer au démontage : sinon chaque document
    // ouvert laisse un écouteur (et son menu entier) derrière lui.
    const fermerAuClicAilleurs = (e) => {
      if (!menu.contains(e.target)) liste.hidden = true
    }
    document.addEventListener('click', fermerAuClicAilleurs)
    ecouteursGlobaux.push(() => document.removeEventListener('click', fermerAuClicAilleurs))
    const ref = { el: menu, liste, fermer: () => { liste.hidden = true }, surOuverture: null }
    menusDeroulants.push(ref)
    return ref
  }
  return menuDeroulant
}

/**
 * @param {object} options
 * @param {Function} options.menuDeroulant        la fabrique de `creerFabriqueMenus`
 * @param {string} options.docId
 * @param {object} options.docMeta
 * @param {() => object} options.getDoc           le document ProseMirror courant
 * @param {() => string} options.getTitre         le titre courant (nom des fichiers exportés)
 * @returns {{ groupeForme: HTMLElement, menuPartage: object, menuExport: object, chargerPublication: () => void }}
 */
export function monterMenusPartageExport({ menuDeroulant, docId, docMeta, getDoc, getTitre }) {
  // 2. La forme. (Le zoom n'est pas ici : il agrandit le texte à l'écran,
  // il ne change rien au document — sa place est dans la barre de mise en
  // forme, au-dessus du texte, pas dans le bandeau du document.)
  // La mise en page du document n'a plus de bouton à elle (01/10/2026) : elle
  // se choisit dans le menu **Exporter**, qui est le geste qui la rend
  // visible — voir monterModeleDocument (modeleDocument.js).
  const groupeForme = document.createElement('div')
  groupeForme.className = 'banniere-groupe'

  // 3. Faire sortir. Un seul bouton du 17/09 au 01/10/2026 : les accès et
  // les exports répondaient déjà à la même question — *qui d'autre voit ce
  // document, et sous quelle forme*. Séparés le 01/10 : le menu portait
  // trop de choses (accès, variante, trois formats, publication) et le choix
  // du modèle de mise en page, qui ne concerne que la forme du fichier
  // produit, vient s'ajouter à la forme. **Partager** = à qui (accès,
  // publication sur le web) ; **Exporter** = sous quelle forme (variante,
  // formats).
  const menuPartage = menuDeroulant('Partager ▾', { classe: 'menu-partage' })
  const menuExport = menuDeroulant('Exporter ▾', { classe: 'menu-export' })

  const accesItem = document.createElement('button')
  accesItem.type = 'button'
  accesItem.textContent = 'Gérer les accès…'
  accesItem.onclick = () => {
    menuPartage.fermer()
    openAccessPanel(docId, { jeSuisProprietaire: !!docMeta.jeSuisProprietaire })
  }

  // Ce que l'export met dans le fichier (19/09/2026) — question restée
  // sans réponse jusque-là, avec pour conséquence des exports où un mot
  // remplacé et son remplaçant se suivaient. Le choix se fait ici, au-dessus
  // des trois formats, parce qu'il vaut pour les trois.
  const varianteSelect = document.createElement('select')
  varianteSelect.className = 'menu-flottant-choix'
  for (const v of VARIANTES) {
    const o = document.createElement('option')
    o.value = v.id
    o.textContent = v.label
    o.title = v.aide
    varianteSelect.appendChild(o)
  }
  varianteSelect.value = FINAL
  varianteSelect.onclick = (e) => e.stopPropagation()
  const varianteAide = document.createElement('span')
  varianteAide.className = 'menu-flottant-aide'
  const majAide = () => {
    varianteAide.textContent = (VARIANTES.find((v) => v.id === varianteSelect.value) || VARIANTES[0]).aide
  }
  majAide()
  varianteSelect.onchange = majAide
  /** Le document à exporter, dans la variante choisie. */
  const docAExporter = () => documentPourExport(getDoc(), varianteSelect.value)

  const exportMdItem = document.createElement('button')
  exportMdItem.type = 'button'
  exportMdItem.textContent = 'Markdown (.md)'
  const exportDocxItem = document.createElement('button')
  exportDocxItem.type = 'button'
  exportDocxItem.textContent = 'Word (.docx)'
  const exportPdfItem = document.createElement('button')
  exportPdfItem.type = 'button'
  exportPdfItem.textContent = 'PDF (.pdf)'

  // « Publier sur le web » (17/09/2026) — la même question que les accès et
  // les exports, poussée d'un cran : qui d'autre voit ce document, et sous
  // quelle forme. D'où sa place dans ce menu, et non ailleurs. L'entrée
  // n'apparaît que si le serveur dit que cette personne peut publier —
  // administrateurs pendant la phase de test, réglable par PUBLICATION_WEB.
  const sepPublier = document.createElement('hr')
  sepPublier.className = 'menu-flottant-separateur'
  const publierItem = document.createElement('button')
  publierItem.type = 'button'
  publierItem.textContent = 'Publier sur le web…'
  sepPublier.hidden = true
  publierItem.hidden = true
  publierItem.onclick = () => {
    menuPartage.fermer()
    ouvrirPanneauPublication(docId, getDoc, getTitre)
  }

  menuPartage.liste.append(accesItem, sepPublier, publierItem)
  // En tête du menu : le modèle de mise en page, propriété du document. Le
  // menu n'existe que pour les éditeurs (voir `isCorrecteur` plus bas), qui
  // sont aussi ceux que le serveur laisse changer le modèle.
  const modeleDoc = monterModeleDocument({
    docId,
    ouvrirPersonnaliser: (id, options) => {
      menuExport.fermer()
      ouvrirPanneauStyle(id, options)
    },
  })
  menuExport.surOuverture = () => modeleDoc.charger()
  const sepModele = document.createElement('hr')
  sepModele.className = 'menu-flottant-separateur'
  menuExport.liste.append(modeleDoc.el, sepModele, varianteSelect, varianteAide, exportMdItem, exportDocxItem, exportPdfItem)
  // Mise en page, Exporter et Partager voisinent : ce sont les gestes qui
  // décident de la **forme sous laquelle le document sort** et de **qui le
  // reçoit**.
  groupeForme.append(menuExport.el, menuPartage.el)

  function chargerPublication() {
    // Le serveur seul sait qui peut publier : on le lui demande plutôt que de
    // rejouer la règle ici, où elle finirait par diverger.
    fetch(`/api/docs/${docId}/publication`)
      .then((r) => (r.ok ? r.json() : null))
      .then((etat) => {
        if (!etat || !etat.autorise) return
        sepPublier.hidden = false
        publierItem.hidden = false
        publierItem.textContent = etat.publiee ? 'Page publiée — gérer…' : 'Publier sur le web…'
      })
      .catch(() => {})
  }

  exportMdItem.onclick = () => {
    menuExport.fermer()
    const markdown = docToMarkdown(docAExporter())
    downloadText(markdown, markdownFilename(getTitre()))
  }
  exportDocxItem.onclick = async () => {
    menuExport.fermer()
    // Toujours re-demander la feuille de style (jamais la copie chargée au
    // montage) : l'admin a pu la changer sur "Mise en page" depuis, un
    // export doit refléter ce qui est enregistré maintenant — même
    // principe que l'export PDF juste en dessous. Import dynamique
    // (Vite en fait un chunk séparé) : la bibliothèque `docx` n'est
    // chargée que si quelqu'un clique vraiment sur "Word (.docx)", pas au
    // chargement initial de l'éditeur.
    const [{ style }, { downloadDocx }] = await Promise.all([loadDocStyle(docId), import('./docxExport.js')])
    await downloadDocx(docAExporter(), style, getTitre())
  }
  exportPdfItem.onclick = async () => {
    menuExport.fermer()
    // Le PDF sort désormais d'un vrai moteur de composition, côté serveur
    // (voir claude/proto-export-pdf-typst-pagedjs.md) : notes de bas de
    // page, césures françaises, table des matières paginée et recto-verso
    // deviennent possibles, et l'export fonctionne enfin depuis un
    // téléphone. On relit toujours la mise en page plutôt que d'utiliser la
    // copie chargée au montage : elle a pu changer depuis.
    exportPdfItem.disabled = true
    const libelle = exportPdfItem.textContent
    exportPdfItem.textContent = 'Composition…'
    try {
      const [{ style }, { downloadTypstPdf }] = await Promise.all([
        loadDocStyle(docId),
        import('./typstExport.js'),
      ])
      await downloadTypstPdf(docAExporter(), style, getTitre(), docId)
    } catch (err) {
      messageFugace(err.message || "le PDF n'a pas pu être composé", { erreur: true })
    } finally {
      exportPdfItem.disabled = false
      exportPdfItem.textContent = libelle
    }
  }

  return { groupeForme, menuPartage, menuExport, chargerPublication }
}
