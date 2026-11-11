// Extension de BlockNote (couche 3) : le bloc « Table des matières », inséré
// où l'on veut dans le texte, avec la profondeur choisie sur le bloc même,
// comme la v1 (renoncement n° 5 levé, Sylvain, 11/11/2026). Docs n'en a pas ;
// son bloc `/children` (non publié) est du même genre : un bloc sans contenu
// qui montre une liste vivante.
//
// À l'écran : son titre, le choix de la profondeur (pour qui peut écrire) et
// la liste des titres du document jusqu'à cette profondeur, tenue à jour. À
// l'export, l'adaptateur le rend à sa place (PDF : `#outline`). Éléments et
// attributs sémantiques seulement (`nav`, `ol`, `data-niveau`), sans classe ni
// style (règle 19) ; les textes viennent du dictionnaire de l'éditeur
// (`dictionary.amend.table` : `titre`, `profondeur`, `niveaux`), que
// l'application remplit depuis ses catalogues : aucune phrase ici. Le choix
// de la profondeur a une étiquette visible et des options en clair (« Niveaux
// 1 à 3 »), comme la v1 (« Jusqu'au titre ») ; Sylvain, 11/11/2026 :
// « sélecteur de niveaux plus accessible ».
import { createBlockSpec } from '@blocknote/core'
import { PROFONDEURS_TABLE, PROFONDEUR_TABLE_PAR_DEFAUT, profondeurTable, entreesTable } from '../../domaine/index.js'

export const TYPE_TABLE = 'tableDesMatieres'

/** Le texte brut d'un contenu en ligne de BlockNote (texte et liens). */
export function texteEnLigne(contenu) {
  if (!Array.isArray(contenu)) return ''
  return contenu.map((c) => (c.type === 'text' ? c.text : texteEnLigne(c.content))).join('')
}

/** Les titres d'une liste de blocs, enfants compris, dans l'ordre. */
export function titresDesBlocs(blocs) {
  const titres = []
  const parcourir = (liste) => {
    for (const b of liste ?? []) {
      if (b.type === 'heading') titres.push({ niveau: b.props?.level ?? 1, texte: texteEnLigne(b.content) })
      parcourir(b.children)
    }
  }
  parcourir(blocs)
  return titres
}

export const blocTableDesMatieres = createBlockSpec(
  {
    type: TYPE_TABLE,
    propSchema: { profondeur: { default: PROFONDEUR_TABLE_PAR_DEFAUT, values: PROFONDEURS_TABLE } },
    content: 'none',
  },
  {
    render(bloc, editeur) {
      const textes = editeur.dictionary?.amend?.table ?? {}
      const profondeur = profondeurTable(bloc.props.profondeur)
      const nav = document.createElement('nav')
      nav.setAttribute('data-amend-bloc', TYPE_TABLE)
      if (textes.titre) nav.setAttribute('aria-label', textes.titre)
      const titre = document.createElement('p')
      titre.textContent = textes.titre ?? ''
      // L'étiquette visible englobe le choix : elle le nomme, et un clic dessus l'ouvre.
      const reglage = document.createElement('label')
      const legende = document.createElement('span')
      legende.textContent = textes.profondeur ?? ''
      const choix = document.createElement('select')
      reglage.append(legende, choix)
      for (const n of PROFONDEURS_TABLE) {
        const option = document.createElement('option')
        option.value = String(n)
        option.textContent = textes.niveaux?.[n - 1] ?? String(n)
        option.selected = n === profondeur
        choix.append(option)
      }
      choix.addEventListener('change', () => {
        if (!editeur.isEditable) return
        editeur.updateBlock(bloc.id, { props: { profondeur: profondeurTable(choix.value) } })
      })
      const liste = document.createElement('ol')
      const rafraichir = () => {
        choix.disabled = !editeur.isEditable
        const entrees = entreesTable(titresDesBlocs(editeur.document), profondeur)
        liste.replaceChildren(
          ...entrees.map((e) => {
            const li = document.createElement('li')
            li.setAttribute('data-niveau', String(e.niveau))
            li.textContent = e.texte
            return li
          }),
        )
      }
      rafraichir()
      const arreter = editeur.onChange(rafraichir)
      choix.addEventListener('focus', rafraichir)
      nav.append(titre, reglage, liste)
      return {
        dom: nav,
        // Le bloc n'a pas de contenu à lui : ce qui change dedans (la liste,
        // le choix) n'est pas une modification du document.
        ignoreMutation: () => true,
        destroy: () => arreter?.(),
      }
    },
  },
)
