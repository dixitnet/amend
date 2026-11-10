// Adaptateur BlockNote, côté serveur (couche 2) : lire et écrire un document
// Yjs 14 en blocs BlockNote, sans navigateur (exports, IA, imports, tests).
import { BlockNoteEditor } from '@blocknote/core'
import { yDocToBlocks, blocksToYDoc, blockNoteTransformer, YjsThreadStore } from '@blocknote/core/y'
import { CommentsExtension, DefaultThreadStoreAuth } from '@blocknote/core/comments'
import * as Y from '@y/y'
import { ynodeToPmnode, pmnodeToDelta } from '@y/prosemirror'
import { Transform } from 'prosemirror-transform'
import * as delta from 'lib0/delta'
import { schemaLivre } from './schema.js'

let editeur = null
// Avec l'extension des commentaires, pour que le schéma ait leur marque
// (`comment`) ; son magasin de fils ne sert à rien ici.
const editeurSansVue = () =>
  (editeur ??= BlockNoteEditor.create({
    schema: schemaLivre,
    extensions: [
      CommentsExtension({
        threadStore: new YjsThreadStore(
          'serveur',
          new Y.Doc().get('fils'),
          new DefaultThreadStoreAuth('serveur', 'comment'),
        ),
        resolveUsers: async () => [],
      }),
    ],
  }))

/** Les blocs d'un document, depuis son état Yjs encodé. Un état illisible
 * lève une erreur de code `document-illisible`, jamais une erreur interne. */
export function lireBlocs(etat, racine = 'doc') {
  const doc = new Y.Doc()
  try {
    Y.applyUpdate(doc, etat)
    return yDocToBlocks(editeurSansVue(), doc, racine)
  } catch (cause) {
    throw Object.assign(new Error('document illisible', { cause }), { code: 'document-illisible' })
  } finally {
    doc.destroy()
  }
}

/** L'état Yjs encodé d'un document fait de ces blocs. Des blocs hors du
 * schéma du livre lèvent une erreur de code `blocs-invalides`. */
export function ecrireBlocs(blocs, racine = 'doc') {
  let doc
  try {
    doc = blocksToYDoc(editeurSansVue(), blocs, racine)
  } catch (cause) {
    throw Object.assign(new Error('blocs invalides', { cause }), { code: 'blocs-invalides' })
  }
  try {
    return Y.encodeStateAsUpdate(doc)
  } finally {
    doc.destroy()
  }
}

/** Le texte brut d'une liste de blocs (pour comparer, compter, indexer) : un
 * bloc par ligne, une ligne de tableau par ligne (cellules séparées par une
 * tabulation). */
export function texteDesBlocs(blocs) {
  const lignes = []
  const enLigne = (contenu) =>
    (contenu || []).map((c) => c.text ?? (Array.isArray(c.content) ? enLigne(c.content) : '')).join('')
  const parcourir = (liste) => {
    for (const b of liste) {
      if (Array.isArray(b.content)) lignes.push(enLigne(b.content))
      else if (b.content?.type === 'tableContent')
        for (const rangee of b.content.rows) lignes.push(rangee.cells.map((c) => enLigne(c.content ?? c)).join('\t'))
      if (b.children?.length) parcourir(b.children)
    }
  }
  parcourir(blocs)
  return lignes.join('\n')
}

/**
 * Pose l'ancre d'un fil de commentaires dans le texte (la marque `comment`
 * que BlockNote pose dans le navigateur de qui peut écrire) pour une personne
 * qui ne le peut pas, le correcteur : décision de Sylvain (étape 5, 2b).
 * L'ancre est donnée en coordonnées du texte principal (bloc et décalage, sans
 * les insertions suggérées) avec le passage cité, qui doit s'y retrouver.
 * @param {Uint8Array} etat  l'état Yjs encodé du texte principal
 * @param {{ debut: { blocId: string, decalage: number }, fin: { blocId: string, decalage: number }, citation: string, fil: string }} ancre
 * @returns {{ code: 'ok', mise: Uint8Array } | { code: 'ancre-invalide' | 'bloc-introuvable' | 'ancre-vide' | 'ancre-perimee' }}
 */
