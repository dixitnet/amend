// Les garde-fous de l'IA : un seul endroit, documenté, modifiable — et aucun
// seuil caché ailleurs (15/10/2026, server/garde-fous.js).

import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GARDE_FOUS,
  GROUPES,
  appliquerGardeFous,
  assainirGardeFous,
  corpsMaxOctets,
  garde,
  gardeFousEnVigueur,
  validerGardeFous,
} from '../garde-fous.js'
import { ReglagesIa } from '../reglagesIa.js'
import { Mcp } from '../mcp.js'

const ici = dirname(fileURLToPath(import.meta.url))
const dossier = () => mkdtempSync(join(tmpdir(), 'collabtext-test-garde-fous-'))

afterEach(() => appliquerGardeFous({}))

test('neuf garde-fous, pas un de plus : les vingt autres ont été supprimés le 22/10/2026', () => {
  assert.deepEqual(GARDE_FOUS.map((g) => g.id).sort(), [
    'corpsMcpOctets',
    'correctionsEnParallele',
    'ecrituresParHeure',
    'lotMcp',
    'margoCoupures',
    'margoEtapes',
    'margoMargeLecture',
    'margoRelances',
    'sortieMaxJetons',
  ])
  for (const supprime of [
    'margoHistorique',
    'margoMessages',
    'margoSimultanes',
    'lireSignesParReponse',
    'longueurNote',
  ])
    assert.throws(() => garde(supprime), /garde-fou inconnu/)
})

test('chaque garde-fou : un identifiant unique, une description, un groupe connu, un défaut dans ses bornes', () => {
  const ids = new Set()
  const groupes = new Set(GROUPES.map((g) => g.id))
  for (const g of GARDE_FOUS) {
    assert.ok(!ids.has(g.id), `identifiant en double : ${g.id}`)
    ids.add(g.id)
    assert.ok(groupes.has(g.groupe), `${g.id} : groupe inconnu`)
    assert.ok(['modele', 'emballement'].includes(g.nature), `${g.id} : nature`)
    assert.ok(g.nom && g.unite && g.quoi.length > 40, `${g.id} : nom, unité et description`)
    assert.ok(Number.isInteger(g.defaut) && Number.isInteger(g.min) && Number.isInteger(g.max), `${g.id} : entiers`)
    assert.ok(g.min >= 0 && g.min <= g.defaut && g.defaut <= g.max, `${g.id} : le défaut tient dans ses bornes`)
  }
  for (const gr of GROUPES)
    assert.ok(
      GARDE_FOUS.some((g) => g.groupe === gr.id),
      `groupe vide : ${gr.id}`
    )
})

test('un identifiant inconnu lève une erreur : un seuil introuvable ne devient jamais « pas de limite »', () => {
  assert.throws(() => garde('margoEtape'), /garde-fou inconnu/)
})

test('les valeurs livrées sont celles de la documentation ; réglées, elles changent et se rétablissent une à une', () => {
  assert.equal(garde('margoEtapes'), 100)
  assert.equal(garde('ecrituresParHeure'), 120)
  appliquerGardeFous({ margoEtapes: 50, ecrituresParHeure: 'beaucoup', inconnu: 3, margoCoupures: 2.5 })
  assert.equal(garde('margoEtapes'), 50)
  assert.equal(garde('ecrituresParHeure'), 120, 'une valeur invalide est ignorée')
  assert.equal(garde('margoCoupures'), 2)
  assert.equal(gardeFousEnVigueur().margoEtapes, 50)
  assert.equal(Object.keys(gardeFousEnVigueur()).length, GARDE_FOUS.length)
  assert.deepEqual(assainirGardeFous({ margoEtapes: 100 }), {}, 'égal au défaut : rien à garder')
})

test('la validation dit quoi corriger et ne retient rien en cas de refus', () => {
  assert.throws(
    () => validerGardeFous({ margoEtapes: 0 }),
    /« Étapes d’une demande, au plus » doit être un entier entre 5 et 10 000/
  )
  assert.throws(() => validerGardeFous({ margoEtapes: '50' }), /entier/)
  assert.throws(() => validerGardeFous({ nimporte: 5 }), /réglage inconnu/)
  assert.throws(() => validerGardeFous([1]), /illisibles/)
  assert.deepEqual(validerGardeFous({ margoEtapes: 60, margoCoupures: null }, { margoCoupures: 5 }), {
    margoEtapes: 60,
  })
})

