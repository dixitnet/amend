// Le fuzz de convergence (tools/fuzz-collab.js), en version courte : quelques
// graines fixes, pour qu'une régression de la synchronisation — reprise après
// coupure, redémarrage du serveur, commentaires et notes concurrents — casse
// la suite plutôt que de se découvrir en production. La version longue
// (`node tools/fuzz-collab.js --serie 50 --secondes 20`) est dans le protocole
// de test global, §5.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { essai } from '../../tools/fuzz-collab.js'

test(
  "fuzz de convergence : tous les clients et le serveur finissent d'accord (graines 11 à 13)",
  { timeout: 90000 },
  async () => {
    for (const graine of [11, 12, 13]) {
      const r = await essai({
        graine,
        clients: 4,
        secondes: 4,
        opsParSeconde: 15,
        tauxCoupure: 0.05,
        redemarrages: 1,
        port: 19880,
        silencieux: true,
      })
      assert.deepEqual(r.problemes, [], `divergence (graine ${graine}) : ${r.problemes.join(' | ')}`)
      assert.ok(r.ops > 20, `trop peu d'opérations jouées (graine ${graine} : ${r.ops})`)
    }
  }
)

test.after(() => process.exit(0))
