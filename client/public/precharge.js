// Demande les métadonnées du document dès l'arrivée sur `#/doc/<id>`, pendant
// que le JavaScript principal se télécharge (audit du premier chargement,
// 02/11/2026) : sinon la requête ne part qu'une fois le bundle exécuté, un
// aller-retour plus tard. main.js reprend la réponse (`__amendMeta`) au lieu
// de la redemander. Fichier à part, et non script en ligne : la CSP n'accepte
// que les scripts servis par le site.
;(function () {
  var m = /^#\/doc\/([A-Za-z0-9_-]+)$/.exec(location.hash)
  if (!m || !window.fetch) return
  window.__amendMeta = { id: m[1], reponse: fetch('/api/docs/' + m[1]) }
})()
