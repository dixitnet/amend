// Chargeur de `.env` intégré (aucune dépendance) : pose les variables d'un
// fichier `.env` à la racine du projet, sans écraser celles que l'environnement
// réel fournit déjà. Extrait de `server.js` (audit du 10/10/2026, A7).
//
// Appelé explicitement par `server.js` **après** l'évaluation des imports : les
// modules qui lisent une variable au chargement ne la verraient pas.

import { existsSync, readFileSync } from 'node:fs'

export function chargerDotEnv(path) {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}