export function ancreCommentaire(etat, ancre, racine = 'doc') {
  const point = (p) => p && typeof p.blocId === 'string' && Number.isSafeInteger(p.decalage) && p.decalage >= 0
  if (
    !ancre ||
    !point(ancre.debut) ||
    !point(ancre.fin) ||
    typeof ancre.citation !== 'string' ||
    typeof ancre.fil !== 'string'
  )
    return { code: 'ancre-invalide' }
  const schema = editeurSansVue().pmSchema
  const doc = new Y.Doc()
  try {
    Y.applyUpdate(doc, etat)
    const fragment = doc.get(racine)
    const ancien = ynodeToPmnode(fragment, schema, { transformer: blockNoteTransformer })
    /** Début du contenu de chaque bloc, par identifiant. */
    const debuts = new Map()
    ancien.descendants((n, p) => {
      if (n.type.name === 'blockContainer')
        debuts.set(n.attrs.id, { pos: p + 2, taille: n.firstChild?.content.size ?? 0 })
    })
    const de = debuts.get(ancre.debut.blocId)
    const a = debuts.get(ancre.fin.blocId)
    if (!de || !a) return { code: 'bloc-introuvable' }
    if (ancre.debut.decalage > de.taille || ancre.fin.decalage > a.taille) return { code: 'ancre-perimee' }
    const from = de.pos + ancre.debut.decalage
    const to = a.pos + ancre.fin.decalage
    if (to <= from) return { code: 'ancre-vide' }
    let lu = ''
    ancien.nodesBetween(from, to, (n, pos) => {
      if (n.isText) lu += n.text.slice(Math.max(0, from - pos), to - pos)
      else if (n.type.name === 'blockContainer' && lu) lu += '\n'
    })
    if (lu !== ancre.citation) return { code: 'ancre-perimee' }
    const nouveau = new Transform(ancien).addMark(
      from,
      to,
      schema.marks.comment.create({ threadId: ancre.fil, orphan: false }),
    ).doc
    const avant = Y.encodeStateVector(doc)
    const diff = delta.diff(
      pmnodeToDelta(ancien, { transformer: blockNoteTransformer }),
      pmnodeToDelta(nouveau, { transformer: blockNoteTransformer }),
    )
    doc.transact(() => fragment.applyDelta(diff))
    return { code: 'ok', mise: Y.encodeStateAsUpdate(doc, avant) }
  } catch (cause) {
    throw Object.assign(new Error('document illisible', { cause }), { code: 'document-illisible' })
  } finally {
    doc.destroy()
  }
}

// --- Margo (étape 8) -------------------------------------------------------

/** Un atome en ligne (tout ce qui n'est pas du texte) : un signe dans le texte
 * montré à Margo, qu'aucune correction ne peut toucher. */
const ATOME = '\uFFFC'

/** Les blocs à texte d'un nœud ProseMirror du document, dans l'ordre, avec
 * leur texte et de quoi passer d'un décalage dans ce texte à une position. */
function blocsATexte(pm) {
  const blocs = []
  pm.descendants((n, p) => {
    if (n.type.name !== 'blockContainer') return true
    const c = n.firstChild
    if (c?.isTextblock) {
      let texte = ''
      const segments = []
      c.forEach((enfant, decalage) => {
        const pos = p + 2 + decalage
        if (enfant.isText) {
          segments.push({ i: texte.length, pos, longueur: enfant.text.length, atome: false })
          texte += enfant.text
        } else {
          segments.push({ i: texte.length, pos, longueur: 1, atome: true })
          texte += ATOME
        }
      })
      blocs.push({
        id: n.attrs.id,
        type: c.type.name,
        niveau: c.type.name === 'heading' ? (c.attrs.level ?? null) : null,
        texte,
        debut: p + 2,
        segments,
      })
    }
    return true
  })
  return blocs
}

/** La plage ProseMirror d'un passage du texte d'un bloc ; `null` s'il touche un atome. */
function plage(bloc, debut, fin) {
  if (debut < 0 || fin > bloc.texte.length || fin < debut) return null
  if (bloc.texte.slice(debut, fin).includes(ATOME)) return null
  const position = (i) => {
    if (!bloc.segments.length) return bloc.debut
    for (const s of bloc.segments) if (!s.atome && i >= s.i && i <= s.i + s.longueur) return s.pos + (i - s.i)
    // Juste avant ou après un atome : la position qui le borde.
    const s = bloc.segments.find((x) => x.i === i) ?? bloc.segments.find((x) => x.i + x.longueur === i)
    return s ? (s.i === i ? s.pos : s.pos + 1) : null
  }
  const de = position(debut)
  const a = position(fin)
  return de === null || a === null ? null : { de, a }
}

