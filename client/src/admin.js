// Back-office (#/admin et ses rubriques), réservé aux administrateurs. Voir
// claude/conception-backoffice.md. Aucun contenu de document n'est affiché,
// titres exceptés.
//
// Depuis le 14/10/2026 il est découpé en rubriques thématiques (onglets, voir
// adminCommun.js) : Synthèse, Utilisateurs, Retours, Documents, IA, Système.
// La rubrique IA vit dans adminIa.js. Chaque rubrique est une adresse.
//
// Deux actions. Marquer un retour comme traité (22/09/2026) : le parti pris
// « aucune action » tenait tant que la page ne servait qu'à regarder ; dès
// qu'elle sert à **travailler** une liste, ne pas pouvoir dire « celui-ci,
// c'est fait » la rend inutilisable au bout de trente retours. Elle n'écrit
// que dans une table annexe, et elle se défait. Embarquer un bêta-testeur
// (01/10/2026, src/embarquement.js) : la seule qui touche à autre chose
// que ce tableau — elle crée un document et envoie un courrier, d'où la
// confirmation en deux clics.

import { brancherEmbarquement } from './embarquement.js'
import { blocImagesOrphelines, brancherImagesOrphelines } from './adminImages.js'
import { blocPolices, brancherPolices } from './adminPolices.js'
import { brancherInvitations, chargerEtatsCourrier, tableInvitations } from './adminInvitations.js'
import { NBSP, esc, nombre, octets, euros, date, duree, chiffre, entete, chargerVue } from './adminCommun.js'

const ecouteurTraite = new WeakSet()

/** Où en est la copie régulière tirée par la machine de sauvegarde, quand il
 * y en a une. Au-delà de 36 h sans nouvelle, c'est une alerte : une sauvegarde qui s'arrête en
 * silence est pire que pas de sauvegarde, parce qu'on croit en avoir une. */
export function copieDistante(etat, maintenant) {
  // Jamais signalée : on ne dit rien (décision du 10/10/2026). L'alerte
  // permanente « aucune copie distante » est retirée du back-office ; celle
  // d'une copie qui s'arrête (plus de 36 h) reste, plus bas.
  if (!etat) return ''
  const sec = Math.max(0, Math.round((maintenant - etat.ts) / 1000))
  const vieille = sec > 36 * 3600
  return `<p class="bo-note${vieille ? ' bo-alerte' : ''}">Dernière copie tirée par la machine de sauvegarde :
    ${sec < 60 ? 'à l’instant' : `il y a ${duree(sec)}`}${vieille ? ' — plus de 36 h, la copie régulière s’est arrêtée' : ''}.</p>`
}

/** L'envoi quotidien vers Proton Drive, fait par le serveur lui-même
 * (deploy/sauvegarde-vers-proton.sh). Facultatif : tant qu'il n'a jamais eu
 * lieu, on ne dit rien (la copie distante a sa propre alerte) ; une fois en
 * place, plus de 36 h sans nouvelle est une alerte comme pour elle. */
export function copieProton(etat, maintenant) {
  if (!etat) return ''
  const sec = Math.max(0, Math.round((maintenant - etat.ts) / 1000))
  const vieille = sec > 36 * 3600
  return `<p class="bo-note${vieille ? ' bo-alerte' : ''}">Dernier envoi sur Proton Drive :
    ${sec < 60 ? 'à l’instant' : `il y a ${duree(sec)}`}${vieille ? ' — plus de 36 h, l’envoi vers Proton s’est arrêté' : ''}.</p>`
}

/** Une ligne de retour. `traite` bascule le libellé du bouton : la même
 * action dans les deux sens, parce qu'on se trompe, et qu'un retour classé
 * trop vite doit pouvoir revenir. */
function ligneRetour(r) {
  const intitule = { avis: 'Avis', question: 'Question', idee: 'Idée', bug: 'Bug' }[r.intention] || r.intention || '—'
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
  if (!aTraiter.length && !traites.length)
    return `<h2>Retours reçus</h2>
    <p class="bo-note">Aucun retour reçu pour le moment. Ils arrivent par la palette de contact, et restent ici même si le courrier n'est pas parti.</p>`
  return `<h2>Retours reçus</h2>
    <p class="bo-note">${nombre(support.recus7j)} sur 7 jours, ${nombre(
      support.recus30j
    )} sur 30. Envoyés par la palette de contact, conservés ici même si le courrier n'est pas parti.</p>
    ${aTraiter.length ? tableRetours(aTraiter) : '<p class="bo-note">Tout est traité.</p>'}
    ${
      traites.length
        ? `<details class="bo-traites"><summary>${nombre(traites.length)} déjà traité(s)</summary>${tableRetours(
            traites
          )}</details>`
        : ''
    }`
}

