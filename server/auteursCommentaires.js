// Rattacher les commentaires d'avant à un compte (point 9 de la feuille de
// route, 13/10/2026).
//
// Depuis le 10/10/2026 (audit S12) chaque commentaire porte `authorId`,
// l'identifiant stable du compte. Ceux d'avant n'ont que `author`, le nom
// affiché — qui n'est pas unique et se change. Pour qu'un lecteur ne touche
// qu'aux siens **sans** garder la comparaison par nom, le serveur complète
// ces commentaires quand il charge un document :
//
//   - le nom est celui d'un seul membre du document → son identifiant ;
//   - « Claude (pour X) » → `AUTEUR_AGENT` ;
//   - sinon (nom absent des membres, ou porté par deux d'entre eux) →
//     `AUTEUR_INCONNU` : on ne devine pas, un mauvais rattachement donnerait
//     à quelqu'un la main sur le commentaire d'un autre.
//
// Fait une fois par chargement de la réplique, avant que quiconque se
// connecte ; l'opération qui en résulte est écrite au journal comme n'importe
// quelle autre (repliques.apresChargement, replique.js). Idempotent : un
// commentaire qui a déjà un `authorId` n'est jamais touché.

import * as Y from 'yjs'
import { AUTEUR_AGENT, AUTEUR_INCONNU, NOM_COMMENTAIRES } from '../shared/protocole.js'

const cleDeNom = (nom) =>
  String(nom ?? '')
    .normalize('NFC')
    .trim()
const EST_UN_AGENT = /^Claude \(pour /

/**
 * @param {Y.Doc} doc
 * @param {{id: string, nom: string|null}[]} membres  les personnes qui ont un accès au document
 * @returns {{attribues: number, agents: number, inconnus: number, update: Uint8Array|null}}
 */
export function rattacherAuteurs(doc, membres) {
  const carte = doc.getMap(NOM_COMMENTAIRES)
  const parNom = new Map()
  for (const m of membres || []) {
    const cle = cleDeNom(m.nom)
    if (!cle || !m.id) continue
    if (!parNom.has(cle)) parNom.set(cle, new Set())
    parNom.get(cle).add(m.id)
  }
  const aFaire = []
  carte.forEach((v, cle) => {
    if (v && typeof v === 'object' && 'author' in v && v.authorId === undefined) aFaire.push([cle, v])
  })
  const bilan = { attribues: 0, agents: 0, inconnus: 0, update: null }
  if (!aFaire.length) return bilan

  const ecoute = (u) => {
    bilan.update = bilan.update ? Y.mergeUpdates([bilan.update, u]) : u
  }
  doc.on('update', ecoute)
  try {
    doc.transact(() => {
      for (const [cle, v] of aFaire) {
        let authorId
        const candidats = parNom.get(cleDeNom(v.author))
        if (EST_UN_AGENT.test(String(v.author))) {
          authorId = AUTEUR_AGENT
          bilan.agents++
        } else if (candidats && candidats.size === 1) {
          authorId = [...candidats][0]
          bilan.attribues++
        } else {
          authorId = AUTEUR_INCONNU
          bilan.inconnus++
        }
        carte.set(cle, { ...v, authorId })
      }
    }, 'rattachement-auteurs')
  } finally {
    doc.off('update', ecoute)
  }
  return bilan
}
