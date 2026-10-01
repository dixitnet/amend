// Le document type qu'on remet à un testeur qu'on « embarque » (01/10/2026,
// claude/etude-... — décision de Sylvain : le testeur en est le propriétaire).
//
// Écrit **directement dans Yjs**, comme le fait `server/agentTexte.js` pour
// les propositions de Claude : le serveur ne connaît pas ProseMirror, il
// connaît la forme que y-prosemirror donne au document (un XmlElement par
// nœud, le texte dans des XmlText dont les attributs portent les marques).
// Le contenu est du **texte neutre, sans marque de suivi** : c'est un point
// de départ, pas une proposition de quelqu'un.
//
// Le test `client/test/modele-bienvenue.test.js` relit ce que ce module écrit
// avec le vrai schéma du client : si la forme change, c'est lui qui le dit.

import * as Y from 'yjs'
import { NOM_TEXTE } from './agentTexte.js'

const G = (texte) => [texte, { strong: {} }]
const T = (texte) => [texte, {}]

export const TITRE_BIENVENUE = 'Bienvenue sur amend.ink'

/** Le contenu, en données : un bloc est `{ type, ... }` et un texte est une
 * liste de morceaux `[texte, marques]`. */
export const BLOCS_BIENVENUE = [
  { type: 'heading', level: 1, texte: [T('Bienvenue sur amend.ink')] },
  {
    type: 'paragraph',
    texte: [
      T(
        'amend.ink est un éditeur de texte à plusieurs mains : vous y écrivez seul ou à plusieurs, et on vous '
      ),
      ['propose', { em: {} }],
      T(
        ' des corrections au lieu de les faire à votre place. C’est vous qui acceptez ou refusez. Ce document est le vôtre : vous en êtes le propriétaire, et personne d’autre n’y a accès tant que vous n’invitez personne.'
      ),
    ],
  },
  { type: 'heading', level: 2, texte: [T('Quatre choses à essayer')] },
  {
    type: 'bullet_list',
    items: [
      [
        G('Le suivi des modifications. '),
        T(
          'Cochez « Suivi des modifications » dans le bandeau, puis modifiez une phrase : ce que vous écrivez apparaît souligné à votre couleur, ce que vous effacez reste barré. Le panneau de droite liste vos modifications ; vous pouvez les accepter ou les refuser une à une.'
        ),
      ],
      [
        G('Un commentaire. '),
        T('Sélectionnez un passage : un bouton « Commenter » apparaît en face. Votre commentaire s’affiche dans la marge, et on peut y répondre.'),
      ],
      [
        G('L’IA. '),
        T(
          'Sélectionnez un paragraphe, décrivez ce que vous voulez (« corriger l’orthographe », « raccourcir ») et cliquez sur « Demander à l’IA ». La proposition arrive comme une modification en attente, jamais à votre place.'
        ),
      ],
      [
        G('Inviter quelqu’un. '),
        T(
          'Menu « Partager » → « Gérer les accès… » : saisissez une adresse et choisissez un rôle (éditeur, correcteur ou lecteur). La personne reçoit un lien qui ouvre ce document directement.'
        ),
      ],
    ],
  },
  { type: 'heading', level: 2, texte: [T('Un paragraphe pour s’exercer')] },
  {
    type: 'paragraph',
    texte: [
      T(
        'Ils mange des pomme au marché, et le chat dormait sur la table. Corrigez ce paragraphe avec le suivi activé, puis acceptez ou refusez vos propres corrections.'
      ),
    ],
  },
  { type: 'heading', level: 2, texte: [T('Un retour ?')] },
  {
    type: 'paragraph',
    texte: [
      T('amend.ink est en phase de test, et votre avis compte. Le bouton « Un retour ? », en bas à droite, envoie une question, une idée ou un bug. Le document en cours et votre navigateur sont joints automatiquement, '),
      G('jamais le contenu de vos documents'),
      T('. Même un message de trois mots est utile.'),
    ],
  },
]

function ecrireTexte(el, morceaux) {
  const xt = new Y.XmlText()
  el.insert(0, [xt])
  let index = 0
  for (const [texte, marques] of morceaux) {
    // Les attributs sont donnés à chaque morceau, même vides : Yjs reprend
    // sinon ceux du morceau précédent (le gras « déborderait »).
    xt.insert(index, texte, marques || {})
    index += texte.length
  }
}

/** Écrit `blocs` à la suite du contenu de `ydoc` (supposé vide). */
export function ecrireModele(ydoc, blocs = BLOCS_BIENVENUE) {
  const racine = ydoc.getXmlFragment(NOM_TEXTE)
  ydoc.transact(() => {
    for (const bloc of blocs) {
      if (bloc.type === 'heading') {
        const el = new Y.XmlElement('heading')
        racine.insert(racine.length, [el])
        el.setAttribute('level', bloc.level)
        ecrireTexte(el, bloc.texte)
      } else if (bloc.type === 'paragraph') {
        const el = new Y.XmlElement('paragraph')
        racine.insert(racine.length, [el])
        ecrireTexte(el, bloc.texte)
      } else if (bloc.type === 'bullet_list') {
        const liste = new Y.XmlElement('bullet_list')
        racine.insert(racine.length, [liste])
        for (const item of bloc.items) {
          const li = new Y.XmlElement('list_item')
          liste.insert(liste.length, [li])
          const p = new Y.XmlElement('paragraph')
          li.insert(0, [p])
          ecrireTexte(p, item)
        }
      }
    }
  }, 'modele')
}