/** Combien d'adresses d'attente on montre en haut du back-office : de quoi
 * traiter la file du jour sans quitter la page. Le reste est à un lien. */
const ATTENTE_VISIBLES = 5

function ligneAttente(l) {
  return `<tr>
    <td>${esc(l.email)}${l.inscriptions > 1 ? ` <span class="bo-attente" title="Inscrite plusieurs fois">×${nombre(l.inscriptions)}</span>` : ''}</td>
    <td>${date(l.ts)}</td>
    <td data-embarquer-zone><button type="button" class="bo-action" data-embarquer="${esc(l.email)}">Embarquer</button>
      <span class="bo-embarquer-msg bo-note" role="status"></span></td>
  </tr>`
}

/** Le bloc du haut : qui attend, et le moyen de les faire entrer. Absent si
 * la route n'a pas répondu — le reste du back-office n'en dépend pas. */
function sectionAttente(att, info) {
  if (!att) return ''
  const attente = (att.file || []).filter((l) => l.statut === 'attente')
  const visibles = attente.slice(0, ATTENTE_VISIBLES)
  return `<h2>Liste d'attente (${nombre(att.enAttente ?? attente.length)})</h2>
    ${info ? `<p class="bo-note bo-ok" role="status">${esc(info)}</p>` : ''}
    <p class="bo-note">Embarquer crée un document de bienvenue dont la personne est propriétaire, et lui envoie l'invitation par courrier.</p>
    ${
      visibles.length
        ? `<table class="bo-table">
      <thead><tr><th>Adresse</th><th>Inscrite le</th><th></th></tr></thead>
      <tbody>${visibles.map(ligneAttente).join('')}</tbody>
    </table>`
        : '<p class="bo-note">Personne n\'attend.</p>'
    }
    <p class="bo-note"><a href="#/inscrits">${
      attente.length > visibles.length ? `Voir les ${nombre(attente.length)} adresses →` : 'Toute la liste →'
    }</a></p>`
}

/** Pour embarquer une adresse qui n'est pas sur la liste (quelqu'un de
 * rencontré, un retour par courrier). Même action, même confirmation. */
function formulaireEmbarquer() {
  return `<form class="bo-embarquer-form" data-embarquer-form data-embarquer-zone>
    <label>Embarquer une adresse
      <input type="email" name="email" placeholder="prenom@exemple.fr" autocomplete="off" required>
    </label>
    <button type="submit" class="bo-action">Embarquer</button>
    <span class="bo-embarquer-msg bo-note" role="status"></span>
  </form>`
}

/** La rubrique « Synthèse » : les indicateurs clés, et ce qui attend. Rien
 * qu'on ne trouve déjà dans une autre rubrique — elle les rassemble, chaque
 * vignette cliquable menant à l'endroit où l'on traite la chose. */
