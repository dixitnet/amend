// Agrégateur du back-office (voir claude/conception-backoffice.md).
// Lecture seule : il ne fait que relire ce qui existe déjà sur le disque et
// les trois journaux d'événements de metrics.js. Aucun contenu de document
// n'y entre — titres et métadonnées seulement.

import { statSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const JOUR = 24 * 60 * 60 * 1000

function depuis(jours) {
  return Date.now() - jours * JOUR
}

/** Recouvrements de connexions sur un même document : le nombre de fois où
 * deux personnes distinctes s'y sont trouvées en même temps. C'est
 * l'indicateur qui dit si la collaboration a réellement lieu, là où la liste
 * d'accès ne dit que qui *pourrait* collaborer. Ne compte que les connexions
 * déjà refermées (celles qui ont une durée). */
function momentsCollaboratifs(connexions) {
  const parDoc = new Map()
  for (const c of connexions) {
    if (!c.docId || !c.dureeMs) continue
    if (!parDoc.has(c.docId)) parDoc.set(c.docId, [])
    // `ts` est l'heure d'écriture (donc la fermeture) ; `debut` est l'heure
    // d'ouverture — c'est elle qui compte pour un recouvrement.
    const debut = c.debut ?? c.ts
    parDoc.get(c.docId).push({ debut, fin: debut + c.dureeMs, email: c.email })
  }
  let moments = 0
  const documents = new Set()
  for (const [docId, sessions] of parDoc) {
    sessions.sort((a, b) => a.debut - b.debut)
    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        if (sessions[j].debut >= sessions[i].fin) break
        if (sessions[j].email !== sessions[i].email) {
          moments++
          documents.add(docId)
        }
      }
    }
  }
  return { moments, documents: documents.size }
}

function tailleDossier(dir) {
  try {
    let total = 0
    for (const nom of readdirSync(dir)) {
      try {
        total += statSync(join(dir, nom)).size
      } catch {
        /* fichier disparu entre-temps */
      }
    }
    return total
  } catch {
    return null
  }
}

