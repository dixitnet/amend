#!/usr/bin/env node
// Écrit sur la sortie standard la documentation des garde-fous de l'IA, depuis
// la liste de server/garde-fous.js (la seule source) :
//
//   node tools/garde-fous-doc.mjs > garde-fous-ia.md
//
// Les valeurs « par défaut » sont celles du code ; celles réglées dans le
// back-office (data/reglages-ia.json) ne figurent pas ici.

import { GARDE_FOUS, GROUPES } from '../server/garde-fous.js'
import { BORNES } from '../server/reglagesIa.js'

const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const NATURE = { modele: 'limite du modèle', emballement: 'verrou contre l’emballement' }

const sortie = []
sortie.push('# Garde-fous de l’IA')
sortie.push('')
sortie.push(
  'Document produit par `node tools/garde-fous-doc.mjs` à partir de `server/garde-fous.js`, la seule source. Ne pas le modifier à la main : modifier la liste, puis le régénérer.'
)
sortie.push('')
sortie.push('## Le principe')
sortie.push('')
sortie.push(
  'La **seule limite d’usage** est la taille de la demande, en signes, espaces compris (« signes par demande », réglage d’instance du back-office, avec le nombre de demandes par heure et le nombre de signes par mois et par personne). Tout le reste est un garde-fou, et un garde-fou est soit **une limite du modèle** (ce qu’il peut produire ou recevoir en une fois), soit **un verrou contre l’emballement** (une boucle, un client qui boucle), placé bien au-dessus de tout usage normal.'
)
sortie.push('')
sortie.push(
  'Il en reste **neuf**, tous visibles et réglables : les vingt autres ont été supprimés le 22/10/2026 (voir la fin de ce document). Ils valent pour Corrections IA, pour Margo et pour le connecteur « inviter Claude ». Ils se règlent dans le back-office (`#/admin/ia`, section « Garde-fous »), pour toute l’instance, un par un, et se rétablissent un par un ; le changement s’applique à la demande suivante, sans redémarrage. Aucun autre fichier de l’IA ne définit de seuil : un test (`server/test/garde-fous.test.js`) échoue si une constante de seuil réapparaît.'
)
sortie.push('')
for (const gr of GROUPES) {
  const defs = GARDE_FOUS.filter((g) => g.groupe === gr.id)
  if (!defs.length) continue
  sortie.push(`## ${gr.nom}`)
  sortie.push('')
  sortie.push(gr.resume)
  sortie.push('')
  sortie.push('| Garde-fou | Défaut | Bornes | Nature | Ce que c’est |')
  sortie.push('|---|---|---|---|---|')
  for (const g of defs) {
    sortie.push(
      `| **${g.nom}** (\`${g.id}\`) | ${fmt(g.defaut)} ${g.unite} | ${fmt(g.min)} à ${fmt(g.max)} | ${NATURE[g.nature]} | ${g.quoi.replace(/\|/g, '\\|')} |`
    )
  }
  sortie.push('')
}
sortie.push('## Ce qui a été supprimé le 22/10/2026')
sortie.push('')
sortie.push(
  'Avec peu d’usages et des abonnements aux limites dures, vingt seuils ont été retirés : presque tous doublaient un plafond que le modèle respecte de lui-même (la sortie maximale d’un appel) ou que le fournisseur impose avec une erreur claire. Supprimés : les nombres d’éléments par appel (remplacements, ajouts, notes, commentaires, paragraphes par ajout) ; les longueurs de passage, de texte, de commentaire, de note, de consigne et de manière de répondre ; les plafonds de lecture (blocs et signes par appel), de recherche, de plan et de liste de commentaires ; le plancher de sortie d’un paragraphe corrigé ; les messages et l’historique d’une conversation de Margo, et les réponses simultanées sur l’instance. Ce qui reste fixe dans le code, sans être un réglage : la taille d’un corps de requête de l’interface (2 Mo, `CORPS_JSON_OCTETS_MAX`) et le verrou « une réponse de Margo à la fois par personne et par document ».'
)
sortie.push('')
sortie.push('## Les réglages d’usage (hors garde-fous)')
sortie.push('')
sortie.push(
  'Ce sont les limites de produit, propres à Corrections IA et à Margo, réglées dans le même écran (`server/reglagesIa.js`). Leurs bornes de saisie sont celles du formulaire :'
)
sortie.push('')
for (const [champ, b] of Object.entries(BORNES))
  sortie.push(`- \`${champ}\` : de ${fmt(b.min)} à ${fmt(b.max)} (un entier, jamais « 0 = illimité »).`)
sortie.push('')
console.log(sortie.join('\n'))
