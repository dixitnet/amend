// Le banc d'essai de Margo (#/admin/ia/banc, 03/11/2026), réservé aux
// administrateurs. Un texte collé, une consigne, et jusqu'à trois colonnes —
// chacune un modèle et, au besoin, une autre manière de répondre — qui
// travaillent en même temps sur leur propre copie du texte. Les résultats
// arrivent côte à côte : la réponse de Margo, ses modifications (en suivi :
// barré / souligné), ses commentaires avec le passage visé, et quelques
// chiffres (étapes, durée, signes lus).
//
// Côté serveur : server/banc.js. Rien n'est enregistré, ni compté au
// back-office : le texte et les résultats n'existent que dans cette page.

import { signes, nombre } from '../../shared/signes.js'
import { esc, entete, chargerVue } from './adminCommun.js'
import { lireFlux, rendreTexte } from './dialogue.js'

/** Le nombre de signes que Margo lira, à peu près : les lignes non vides, sans
 * leurs marques de Markdown (le serveur donne le compte exact au lancement). */
export function signesApproximatifs(texte) {
  let n = 0
  for (const ligne of String(texte || '').split(/\r?\n/)) {
    const t = ligne
      .trim()
      .replace(/^(#{1,6}|[-*•]|\d+[.)]|>)\s+/, '')
      .replace(/\*\*|(?<!\*)\*(?!\*)/g, '')
    n += t.length
  }
  return n
}

/** Le modèle proposé par défaut dans chaque colonne : celui de Margo en
 * production d'abord, puis les autres modèles dont la clé est configurée ;
 * la dernière colonne est vide (deux colonnes par défaut). */
export function modelesParDefaut(d) {
  const disponibles = d.modeles.filter((m) => m.cle).map((m) => m.id)
  const ordre = [
    ...(disponibles.includes(d.modeleMargo) ? [d.modeleMargo] : []),
    ...disponibles.filter((id) => id !== d.modeleMargo),
  ]
  return Array.from({ length: d.colonnesMax }, (_, i) => (i < 2 ? ordre[i] || '' : ''))
}

/** Les niveaux de réflexion, dits en français. Les valeurs sont celles des API. */
export const LIBELLES_REFLEXION = {
  aucune: 'aucune',
  low: 'basse',
  medium: 'moyenne',
  high: 'haute',
  xhigh: 'très haute',
}
const libelleReflexion = (n) => LIBELLES_REFLEXION[n] || n

/** Les options du choix de réflexion pour un modèle : ses niveaux, le premier
 * (celui de la production) marqué comme tel. */
export function optionsReflexion(d, modele) {
  const m = d.modeles.find((x) => x.id === modele)
  const r = (m && m.reflexion) || { niveaux: ['aucune'], defaut: 'aucune' }
  return r.niveaux
    .map(
      (n) =>
        `<option value="${esc(n)}"${n === r.defaut ? ' selected' : ''}>${esc(libelleReflexion(n))}${n === r.defaut ? ' (production)' : ''}</option>`
    )
    .join('')
}

function carteColonne(i, d, modele) {
  const options = d.modeles
    .map(
      (m) =>
        `<option value="${esc(m.id)}"${m.id === modele ? ' selected' : ''}${m.cle ? '' : ' disabled'}>${esc(m.nom)} — ${esc(m.fournisseur)}${m.cle ? '' : ' (clé non configurée)'}</option>`
    )
    .join('')
  return `
    <fieldset class="bo-ia-carte bo-banc-carte" data-col="${i}">
      <legend>Colonne ${i + 1}</legend>
      <label class="bo-ia-champ">
        <span>Modèle</span>
        <select name="modele${i}"><option value="">— aucune —</option>${options}</select>
      </label>
      <label class="bo-ia-champ" data-reflexion>
        <span>Réflexion</span>
        <select name="reflexion${i}">${optionsReflexion(d, modele)}</select>
        <small>Les niveaux que ce modèle accepte. Plus haut : souvent meilleur, plus lent et plus cher.</small>
      </label>
      <details class="bo-banc-maniere">
        <summary>Manière de répondre <span class="bo-attente" data-maniere-etat hidden>modifiée</span></summary>
        <textarea name="maniere${i}" rows="10" spellcheck="true">${esc(d.maniere)}</textarea>
        <p class="bo-ia-maniere-pied"><small>Préremplie avec celle de la production. La modifier ne touche qu’à cet essai.</small>
          <button type="button" class="bo-action" data-maniere-defaut="${i}">Rétablir</button></p>
      </details>
    </fieldset>`
}

/** Une modification : le texte du bloc, ses suppressions barrées et ses
 * ajouts soulignés. */
function rendreModification(m) {
  const li = document.createElement('li')
  li.dataset.bloc = String(m.bloc)
  const tete = document.createElement('span')
  tete.className = 'bo-banc-num'
  tete.textContent = `[${m.bloc}]${m.ajoute ? ' ajout' : ''}`
  li.appendChild(tete)
  const corps = document.createElement('span')
  corps.className = 'bo-banc-texte'
  for (const morceau of m.morceaux) {
    const el =
      morceau.type === 'ins'
        ? document.createElement('ins')
        : morceau.type === 'del'
          ? document.createElement('del')
          : document.createElement('span')
    if (morceau.type === 'ins') el.className = 'tracked-insertion'
    if (morceau.type === 'del') el.className = 'tracked-deletion'
    el.textContent = morceau.t
    corps.appendChild(el)
  }
  li.appendChild(corps)
  return li
}

function rendreCommentaire(c) {
  const li = document.createElement('li')
  if (c.bloc) li.dataset.bloc = String(c.bloc)
  const tete = document.createElement('span')
  tete.className = 'bo-banc-num'
  tete.textContent = c.bloc ? `[${c.bloc}]` : '[?]'
  li.appendChild(tete)
  if (c.passage) {
    const q = document.createElement('span')
    q.className = 'bo-banc-passage'
    q.textContent = `«\u00a0${c.passage}\u00a0»`
    li.appendChild(q)
  }
  const t = document.createElement('div')
  t.className = 'bo-banc-commentaire'
  t.textContent = c.texte
  li.appendChild(t)
  for (const r of c.reponses || []) {
    const rep = document.createElement('div')
    rep.className = 'bo-banc-commentaire bo-banc-reponse-fil'
    rep.textContent = `↳ ${r}`
    li.appendChild(rep)
  }
  return li
}

const secondes = (ms) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0).replace('.', ',')} s`

/** Une colonne de résultats, qui se remplit au fil des événements. */
function colonneResultat(col) {
  const section = document.createElement('section')
  section.className = 'bo-banc-col'
  section.innerHTML = `
    <h3>${esc(col.nom)} ${col.reflexion ? `<span class="bo-attente">réflexion ${esc(libelleReflexion(col.reflexion))}</span>` : ''} ${col.maniereModifiee ? '<span class="bo-attente">manière modifiée</span>' : ''}</h3>
    <p class="bo-banc-etat bo-note" role="status">En cours…</p>
    <details class="bo-banc-etapes"><summary>Étapes (<span data-nb-etapes>0</span>)</summary><ol></ol></details>
    <div class="bo-banc-reponse"></div>
    <p class="bo-banc-erreurs bo-alerte" hidden></p>
    <div class="bo-banc-bilan" hidden>
      <h4>Modifications (<span data-nb-modifs>0</span>)</h4>
      <ol class="bo-banc-modifs"></ol>
      <h4>Commentaires (<span data-nb-commentaires>0</span>)</h4>
      <ol class="bo-banc-commentaires"></ol>
    </div>`
  let texte = ''
  let fin = null
  const etat = section.querySelector('.bo-banc-etat')
  const etapes = section.querySelector('.bo-banc-etapes ol')
  const erreurs = section.querySelector('.bo-banc-erreurs')
  // Un [n] de la réponse mène à la modification (ou au commentaire) de ce bloc, dans cette colonne.
  const allerAuBloc = (n) => {
    const cible = section.querySelector(`.bo-banc-bilan li[data-bloc="${n}"]`)
    if (!cible) return
    cible.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    cible.classList.add('bo-banc-vise')
    setTimeout(() => cible.classList.remove('bo-banc-vise'), 1500)
  }
  return {
    section,
    evenement(evt) {
      if (evt.type === 'texte') {
        texte += (texte ? '\n\n' : '') + evt.texte
        rendreTexte(section.querySelector('.bo-banc-reponse'), texte, allerAuBloc)
      } else if (evt.type === 'outil') {
        const li = document.createElement('li')
        li.textContent = evt.libelle
        etapes.appendChild(li)
        section.querySelector('[data-nb-etapes]').textContent = String(etapes.children.length)
        etat.textContent = `En cours : ${evt.libelle}`
      } else if (evt.type === 'outil_fin') {
        const dernier = etapes.lastElementChild
        if (dernier && evt.libelle) dernier.textContent = evt.libelle
        if (dernier && !evt.ok) dernier.classList.add('bo-alerte')
      } else if (evt.type === 'erreur') {
        erreurs.hidden = false
        erreurs.textContent = (erreurs.textContent ? erreurs.textContent + ' ' : '') + evt.message
      } else if (evt.type === 'fin') {
        fin = evt
      } else if (evt.type === 'resultat') {
        const bilan = section.querySelector('.bo-banc-bilan')
        bilan.hidden = false
        const modifs = section.querySelector('.bo-banc-modifs')
        for (const m of evt.modifications) modifs.appendChild(rendreModification(m))
        section.querySelector('[data-nb-modifs]').textContent = String(evt.modifications.length)
        if (!evt.modifications.length) modifs.outerHTML = '<p class="bo-note">Aucune.</p>'
        const coms = section.querySelector('.bo-banc-commentaires')
        for (const c of evt.commentaires) coms.appendChild(rendreCommentaire(c))
        section.querySelector('[data-nb-commentaires]').textContent = String(evt.commentaires.length)
        if (!evt.commentaires.length) coms.outerHTML = '<p class="bo-note">Aucun.</p>'
        const morceaux = [secondes(evt.ms)]
        if (fin) {
          const tours = fin.usage && fin.usage.tours
          if (tours) morceaux.push(`${nombre(tours)} appel(s) au modèle`)
          if (Number.isFinite(fin.lus)) morceaux.push(`${signes(fin.lus)} lus`)
          if (fin.refus) morceaux.push(`${nombre(fin.refus)} écriture(s) refusée(s) par le moteur`)
          if (fin.incomplet) morceaux.push('demande incomplète')
        }
        etat.textContent = `Terminé — ${morceaux.join(' · ')}.`
      }
    },
    interrompre(message) {
      if (!section.querySelector('.bo-banc-bilan').hidden) return
      etat.textContent = message
    },
  }
}

export async function mountAdminBanc(root, { fetcher = (...a) => fetch(...a) } = {}) {
  root.innerHTML = '<div class="home"><p>Chargement…</p></div>'
  const [res, vue] = await Promise.all([
    fetcher('/api/admin/banc', { credentials: 'same-origin' }).catch(() => null),
    chargerVue(fetcher),
  ])
  if (res && res.status === 403) {
    root.innerHTML = '<div class="home"><p>Réservé aux administrateurs.</p><a href="#/">← Retour</a></div>'
    return
  }
  if (!res || !res.ok) {
    root.innerHTML =
      '<div class="home"><p>Le banc d’essai ne répond pas.</p><a href="#/admin/ia">← Retour à la rubrique IA</a></div>'
    return
  }
  const d = await res.json()
  const parDefaut = modelesParDefaut(d)

  root.innerHTML = `
    <div class="home backoffice bo-banc">
      ${entete('ia', vue)}
      <p class="bo-retour"><a href="#/admin/ia">← Réglages de l’IA</a></p>
      <h2>Banc d’essai de Margo</h2>
      <p class="bo-note">Collez un texte, donnez une consigne et choisissez jusqu’à ${nombre(d.colonnesMax)} réglages de Margo (modèle, manière de répondre). Chacun travaille <strong>sur sa propre copie du texte, en mémoire</strong>, avec le moteur et les garde-fous de la production, et propose ses modifications et ses commentaires comme dans un document. Rien n’est enregistré : ni le texte, ni les résultats.</p>
      <p class="bo-note bo-alerte">Ces essais ne sont <strong>comptés nulle part</strong> au back-office (ni quotas, ni consommation, ni jetons) : leur coût réel n’apparaît que sur la facture des fournisseurs. Le texte est envoyé en entier à chaque modèle choisi.</p>

      <form class="bo-banc-form" novalidate>
        <label class="bo-ia-champ">
          <span>Titre du document <small>(facultatif ; Margo le voit)</small></span>
          <input type="text" name="titre" placeholder="Texte d’essai" maxlength="200">
        </label>
        <label class="bo-ia-champ bo-banc-zone">
          <span>Texte</span>
          <textarea name="texte" rows="16" spellcheck="false" placeholder="Un paragraphe par ligne. Markdown simple accepté : # titres, - puces, 1. listes, > citations, **gras**, *italique*."></textarea>
        </label>
        <label class="bo-ia-champ bo-banc-zone">
          <span>Consigne</span>
          <textarea name="consigne" rows="3" placeholder="Ce que vous demanderiez à Margo dans l’éditeur, par exemple : « Corrige l’orthographe et la typographie, et signale en commentaire les passages confus. »"></textarea>
        </label>
        <div class="bo-ia-cartes bo-banc-cartes">
          ${parDefaut.map((m, i) => carteColonne(i, d, m)).join('')}
        </div>
        <p class="bo-note" data-estimation></p>
        <p class="bo-ia-actions">
          <button type="submit" class="btn-primary">Lancer l’essai</button>
          <button type="button" class="bo-action" data-arreter hidden>Arrêter</button>
          <span class="bo-ia-message" role="status"></span>
        </p>
      </form>
      <div class="bo-banc-resultats"></div>
    </div>`

  const form = root.querySelector('.bo-banc-form')
  const message = form.querySelector('.bo-ia-message')
  const estimation = form.querySelector('[data-estimation]')
  const lancer = form.querySelector('[type="submit"]')
  const arreter = form.querySelector('[data-arreter]')
  const resultats = root.querySelector('.bo-banc-resultats')

  const colonnesChoisies = () =>
    parDefaut
      .map((_, i) => ({
        modele: form.elements[`modele${i}`].value,
        reflexion: form.elements[`reflexion${i}`].value,
        maniere: form.elements[`maniere${i}`].value,
      }))
      .filter((c) => c.modele)

  const majEstimation = () => {
    const n = signesApproximatifs(form.elements.texte.value)
    const k = colonnesChoisies().length
    const lignes = [
      `Texte : environ ${signes(n)}. ${k} colonne(s) : environ ${signes(n * k)} envoyés au total, plus ce que chaque modèle relit en route.`,
    ]
    if (n + form.elements.consigne.value.length > d.signesParDemande)
      lignes.push(
        `En production, Margo refuserait cette demande (limite actuelle : ${signes(d.signesParDemande)} par demande). Le banc la laisse passer.`
      )
    estimation.textContent = lignes.join(' ')
  }
  form.addEventListener('input', majEstimation)
  majEstimation()

  form.querySelectorAll('[data-maniere-defaut]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = b.dataset.maniereDefaut
      form.elements[`maniere${i}`].value = d.maniere
      form.elements[`maniere${i}`].dispatchEvent(new Event('input', { bubbles: true }))
    })
  )
  form.querySelectorAll('.bo-banc-carte').forEach((carte) => {
    // Le choix de réflexion suit le modèle ; il disparaît quand le modèle n'a qu'un niveau.
    const i = carte.dataset.col
    const choixModele = form.elements[`modele${i}`]
    const choixReflexion = form.elements[`reflexion${i}`]
    const majReflexion = () => {
      choixReflexion.innerHTML = optionsReflexion(d, choixModele.value)
      carte.querySelector('[data-reflexion]').hidden = !choixModele.value || choixReflexion.options.length < 2
    }
    choixModele.addEventListener('change', majReflexion)
    majReflexion()
    const zone = carte.querySelector('textarea')
    const etat = carte.querySelector('[data-maniere-etat]')
    zone.addEventListener('input', () => {
      etat.hidden = zone.value === d.maniere
    })
  })

  let controle = null
  arreter.addEventListener('click', () => {
    if (controle) controle.abort()
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const colonnes = colonnesChoisies()
    message.className = 'bo-ia-message'
    if (!form.elements.texte.value.trim()) return erreur('Collez un texte à faire relire.')
    if (!form.elements.consigne.value.trim()) return erreur('Écrivez la consigne donnée à Margo.')
    if (!colonnes.length) return erreur('Choisissez au moins un modèle.')

    controle = new AbortController()
    lancer.disabled = true
    arreter.hidden = false
    message.textContent = 'Envoi…'
    resultats.textContent = ''
    let vues = []
    try {
      const rep = await fetcher('/api/admin/banc', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          titre: form.elements.titre.value,
          texte: form.elements.texte.value,
          consigne: form.elements.consigne.value,
          colonnes,
        }),
        signal: controle.signal,
      })
      if (!rep.ok) {
        const corps = await rep.json().catch(() => ({}))
        return erreur(corps.error || `Le serveur a refusé l’essai (${rep.status}).`)
      }
      message.textContent = 'Essai en cours…'
      await lireFlux(rep, (evt) => {
        if (evt.type === 'debut') {
          const grille = document.createElement('div')
          grille.className = 'bo-banc-grille'
          vues = evt.colonnes.map((c) => colonneResultat(c))
          for (const v of vues) grille.appendChild(v.section)
          const info = document.createElement('p')
          info.className = 'bo-note'
          info.textContent =
            `Texte lu par Margo : ${signes(evt.signes)}, consigne : ${signes(evt.consigne)}.` +
            (evt.refuseeEnProduction
              ? ` En production, cette demande serait refusée (limite : ${signes(evt.signesParDemande)}).`
              : '')
          resultats.append(info, grille)
        } else if (Number.isInteger(evt.col) && vues[evt.col]) {
          vues[evt.col].evenement(evt)
        } else if (evt.type === 'erreur') {
          erreur(evt.message)
        }
      })
      if (!message.classList.contains('bo-erreur')) {
        message.className = 'bo-ia-message bo-ok'
        message.textContent = 'Essai terminé.'
      }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        message.textContent = 'Essai arrêté.'
        for (const v of vues) v.interrompre('Arrêté.')
      } else {
        erreur('Le serveur ne répond pas, ou la connexion a été coupée.')
        for (const v of vues) v.interrompre('Interrompu.')
      }
    } finally {
      controle = null
      lancer.disabled = false
      arreter.hidden = true
    }
  })

  function erreur(texte) {
    message.className = 'bo-ia-message bo-erreur'
    message.textContent = texte
  }
}
