// Back-office (page #/admin), réservé aux administrateurs. Voir
// claude/conception-backoffice.md : trois blocs (utilisateurs, documents,
// serveur). Aucun contenu de document n'est affiché, titres exceptés.
//
// Une seule action depuis le 22/09/2026 : marquer un retour comme traité.
// Le parti pris « aucune action » tenait tant que la page ne servait qu'à
// regarder ; dès qu'elle sert à **travailler** une liste, ne pas pouvoir
// dire « celui-ci, c'est fait » la rend inutilisable au bout de trente
// retours. C'est la seule action, elle n'écrit que dans une table annexe,
// et elle se défait.

const NBSP = ' '

function nombre(n) {
  if (n === null || n === undefined) return '—'
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
}

function octets(o) {
  if (o === null || o === undefined) return '—'
  if (o < 1024) return `${o}${NBSP}o`
  if (o < 1048576) return `${Math.round(o / 1024)}${NBSP}ko`
  return `${(o / 1048576).toFixed(1)}${NBSP}Mo`
}

/** Une somme en euros. Sous le centime, « <0,01 € » plutôt qu'un « 0,00 € »
 * qui laisserait croire que rien n'a été consommé. */
function euros(v) {
  if (v === null || v === undefined) return '—'
  if (v > 0 && v < 0.01) return `<0,01${NBSP}€`
  return `${v.toFixed(2).replace('.', ',')}${NBSP}€`
}