export function apercu({ storage, rooms, metrics, dataDir, waitlistPath }) {
  const docs = storage.allDocs()
  const maintenant = Date.now()

  // --- Utilisateurs : ils n'existent que comme adresses répétées dans les
  // listes d'accès (voir la note « centraliser la gestion des utilisateurs »
  // de claude/conception-gestion-utilisateurs.md). On les reconstitue ici.
  const parEmail = new Map()
  let invitationsEnAttente = []
  for (const doc of docs) {
    for (const acces of doc.access || []) {
      const e = parEmail.get(acces.email) || {
        email: acces.email,
        documents: 0,
        editeur: 0,
        correcteur: 0,
        depuis: acces.grantedAt,
        statut: 'invite',
      }
      e.documents++
      if (acces.role === 'editeur') e.editeur++
      else e.correcteur++
      e.depuis = Math.min(e.depuis, acces.grantedAt || maintenant)
      if (acces.status === 'actif') e.statut = 'actif'
      parEmail.set(acces.email, e)
      if (acces.status === 'invite') {
        invitationsEnAttente.push({
          email: acces.email,
          docId: doc.id,
          titre: doc.title,
          role: acces.role,
          invitePar: acces.invitedBy || null,
          depuisJours: acces.invitedAt ? Math.round((maintenant - acces.invitedAt) / JOUR) : null,
        })
      }
    }
  }
  const utilisateurs = [...parEmail.values()].sort((a, b) => b.documents - a.documents)
  invitationsEnAttente = invitationsEnAttente.sort((a, b) => (b.depuisJours || 0) - (a.depuisJours || 0))

  // Qui invite : le seul chiffre qui dise si l'outil circule tout seul ou si
  // une seule personne est le point d'entrée de tout le monde.
  const invitationsPar = {}
  for (const doc of docs) {
    for (const acces of doc.access || []) {
      if (acces.invitedBy) invitationsPar[acces.invitedBy] = (invitationsPar[acces.invitedBy] || 0) + 1
    }
  }

  // --- Documents
  const journaux = docs.map((d) => ({ id: d.id, ...storage.journalInfo(d.id) }))
  const octetsJournaux = journaux.reduce((a, j) => a + (j.octets || 0), 0)
  const participants = (d) => (d.access ? new Set(d.access.map((a) => a.email)).size : 0)
  const aPlusieurs = docs.filter((d) => participants(d) > 1)

  const documents = {
    total: docs.length,
    crees7j: docs.filter((d) => d.createdAt >= depuis(7)).length,
    crees30j: docs.filter((d) => d.createdAt >= depuis(30)).length,
    actifs7j: docs.filter((d) => (d.updatedAt || 0) >= depuis(7)).length,
    aPlusieursParticipants: aPlusieurs.length,
    partCollaborative: docs.length ? Math.round((aPlusieurs.length / docs.length) * 100) : null,
    sansControleDacces: docs.filter((d) => !d.access).length,
    journaux: {
      octetsTotal: octetsJournaux,
      plusGrosOctets: journaux.reduce((a, j) => Math.max(a, j.octets || 0), 0),
      aCompacter: journaux.filter((j) => j.aCompacter).length,
      sansHorodatage: journaux.filter((j) => j.operations === null).length,
    },
    liste: docs
      .slice()
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 50)
      .map((d) => {
        const j = journaux.find((x) => x.id === d.id) || {}
        return {
          id: d.id,
          titre: d.title,
          participants: participants(d),
          creeLe: d.createdAt,
          modifieLe: d.updatedAt,
          operations: j.operations,
          octets: j.octets,
          aCompacter: !!j.aCompacter,
          enLigne: rooms.presenceCount(d.id),
        }
      }),
  }

  // --- Flux (journaux d'événements)
  const connexions30 = metrics.read('connexions', depuis(30))
  const actifs = (jours) => new Set(connexions30.filter((c) => c.ts >= depuis(jours)).map((c) => c.email)).size
  const ia30 = metrics.read('ia', depuis(30))
  const mail30 = metrics.read('mail', depuis(30))

  const iaParEmail = {}
  for (const appel of ia30) {
    const e = (iaParEmail[appel.email] = iaParEmail[appel.email] || { appels: 0, entree: 0, sortie: 0 })
    e.appels++
    e.entree += appel.entree || 0
    e.sortie += appel.sortie || 0
  }

  const flux = {
    connexions: {
      actifs7j: actifs(7),
      actifs30j: actifs(30),
      sessions7j: connexions30.filter((c) => (c.debut ?? c.ts) >= depuis(7)).length,
      dureeMedianeMin: (() => {
        const d = connexions30.filter((c) => c.dureeMs).map((c) => c.dureeMs).sort((a, b) => a - b)
        return d.length ? Math.round(d[d.length >> 1] / 60000) : null
      })(),
      collaboration30j: momentsCollaboratifs(connexions30),
    },
    ia: {
      appels7j: ia30.filter((a) => a.ts >= depuis(7)).length,
      appels30j: ia30.length,
      tokensEntree30j: ia30.reduce((a, x) => a + (x.entree || 0), 0),
      tokensSortie30j: ia30.reduce((a, x) => a + (x.sortie || 0), 0),
      parPersonne: Object.entries(iaParEmail)
        .map(([email, v]) => ({ email, ...v }))
        .sort((a, b) => b.sortie - a.sortie),
    },
    mail: {
      envois30j: mail30.length,
      echecs30j: mail30.filter((m) => !m.ok).length,
      parType: mail30.reduce((acc, m) => {
        const k = m.type || 'inconnu'
        acc[k] = acc[k] || { ok: 0, echecs: 0 }
        m.ok ? acc[k].ok++ : acc[k].echecs++
        return acc
      }, {}),
      dernierEchec: mail30.filter((m) => !m.ok).slice(-1)[0] || null,
    },
  }

  // --- Serveur
  const memoire = process.memoryUsage()
  const serveur = {
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    rssMo: Math.round(memoire.rss / 1048576),
    heapUtiliseMo: Math.round(memoire.heapUsed / 1048576),
    node: process.version,
    connexionsEnCours: rooms.snapshot(),
    dataDirOctets: tailleDossier(dataDir),
    listeAttente: (() => {
      try {
        if (!existsSync(waitlistPath)) return { total: 0, dernier: null }
        const liste = JSON.parse(readFileSync(waitlistPath, 'utf8'))
        return { total: liste.length, dernier: liste.length ? liste[liste.length - 1].ts : null }
      } catch {
        return { total: null, dernier: null }
      }
    })(),
  }

  return {
    genereLe: maintenant,
    serveur,
    utilisateurs: {
      total: utilisateurs.length,
      actifs: utilisateurs.filter((u) => u.statut === 'actif').length,
      enAttente: utilisateurs.filter((u) => u.statut === 'invite').length,
      liste: utilisateurs,
      invitationsEnAttente,
      invitationsPar,
    },
    documents,
    flux,
  }
}
