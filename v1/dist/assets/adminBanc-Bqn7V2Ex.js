import{T as e,b as t,w as n,x as r}from"./index-DV50vuG1.js";import{chargerVue as i,entete as a,esc as o}from"./adminCommun-FfoS0kpN.js";function s(e){let t=0;for(let n of String(e||``).split(/\r?\n/)){let e=n.trim().replace(/^(#{1,6}|[-*•]|\d+[.)]|>)\s+/,``).replace(/\*\*|(?<!\*)\*(?!\*)/g,``);t+=e.length}return t}function c(e){let t=e.modeles.filter(e=>e.cle).map(e=>e.id),n=[...t.includes(e.modeleMargo)?[e.modeleMargo]:[],...t.filter(t=>t!==e.modeleMargo)];return Array.from({length:e.colonnesMax},(e,t)=>t<2&&n[t]||``)}var l={aucune:`aucune`,low:`basse`,medium:`moyenne`,high:`haute`,xhigh:`très haute`,max:`maximale`},u=e=>l[e]||e;function d(e,t){let n=e.modeles.find(e=>e.id===t),r=n&&n.reflexion||{niveaux:[`aucune`],defaut:`aucune`};return r.niveaux.map(e=>`<option value="${o(e)}"${e===r.defaut?` selected`:``}>${o(u(e))}${e===r.defaut?` (production)`:``}</option>`).join(``)}function f(e,t,n){let r=t.modeles.map(e=>`<option value="${o(e.id)}"${e.id===n?` selected`:``}${e.cle?``:` disabled`}>${o(e.nom)} — ${o(e.fournisseur)}${e.cle?``:` (clé non configurée)`}</option>`).join(``);return`
    <fieldset class="bo-ia-carte bo-banc-carte" data-col="${e}">
      <legend>Colonne ${e+1}</legend>
      <label class="bo-ia-champ">
        <span>Modèle</span>
        <select name="modele${e}"><option value="">— aucune —</option>${r}</select>
      </label>
      <label class="bo-ia-champ" data-reflexion>
        <span>Réflexion</span>
        <select name="reflexion${e}">${d(t,n)}</select>
        <small>Les niveaux que ce modèle accepte. Plus haut : souvent meilleur, plus lent et plus cher.</small>
      </label>
      <details class="bo-banc-maniere">
        <summary>Manière de répondre <span class="bo-attente" data-maniere-etat hidden>modifiée</span></summary>
        <textarea name="maniere${e}" rows="10" spellcheck="true">${o(t.maniere)}</textarea>
        <p class="bo-ia-maniere-pied"><small>Préremplie avec celle de la production. La modifier ne touche qu’à cet essai.</small>
          <button type="button" class="bo-action" data-maniere-defaut="${e}">Rétablir</button></p>
      </details>
    </fieldset>`}function p(e){let t=document.createElement(`li`);t.dataset.bloc=String(e.bloc);let n=document.createElement(`span`);n.className=`bo-banc-num`,n.textContent=`[${e.bloc}]${e.ajoute?` ajout`:``}`,t.appendChild(n);let r=document.createElement(`span`);r.className=`bo-banc-texte`;for(let t of e.morceaux){let e=t.type===`ins`?document.createElement(`ins`):t.type===`del`?document.createElement(`del`):document.createElement(`span`);t.type===`ins`&&(e.className=`tracked-insertion`),t.type===`del`&&(e.className=`tracked-deletion`),e.textContent=t.t,r.appendChild(e)}return t.appendChild(r),t}function m(e){let t=document.createElement(`li`);e.bloc&&(t.dataset.bloc=String(e.bloc));let n=document.createElement(`span`);if(n.className=`bo-banc-num`,n.textContent=e.bloc?`[${e.bloc}]`:`[?]`,t.appendChild(n),e.passage){let n=document.createElement(`span`);n.className=`bo-banc-passage`,n.textContent=`«\u00a0${e.passage}\u00a0»`,t.appendChild(n)}let r=document.createElement(`div`);r.className=`bo-banc-commentaire`,r.textContent=e.texte,t.appendChild(r);for(let n of e.reponses||[]){let e=document.createElement(`div`);e.className=`bo-banc-commentaire bo-banc-reponse-fil`,e.textContent=`↳ ${n}`,t.appendChild(e)}return t}var h=e=>`${(e/1e3).toFixed(+(e<1e4)).replace(`.`,`,`)} s`;function g(t){let i=document.createElement(`section`);i.className=`bo-banc-col`,i.innerHTML=`
    <h3>${o(t.nom)} ${t.reflexion?`<span class="bo-attente">réflexion ${o(u(t.reflexion))}</span>`:``} ${t.maniereModifiee?`<span class="bo-attente">manière modifiée</span>`:``}</h3>
    <p class="bo-banc-etat bo-note" role="status">En cours…</p>
    <details class="bo-banc-etapes"><summary>Étapes (<span data-nb-etapes>0</span>)</summary><ol></ol></details>
    <div class="bo-banc-reponse"></div>
    <p class="bo-banc-erreurs bo-alerte" hidden></p>
    <div class="bo-banc-bilan" hidden>
      <h4>Modifications (<span data-nb-modifs>0</span>)</h4>
      <ol class="bo-banc-modifs"></ol>
      <h4>Commentaires (<span data-nb-commentaires>0</span>)</h4>
      <ol class="bo-banc-commentaires"></ol>
    </div>`;let a=``,s=null,c=i.querySelector(`.bo-banc-etat`),l=i.querySelector(`.bo-banc-etapes ol`),d=i.querySelector(`.bo-banc-erreurs`),f=e=>{let t=i.querySelector(`.bo-banc-bilan li[data-bloc="${e}"]`);t&&(t.scrollIntoView?.({block:`center`,behavior:`smooth`}),t.classList.add(`bo-banc-vise`),setTimeout(()=>t.classList.remove(`bo-banc-vise`),1500))};return{section:i,evenement(t){if(t.type===`texte`)a+=(a?`

`:``)+t.texte,r(i.querySelector(`.bo-banc-reponse`),a,f);else if(t.type===`outil`){let e=document.createElement(`li`);e.textContent=t.libelle,l.appendChild(e),i.querySelector(`[data-nb-etapes]`).textContent=String(l.children.length),c.textContent=`En cours : ${t.libelle}`}else if(t.type===`outil_fin`){let e=l.lastElementChild;e&&t.libelle&&(e.textContent=t.libelle),e&&!t.ok&&e.classList.add(`bo-alerte`)}else if(t.type===`erreur`)d.hidden=!1,d.textContent=(d.textContent?d.textContent+` `:``)+t.message;else if(t.type===`fin`)s=t;else if(t.type===`resultat`){let r=i.querySelector(`.bo-banc-bilan`);r.hidden=!1;let a=i.querySelector(`.bo-banc-modifs`);for(let e of t.modifications)a.appendChild(p(e));i.querySelector(`[data-nb-modifs]`).textContent=String(t.modifications.length),t.modifications.length||(a.outerHTML=`<p class="bo-note">Aucune.</p>`);let o=i.querySelector(`.bo-banc-commentaires`);for(let e of t.commentaires)o.appendChild(m(e));i.querySelector(`[data-nb-commentaires]`).textContent=String(t.commentaires.length),t.commentaires.length||(o.outerHTML=`<p class="bo-note">Aucun.</p>`);let l=[h(t.ms)];if(s){let t=s.usage&&s.usage.tours;t&&l.push(`${n(t)} appel(s) au modèle`),Number.isFinite(s.lus)&&l.push(`${e(s.lus)} lus`),s.refus&&l.push(`${n(s.refus)} écriture(s) refusée(s) par le moteur`),s.incomplet&&l.push(`demande incomplète`)}c.textContent=`Terminé — ${l.join(` · `)}.`}},interrompre(e){i.querySelector(`.bo-banc-bilan`).hidden&&(c.textContent=e)}}}async function _(r,{fetcher:o=(...e)=>fetch(...e)}={}){r.innerHTML=`<div class="home"><p>Chargement…</p></div>`;let[l,u]=await Promise.all([o(`/api/admin/banc`,{credentials:`same-origin`}).catch(()=>null),i(o)]);if(l&&l.status===403){r.innerHTML=`<div class="home"><p>Réservé aux administrateurs.</p><a href="#/">← Retour</a></div>`;return}if(!l||!l.ok){r.innerHTML=`<div class="home"><p>Le banc d’essai ne répond pas.</p><a href="#/admin/ia">← Retour à la rubrique IA</a></div>`;return}let p=await l.json(),m=c(p);r.innerHTML=`
    <div class="home backoffice bo-banc">
      ${a(`ia`,u)}
      <p class="bo-retour"><a href="#/admin/ia">← Réglages de l’IA</a></p>
      <h2>Banc d’essai de Margo</h2>
      <p class="bo-note">Collez un texte, donnez une consigne et choisissez jusqu’à ${n(p.colonnesMax)} réglages de Margo (modèle, manière de répondre). Chacun travaille <strong>sur sa propre copie du texte, en mémoire</strong>, avec le moteur et les garde-fous de la production, et propose ses modifications et ses commentaires comme dans un document. Rien n’est enregistré : ni le texte, ni les résultats.</p>
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
          ${m.map((e,t)=>f(t,p,e)).join(``)}
        </div>
        <p class="bo-note" data-estimation></p>
        <p class="bo-ia-actions">
          <button type="submit" class="btn-primary">Lancer l’essai</button>
          <button type="button" class="bo-action" data-arreter hidden>Arrêter</button>
          <span class="bo-ia-message" role="status"></span>
        </p>
      </form>
      <div class="bo-banc-resultats"></div>
    </div>`;let h=r.querySelector(`.bo-banc-form`),_=h.querySelector(`.bo-ia-message`),v=h.querySelector(`[data-estimation]`),y=h.querySelector(`[type="submit"]`),b=h.querySelector(`[data-arreter]`),x=r.querySelector(`.bo-banc-resultats`),S=()=>m.map((e,t)=>({modele:h.elements[`modele${t}`].value,reflexion:h.elements[`reflexion${t}`].value,maniere:h.elements[`maniere${t}`].value})).filter(e=>e.modele),C=()=>{let t=s(h.elements.texte.value),n=S().length,r=[`Texte : environ ${e(t)}. ${n} colonne(s) : environ ${e(t*n)} envoyés au total, plus ce que chaque modèle relit en route.`];t+h.elements.consigne.value.length>p.signesParDemande&&r.push(`En production, Margo refuserait cette demande (limite actuelle : ${e(p.signesParDemande)} par demande). Le banc la laisse passer.`),v.textContent=r.join(` `)};h.addEventListener(`input`,C),C(),h.querySelectorAll(`[data-maniere-defaut]`).forEach(e=>e.addEventListener(`click`,()=>{let t=e.dataset.maniereDefaut;h.elements[`maniere${t}`].value=p.maniere,h.elements[`maniere${t}`].dispatchEvent(new Event(`input`,{bubbles:!0}))})),h.querySelectorAll(`.bo-banc-carte`).forEach(e=>{let t=e.dataset.col,n=h.elements[`modele${t}`],r=h.elements[`reflexion${t}`],i=()=>{r.innerHTML=d(p,n.value),e.querySelector(`[data-reflexion]`).hidden=!n.value||r.options.length<2};n.addEventListener(`change`,i),i();let a=e.querySelector(`textarea`),o=e.querySelector(`[data-maniere-etat]`);a.addEventListener(`input`,()=>{o.hidden=a.value===p.maniere})});let w=null;b.addEventListener(`click`,()=>{w&&w.abort()}),h.addEventListener(`submit`,async n=>{n.preventDefault();let r=S();if(_.className=`bo-ia-message`,!h.elements.texte.value.trim())return T(`Collez un texte à faire relire.`);if(!h.elements.consigne.value.trim())return T(`Écrivez la consigne donnée à Margo.`);if(!r.length)return T(`Choisissez au moins un modèle.`);w=new AbortController,y.disabled=!0,b.hidden=!1,_.textContent=`Envoi…`,x.textContent=``;let i=[];try{let n=await o(`/api/admin/banc`,{method:`POST`,credentials:`same-origin`,headers:{"content-type":`application/json`},body:JSON.stringify({titre:h.elements.titre.value,texte:h.elements.texte.value,consigne:h.elements.consigne.value,colonnes:r}),signal:w.signal});if(!n.ok)return T((await n.json().catch(()=>({}))).error||`Le serveur a refusé l’essai (${n.status}).`);_.textContent=`Essai en cours…`,await t(n,t=>{if(t.type===`debut`){let n=document.createElement(`div`);n.className=`bo-banc-grille`,i=t.colonnes.map(e=>g(e));for(let e of i)n.appendChild(e.section);let r=document.createElement(`p`);r.className=`bo-note`,r.textContent=`Texte lu par Margo : ${e(t.signes)}, consigne : ${e(t.consigne)}.`+(t.refuseeEnProduction?` En production, cette demande serait refusée (limite : ${e(t.signesParDemande)}).`:``),x.append(r,n)}else Number.isInteger(t.col)&&i[t.col]?i[t.col].evenement(t):t.type===`erreur`&&T(t.message)}),_.classList.contains(`bo-erreur`)||(_.className=`bo-ia-message bo-ok`,_.textContent=`Essai terminé.`)}catch(e){if(e&&e.name===`AbortError`){_.textContent=`Essai arrêté.`;for(let e of i)e.interrompre(`Arrêté.`)}else{T(`Le serveur ne répond pas, ou la connexion a été coupée.`);for(let e of i)e.interrompre(`Interrompu.`)}}finally{w=null,y.disabled=!1,b.hidden=!0}});function T(e){_.className=`bo-ia-message bo-erreur`,_.textContent=e}}export{_ as mountAdminBanc};