function date(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function duree(sec) {
  if (!sec) return '—'
  const j = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return j ? `${j}${NBSP}j${NBSP}${h}${NBSP}h` : h ? `${h}${NBSP}h${NBSP}${m}${NBSP}min` : `${m}${NBSP}min`
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function chiffre(valeur, libelle, precision) {
  return `<div class="bo-chiffre"><strong>${valeur}</strong><span>${libelle}</span>${
    precision ? `<em>${precision}</em>` : ''
  }</div>`
}

/** Une ligne de retour. `traite` bascule le libellé du bouton : la même
 * action dans les deux sens, parce qu'on se trompe, et qu'un retour classé
 * trop vite doit pouvoir revenir. */
function ligneRetour(r) {
  const intitule = { question: 'Question', idee: 'Idée', bug: 'Bug' }[r.intention] || r.intention || '—'
  const contexte = [
    r.docId ? `<a href="#/doc/${esc(r.docId)}">document</a>${r.role ? ` (${esc(r.role)})` : ''}` : '',
    r.navigateur ? `<span title="${esc(r.navigateur)}">navigateur</span>` : '',
    r.erreurs && r.erreurs.length
      ? `<span class="bo-attente" title="${esc(r.erreurs.join(' | '))}">${r.erreurs.length} erreur(s)</span>`
      : '',
  ]
    .filter(Boolean)
    .join(' · ')
  return `<tr class="${r.traite ? 'bo-traite' : ''}">
    <td>${date(r.ts)}</td>
    <td>${esc(r.email || '—')}</td>
    <td>${esc(intitule)}</td>
    <td class="bo-message">${esc(r.message || '')}</td>
    <td class="bo-contexte">${contexte}</td>
    <td><button type="button" class="bo-action" data-cle="${esc(r.cle)}" data-traite="${
    r.traite ? 'oui' : 'non'
  }">${r.traite ? 'Rouvrir' : 'Traiter'}</button></td>
  </tr>`
}

function tableRetours(lignes) {
  return `<table class="bo-table">
    <thead><tr><th>Quand</th><th>Qui</th><th>Quoi</th><th>Message</th><th>Contexte</th><th></th></tr></thead>
    <tbody>${lignes.map(ligneRetour).join('')}</tbody>
  </table>`
}

function sectionRetours(support) {
  if (!support) return ''
  const aTraiter = support.aTraiter || []
  const traites = support.traites || []
  if (!aTraiter.length && !traites.length) return ''
  return `<h2>Retours reçus</h2>
    <p class="bo-note">${nombre(support.recus7j)} sur 7 jours, ${nombre(
    support.recus30j
  )} sur 30. Envoyés par la palette de contact, conservés ici même si le courrier n'est pas parti.</p>
    ${
      aTraiter.length
        ? tableRetours(aTraiter)
        : '<p class="bo-note">Tout est traité.</p>'
    }
    ${
      traites.length
        ? `<details class="bo-traites"><summary>${nombre(traites.length)} déjà traité(s)</summary>${tableRetours(
            traites
          )}</details>`
        : ''
    }`
}

export async function mountAdmin(root) {
  root.innerHTML = '<div class="home"><p>Chargement…</p></div>'
  const res = await fetch('/api/admin/overview')
  if (res.status === 403) {
    root.innerHTML = '<div class="home"><p>Réservé aux administrateurs.</p><a href="#/">← Retour</a></div>'
    return
  }
  if (!res.ok) {
    root.innerHTML = '<div class="home"><p>Le back-office n\'a pas répondu.</p><a href="#/">← Retour</a></div>'
    return
  }
  const d = await res.json()
  const u = d.utilisateurs
  const doc = d.documents
  const f = d.flux
  const s = d.serveur

  root.innerHTML = `
    <div class="home backoffice">
      <p class="bo-retour"><a href="#/">← Retour aux documents</a></p>
      <h1>Back-office</h1>
      <p class="bo-note">Vue au ${new Date(d.genereLe).toLocaleString('fr-FR')}. Lecture seule.</p>

      ${sectionRetours(f.support)}

      <h2>Utilisateurs</h2>
      <p class="bo-note"><a href="#/inscrits">Voir la liste d'attente →</a></p>
      <div class="bo-chiffres">
        ${chiffre(nombre(u.total), 'personnes connues')}
        ${chiffre(nombre(u.actifs), 'déjà venues')}
        ${chiffre(nombre(u.enAttente), 'invitées, jamais venues')}
        ${chiffre(nombre(f.connexions.actifs7j), 'actives sur 7 jours', `${nombre(f.connexions.actifs30j)} sur 30 jours`)}
      </div>
      <table class="bo-table">
        <thead><tr><th>Adresse</th><th>Nom affiché</th><th>Documents</th><th>Rôles</th><th>Depuis</th><th>Statut</th></tr></thead>
        <tbody>${u.liste
          .map(
            (p) => `<tr>
              <td>${esc(p.email)}</td>
              <td>${
                p.nom
                  ? esc(p.nom)
                  : '<span class="bo-attente">—</span>'
              }</td>
              <td>${nombre(p.documents)}</td>
              <td>${p.editeur ? `${p.editeur} éditeur` : ''}${p.editeur && p.correcteur ? ', ' : ''}${
              p.correcteur ? `${p.correcteur} correcteur` : ''
            }</td>
              <td>${date(p.depuis)}</td>
              <td>${p.statut === 'actif' ? 'actif' : '<span class="bo-attente">en attente</span>'}</td>
            </tr>`
          )
          .join('')}</tbody>
      </table>
      <p class="bo-note">Le nom affiché est celui que la personne se donne à sa première ouverture d'un
      document ; un tiret signifie qu'elle n'en a pas encore ouvert. Il n'y a pas encore d'écran pour
      le corriger soi-même — en attendant, il se modifie dans <code>data/users.json</code>.</p>
      ${
        u.invitationsEnAttente.length
          ? `<h3>Invitations sans réponse</h3>
             <ul class="bo-liste">${u.invitationsEnAttente
               .map(
                 (i) =>
                   `<li>${esc(i.email)} — ${esc(i.role)} sur « ${esc(i.titre)} »${
                     i.depuisJours !== null ? `, depuis ${i.depuisJours}${NBSP}j` : ''
                   }${i.invitePar ? ` (invité·e par ${esc(i.invitePar)})` : ''}</li>`
               )
               .join('')}</ul>`
          : ''
      }
      ${
        Object.keys(u.invitationsPar).length
          ? `<p class="bo-note">Invitations envoyées : ${Object.entries(u.invitationsPar)
              .map(([e, n]) => `${esc(e)} (${n})`)
              .join(', ')} — si une seule adresse figure ici, l'outil ne circule pas encore tout seul.</p>`
          : ''
      }

      <h2>Documents</h2>
      <div class="bo-chiffres">
        ${chiffre(nombre(doc.total), 'documents', `${nombre(doc.crees30j)} créés sur 30 jours`)}
        ${chiffre(
          doc.partCollaborative === null ? '—' : `${doc.partCollaborative}${NBSP}%`,
          'à plusieurs participants',
          `${nombre(doc.aPlusieursParticipants)} documents`
        )}
        ${chiffre(nombre(f.connexions.collaboration30j.moments), 'moments à deux ou plus', `sur ${nombre(f.connexions.collaboration30j.documents)} documents, 30 j`)}
        ${chiffre(nombre(doc.actifs7j), 'modifiés sur 7 jours')}
      </div>
      <p class="bo-note">Journaux : ${octets(doc.journaux.octetsTotal)} au total, le plus gros ${octets(
    doc.journaux.plusGrosOctets
  )}, ${nombre(doc.journaux.aCompacter)} au-dessus du seuil de compaction${
    doc.journaux.sansHorodatage ? `, ${nombre(doc.journaux.sansHorodatage)} sans horodatage (antérieurs au suivi)` : ''
  }${doc.sansControleDacces ? `. ${nombre(doc.sansControleDacces)} document(s) sans liste d'accès.` : '.'}</p>
      <table class="bo-table">
        <thead><tr><th>Titre</th><th>Propriétaire</th><th>Participants</th><th>En ligne</th><th>Opérations</th><th>Poids</th><th>Modifié</th></tr></thead>
        <tbody>${doc.liste
          .map(
            (l) => `<tr>
              <td><a href="#/doc/${esc(l.id)}">${esc(l.titre || 'Sans titre')}</a></td>
              <td>${l.proprietaire ? esc(l.proprietaire) : '<span class="bo-attente">aucun</span>'}</td>
              <td>${nombre(l.participants)}</td>
              <td>${l.enLigne || ''}</td>
              <td>${nombre(l.operations)}${l.aCompacter ? ' <span class="bo-attente">à compacter</span>' : ''}</td>
              <td>${octets(l.octets)}</td>
              <td>${date(l.modifieLe)}</td>
            </tr>`
          )
          .join('')}</tbody>
      </table>

      <h2>Serveur</h2>
      <div class="bo-chiffres">
        ${chiffre(`${nombre(s.rssMo)}${NBSP}Mo`, 'mémoire du process', 'plafond 700 Mo')}
        ${chiffre(duree(s.uptimeSec), 'sans redémarrage', `pid ${s.pid}`)}
        ${chiffre(nombre(s.connexionsEnCours.reduce((a, r) => a + r.connectes, 0)), 'connexions en cours')}
        ${chiffre(octets(s.dataDirOctets), 'données sur disque')}
      </div>

      <h2>Sauvegarde</h2>
      <p class="bo-note">Une archive de tout <code>data/</code> — documents,
      images, comptes, accès, pages publiées — prise pendant que
      l'application tourne, sans coupure. Elle contient sa propre procédure
      de restauration.<br>
      <strong>Le fichier <code>.env</code> n'y est pas</strong> : les
      secrets ne transitent pas par un navigateur. Restaurer les données
      sans lui déconnecte tout le monde et peut fermer la porte à tout le
      monde — il se sauvegarde séparément.</p>
      <p><a class="btn-preset" href="/api/admin/sauvegarde" download>Télécharger la sauvegarde (${octets(
        s.dataDirOctets
      )} avant compression)</a></p>
      ${
        s.connexionsEnCours.length
          ? `<ul class="bo-liste">${s.connexionsEnCours
              .map((r) => `<li>${esc(r.docId)} — ${r.connectes} connecté(s) : ${esc(r.noms.join(', '))}</li>`)
              .join('')}</ul>`
          : '<p class="bo-note">Personne connecté en ce moment.</p>'
      }

      <h3>Assistance IA (30 jours)</h3>
      <div class="bo-chiffres">
        ${chiffre(euros(f.ia.coutEuros30j), 'sur 30 jours', `${euros(f.ia.coutEuros7j)} sur 7 jours`)}
        ${chiffre(euros(f.ia.coutEuros24h), 'dans les 24 h')}
        ${chiffre(nombre(f.ia.appels30j), 'suggestions', `${nombre(f.ia.appels7j)} sur 7 jours`)}
        ${chiffre(
          `${nombre(f.ia.tokensEntree30j)} / ${nombre(f.ia.tokensSortie30j)}`,
          'tokens entrée / sortie'
        )}
      </div>
      ${
        f.ia.parPersonne.length
          ? `<ul class="bo-liste">${f.ia.parPersonne
              .map(
                (p) =>
                  `<li>${esc(p.email)} — <strong>${euros(p.coutEuros)}</strong>, ${nombre(
                    p.appels
                  )} appels, ${nombre(p.entree)} / ${nombre(p.sortie)} tokens</li>`
              )
              .join('')}</ul>
             <p class="bo-note">C'est la distribution, pas la moyenne, qui doit fixer le quota de l'offre gratuite.</p>`
          : '<p class="bo-note">Aucun appel enregistré — le journal démarre à la mise en service du back-office.</p>'
      }
      ${
        f.ia.tarif
          ? `<p class="bo-note">Addition faite au tarif de <strong>${esc(f.ia.tarif.modele)}</strong> :
             ${String(f.ia.tarif.entreeEurParMTok).replace('.', ',')}${NBSP}€ en entrée et
             ${String(f.ia.tarif.sortieEurParMTok).replace('.', ',')}${NBSP}€ en sortie par million de tokens
             (AI_PRICE_INPUT_EUR / AI_PRICE_OUTPUT_EUR dans le .env — à ajuster en même temps que le modèle,
             sinon le coût affiché devient faux sans prévenir). Le plafond de dépense réel se règle côté
             Anthropic, pas ici.</p>`
          : ''
      }

      <h3>Emails (30 jours)</h3>
      <p class="bo-note ${f.mail.echecs30j ? 'bo-alerte' : ''}">
        ${nombre(f.mail.envois30j)} envois, <strong>${nombre(f.mail.echecs30j)} échecs</strong>${
    Object.keys(f.mail.parType).length
      ? ' — ' +
        Object.entries(f.mail.parType)
          .map(([t, v]) => `${esc(t)} : ${v.ok} ok / ${v.echecs} échecs`)
          .join(', ')
      : ''
  }.
        ${
          f.mail.dernierEchec
            ? `Dernier échec le ${new Date(f.mail.dernierEchec.ts).toLocaleString('fr-FR')} : ${esc(
                f.mail.dernierEchec.erreur || ''
              )}.`
            : ''
        }
        Depuis le retrait du filtre d'accès, l'email est la seule porte d'entrée : un échec n'expose rien mais enferme dehors.
      </p>

      <p class="bo-note">Liste d'attente : ${nombre(s.listeAttente.total)} adresse(s)${
    s.listeAttente.dernier ? `, dernière le ${date(s.listeAttente.dernier)}` : ''
  }.</p>
    </div>
  `

  // Un seul écouteur sur la racine plutôt qu'un par bouton : la page est
  // rendue d'un bloc par `innerHTML`, et des écouteurs posés sur les
  // boutons disparaîtraient au prochain rendu.
  root.addEventListener('click', async (e) => {
    const bouton = e.target.closest('.bo-action')
    if (!bouton) return
    const cle = bouton.dataset.cle
    const traite = bouton.dataset.traite !== 'oui'
    bouton.disabled = true
    try {
      const reponse = await fetch(`/api/admin/support/${encodeURIComponent(cle)}/traite`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ traite }),
      })
      if (!reponse.ok) throw new Error('refus du serveur')
      // On relit la page entière : le retour change de table, et les
      // compteurs avec lui. Redessiner à la main ce que le serveur sait
      // calculer serait deux vérités à tenir d'accord.
      await mountAdmin(root)
    } catch {
      bouton.disabled = false
      bouton.textContent = 'Échec — réessayer'
    }
  })
}
