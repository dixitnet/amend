// Adaptateur du courrier (couche 2) : l'API HTTP de Mailgun (zone
// européenne), un simple appel HTTPS, sans bibliothèque. Idées reprises de la
// v1 : une partie texte et une partie HTML (bien des messageries ne rendent
// pas cliquable une adresse en texte seul), un seul lien cliquable (une
// passerelle de sécurité se méfie des courriers à plusieurs liens vers le
// même jeton), l'adresse recopiée en texte. Aucune mise en forme ici : le
// gabarit HTML est celui du design (`design/courrier.js`, 18/11/2026). Les
// textes arrivent traduits.
//
// Sans clé (développement, tests), les courriers sont gardés en mémoire et
// écrits dans le journal, jamais envoyés.

const echapper = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/**
 * Un courrier à un geste : un titre, une phrase, un lien, l'adresse en texte, une note. La
 * partie texte est écrite ici ; l'apparence de la partie HTML est celle du design : `gabarit`
 * (`design/courrier.js`) la compose, sans lui un HTML nu (essais).
 * @param {{ titre?: string, intro: string, libelleLien: string, lien: string, copier: string,
 *   apres: string, gabarit?: (o: object) => string }} o
 */
export function courrierAvecLien({ titre, intro, libelleLien, lien, copier, apres, gabarit }) {
  const texte = `${titre ? `${titre}\n\n` : ''}${intro}\n\n${lien}\n\n${apres}`
  const html = gabarit
    ? gabarit({ titre: titre ?? '', intro, libelleLien, lien, copier, apres })
    : `<!doctype html><html><body>
<p>${echapper(intro)}</p>
<p><a href="${echapper(lien)}">${echapper(libelleLien)}</a></p>
<p>${echapper(copier)}<br>${echapper(lien)}</p>
<p>${echapper(apres)}</p>
</body></html>`
  return { texte, html }
}

/**
 * @param {{ cle?: string, domaine?: string, expediteur: string }} o
 *   sans `cle` : courriers gardés en mémoire (`envoyes`), jamais envoyés
 */
export function creerCourrier({ cle, domaine, expediteur }) {
  const envoyes = []
  return {
    envoyes,
    /** @param {{ a: string, sujet: string, texte: string, html: string }} m */
    async envoyer(m) {
      // Une adresse en .invalid (comptes de développement et d'essai) ne reçoit
      // jamais rien, même avec une clé : rien ne part vers Mailgun.
      if (/\.invalid$/i.test(String(m.a).trim())) {
        envoyes.push(m)
        console.log(`[courrier] (non envoyé : adresse d'essai) : ${m.sujet}`)
        return
      }
      if (!cle || !domaine) {
        envoyes.push(m)
        console.log(`[courrier] (non envoyé) à ${m.a} : ${m.sujet}\n${m.texte}`)
        return
      }
      const corps = new URLSearchParams({ from: expediteur, to: m.a, subject: m.sujet, text: m.texte, html: m.html })
      const r = await fetch(`https://api.eu.mailgun.net/v3/${encodeURIComponent(domaine)}/messages`, {
        method: 'POST',
        headers: { authorization: `Basic ${Buffer.from(`api:${cle}`).toString('base64')}` },
        body: corps,
        signal: AbortSignal.timeout(10000),
      })
      if (!r.ok) throw Object.assign(new Error(`Mailgun : ${r.status}`), { code: 'courrier-non-envoye' })
    },
  }
}