test('réglés depuis le back-office : écrits sur le disque, relus au redémarrage, tout ou rien', () => {
  const d = dossier()
  const r = new ReglagesIa(d, { maintenant: () => 7 })
  r.modifier({ gardeFous: { margoEtapes: 40, ecrituresParHeure: 500 } }, 'admin@x.fr')
  assert.equal(garde('margoEtapes'), 40)
  assert.equal(garde('ecrituresParHeure'), 500)
  assert.deepEqual(r.tous().gardeFous, { margoEtapes: 40, ecrituresParHeure: 500 })

  // Un refus n'en applique aucun, ni des garde-fous ni du reste.
  assert.throws(
    () => r.modifier({ margo: { signesParMois: 2_000 }, gardeFous: { margoEtapes: 7, margoCoupures: 99 } }, 'a'),
    /Reprises après une réponse coupée/
  )
  assert.equal(garde('margoEtapes'), 40)
  assert.equal(r.de('margo').signesParMois, 300_000)

  const fichier = JSON.parse(readFileSync(join(d, 'reglages-ia.json'), 'utf8'))
  assert.deepEqual(fichier.gardeFous, { margoEtapes: 40, ecrituresParHeure: 500 })

  appliquerGardeFous({}) // comme un processus qui redémarre
  new ReglagesIa(d)
  assert.equal(garde('margoEtapes'), 40, 'relu du disque')

  const relu = new ReglagesIa(d)
  relu.modifier({ gardeFous: { margoEtapes: null, ecrituresParHeure: 120 } }, 'admin@x.fr')
  assert.equal(garde('margoEtapes'), 100)
  assert.deepEqual(relu.tous().gardeFous, {}, 'rétablis : plus rien de réglé')
})

test('un nouveau ReglagesIa sans garde-fous réglés remet les défauts (aucune fuite d’une instance à l’autre)', () => {
  appliquerGardeFous({ margoEtapes: 9 })
  new ReglagesIa(dossier())
  assert.equal(garde('margoEtapes'), 100)
})

test('les outils n’annoncent plus de plafond au modèle : ni nombre d’éléments par appel, ni borne de lecture', () => {
  const mcp = new Mcp({ agents: {}, storage: {}, rooms: {} })
  const droits = { capabilities: { canProposeChanges: true, canComment: true } }
  const outils = Object.fromEntries(mcp._outilsPour(droits).map((o) => [o.name, o]))
  assert.equal(outils.proposer.inputSchema.properties.remplacements.maxItems, undefined)
  assert.equal(outils.commenter.inputSchema.properties.commentaires.maxItems, undefined)
  assert.equal(outils.lire.inputSchema.properties.nombre.maximum, undefined)
  assert.equal(outils.chercher.inputSchema.properties.limite.maximum, undefined)
  assert.doesNotMatch(outils.proposer.description, /Jusqu’à \d+ remplacements/)
})

test('un corps de requête peut porter toute la limite en signes, quel que soit le nombre d’octets par signe', () => {
  assert.equal(corpsMaxOctets(100_000), 450_000)
  const surDeuxOctets = '€'.repeat(100_000) // 3 octets en UTF-8
  assert.ok(Buffer.byteLength(surDeuxOctets) <= corpsMaxOctets(100_000))
})

// ---------------------------------------------------------------------------
// Aucun seuil caché
// ---------------------------------------------------------------------------

/** Les fichiers où vit l'IA : un seuil de plus ne doit jamais s'y glisser. */
const FICHIERS_IA = [
  'ai.js',
  'dialogue.js',
  'mcp.js',
  'agentTexte.js',
  'connecteur.js',
  'fournisseurs.js',
  'quotasIa.js',
  'routes/ia.js',
]

/**
 * Ce qui ressemble à un seuil et n'en est pas un : des valeurs de pagination par
 * défaut, une fenêtre de temps, une taille d'extrait d'affichage, la portée d'un
 * repère. Chaque entrée dit pourquoi ; ajouter ici demande de le justifier.
 */
