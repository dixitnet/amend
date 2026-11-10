import{n as e,t}from"./polices-DQS8LwPX.js";import{_ as n,v as r,y as i}from"./index-CvO8UjLR.js";import{n as a,r as o,t as s}from"./embarquement-CdtWg2qN.js";import{chargerVue as c,chiffre as l,date as u,duree as d,entete as f,esc as p,euros as m,nombre as h,octets as g}from"./adminCommun-FfoS0kpN.js";function _(){return`<h2>Images orphelines</h2>
    <p class="bo-note">Une image supprimée du texte reste sur le disque, et compte dans la
    limite d'images de son propriétaire. Ce nettoyage retire celles que <strong>plus rien ne
    référence</strong> : ni le texte (y compris une suppression encore en attente de
    décision), ni une version enregistrée, ni une page publiée, ni un autre document. Une image
    de moins de sept jours n'est jamais retirée.</p>
    <div data-orphelines>
      <p><button type="button" class="bo-action" data-orph="analyser">Analyser</button>
      <span class="bo-note" data-orph-msg role="status"></span></p>
      <div data-orph-resultat></div>
    </div>`}function v(e){if(e.illisibles&&e.illisibles.length)return`<p class="bo-note bo-erreur">Une source n'a pas pu être lue (${e.illisibles.length}) : par prudence, rien ne peut être supprimé tant que ce n'est pas réglé.</p>`;let t=`${h(e.fichiers)} image(s) stockées (${g(e.octets)}) ; <strong>${h(e.orphelines)} orpheline(s)</strong>${e.orphelines?` pesant ${g(e.octetsOrphelines)}`:``}.`;if(!e.orphelines)return`<p class="bo-note">${t} Rien à nettoyer.</p>`;let n=e.documents.filter(e=>e.orphelines.length).slice(0,15).map(e=>{let t=e.orphelines.reduce((e,t)=>e+t.octets,0),n=Math.max(...e.orphelines.map(e=>e.ageJours));return`<tr><td>${e.titre?p(e.titre):`<em>document supprimé</em> (${p(e.docId)})`}</td><td>${h(e.orphelines.length)}</td><td>${g(t)}</td><td>jusqu'à ${h(n)} j</td></tr>`}).join(``),r=e.documents.filter(e=>e.orphelines.length).length-15;return`<p class="bo-note">${t}</p>
    <table class="bo-table"><thead><tr><th>Document</th><th>Orphelines</th><th>Poids</th><th>Âge</th></tr></thead>
    <tbody>${n}</tbody></table>
    ${r>0?`<p class="bo-note">… et ${r} autre(s) document(s).</p>`:``}
    <p><button type="button" class="bo-action" data-orph="supprimer">Supprimer ces images</button></p>`}var y=new WeakSet;function b(e){y.has(e)||(y.add(e),e.addEventListener(`click`,async e=>{let t=e.target.closest(`button[data-orph]`),n=t&&t.closest(`[data-orphelines]`);if(!n||t.disabled)return;let r=n.querySelector(`[data-orph-msg]`),i=n.querySelector(`[data-orph-resultat]`),a=(e,t=!1)=>{r.textContent=e,r.classList.toggle(`bo-erreur`,t)};if(t.dataset.orph===`analyser`){t.disabled=!0,a(`Analyse en cours…`);try{let e=await fetch(`/api/admin/images-orphelines`);if(!e.ok)throw Error();i.innerHTML=v(await e.json()),a(``),t.textContent=`Analyser de nouveau`}catch{a(`L'analyse a échoué.`,!0)}t.disabled=!1}else if(t.dataset.arme!==`oui`)s(t,`Confirmer la suppression ?`),a(`Les fichiers seront effacés du disque, sans corbeille.`);else{o(t),t.disabled=!0,a(`Suppression…`);try{let e=await fetch(`/api/admin/images-orphelines`,{method:`POST`}),t=await e.json().catch(()=>({}));if(!e.ok)throw Error(t.error||`Refusé par le serveur.`);i.innerHTML=`<p class="bo-note">${h(t.supprimees)} image(s) supprimée(s), ${g(t.octets)} libérés.${t.echecs?` ${t.echecs} n'ont pas pu l'être.`:``}</p>`,a(``)}catch(e){t.disabled=!1,a(e.message||`La suppression a échoué.`,!0)}}}))}function x(){return`<h2>Polices</h2>
    <p class="bo-note">Les polices de base sont celles du serveur. Celles que vous déposez ici
    servent <strong>au PDF</strong> (composé avec le fichier lui-même), <strong>à l'écran</strong> et,
    par leur nom, à Word — le destinataire doit l'avoir installée pour la voir dans Word. Fichiers
    <code>.ttf</code> ou <code>.otf</code> (pas de WOFF, pas de police variable) ; vous devez en avoir
    le droit : les polices sous licence libre (OFL) s'y prêtent. Une famille se dépose en
    sélectionnant ses fichiers (normal, gras, italique…) ensemble.</p>
    <div data-polices>
      <div data-polices-liste><p class="bo-note">Chargement…</p></div>
      <p><label class="bo-action">Déposer des polices…
        <input type="file" data-polices-fichier accept=".ttf,.otf,font/ttf,font/otf" multiple hidden></label>
        <span class="bo-note" data-polices-msg role="status"></span></p>
    </div>`}var S={100:`Thin`,200:`ExtraLight`,300:`Light`,400:`Regular`,500:`Medium`,600:`SemiBold`,700:`Bold`,800:`ExtraBold`,900:`Black`},C=e=>`${S[e.poids]||e.poids}${e.italique?` italique`:``}`,w=e=>e.length>110?`${e.slice(0,110).trimEnd()}…`:e;function T(e){return e.polices.length?`<table class="bo-table"><thead><tr><th>Famille</th><th>Styles</th><th>Poids</th><th>Licence</th><th></th></tr></thead>
    <tbody>${e.polices.map(e=>`<tr>
        <td><strong style="font-family:'${p(e.famille)}', ${p(e.generique)}">${p(e.famille)}</strong></td>
        <td>${e.fichiers.map(e=>p(C(e))).join(`, `)}</td>
        <td>${g(e.fichiers.reduce((e,t)=>e+t.octets,0))}</td>
        <td class="bo-note" title="${p(e.licence||``)}">${p(w(e.licence||`licence non indiquée dans le fichier`))}</td>
        <td><button type="button" class="bo-action" data-police-supprimer="${p(e.id)}">Supprimer</button></td>
      </tr>`).join(``)}</tbody></table>
    <p class="bo-note">${h(e.polices.length)} famille(s) sur ${h(e.familles)} au plus, ${g(e.octets)} sur ${g(e.octetsMax)}. Un document dont la police est supprimée retombe sur la police de base.</p>`:`<p class="bo-note">Aucune police déposée : seules les polices de base sont proposées.</p>`}async function E(e){await t();let n=e.querySelector(`[data-polices-liste]`);if(n)try{let e=await fetch(`/api/admin/polices`);if(!e.ok)throw Error();n.innerHTML=T(await e.json())}catch{n.innerHTML=`<p class="bo-note bo-erreur">La liste des polices n’a pas pu être chargée.</p>`}}var D=new WeakSet;function O(t){E(t),!D.has(t)&&(D.add(t),t.addEventListener(`change`,async n=>{let r=n.target.closest(`input[data-polices-fichier]`),i=r&&r.closest(`[data-polices]`);if(!i||!r.files||!r.files.length)return;let a=i.querySelector(`[data-polices-msg]`),o=[...r.files];r.value=``;let s=[],c=0;for(let[e,t]of o.entries()){a.classList.remove(`bo-erreur`),a.textContent=`Envoi ${e+1}/${o.length} : ${t.name}…`;try{let e=await fetch(`/api/admin/polices`,{method:`POST`,headers:{"content-type":`application/octet-stream`},body:t}),n=await e.json().catch(()=>({}));if(!e.ok)throw Error(n.error||`refusé (${e.status})`);s.push(`${t.name} : ${n.police.famille} ${C(n.fichier)}${n.remplace?` (remplace)`:``}`)}catch(e){c++,s.push(`${t.name} : ${e.message||`échec`}`)}}a.classList.toggle(`bo-erreur`,c>0),a.textContent=s.join(` — `),await e(),await E(t)}),t.addEventListener(`click`,async n=>{let r=n.target.closest(`button[data-police-supprimer]`),i=r&&r.closest(`[data-polices]`);if(!i||r.disabled)return;let a=i.querySelector(`[data-polices-msg]`);if(r.dataset.arme!==`oui`)s(r,`Confirmer ?`),a.classList.remove(`bo-erreur`),a.textContent=`Les documents qui l’utilisent retomberont sur la police de base.`;else{o(r),r.disabled=!0;try{let n=await fetch(`/api/admin/polices/${encodeURIComponent(r.dataset.policeSupprimer)}`,{method:`DELETE`});if(!n.ok)throw Error((await n.json().catch(()=>({}))).error||`refusé (${n.status})`);a.textContent=``,await e(),await E(t)}catch(e){r.disabled=!1,a.classList.add(`bo-erreur`),a.textContent=e.message||`La suppression a échoué.`}}}))}function k(e,{nbsp:t=`\xA0`}={}){return e.length?`<h3>Invitations sans réponse</h3>
    <p class="bo-note">« Copier le lien » fabrique un nouveau lien à transmettre vous-même ; « Renvoyer » en fabrique un et réécrit à la personne. Dans les deux cas le lien du courrier déjà envoyé cesse de marcher. « Supprimer » retire l'invitation (et, pour une personne embarquée, son document de bienvenue, qui n'a jamais été ouvert).</p>
    <table class="bo-table bo-invitations">
      <thead><tr><th>Adresse</th><th>Invitation</th><th>Courrier</th><th></th></tr></thead>
      <tbody>${e.map(e=>`<tr data-inv-doc="${p(e.docId)}" data-inv-email="${p(e.email)}" data-inv-bienvenue="${e.bienvenue?`oui`:``}">
        <td>${p(e.email)}</td>
        <td>${e.bienvenue?`document de bienvenue (embarquement)`:`${p(e.role)} sur « ${p(e.titre)} »`}${e.depuisJours===null?``:`, depuis ${e.depuisJours}${t}j`}${e.invitePar?` (invité·e par ${p(e.invitePar)})`:``}</td>
        <td data-inv-courrier></td>
        <td class="bo-inv-cellule">
          <div class="bo-inv-actions">
            <button type="button" class="bo-action" data-inv="copier">Copier le lien</button>
            <button type="button" class="bo-action" data-inv="renvoyer">Renvoyer</button>
            <button type="button" class="bo-action" data-inv="supprimer">Supprimer</button>
          </div>
          <span class="bo-inv-msg bo-note" role="status"></span>
        </td>
      </tr>`).join(``)}</tbody>
    </table>`:``}async function A(e){if(!e.querySelector(`[data-inv-courrier]`))return;let t;try{let e=await fetch(`/api/admin/invitations/courrier`);if(!e.ok)return;t=(await e.json()).etats||{}}catch{return}for(let r of e.querySelectorAll(`tr[data-inv-doc]`)){let e=r.querySelector(`[data-inv-courrier]`),i=n(t[`${r.dataset.invDoc}|${r.dataset.invEmail}`]);e&&i&&(e.textContent=``,e.append(i))}}async function j(e,t,n){try{let r=await fetch(t,{method:e,headers:{"content-type":`application/json`},body:JSON.stringify(n)}),i=await r.json().catch(()=>({}));return r.ok?{ok:!0,...i}:{ok:!1,message:i.error||`Refusé par le serveur.`}}catch{return{ok:!1,message:`Le serveur n'a pas répondu : regardez la liste avant de réessayer.`}}}var M=new WeakMap;function N(e,t){let n=M.get(e);if(n){n.apres=t;return}let a={apres:t};M.set(e,a),e.addEventListener(`click`,async e=>{let t=e.target.closest(`button[data-inv]`),n=t&&t.closest(`tr[data-inv-doc]`);if(!n||t.disabled)return;let{invDoc:c,invEmail:l}=n.dataset,u=n.querySelector(`.bo-inv-msg`),d=(e,t)=>{u.textContent=e,u.classList.toggle(`bo-erreur`,!!t),n.querySelector(`.lien-copie`)?.remove()},f=t.dataset.inv;if(f===`copier`){t.disabled=!0;let e;try{e=await i(j(`POST`,`/api/admin/invitations/lien`,{docId:c,email:l}).then(e=>{if(!e.ok)throw Error(e.message);return e.lien}))}catch(e){t.disabled=!1,d(e.message,!0);return}if(t.disabled=!1,e.copie){d(`Lien copié. Celui du courrier déjà envoyé ne fonctionne plus.`,!1);return}d(`Copiez ce lien (celui du courrier déjà envoyé ne fonctionne plus) :`,!1);let n=r(e.texte,`Lien d’invitation pour ${l}`);u.after(n),n.focus(),n.select();return}if(t.dataset.arme!==`oui`){s(t,`Confirmer ?`),d(f===`renvoyer`?`Écrire de nouveau à ${l} (l'ancien lien cessera de marcher).`:n.dataset.invBienvenue?`Supprimer l'invitation et le document de bienvenue de ${l} ; l'adresse retournera dans la liste d'attente.`:`Supprimer l'invitation de ${l} : elle n'aura plus accès au document.`,!1);return}o(t),t.disabled=!0,d(f===`renvoyer`?`Envoi en cours…`:`Suppression…`,!1);let p=f===`renvoyer`?await j(`POST`,`/api/admin/invitations/renvoyer`,{docId:c,email:l}):await j(`DELETE`,`/api/admin/invitations`,{docId:c,email:l});p.ok?await a.apres(f===`renvoyer`?`Invitation renvoyée à ${l}.`:p.remiseEnAttente?`Invitation de ${l} supprimée ; l'adresse est de nouveau dans la liste d'attente.`:`Invitation de ${l} supprimée.`):(t.disabled=!1,d(p.message,!0))})}var P=new WeakSet;function F(e,t){if(!e)return``;let n=Math.max(0,Math.round((t-e.ts)/1e3)),r=n>129600;return`<p class="bo-note${r?` bo-alerte`:``}">Dernière copie tirée par la machine de sauvegarde :
    ${n<60?`à l’instant`:`il y a ${d(n)}`}${r?` — plus de 36 h, la copie régulière s’est arrêtée`:``}.</p>`}function I(e,t){if(!e)return``;let n=Math.max(0,Math.round((t-e.ts)/1e3)),r=n>129600;return`<p class="bo-note${r?` bo-alerte`:``}">Dernier envoi sur Proton Drive :
    ${n<60?`à l’instant`:`il y a ${d(n)}`}${r?` — plus de 36 h, l’envoi vers Proton s’est arrêté`:``}.</p>`}function L(e){let t={avis:`Avis`,question:`Question`,idee:`Idée`,bug:`Bug`}[e.intention]||e.intention||`—`,n=[e.docId?`<a href="#/doc/${p(e.docId)}">document</a>${e.role?` (${p(e.role)})`:``}`:``,e.navigateur?`<span title="${p(e.navigateur)}">navigateur</span>`:``,e.erreurs&&e.erreurs.length?`<span class="bo-attente" title="${p(e.erreurs.join(` | `))}">${e.erreurs.length} erreur(s)</span>`:``].filter(Boolean).join(` · `);return`<tr class="${e.traite?`bo-traite`:``}">
    <td>${u(e.ts)}</td>
    <td>${p(e.email||`—`)}</td>
    <td>${p(t)}</td>
    <td class="bo-message">${p(e.message||``)}</td>
    <td class="bo-contexte">${n}</td>
    <td><button type="button" class="bo-action" data-cle="${p(e.cle)}" data-traite="${e.traite?`oui`:`non`}">${e.traite?`Rouvrir`:`Traiter`}</button></td>
  </tr>`}function R(e){return`<table class="bo-table">
    <thead><tr><th>Quand</th><th>Qui</th><th>Quoi</th><th>Message</th><th>Contexte</th><th></th></tr></thead>
    <tbody>${e.map(L).join(``)}</tbody>
  </table>`}function z(e){if(!e)return``;let t=e.aTraiter||[],n=e.traites||[];return!t.length&&!n.length?`<h2>Retours reçus</h2>
    <p class="bo-note">Aucun retour reçu pour le moment. Ils arrivent par la palette de contact, et restent ici même si le courrier n'est pas parti.</p>`:`<h2>Retours reçus</h2>
    <p class="bo-note">${h(e.recus7j)} sur 7 jours, ${h(e.recus30j)} sur 30. Envoyés par la palette de contact, conservés ici même si le courrier n'est pas parti.</p>
    ${t.length?R(t):`<p class="bo-note">Tout est traité.</p>`}
    ${n.length?`<details class="bo-traites"><summary>${h(n.length)} déjà traité(s)</summary>${R(n)}</details>`:``}`}var B=5;function V(e){return`<tr>
    <td>${p(e.email)}${e.inscriptions>1?` <span class="bo-attente" title="Inscrite plusieurs fois">×${h(e.inscriptions)}</span>`:``}</td>
    <td>${u(e.ts)}</td>
    <td data-embarquer-zone><button type="button" class="bo-action" data-embarquer="${p(e.email)}">Embarquer</button>
      <span class="bo-embarquer-msg bo-note" role="status"></span></td>
  </tr>`}function H(e,t){if(!e)return``;let n=(e.file||[]).filter(e=>e.statut===`attente`),r=n.slice(0,B);return`<h2>Liste d'attente (${h(e.enAttente??n.length)})</h2>
    ${t?`<p class="bo-note bo-ok" role="status">${p(t)}</p>`:``}
    <p class="bo-note">Embarquer crée un document de bienvenue dont la personne est propriétaire, et lui envoie l'invitation par courrier.</p>
    ${r.length?`<table class="bo-table">
      <thead><tr><th>Adresse</th><th>Inscrite le</th><th></th></tr></thead>
      <tbody>${r.map(V).join(``)}</tbody>
    </table>`:`<p class="bo-note">Personne n'attend.</p>`}
    <p class="bo-note"><a href="#/inscrits">${n.length>r.length?`Voir les ${h(n.length)} adresses →`:`Toute la liste →`}</a></p>`}function U(){return`<form class="bo-embarquer-form" data-embarquer-form data-embarquer-zone>
    <label>Embarquer une adresse
      <input type="email" name="email" placeholder="prenom@exemple.fr" autocomplete="off" required>
    </label>
    <button type="submit" class="bo-action">Embarquer</button>
    <span class="bo-embarquer-msg bo-note" role="status"></span>
  </form>`}function W({d:e,att:t}){let n=e.utilisateurs,r=e.documents,i=e.flux,a=e.serveur,o=i.support?(i.support.aTraiter||[]).length:0,s=t&&Number.isInteger(t.enAttente)?t.enAttente:null,c=i.mail?i.mail.echecs30j:0,u=i.tokens,f=`${F(a.sauvegardeDistante,e.genereLe)}${I(a.sauvegardeProton,e.genereLe)}`;return`
      <h2>À traiter</h2>
      <div class="bo-chiffres">
        ${s===null?``:l(h(s),`en liste d'attente`,`à embarquer`,{lien:`#/admin/utilisateurs`,alerte:!1})}
        ${i.support?l(h(o),`retours à traiter`,`${h(i.support.recus7j)} reçus sur 7 jours`,{lien:`#/admin/retours`}):``}
        ${i.mail?l(h(c),`échecs d'e-mail`,`sur ${h(i.mail.envois30j)} envois en 30 jours`,{lien:`#/admin/systeme`,alerte:c>0}):``}
      </div>

      <h2>Personnes</h2>
      <div class="bo-chiffres">
        ${l(h(n.total),`personnes connues`,``,{lien:`#/admin/utilisateurs`})}
        ${l(h(i.connexions.actifs7j),`actives sur 7 jours`,`${h(i.connexions.actifs30j)} sur 30 jours`,{lien:`#/admin/utilisateurs`})}
        ${l(h(n.actifs),`déjà venues`)}
        ${l(h(n.enAttente),`invitées, jamais venues`)}
      </div>

      <h2>Documents</h2>
      <div class="bo-chiffres">
        ${l(h(r.total),`documents`,`${h(r.crees30j)} créés sur 30 jours`,{lien:`#/admin/documents`})}
        ${l(h(r.actifs7j),`modifiés sur 7 jours`,``,{lien:`#/admin/documents`})}
        ${l(r.partCollaborative===null?`—`:`${r.partCollaborative} %`,`à plusieurs participants`,`${h(r.aPlusieursParticipants)} documents`)}
      </div>

      <h2>IA (30 jours)</h2>
      <div class="bo-chiffres">
        ${i.ia?l(m(i.ia.coutEuros30j),`Corrections IA`,`${m(i.ia.coutEuros7j)} sur 7 jours`,{lien:`#/admin/ia`}):``}
        ${u?l(h(u.barreLaterale[`30j`].appels),`demandes de Corrections IA`,`${h(u.barreLaterale[`7j`].appels)} sur 7 jours`,{lien:`#/admin/ia`}):``}
        ${u?l(h(u.fenetre[`30j`].appels),`messages à Margo`,`${h(u.fenetre[`7j`].appels)} sur 7 jours`,{lien:`#/admin/ia`}):``}
      </div>

      <h2>Serveur</h2>
      <div class="bo-chiffres">
        ${l(`${h(a.rssMo)} Mo`,`mémoire du process`,`plafond 700 Mo`,{lien:`#/admin/systeme`})}
        ${l(d(a.uptimeSec),`sans redémarrage`,`pid ${a.pid}`,{lien:`#/admin/systeme`})}
        ${l(g(a.dataDirOctets),`données sur disque`,``,{lien:`#/admin/systeme`})}
      </div>
      ${f}`}function G({d:e,att:t,info:n}){let r=e.utilisateurs,i=e.flux;return`
      ${H(t,n)}

      <h2>Utilisateurs</h2>
      ${U()}
      <div class="bo-chiffres">
        ${l(h(r.total),`personnes connues`)}
        ${l(h(r.actifs),`déjà venues`)}
        ${l(h(r.enAttente),`invitées, jamais venues`)}
        ${l(h(i.connexions.actifs7j),`actives sur 7 jours`,`${h(i.connexions.actifs30j)} sur 30 jours`)}
      </div>
      <table class="bo-table">
        <thead><tr><th>Adresse</th><th>Nom affiché</th><th>Documents</th><th>Rôles</th><th>Depuis</th><th>Statut</th></tr></thead>
        <tbody>${r.liste.map(e=>`<tr>
              <td>${p(e.email)}</td>
              <td>${e.nom?p(e.nom):`<span class="bo-attente">—</span>`}</td>
              <td>${h(e.documents)}</td>
              <td>${[e.editeur?`${e.editeur} éditeur`:``,e.correcteur?`${e.correcteur} correcteur`:``,e.lecteur?`${e.lecteur} lecteur`:``].filter(Boolean).join(`, `)}</td>
              <td>${u(e.depuis)}</td>
              <td>${e.statut===`actif`?`actif`:`<span class="bo-attente">en attente</span>`}</td>
            </tr>`).join(``)}</tbody>
      </table>
      <p class="bo-note">Le nom affiché est celui que la personne se donne à sa première ouverture d'un
      document ; un tiret signifie qu'elle n'en a pas encore ouvert. Il n'y a pas encore d'écran pour
      le corriger soi-même — en attendant, il se modifie dans <code>data/users.json</code>.</p>
      ${k(r.invitationsEnAttente,{nbsp:` `})}
      ${Object.keys(r.invitationsPar).length?`<p class="bo-note">Invitations envoyées : ${Object.entries(r.invitationsPar).map(([e,t])=>`${p(e)} (${t})`).join(`, `)} — si une seule adresse figure ici, l'outil ne circule pas encore tout seul.</p>`:``}`}function K({d:e}){let t=e.documents,n=e.flux;return`
      <h2>Documents</h2>
      <div class="bo-chiffres">
        ${l(h(t.total),`documents`,`${h(t.crees30j)} créés sur 30 jours`)}
        ${l(t.partCollaborative===null?`—`:`${t.partCollaborative} %`,`à plusieurs participants`,`${h(t.aPlusieursParticipants)} documents`)}
        ${l(h(n.connexions.collaboration30j.moments),`moments à deux ou plus`,`sur ${h(n.connexions.collaboration30j.documents)} documents, 30 j`)}
        ${l(h(t.actifs7j),`modifiés sur 7 jours`)}
        ${l(h(t.corbeille?t.corbeille.documents:0),`à la corbeille`,t.corbeille&&t.corbeille.plusAncienJours!==null?`le plus ancien : ${h(t.corbeille.plusAncienJours)} j, ${g(t.corbeille.octetsJournaux)} de journaux`:`pas de purge automatique`)}
      </div>
      <p class="bo-note">Journaux : ${g(t.journaux.octetsTotal)} au total, le plus gros ${g(t.journaux.plusGrosOctets)}, ${h(t.journaux.aCompacter)} au-dessus du seuil de compaction${t.journaux.sansHorodatage?`, ${h(t.journaux.sansHorodatage)} sans horodatage (antérieurs au suivi)`:``}${t.sansControleDacces?`. ${h(t.sansControleDacces)} document(s) sans liste d'accès.`:`.`}</p>
      <table class="bo-table">
        <thead><tr><th>Titre</th><th>Propriétaire</th><th>Participants</th><th>En ligne</th><th>Opérations</th><th>Poids</th><th>Modifié</th></tr></thead>
        <tbody>${t.liste.map(e=>`<tr>
              <td><a href="#/doc/${p(e.id)}">${p(e.titre||`Sans titre`)}</a></td>
              <td>${e.proprietaire?p(e.proprietaire):`<span class="bo-attente">aucun</span>`}</td>
              <td>${h(e.participants)}</td>
              <td>${e.enLigne||``}</td>
              <td>${h(e.operations)}${e.aCompacter?` <span class="bo-attente">à compacter</span>`:``}</td>
              <td>${g(e.octets)}</td>
              <td>${u(e.modifieLe)}</td>
            </tr>`).join(``)}</tbody>
      </table>`}function q({d:e}){let t=e.flux,n=e.serveur;return`
      <h2>Serveur</h2>
      <div class="bo-chiffres">
        ${l(`${h(n.rssMo)} Mo`,`mémoire du process`,`plafond 700 Mo`)}
        ${l(d(n.uptimeSec),`sans redémarrage`,`pid ${n.pid}`)}
        ${n.version?l(p(n.version.commit),`version déployée`,`${n.version.branche?`${p(n.version.branche)}, `:``}depuis le ${u(n.version.depuis)} à ${new Date(n.version.depuis).toLocaleTimeString(`fr-FR`,{hour:`2-digit`,minute:`2-digit`})}`):``}
        ${l(h(n.connexionsEnCours.reduce((e,t)=>e+t.connectes,0)),`connexions en cours`)}
        ${l(h((n.repliques||[]).length),`documents en mémoire`,`plafond 20`)}
        ${l(g(n.dataDirOctets),`données sur disque`)}
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
      <p><a class="btn-preset" href="/api/admin/sauvegarde" download>Télécharger la sauvegarde (${g(n.dataDirOctets)} avant compression)</a></p>
      ${F(n.sauvegardeDistante,e.genereLe)}
      ${I(n.sauvegardeProton,e.genereLe)}
      ${n.connexionsEnCours.length?`<ul class="bo-liste">${n.connexionsEnCours.map(e=>`<li>${p(e.docId)} — ${e.connectes} connecté(s) : ${p(e.noms.join(`, `))}</li>`).join(``)}</ul>`:`<p class="bo-note">Personne connecté en ce moment.</p>`}

      ${x()}

      ${_()}

      <h2>Emails (30 jours)</h2>
      <p class="bo-note ${t.mail.echecs30j?`bo-alerte`:``}">
        ${h(t.mail.envois30j)} envois, <strong>${h(t.mail.echecs30j)} échecs</strong>${Object.keys(t.mail.parType).length?` — `+Object.entries(t.mail.parType).map(([e,t])=>`${p(e)} : ${t.ok} ok / ${t.echecs} échecs`).join(`, `):``}.
        ${t.mail.dernierEchec?`Dernier échec le ${new Date(t.mail.dernierEchec.ts).toLocaleString(`fr-FR`)} : ${p(t.mail.dernierEchec.erreur||``)}.`:``}
        Depuis le retrait du filtre d'accès, l'email est la seule porte d'entrée : un échec n'expose rien mais enferme dehors.
      </p>

      <p class="bo-note">Liste d'attente : ${h(n.listeAttente.total)} adresse(s)${n.listeAttente.dernier?`, dernière le ${u(n.listeAttente.dernier)}`:``}.</p>`}var J={synthese:W,utilisateurs:G,retours:({d:e})=>z(e.flux.support),documents:K,systeme:q},Y=new WeakMap;async function X(e,{onglet:t=`synthese`,info:n=``}={}){J[t]||(t=`synthese`),Y.set(e,t),e.innerHTML=`<div class="home"><p>Chargement…</p></div>`;let r=await c();if(r.statut===403){e.innerHTML=`<div class="home"><p>Réservé aux administrateurs.</p><a href="#/">← Retour</a></div>`;return}if(!r.d){e.innerHTML=`<div class="home"><p>Le back-office n'a pas répondu.</p><a href="#/">← Retour</a></div>`;return}let{d:i}=r;e.innerHTML=`
    <div class="home backoffice">
      ${f(t,r)}
      <p class="bo-note">Vue au ${new Date(i.genereLe).toLocaleString(`fr-FR`)}. On n'y lit aucun contenu de document.</p>
      ${J[t]({...r,info:n})}
    </div>
  `,a(e,({email:n})=>X(e,{onglet:t,info:`Document créé, invitation envoyée à ${n}.`})),N(e,n=>X(e,{onglet:t,info:n})),A(e),b(e),O(e),!P.has(e)&&(P.add(e),e.addEventListener(`click`,async t=>{let n=t.target.closest(`.bo-action[data-cle]`);if(!n)return;let r=n.dataset.cle,i=n.dataset.traite!==`oui`;n.disabled=!0;try{if(!(await fetch(`/api/admin/support/${encodeURIComponent(r)}/traite`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({traite:i})})).ok)throw Error(`refus du serveur`);await X(e,{onglet:Y.get(e)})}catch{n.disabled=!1,n.textContent=`Échec — réessayer`}}))}export{X as mountAdmin};