function rubriqueSynthese({ d, att }) {
  const u = d.utilisateurs
  const doc = d.documents
  const f = d.flux
  const s = d.serveur
  const aTraiter = f.support ? (f.support.aTraiter || []).length : 0
  const attente = att && Number.isInteger(att.enAttente) ? att.enAttente : null
  const mailEchecs = f.mail ? f.mail.echecs30j : 0
  const t = f.tokens
  const sauvegardes = `${copieDistante(s.sauvegardeDistante, d.genereLe)}${copieProton(s.sauvegardeProton, d.genereLe)}`
  return `
      <h2>À traiter</h2>
      <div class="bo-chiffres">
        ${attente === null ? '' : chiffre(nombre(attente), "en liste d'attente", 'à embarquer', { lien: '#/admin/utilisateurs', alerte: false })}
        ${f.support ? chiffre(nombre(aTraiter), 'retours à traiter', `${nombre(f.support.recus7j)} reçus sur 7 jours`, { lien: '#/admin/retours' }) : ''}
        ${f.mail ? chiffre(nombre(mailEchecs), "échecs d'e-mail", `sur ${nombre(f.mail.envois30j)} envois en 30 jours`, { lien: '#/admin/systeme', alerte: mailEchecs > 0 }) : ''}
      </div>

      <h2>Personnes</h2>
      <div class="bo-chiffres">
        ${chiffre(nombre(u.total), 'personnes connues', '', { lien: '#/admin/utilisateurs' })}
        ${chiffre(nombre(f.connexions.actifs7j), 'actives sur 7 jours', `${nombre(f.connexions.actifs30j)} sur 30 jours`, { lien: '#/admin/utilisateurs' })}
        ${chiffre(nombre(u.actifs), 'déjà venues')}
        ${chiffre(nombre(u.enAttente), 'invitées, jamais venues')}
      </div>

      <h2>Documents</h2>
      <div class="bo-chiffres">
        ${chiffre(nombre(doc.total), 'documents', `${nombre(doc.crees30j)} créés sur 30 jours`, { lien: '#/admin/documents' })}
        ${chiffre(nombre(doc.actifs7j), 'modifiés sur 7 jours', '', { lien: '#/admin/documents' })}
        ${chiffre(
          doc.partCollaborative === null ? '—' : `${doc.partCollaborative}${NBSP}%`,
          'à plusieurs participants',
          `${nombre(doc.aPlusieursParticipants)} documents`
        )}
      </div>

      <h2>IA (30 jours)</h2>
      <div class="bo-chiffres">
        ${f.ia ? chiffre(euros(f.ia.coutEuros30j), 'Corrections IA', `${euros(f.ia.coutEuros7j)} sur 7 jours`, { lien: '#/admin/ia' }) : ''}
        ${t ? chiffre(nombre(t.barreLaterale['30j'].appels), 'demandes de Corrections IA', `${nombre(t.barreLaterale['7j'].appels)} sur 7 jours`, { lien: '#/admin/ia' }) : ''}
        ${t ? chiffre(nombre(t.fenetre['30j'].appels), 'messages à Margo', `${nombre(t.fenetre['7j'].appels)} sur 7 jours`, { lien: '#/admin/ia' }) : ''}
      </div>

      <h2>Serveur</h2>
      <div class="bo-chiffres">
        ${chiffre(`${nombre(s.rssMo)}${NBSP}Mo`, 'mémoire du process', 'plafond 700 Mo', { lien: '#/admin/systeme' })}
        ${chiffre(duree(s.uptimeSec), 'sans redémarrage', `pid ${s.pid}`, { lien: '#/admin/systeme' })}
        ${chiffre(octets(s.dataDirOctets), 'données sur disque', '', { lien: '#/admin/systeme' })}
      </div>
      ${sauvegardes}`
}