/** Le document des suggestions tel qu'un éditeur le voit : le texte principal
 * (qui s'y recopie toujours, comme le fait l'afficheur de Yjs) et les
 * suggestions en cours. */
function docDesSuggestions(etatTexte, etatSuggestions) {
  const doc = new Y.Doc({ isSuggestionDoc: true })
  if (etatSuggestions?.length) Y.applyUpdate(doc, etatSuggestions)
  Y.applyUpdate(doc, etatTexte)
  return doc
}

const publics = (blocs) => blocs.map(({ id, type, niveau, texte }) => ({ id, type, niveau, texte }))

/**
 * Les blocs à texte, pour Margo : `[{ id, type, niveau, texte }]`. Avec l'état
 * des suggestions, le texte se lit comme si elles étaient acceptées (ce que
 * Margo corrige) ; sans, c'est le texte principal (où s'ancrent les commentaires).
 */
export function blocsATexteDe(etatTexte, etatSuggestions = null, racine = 'doc') {
  const schema = editeurSansVue().pmSchema
  const doc = etatSuggestions ? docDesSuggestions(etatTexte, etatSuggestions) : new Y.Doc()
  try {
    if (!etatSuggestions) Y.applyUpdate(doc, etatTexte)
    return publics(blocsATexte(ynodeToPmnode(doc.get(racine), schema, { transformer: blockNoteTransformer })))
  } catch (cause) {
    throw Object.assign(new Error('document illisible', { cause }), { code: 'document-illisible' })
  } finally {
    doc.destroy()
  }
}

/**
 * Écrit des corrections dans les suggestions, comme le ferait un correcteur :
 * le texte principal ne change pas, un éditeur accepte ou refuse chacune.
 * Les décalages sont ceux du texte rendu par `blocsATexteDe` avec les
 * suggestions. Rend, pour chaque remplacement, `posee`, `bloc` (bloc absent)
 * ou `structure` (passage qui touche autre chose que du texte), et la mise à
 * jour à écrire dans la branche des suggestions (`null` si rien n'est posé).
 * @param {Array<{ blocId: string, debut: number, fin: number, apres: string }>} remplacements
 * @returns {{ resultats: Array<'posee' | 'bloc' | 'structure'>, mise: Uint8Array | null }}
 */
export function suggererRemplacements(etatTexte, etatSuggestions, remplacements, racine = 'doc') {
  const schema = editeurSansVue().pmSchema
  const doc = docDesSuggestions(etatTexte, etatSuggestions)
  try {
    const fragment = doc.get(racine)
    const ancien = ynodeToPmnode(fragment, schema, { transformer: blockNoteTransformer })
    const parId = new Map(blocsATexte(ancien).map((b) => [b.id, b]))
    const resultats = []
    const plages = []
    for (const r of remplacements) {
      const bloc = parId.get(r.blocId)
      if (!bloc) {
        resultats.push('bloc')
        continue
      }
      const p = plage(bloc, r.debut, r.fin)
      if (!p) {
        resultats.push('structure')
        continue
      }
      resultats.push('posee')
      plages.push({ ...p, apres: String(r.apres ?? '') })
    }
    if (!plages.length) return { resultats, mise: null }
    // De la fin vers le début : chaque position reste juste.
    plages.sort((x, y) => y.de - x.de)
    let tr = new Transform(ancien)
    for (const { de, a, apres } of plages) {
      const marques = ancien.resolve(de).marks()
      tr = apres ? tr.replaceWith(de, a, schema.text(apres, marques)) : tr.delete(de, a)
    }
    const avant = Y.encodeStateVectorFromUpdate(
      etatSuggestions?.length ? etatSuggestions : Y.encodeStateAsUpdate(new Y.Doc()),
    )
    const diff = delta.diff(
      pmnodeToDelta(ancien, { transformer: blockNoteTransformer }),
      pmnodeToDelta(tr.doc, { transformer: blockNoteTransformer }),
    )
    doc.transact(() => fragment.applyDelta(diff))
    return { resultats, mise: Y.encodeStateAsUpdate(doc, avant) }
  } catch (cause) {
    throw Object.assign(new Error('document illisible', { cause }), { code: 'document-illisible' })
  } finally {
    doc.destroy()
  }
}
