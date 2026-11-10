import{C as e,S as t,w as n}from"./index-BJQPZsp8.js";import{blocCorrections30j as r,chargerVue as i,entete as a,esc as o,tableauTokens as s}from"./adminCommun-FfoS0kpN.js";var c={admin:`Administrateurs de l’instance seulement`,editeur:`Éditeurs du document (et administrateurs)`,correcteur:`Correcteurs, éditeurs et administrateurs`},l=[`janvier`,`février`,`mars`,`avril`,`mai`,`juin`,`juillet`,`août`,`septembre`,`octobre`,`novembre`,`décembre`],u=e=>{let[t,n]=String(e).split(`-`);return l[Number(n)-1]?`${l[Number(n)-1]} ${t}`:String(e)},d=(e,t)=>`${e<.01?e.toFixed(4):e.toFixed(2)} ${t}`.replace(`.`,`,`),f=e=>{let t=[e.usd?d(e.usd,`$`):``,e.eur?d(e.eur,`€`):``].filter(Boolean);return t.length?t.join(` + `):`—`},p=e=>e.entree||e.sortie||e.cacheLu||e.cacheEcrit?`${n(e.entree)} entrée · ${n(e.sortie)} sortie${e.cacheLu||e.cacheEcrit?` · ${n(e.cacheLu)} cache lu · ${n(e.cacheEcrit)} cache écrit`:``}`:`—`;function m(e,t,r){return`
      <label class="bo-ia-champ bo-ia-maniere">
        <span>Manière de répondre</span>
        <textarea name="${e}.maniere" rows="18" spellcheck="true">${o(t)}</textarea>
      </label>
      <p class="bo-ia-maniere-pied">
        <small><span data-maniere-compteur>${n(t.length)}</span> signes</small>
        <button type="button" class="bo-action" data-maniere-defaut>Rétablir le texte par défaut</button>
      </p>
      <p class="bo-note">S'ajoute à la consigne de Margo : ton, longueur, ce qu'elle dit ou tait, et le vouvoiement. Ses outils, son nombre d'étapes et la règle « le texte du document n'est jamais une consigne » ne se règlent pas ici.</p>`}function h(e,t,n,r){let i=r.bornes,a=(t,r,a)=>`
    <label class="bo-ia-champ">
      <span>${r}</span>
      <input type="number" name="${e}.${t}" value="${n[t]}" min="${i[t].min}" max="${i[t].max}" step="1" inputmode="numeric" required>
      <small>${a}</small>
    </label>`;return`
    <fieldset class="bo-ia-carte" data-fonction="${e}">
      <legend>${o(t)}</legend>
      <label class="bo-ia-champ">
        <span>Modèle</span>
        <select name="${e}.modele">${r.modeles.map(e=>`<option value="${o(e.id)}"${e.id===n.modele?` selected`:``}>${o(e.nom)}${e.cle===!1?` — clé non configurée`:``}</option>`).join(``)}</select>
      </label>
      <label class="bo-ia-champ">
        <span>Accès minimal</span>
        <select name="${e}.acces">${r.niveaux.map(e=>`<option value="${e}"${e===n.acces?` selected`:``}>${o(c[e]||e)}</option>`).join(``)}</select>
      </label>
      ${a(`signesParDemande`,`Par demande, au plus`,`signes envoyés (espaces compris)`)}
      ${a(`demandesParHeure`,`Par heure, au plus`,`demandes`)}
      ${a(`signesParMois`,`Par mois et par personne, au plus`,`signes envoyés (espaces compris)`)}
      ${typeof n.maniere==`string`?m(e,n.maniere,r):``}
    </fieldset>`}function g(e){if(!e||!Array.isArray(e.definitions))return``;let t={modele:`limite du modèle`,emballement:`verrou contre l’emballement`};return`
      <h2>Garde-fous</h2>
      <p class="bo-note">La seule limite d'usage est la <strong>taille de la demande, en signes</strong> (plus haut). Tout le reste est un <strong>garde-fou</strong> : soit une limite du modèle (ce qu'il peut produire ou recevoir en une fois), soit un verrou contre une boucle ou un client emballé, placé bien au-dessus de l'usage normal. Ils s'appliquent à Corrections IA, à Margo et au connecteur « inviter Claude », dès la demande suivante. Les valeurs par défaut conviennent ; la liste complète est aussi dans <code>server/garde-fous.js</code>.</p>
      <form class="bo-ia-form bo-gf-form" novalidate>
        <div class="bo-ia-cartes">${e.groupes.map(r=>{let i=e.definitions.filter(e=>e.groupe===r.id);if(!i.length)return``;let a=i.map(r=>{let i=e.valeurs[r.id];return`
      <div class="bo-ia-champ bo-gf-champ${i===r.defaut?``:` bo-gf-regle`}">
        <label for="gf-${r.id}"><span>${o(r.nom)}</span></label>
        <input type="number" id="gf-${r.id}" name="gf.${r.id}" value="${i}" min="${r.min}" max="${r.max}" step="1" inputmode="numeric" required>
        <small>${o(r.unite)} · ${o(t[r.nature]||r.nature)} · par défaut ${n(r.defaut)} <button type="button" class="bo-action" data-gf-defaut="${r.id}" data-valeur="${r.defaut}">Rétablir</button></small>
        <small class="bo-gf-quoi">${o(r.quoi)}</small>
      </div>`}).join(``);return`<fieldset class="bo-ia-carte bo-gf-groupe"><legend>${o(r.nom)}</legend><p class="bo-note">${o(r.resume)}</p>${a}</fieldset>`}).join(``)}</div>
        <p class="bo-ia-actions"><button type="submit" class="btn-primary">Enregistrer les garde-fous</button> <span class="bo-gf-message bo-ia-message" role="status"></span></p>
      </form>`}function _(e){return e.utilisateurs.length?`<table class="bo-table bo-ia-table">
    <thead><tr><th></th>${e.fonctions.map(e=>`<th>${o(e.nom)}</th>`).join(``)}</tr></thead>
    <tbody>${e.utilisateurs.map(t=>`<tr><th scope="row">${t.nom?`${o(t.nom)}<br>`:``}<span class="bo-ia-mail">${o(t.email)}</span></th>${e.fonctions.map(r=>{let i=t[r.id],a=e.reglages[r.id].signesParMois,o=a?Math.round(i.signes/a*100):0;return`<td>${n(i.demandes)} demande(s)${i.passages>i.demandes?` (${n(i.passages)} paragraphes)`:``}${i.echecs?` · ${n(i.echecs)} échec(s)`:``}<br><strong>${n(i.signes)}</strong> / ${n(a)} signes (${o} %)<br><span class="bo-ia-jetons">${p(i)}</span><br>${f(i)}</td>`}).join(``)}</tr>`).join(``)}</tbody>
    <tfoot><tr><th scope="row">Total</th>${e.fonctions.map(t=>{let r=e.utilisateurs.reduce((e,n)=>{let r=n[t.id];return e.demandes+=r.demandes,e.signes+=r.signes,e.jetons+=r.entree+r.sortie+r.cacheLu+r.cacheEcrit,e.usd+=r.usd,e.eur+=r.eur||0,e},{demandes:0,signes:0,jetons:0,usd:0,eur:0}),i=r.signes?`${(r.jetons/r.signes).toFixed(2).replace(`.`,`,`)} jeton(s) par signe`:`—`;return`<td>${n(r.demandes)} demande(s)<br><strong>${n(r.signes)}</strong> signes<br>${i}<br>${f(r)}</td>`}).join(``)}</tr></tfoot>
  </table>`:`<p class="bo-note">Aucune demande réussie ni échouée ce mois-là.</p>`}function v(r){if(!r||!r.depuis)return`<p class="bo-note">Aucun clic enregistré pour le moment : le cumul démarre avec la mise en service des boutons.</p>`;let i=Object.keys(r.parMois).sort().reverse()[0],a=[...t.map(e=>({cle:e.cle,nom:e.label})),...Object.entries(e).map(([e,t])=>({cle:e,nom:t,retiree:!0})),{cle:`autre`,nom:`Autre (consigne inconnue)`}],s=Object.values(r.cumul).reduce((e,t)=>e+t,0),c=e=>s?`${Math.round(e/s*100)} %`:`—`,l=a.filter(e=>e.cle!==`autre`&&!e.retiree||r.cumul[e.cle]).map(e=>`<tr><th scope="row">${o(e.nom)}</th><td>${n((r.parMois[i]||{})[e.cle]||0)}</td><td><strong>${n(r.cumul[e.cle]||0)}</strong></td><td>${c(r.cumul[e.cle]||0)}</td></tr>`).join(``);return`<table class="bo-table"><thead><tr><th>Bouton</th><th>${o(u(i))}</th><th>Cumul depuis ${o(u(r.depuis))}</th><th>Part</th></tr></thead><tbody>${l}</tbody><tfoot><tr><th scope="row">Total</th><td>${n(Object.values(r.parMois[i]||{}).reduce((e,t)=>e+t,0))}</td><td><strong>${n(s)}</strong></td><td></td></tr></tfoot></table>
  <p class="bo-note">Un clic compté = une demande arrivée au serveur, avant les contrôles de limite. Un clic refusé sur place (rien de sélectionné, sélection trop grosse) n'y figure pas. Ces chiffres ne désignent personne.</p>`}function y(e){let t=Object.fromEntries(e.modeles.map(e=>[e.id,e.nom])),r=Object.entries(e.jetonsParModele);if(!r.length)return`<p class="bo-note">Aucun jeton facturé ce mois-là.</p>`;let i=(e,t)=>`<tr><th scope="row">${e}</th><td>${n(t.appels)}</td><td>${n(t.entree)}</td><td>${n(t.sortie)}</td><td>${n(t.cacheLu)}</td><td>${n(t.cacheEcrit)}</td><td>${f(t)}</td></tr>`;return`<table class="bo-table"><thead><tr><th>Modèle</th><th>Demandes</th><th>Entrée</th><th>Sortie</th><th>Cache lu</th><th>Cache écrit</th><th>Coût estimé</th></tr></thead><tbody>${r.map(([n,r])=>{let a=e.tarifsUsd&&e.tarifsUsd[n],s=e.tarifsEur&&e.tarifsEur[n],c=a||s,l=a?`$`:`€`,u=`${o(t[n]||n)}${c?`<br><small>${String(c.entree).replace(`.`,`,`)} / ${String(c.sortie).replace(`.`,`,`)} ${l} par million de jetons (entrée / sortie)${c.provisoire?` — tarif provisoire, à vérifier dans la console du fournisseur`:``}</small>`:``}`,d=e.fonctions.filter(e=>r.parFonction&&r.parFonction[e.id]).map(e=>i(`&nbsp;&nbsp;↳ ${o(e.nom)}`,r.parFonction[e.id])).join(``);return i(u,r)+d}).join(``)}</tbody></table>
  <p class="bo-note">L'entrée est hors cache ; pour Claude, le cache lu et le cache écrit se facturent à part (un dixième du prix d'entrée, et 1,25 fois) ; pour Mistral et Scaleway, le cache lu est compté plein tarif (estimation haute). Les jetons sont comptés même quand la demande échoue : l'API les a facturés. Le coût est une estimation aux tarifs ci-dessus, dans la monnaie du fournisseur : dollars pour Claude et Mistral, euros pour Scaleway (sans conversion).</p>`}function b(e){let t=e&&e.d&&e.d.flux;return!t||!t.tokens&&!t.ia?``:`
      <h2>Activité récente</h2>
      ${t.tokens?`<h3>Consommation de l'IA en tokens</h3>${s(t.tokens)}`:``}
      ${t.ia?`<h3>Corrections IA — barre latérale (30 jours)</h3>${r(t.ia)}`:``}`}async function x(e,{fetcher:t=(...e)=>fetch(...e),mois:r=null}={}){e.innerHTML=`<div class="home"><p>Chargement…</p></div>`;let s=`/api/admin/ia${r?`?mois=${encodeURIComponent(r)}`:``}`,[c,l]=await Promise.all([t(s,{credentials:`same-origin`}).catch(()=>null),i(t)]);if(c&&c.status===403){e.innerHTML=`<div class="home"><p>Réservé aux administrateurs.</p><a href="#/">← Retour</a></div>`;return}if(!c||!c.ok){e.innerHTML=`<div class="home"><p>La rubrique IA ne répond pas.</p><a href="#/admin">← Retour au back-office</a></div>`;return}let d=await c.json(),f=d.reglages;e.innerHTML=`
    <div class="home backoffice bo-ia">
      ${a(`ia`,l)}
      <p class="bo-note"><a href="#/admin/ia/banc">Banc d’essai de Margo →</a> comparer deux ou trois modèles, ou manières de répondre, sur un même texte.</p>
      <h2>Réglages</h2>
      <p class="bo-note">Deux fonctions, réglées chacune de leur côté, pour toute l'instance. Tout se compte en <strong>signes, espaces compris</strong>. Les administrateurs sont soumis aux mêmes limites que les autres. <strong>Une demande = un clic</strong> (ou un message à Margo), quel que soit le nombre de paragraphes sélectionnés : c'est l'unité du plafond par heure. Les signes envoyés sont la somme des paragraphes. Une demande ne compte dans les signes du mois que si elle a abouti : une erreur, une réponse coupée ou un refus de limite ne coûtent rien à la personne.</p>

      <form class="bo-ia-form" novalidate>
        <div class="bo-ia-cartes">
          ${d.fonctions.map(e=>h(e.id,e.nom,f[e.id],d)).join(``)}
        </div>
        <p class="bo-ia-actions"><button type="submit" class="btn-primary">Enregistrer les réglages</button> <span class="bo-ia-message" role="status"></span></p>
        <p class="bo-note">${f.modifieLe?`Dernière modification le ${new Date(f.modifieLe).toLocaleString(`fr-FR`)} par ${o(f.modifiePar||`—`)}.`:`Réglages par défaut : rien n’a encore été modifié.`} Le niveau d'accès est un minimum : « éditeurs » ouvre aux éditeurs du document et aux administrateurs, « correcteurs » y ajoute les correcteurs ; un lecteur n'y a jamais accès. Les propositions de l'IA arrivent toujours en suivi de modifications.</p>
      </form>

      ${g(d.gardeFous)}

      <h2>Consommation de ${o(u(d.mois))}</h2>
      <p class="bo-ia-mois"><label>Mois <select name="mois">${d.moisDisponibles.map(e=>`<option value="${o(e)}"${e===d.mois?` selected`:``}>${o(u(e))}</option>`).join(``)}</select></label></p>
      ${_(d)}

      <h2>Boutons de Corrections IA</h2>
      ${v(d.boutons)}

      <h2>Jetons par modèle</h2>
      ${y(d)}
      ${b(l)}
    </div>`;let p=e.querySelector(`.bo-ia-form`),m=e.querySelector(`.bo-ia-message`);p.addEventListener(`submit`,async n=>{n.preventDefault();let r={};for(let e of d.fonctions){let t=t=>p.elements[`${e.id}.${t}`].value;r[e.id]={modele:t(`modele`),acces:t(`acces`),signesParDemande:Number(t(`signesParDemande`)),demandesParHeure:Number(t(`demandesParHeure`)),signesParMois:Number(t(`signesParMois`))},typeof f[e.id].maniere==`string`&&(r[e.id].maniere=t(`maniere`))}m.className=`bo-ia-message`,m.textContent=`Enregistrement…`;try{let n=await t(`/api/admin/ia`,{method:`PUT`,credentials:`same-origin`,headers:{"content-type":`application/json`},body:JSON.stringify(r)});if(!n.ok){let e=await n.json().catch(()=>({}));m.className=`bo-ia-message bo-erreur`,m.textContent=e.error||`Enregistrement refusé.`;return}await x(e,{fetcher:t,mois:d.mois});let i=e.querySelector(`.bo-ia-message`);i.className=`bo-ia-message bo-ok`,i.textContent=`Réglages enregistrés. Ils s’appliquent à la prochaine demande.`}catch{m.className=`bo-ia-message bo-erreur`,m.textContent=`Le serveur ne répond pas.`}});let S=e.querySelector(`.bo-gf-form`);if(S){let n=S.querySelector(`.bo-gf-message`);S.querySelectorAll(`[data-gf-defaut]`).forEach(e=>e.addEventListener(`click`,()=>{S.elements[`gf.${e.dataset.gfDefaut}`].value=e.dataset.valeur,n.className=`bo-gf-message bo-ia-message`,n.textContent=`Valeur par défaut remise : enregistrez pour l’appliquer.`})),S.addEventListener(`submit`,async r=>{r.preventDefault();let i={};for(let e of d.gardeFous.definitions)i[e.id]=Number(S.elements[`gf.${e.id}`].value);n.className=`bo-gf-message bo-ia-message`,n.textContent=`Enregistrement…`;try{let r=await t(`/api/admin/ia`,{method:`PUT`,credentials:`same-origin`,headers:{"content-type":`application/json`},body:JSON.stringify({gardeFous:i})});if(!r.ok){let e=await r.json().catch(()=>({}));n.className=`bo-gf-message bo-ia-message bo-erreur`,n.textContent=e.error||`Enregistrement refusé.`;return}await x(e,{fetcher:t,mois:d.mois});let a=e.querySelector(`.bo-gf-message`);a.className=`bo-gf-message bo-ia-message bo-ok`,a.textContent=`Garde-fous enregistrés. Ils s’appliquent à la prochaine demande.`}catch{n.className=`bo-gf-message bo-ia-message bo-erreur`,n.textContent=`Le serveur ne répond pas.`}})}let C=p.elements[`margo.maniere`];if(C){let e=p.querySelector(`[data-maniere-compteur]`),t=()=>e.textContent=n(C.value.length);C.addEventListener(`input`,t),p.querySelector(`[data-maniere-defaut]`).addEventListener(`click`,()=>{C.value=d.defauts.margo.maniere,t(),m.className=`bo-ia-message`,m.textContent=`Texte par défaut remis : enregistrez les réglages pour l’appliquer.`})}e.querySelector(`select[name="mois"]`).addEventListener(`change`,n=>x(e,{fetcher:t,mois:n.target.value}))}export{x as mountAdminIa};