/** « Utilisateurs » : la file d'attente et l'embarquement, puis les comptes. */
function rubriqueUtilisateurs({ d, att, info }) {
  const u = d.utilisateurs
  const f = d.flux
  return `
      ${sectionAttente(att, info)}

      <h2>Utilisateurs</h2>
      ${formulaireEmbarquer()}
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
              <td>${p.nom ? esc(p.nom) : '<span class="bo-attente">—</span>'}</td>
              <td>${nombre(p.documents)}</td>
              <td>${[
                p.editeur ? `${p.editeur} éditeur` : '',
                p.correcteur ? `${p.correcteur} correcteur` : '',
                p.lecteur ? `${p.lecteur} lecteur` : '',
              ]
                .filter(Boolean)
                .join(', ')}</td>
              <td>${date(p.depuis)}</td>
              <td>${p.statut === 'actif' ? 'actif' : '<span class="bo-attente">en attente</span>'}</td>
            </tr>`
          )
          .join('')}</tbody>
      </table>
      <p class="bo-note">Le nom affiché est celui que la personne se donne à sa première ouverture d'un
      document ; un tiret signifie qu'elle n'en a pas encore ouvert. Il n'y a pas encore d'écran pour
      le corriger soi-même — en attendant, il se modifie dans <code>data/users.json</code>.</p>
      ${tableInvitations(u.invitationsEnAttente, { nbsp: NBSP })}
      ${
        Object.keys(u.invitationsPar).length
          ? `<p class="bo-note">Invitations envoyées : ${Object.entries(u.invitationsPar)
              .map(([e, n]) => `${esc(e)} (${n})`)
              .join(', ')} — si une seule adresse figure ici, l'outil ne circule pas encore tout seul.</p>`
          : ''
      }`
}

/** « Documents » : le parc, sa collaboration, ses journaux. */
function rubriqueDocuments({ d }) {
  const doc = d.documents
  const f = d.flux
  return `
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
        ${chiffre(nombre(doc.corbeille ? doc.corbeille.documents : 0), 'à la corbeille', doc.corbeille && doc.corbeille.plusAncienJours !== null ? `le plus ancien : ${nombre(doc.corbeille.plusAncienJours)} j, ${octets(doc.corbeille.octetsJournaux)} de journaux` : 'pas de purge automatique')}
      </div>
      <p class="bo-note">Journaux : ${octets(doc.journaux.octetsTotal)} au total, le plus gros ${octets(
        doc.journaux.plusGrosOctets
      )}, ${nombre(doc.journaux.aCompacter)} au-dessus du seuil de compaction${
        doc.journaux.sansHorodatage
          ? `, ${nombre(doc.journaux.sansHorodatage)} sans horodatage (antérieurs au suivi)`
          : ''
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
      </table>`
}

/** « Système » : le serveur, la sauvegarde, qui est connecté, le courrier. */
function rubriqueSysteme({ d }) {
  const f = d.flux
  const s = d.serveur
  return `
      <h2>Serveur</h2>
      <div class="bo-chiffres">
        ${chiffre(`${nombre(s.rssMo)}${NBSP}Mo`, 'mémoire du process', 'plafond 700 Mo')}
        ${chiffre(duree(s.uptimeSec), 'sans redémarrage', `pid ${s.pid}`)}
        ${chiffre(nombre(s.connexionsEnCours.reduce((a, r) => a + r.connectes, 0)), 'connexions en cours')}
        ${chiffre(nombre((s.repliques || []).length), 'documents en mémoire', 'plafond 20')}
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
      ${copieDistante(s.sauvegardeDistante, d.genereLe)}
      ${copieProton(s.sauvegardeProton, d.genereLe)}
      ${
        s.connexionsEnCours.length
          ? `<ul class="bo-liste">${s.connexionsEnCours
              .map((r) => `<li>${esc(r.docId)} — ${r.connectes} connecté(s) : ${esc(r.noms.join(', '))}</li>`)
              .join('')}</ul>`
          : '<p class="bo-note">Personne connecté en ce moment.</p>'
      }

      ${blocPolices()}

      ${blocImagesOrphelines()}

      <h2>Emails (30 jours)</h2>
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
      }.</p>`
}

const RUBRIQUES = {
  synthese: rubriqueSynthese,
  utilisateurs: rubriqueUtilisateurs,
  retours: ({ d }) => sectionRetours(d.flux.support),
  documents: rubriqueDocuments,
  systeme: rubriqueSysteme,
}

// La rubrique affichée dans chaque racine : l'écouteur « Traiter » (un seul
// par racine) redessine celle-là, pas la synthèse.
const rubriqueCourante = new WeakMap()

/** Dessine une rubrique du back-office (`synthese` par défaut). La rubrique
 * IA est dessinée par `mountAdminIa` (adminIa.js). */
export async function mountAdmin(root, { onglet = 'synthese', info = '' } = {}) {
  if (!RUBRIQUES[onglet]) onglet = 'synthese'
  rubriqueCourante.set(root, onglet)
  root.innerHTML = '<div class="home"><p>Chargement…</p></div>'
  const vue = await chargerVue()
  if (vue.statut === 403) {
    root.innerHTML = '<div class="home"><p>Réservé aux administrateurs.</p><a href="#/">← Retour</a></div>'
    return
  }
  if (!vue.d) {
    root.innerHTML = '<div class="home"><p>Le back-office n\'a pas répondu.</p><a href="#/">← Retour</a></div>'
    return
  }
  const { d } = vue

  root.innerHTML = `
    <div class="home backoffice">
      ${entete(onglet, vue)}
      <p class="bo-note">Vue au ${new Date(d.genereLe).toLocaleString('fr-FR')}. On n'y lit aucun contenu de document.</p>
      ${RUBRIQUES[onglet]({ ...vue, info })}
    </div>
  `

  // Après un embarquement on redessine tout : la file, les compteurs et la
  // table des utilisateurs ont changé en même temps.
  brancherEmbarquement(root, ({ email }) =>
    mountAdmin(root, { onglet, info: `Document créé, invitation envoyée à ${email}.` })
  )

  // Les invitations sans réponse : renvoyer, supprimer, copier le lien ; le
  // badge du courrier se remplit une fois la page affichée.
  brancherInvitations(root, (info) => mountAdmin(root, { onglet, info }))
  chargerEtatsCourrier(root)
  brancherImagesOrphelines(root)
  brancherPolices(root)

  // Un seul écouteur sur la racine plutôt qu'un par bouton : la page est
  // rendue d'un bloc par `innerHTML`, et des écouteurs posés sur les
  // boutons disparaîtraient au prochain rendu.
  // `[data-cle]` : les boutons d'embarquement portent la même classe, et
  // ne doivent surtout pas passer par ici. Et un seul écouteur par racine :
  // chaque redessin en empilait un de plus.
  if (ecouteurTraite.has(root)) return
  ecouteurTraite.add(root)
  root.addEventListener('click', async (e) => {
    const bouton = e.target.closest('.bo-action[data-cle]')
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
      await mountAdmin(root, { onglet: rubriqueCourante.get(root) })
    } catch {
      bouton.disabled = false
      bouton.textContent = 'Échec — réessayer'
    }
  })
}