const PAS_UN_SEUIL = [
  {
    fichier: 'mcp.js',
    motif: /^const CHERCHER_PAR_DEFAUT = 20$/,
    pourquoi: 'défaut de pagination',
  },
  { fichier: 'mcp.js', motif: /^export const LIRE_PAR_DEFAUT = 40$/, pourquoi: 'défaut de pagination' },
  {
    fichier: 'dialogue.js',
    motif: /^const ATTENTE_QUOTA_MS = 20_000$/,
    pourquoi: 'durée d’attente après un 429 faute de délai annoncé : un délai, pas une limite d’usage',
  },
  {
    fichier: 'dialogue.js',
    motif: /^const ATTENTE_QUOTA_MAX_MS = 60_000$/,
    pourquoi: 'durée d’attente après un 429 : jusqu’où suivre le délai annoncé, un délai, pas une limite d’usage',
  },
  {
    fichier: 'mcp.js',
    motif: /^const ECRITURES_FENETRE_MS = 60 \* 60_000$/,
    pourquoi: 'la fenêtre (une heure) du garde-fou « par heure »',
  },
  {
    fichier: 'ai.js',
    motif: /^const PLANCHER_SORTIE_JETONS = 4096$/,
    pourquoi: 'plancher du budget de sortie d’un paragraphe : un plafond, il ne coûte que ce que le modèle écrit',
  },
  {
    fichier: 'agentTexte.js',
    motif: /^const ANCRE_NOTE_MAX = 60$/,
    pourquoi: 'contexte de repérage de l’appel de note, pas une limite',
  },
  { fichier: 'agentTexte.js', motif: /out\.length > 400/, pourquoi: 'extrait affiché du passage commenté' },
  {
    fichier: 'dialogue.js',
    motif: /cherche « \$\{String\(a\.texte \|\| ''\)\.slice\(0, 40\)\}/,
    pourquoi: 'libellé affiché : début du texte cherché',
  },
  {
    fichier: 'dialogue.js',
    motif: /digest\('hex'\)\.slice\(0, 10\)/,
    pourquoi: 'identifiant court (empreinte de l’adresse), pas une limite',
  },
  {
    fichier: 'mcp.js',
    motif: /méthode inconnue : \$\{String\(m\.method\)\.slice\(0, 60\)\}/,
    pourquoi: 'message d’erreur : nom de méthode raccourci pour ne pas renvoyer un texte énorme',
  },
  {
    fichier: 'mcp.js',
    motif: /outil inconnu : \$\{String\(params\.name\)\.slice\(0, 40\)\}/,
    pourquoi: 'message d’erreur : nom d’outil raccourci',
  },
  {
    fichier: 'fournisseurs.js',
    motif: /String\(detail\)\.slice\(0, 500\)/,
    pourquoi: 'message d’erreur du fournisseur raccourci avant d’être renvoyé',
  },
  {
    fichier: 'quotasIa.js',
    motif: /^const HEURE_MS = 3600_000$/,
    pourquoi: 'la fenêtre du réglage « demandes par heure »',
  },
]

function lignesSuspectes(chemin) {
  const texte = readFileSync(join(ici, '..', chemin), 'utf8')
  const sortie = []
  texte.split('\n').forEach((ligne, i) => {
    const code = ligne.replace(/\/\/.*$/, '').trim()
    if (!code || code.startsWith('*') || code.startsWith('/*')) return
    const suspect =
      /^(export\s+)?const\s+[A-Z][A-Z0-9_]*\s*=\s*[\d_*. ]+$/.test(code) || // const X_MAX = 100
      /(maxItems|maximum)\s*:\s*\d/.test(code) || // schéma d'outil avec un nombre en dur
      /\.slice\(\s*0\s*,\s*\d{2,}\s*\)/.test(code) || // troncature silencieuse
      /\.length\s*>=?\s*\d{3,}/.test(code) // comparaison de longueur à un nombre en dur
    if (suspect) sortie.push({ n: i + 1, code })
  })
  return sortie
}

test('aucun seuil d’IA n’est défini hors de server/garde-fous.js (sauf ce qui n’en est pas un, et qui est dit)', () => {
  const restes = []
  for (const f of FICHIERS_IA) {
    for (const s of lignesSuspectes(f)) {
      const admis = PAS_UN_SEUIL.some((p) => p.fichier === f.split('/').pop() && p.motif.test(s.code))
      if (!admis) restes.push(`${f}:${s.n}  ${s.code}`)
    }
  }
  assert.deepEqual(
    restes,
    [],
    'un seuil en dur : le déplacer dans server/garde-fous.js (ou le justifier dans PAS_UN_SEUIL)'
  )
})

test('chaque exception de PAS_UN_SEUIL correspond encore à une ligne (la liste ne vieillit pas)', () => {
  for (const p of PAS_UN_SEUIL) {
    const fichier = FICHIERS_IA.find((f) => f.split('/').pop() === p.fichier)
    const texte = readFileSync(join(ici, '..', fichier), 'utf8')
    assert.ok(
      texte.split('\n').some((l) => p.motif.test(l.replace(/\/\/.*$/, '').trim())),
      `exception périmée : ${p.fichier} ${p.motif}`
    )
  }
})

test('chaque garde-fou défini est lu quelque part (aucun réglage mort)', () => {
  const sources = FICHIERS_IA.map((f) => readFileSync(join(ici, '..', f), 'utf8')).join('\n')
  const autres = ['reglagesIa.js', 'routes/admin.js'].map((f) => readFileSync(join(ici, '..', f), 'utf8')).join('\n')
  const morts = GARDE_FOUS.filter((g) => !sources.includes(`'${g.id}'`) && !autres.includes(`'${g.id}'`)).map(
    (g) => g.id
  )
  assert.deepEqual(morts, [])
  assert.ok(existsSync(join(ici, '..', 'garde-fous.js')))
})
