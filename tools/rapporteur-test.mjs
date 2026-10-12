// Rapporteur pour tools/lancer-tests.mjs : compte les tests **par les
// événements** du lanceur de Node (feuilles uniquement, à tous les niveaux
// d'imbrication), pas par la ligne « # tests » du rapporteur par défaut, qui
// ne compte pas pareil selon qu'un fichier est lancé seul ou avec d'autres
// (33 contre 55 pour un même fichier, constaté le 11/10/2026 : c'est ce qui
// faisait varier le total annoncé).
export default async function* (source) {
  let reussis = 0,
    echecs = 0,
    ignores = 0,
    annules = 0
  const noms = []
  for await (const e of source) {
    if (e.type !== 'test:pass' && e.type !== 'test:fail') continue
    if (e.data.details && e.data.details.type === 'suite') continue
    if (e.type === 'test:pass') {
      reussis++
      if (e.data.skip || e.data.todo) ignores++
    } else {
      echecs++
      const err = e.data.details && e.data.details.error
      if (err && /cancelled|timeout/i.test(String(err.failureType || ''))) annules++
      const message = err
        ? String(err.message || err)
            .split('\n')[0]
            .slice(0, 200)
        : ''
      noms.push(`${e.data.name}${message ? ` — ${message}` : ''}`)
    }
  }
  yield `@@bilan ${JSON.stringify({ tests: reussis + echecs, reussis, echecs, ignores, annules, noms: noms.slice(0, 20) })}\n`
}
