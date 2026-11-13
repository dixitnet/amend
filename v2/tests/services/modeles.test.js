// T3 : les modèles de mise en page des équipes sur le serveur (étape 7,
// ADR 0011), contre PostgreSQL : création et réglage par le gestionnaire,
// écarts contrôlés par le domaine, modèle retenu d'un document, suppression,
// sortie de l'équipe.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { preparerServices, POSTGRES } from '../../exploitation/dev/pile.mjs'
import { creerServeur } from '../../application/serveur/index.js'
import { ouvrirComptes } from '../../adaptateurs/postgres/comptes.js'
import { ouvrirCommentaires } from '../../adaptateurs/postgres/index.js'
import { creerCourrier } from '../../adaptateurs/courrier/index.js'

let comptes, commentaires, serveur, base
const courrier = creerCourrier({ expediteur: 'amend.ink <x@y.fr>' })
const effaces = []
const ADRESSE = 'https://essai.amend.ink'

before(async () => {
  preparerServices()
  comptes = await ouvrirComptes(POSTGRES)
  commentaires = await ouvrirCommentaires(POSTGRES)
  serveur = creerServeur(
    {
      secret: 's'.repeat(32),
      jetonInterne: 'j',
      collaboration: 'ws://x',
      statique: '/x',
      dev: true,
      adresse: ADRESSE,
      administrateurs: ADMIN,
    },
    { comptes, commentaires, courrier, collaboration: { supprimerDocument: async (id) => effaces.push(id) } },
  )
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${serveur.address().port}`
})
after(async () => {
  serveur?.close()
  await comptes?.fermer()
  await commentaires?.fermer()
})

const adresse = (n) => `${n}-${randomUUID().slice(0, 8)}@exemple.fr`
const ADMIN = adresse('admin')
async function appel(methode, chemin, { cookie, corps, entetes = {} } = {}) {
  const r = await fetch(`${base}${chemin}`, {
    method: methode,
    redirect: 'manual',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...entetes },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  const texte = await r.text()
  let json = null
  try {
    if (texte) json = JSON.parse(texte)
  } catch {
    // une réponse qui n'est pas du JSON (redirection) : json reste null
  }
  return { statut: r.status, json, entetes: r.headers }
}
/** Le dernier lien de connexion envoyé à une adresse, réduit à son chemin. */
const dernierLien = (a) => {
  const m = [...courrier.envoyes].reverse().find((x) => x.a === a)
  return m ? new URL(m.texte.match(/https:\/\/\S+/)[0]).pathname : null
}
/** Suit un lien de connexion, comme la page (POST) : rend le cookie de session et le document visé. */
async function suivre(chemin) {
  const r = await appel('POST', chemin)
  return {
    statut: r.statut,
    cookie: r.entetes.get('set-cookie')?.split(';')[0] ?? null,
    document: r.json?.document ?? null,
    code: r.json?.code ?? null,
  }
}
/** Une personne connectée par la route de développement. */
async function personne(nom) {
  const r = await appel('POST', '/api/dev/session', { corps: { nom } })
  return { id: r.json.id, cookie: r.entetes.get('set-cookie').split(';')[0] }
}

/** Une personne avec une vraie adresse (pour être ajoutée par courriel). */
async function personneAvecAdresse(n, a = adresse('membre')) {
  await comptes.personneOuNouvelle(a)
  await appel('POST', '/api/connexion', { corps: { courriel: a } })
  const s = await suivre(dernierLien(a))
  await appel('PUT', '/api/moi', { cookie: s.cookie, corps: { nom: n } })
  const moi = await appel('GET', '/api/moi', { cookie: s.cookie })
  return { id: moi.json.id, courriel: a, cookie: s.cookie }
}

/** Une équipe de Gaëlle (gestionnaire) avec Marc (éditeur) et Lou (correcteur), et un document. */
async function equipeEtDocument() {
  const gaelle = await personne('Gaëlle')
  const marc = await personneAvecAdresse('Marc')
  const lou = await personneAvecAdresse('Lou')
  const g = { cookie: gaelle.cookie }
  const { json: eq } = await appel('POST', '/api/equipes', { ...g, corps: { nom: 'Éditions' } })
  await appel('POST', `/api/equipes/${eq.id}/membres`, { ...g, corps: { courriel: marc.courriel, role: 'editeur' } })
  await appel('POST', `/api/equipes/${eq.id}/membres`, { ...g, corps: { courriel: lou.courriel, role: 'correcteur' } })
  const { json: doc } = await appel('POST', '/api/documents', { ...g, corps: { titre: 'Manuscrit', equipe: eq.id } })
  return { gaelle, marc, lou, eq, doc }
}
/** Le défaut de l'instance (la base de développement est partagée : un
 * modèle de l'instance peut y être le défaut). */
const defautInstance = async () => {
  const d = await comptes.reglage('modeles.defaut')
  return d && (await comptes.modele(d))?.equipe === null ? d : 'a4'
}
/** Les modèles d'un document, sans ceux de l'instance (base partagée). */
const horsInstance = (v) => v.modeles.filter((x) => !x.instance)
const modelesDu = async (qui, doc) => (await appel('GET', `/api/documents/${doc}/modeles`, { cookie: qui.cookie })).json

test('modèles d’équipe : le gestionnaire crée et règle ; les écarts sont contrôlés et réduits à ce qui change', async () => {
  const { gaelle, marc, eq } = await equipeEtDocument()
  const base = `/api/equipes/${eq.id}/modeles`
  assert.equal(
    (await appel('POST', base, { cookie: marc.cookie, corps: { nom: 'Essais', base: 'a4' } })).statut,
    403,
    'un éditeur de l’équipe ne crée pas de modèle',
  )
  assert.equal(
    (await appel('POST', base, { cookie: gaelle.cookie, corps: { nom: 'Essais', base: 'inconnu' } })).json.code,
    'modele-introuvable',
  )
  const { statut, json: m } = await appel('POST', base, {
    cookie: gaelle.cookie,
    corps: { nom: ' Essais ', base: 'a4' },
  })
  assert.equal(statut, 201)
  const refus = await appel('PUT', `${base}/${m.id}`, {
    cookie: gaelle.cookie,
    corps: { ecarts: { 'grille.lignes': 80 } },
  })
  assert.equal(refus.statut, 400)
  assert.deepEqual(refus.json, { code: 'modele-impossible', reglage: null, raison: 'lignes' })
  const hors = await appel('PUT', `${base}/${m.id}`, { cookie: gaelle.cookie, corps: { ecarts: { 'folio.bas': 3 } } })
  assert.deepEqual(hors.json, { code: 'reglage-inconnu', reglage: 'folio.bas', raison: null })
  const bon = await appel('PUT', `${base}/${m.id}`, {
    cookie: gaelle.cookie,
    corps: { nom: 'Essais 2027', ecarts: { 'page.largeur': 135, 'page.hauteur': 297, 'chapitre.debut': 'continuer' } },
  })
  assert.deepEqual(bon.json, { ecarts: { 'page.largeur': 135, 'chapitre.debut': 'continuer' } })
  const vue = (await appel('GET', `/api/equipes/${eq.id}`, { cookie: marc.cookie })).json
  assert.deepEqual(
    vue.modeles.map((x) => [x.nom, x.base, x.ecarts, x.documents]),
    [['Essais 2027', 'a4', { 'page.largeur': 135, 'chapitre.debut': 'continuer' }, 0]],
  )
  assert.equal(vue.modeleDefaut, null)
})

test('modèle d’un document : défaut de l’équipe, choix par qui écrit, ce que voit un correcteur extérieur', async () => {
  const { gaelle, marc, lou, eq, doc } = await equipeEtDocument()
  const g = { cookie: gaelle.cookie }
  const { json: m } = await appel('POST', `/api/equipes/${eq.id}/modeles`, {
    ...g,
    corps: { nom: 'Collection', base: 'a4' },
  })
  const { json: m2 } = await appel('POST', `/api/equipes/${eq.id}/modeles`, {
    ...g,
    corps: { nom: 'Brouillon', base: 'a4' },
  })
  let v = await modelesDu(marc, doc.id)
  assert.equal(v.retenu, await defautInstance(), 'sans choix, le défaut de l’instance')
  assert.equal(v.equipe, 'Éditions')
  assert.equal(v.peutChoisir, true)
  assert.deepEqual(
    horsInstance(v).map((x) => x.id),
    ['a4', m2.id, m.id],
  )
  assert.equal(
    (await appel('PUT', `/api/equipes/${eq.id}/modele-defaut`, { cookie: marc.cookie, corps: { modele: m.id } }))
      .statut,
    403,
  )
  assert.equal(
    (await appel('PUT', `/api/equipes/${eq.id}/modele-defaut`, { ...g, corps: { modele: 'inconnu' } })).statut,
    404,
  )
  await appel('PUT', `/api/equipes/${eq.id}/modele-defaut`, { ...g, corps: { modele: m.id } })
  assert.equal((await modelesDu(marc, doc.id)).retenu, m.id, 'le défaut de l’équipe')
  // Lou, correcteur, ne choisit pas ; Marc, éditeur, choisit.
  assert.equal(
    (await appel('PUT', `/api/documents/${doc.id}/modele`, { cookie: lou.cookie, corps: { modele: m2.id } })).statut,
    403,
  )
  assert.equal((await modelesDu(lou, doc.id)).peutChoisir, false)
  await appel('PUT', `/api/documents/${doc.id}/modele`, { cookie: marc.cookie, corps: { modele: m2.id } })
  v = await modelesDu(marc, doc.id)
  assert.equal(v.retenu, m2.id)
  assert.equal(v.choisi, m2.id)
  // Un modèle d'une autre équipe n'est pas permis.
  const { json: autre } = await appel('POST', '/api/equipes', { ...g, corps: { nom: 'Autre' } })
  const { json: ailleurs } = await appel('POST', `/api/equipes/${autre.id}/modeles`, {
    ...g,
    corps: { nom: 'Ailleurs', base: 'a4' },
  })
  assert.equal(
    (await appel('PUT', `/api/documents/${doc.id}/modele`, { cookie: marc.cookie, corps: { modele: ailleurs.id } }))
      .statut,
    404,
  )
  // Une personne hors de l'équipe, à qui le document est partagé : le modèle
  // retenu, sans les autres modèles de l'équipe.
  const zoe = await personneAvecAdresse('Zoé')
  await appel('POST', `/api/documents/${doc.id}/acces`, { ...g, corps: { courriel: zoe.courriel, role: 'correcteur' } })
  v = await modelesDu(zoe, doc.id)
  assert.equal(v.retenu, m2.id)
  assert.deepEqual(
    horsInstance(v).map((x) => x.id),
    ['a4', m2.id],
  )
  const [, vu] = horsInstance(v)
  assert.deepEqual([vu.id, vu.nom, vu.base, vu.ecarts, vu.complet.page.largeur], [m2.id, 'Brouillon', 'a4', {}, 210])
  // Personne d'autre ne voit les modèles du document.
  const inconnu = await personne('Inconnu')
  assert.equal((await appel('GET', `/api/documents/${doc.id}/modeles`, { cookie: inconnu.cookie })).statut, 404)
})

test('supprimer un modèle : les documents qui l’avaient retombent sur le défaut, et le nombre est rendu', async () => {
  const { gaelle, marc, eq, doc } = await equipeEtDocument()
  const g = { cookie: gaelle.cookie }
  const { json: m } = await appel('POST', `/api/equipes/${eq.id}/modeles`, {
    ...g,
    corps: { nom: 'Collection', base: 'a4' },
  })
  await appel('PUT', `/api/equipes/${eq.id}/modele-defaut`, { ...g, corps: { modele: m.id } })
  await appel('PUT', `/api/documents/${doc.id}/modele`, { ...g, corps: { modele: m.id } })
  assert.equal((await appel('GET', `/api/equipes/${eq.id}`, g)).json.modeles[0].documents, 1)
  assert.equal((await appel('DELETE', `/api/equipes/${eq.id}/modeles/${m.id}`, { cookie: marc.cookie })).statut, 403)
  const r = await appel('DELETE', `/api/equipes/${eq.id}/modeles/${m.id}`, g)
  assert.deepEqual(r.json, { documents: 1 })
  const v = await modelesDu(marc, doc.id)
  assert.equal(v.retenu, await defautInstance())
  assert.equal(v.choisi, null)
  assert.equal((await appel('GET', `/api/equipes/${eq.id}`, g)).json.modeleDefaut, null)
})

test('un document qui sort de l’équipe perd son modèle d’équipe, garde un modèle d’amend.ink', async () => {
  const { gaelle, eq, doc } = await equipeEtDocument()
  const g = { cookie: gaelle.cookie }
  const { json: m } = await appel('POST', `/api/equipes/${eq.id}/modeles`, {
    ...g,
    corps: { nom: 'Collection', base: 'a4' },
  })
  await appel('PUT', `/api/documents/${doc.id}/modele`, { ...g, corps: { modele: m.id } })
  await appel('PUT', `/api/documents/${doc.id}/dossier`, { ...g, corps: { equipe: null, dossier: null } })
  let v = await modelesDu(gaelle, doc.id)
  assert.equal(v.equipe, null)
  assert.equal(v.choisi, null)
  assert.deepEqual(
    horsInstance(v).map((x) => x.id),
    ['a4'],
  )
  await appel('PUT', `/api/documents/${doc.id}/modele`, { ...g, corps: { modele: 'a4' } })
  v = await modelesDu(gaelle, doc.id)
  assert.equal(v.choisi, 'a4')
})

test('modèles de l’instance : l’administrateur les crée et règle tout ; une équipe en dérive et suit ses corrections', async () => {
  const admin = await personneAvecAdresse('Ada', ADMIN)
  const a = { cookie: admin.cookie }
  const { gaelle, marc, eq, doc } = await equipeEtDocument()
  const g = { cookie: gaelle.cookie }
  assert.equal((await appel('GET', '/api/admin/modeles', g)).statut, 403, 'réservé aux administrateurs')
  assert.equal((await appel('POST', '/api/admin/modeles', { ...g, corps: { nom: 'X' } })).statut, 403)
  assert.equal((await appel('PUT', '/api/admin/modele-defaut', { ...g, corps: { modele: null } })).statut, 403)
  const { statut, json: i } = await appel('POST', '/api/admin/modeles', { ...a, corps: { nom: 'Collection maison' } })
  assert.equal(statut, 201)
  // L'administrateur règle ce qu'une équipe ne règle pas.
  const r = await appel('PUT', `/api/admin/modeles/${i.id}`, {
    ...a,
    corps: { ecarts: { 'folio.bas': 20, 'chapitre.ligneTitre': 4, separateur: 'trait' } },
  })
  assert.deepEqual(r.json, { ecarts: { 'folio.bas': 20, 'chapitre.ligneTitre': 4, separateur: 'trait' } })
  const hors = await appel('PUT', `/api/admin/modeles/${i.id}`, { ...a, corps: { ecarts: { separateur: 'licorne' } } })
  assert.equal(hors.json.code, 'reglage-hors-bornes')
  let liste = (await appel('GET', '/api/admin/modeles', a)).json
  assert.equal(liste.modeleCode.id, 'a4')
  assert.equal(liste.modeles.find((m) => m.id === i.id).complet.folio.bas, 20)
  // Une équipe part du modèle de l'instance et règle sa largeur.
  const { json: m } = await appel('POST', `/api/equipes/${eq.id}/modeles`, {
    ...g,
    corps: { nom: 'Poche', base: i.id },
  })
  await appel('PUT', `/api/equipes/${eq.id}/modeles/${m.id}`, { ...g, corps: { ecarts: { 'page.largeur': 150 } } })
  const interdit = await appel('PUT', `/api/equipes/${eq.id}/modeles/${m.id}`, {
    ...g,
    corps: { ecarts: { 'folio.bas': 30 } },
  })
  assert.equal(interdit.json.code, 'reglage-inconnu', 'l’équipe garde sa liste fermée')
  const vueEquipe = (await appel('GET', `/api/equipes/${eq.id}`, g)).json
  assert.ok(
    vueEquipe.modelesInstance.some((x) => x.id === i.id),
    'les modèles de l’instance, bases possibles',
  )
  const complet = () => modelesDu(marc, doc.id).then((v) => v.modeles.find((x) => x.id === m.id).complet)
  assert.deepEqual(await complet().then((c) => [c.page.largeur, c.folio.bas, c.separateur]), [150, 20, 'trait'])
  // Une correction du modèle de l'instance atteint le modèle de l'équipe.
  await appel('PUT', `/api/admin/modeles/${i.id}`, {
    ...a,
    corps: { ecarts: { 'folio.bas': 25, separateur: 'trait' } },
  })
  assert.equal((await complet()).folio.bas, 25)
  // Le défaut de l'instance, puis sa suppression.
  const avant = await comptes.reglage('modeles.defaut')
  try {
    await appel('PUT', '/api/admin/modele-defaut', { ...a, corps: { modele: i.id } })
    assert.equal((await modelesDu(marc, doc.id)).retenu, i.id, 'le défaut de l’instance')
    liste = (await appel('GET', '/api/admin/modeles', a)).json
    assert.equal(liste.defaut, i.id)
    assert.equal(liste.modeles.find((x) => x.id === i.id).derives, 1)
    assert.equal((await appel('PUT', `/api/admin/modeles/${i.id}`, { ...g, corps: { nom: 'Y' } })).statut, 403)
    assert.equal((await appel('DELETE', `/api/admin/modeles/${i.id}`, g)).statut, 403)
    const sup = await appel('DELETE', `/api/admin/modeles/${i.id}`, a)
    assert.equal(sup.statut, 200)
    assert.equal(await comptes.reglage('modeles.defaut'), null, 'le défaut retombe sur l’A4')
    assert.equal((await comptes.modele(m.id)).base, 'a4', 'le modèle d’équipe repart de l’A4')
  } finally {
    await comptes.definirReglage('modeles.defaut', avant, null)
  }
})

test('reprise de « TàT - Poche » : un modèle de l’instance, une seule fois, et ce qui le citait le suit', async () => {
  const { gaelle, eq, doc } = await equipeEtDocument()
  const g = { cookie: gaelle.cookie }
  const { json: m } = await appel('POST', `/api/equipes/${eq.id}/modeles`, {
    ...g,
    corps: { nom: 'Vieux', base: 'a4' },
  })
  // Comme avant la reprise : le document et l'équipe citent « tat-poche », le
  // modèle d'équipe porte l'ancien réglage « belle page ».
  await comptes.definirModeleDocument(doc.id, 'tat-poche')
  await comptes.definirModeleDefaut(eq.id, 'tat-poche')
  await comptes.modifierModele(m.id, { ecarts: { 'chapitre.bellePage': false } })
  const avant = { reprise: await comptes.reglage('modeles.reprise'), defaut: await comptes.reglage('modeles.defaut') }
  // Les modèles de l'instance déjà là (base de développement partagée) ne
  // sont pas effacés par le ménage du test.
  const deja = new Set((await comptes.modelesInstance()).map((x) => x.id))
  await comptes.definirReglage('modeles.reprise', {}, null)
  let cree = null
  try {
    await serveur.reprendreModeles()
    cree = (await comptes.reglage('modeles.reprise'))['tat-poche']
    assert.ok(cree, 'le modèle repris est noté')
    const repris = await comptes.modele(cree)
    assert.equal(repris.equipe, null)
    assert.equal(repris.nom, 'TàT - Poche')
    assert.equal(repris.base, 'a4')
    assert.equal(repris.ecarts['page.largeur'], 120)
    assert.equal((await comptes.document(doc.id)).modele, cree)
    assert.equal((await comptes.equipe(eq.id)).modeleDefaut, cree)
    assert.deepEqual((await comptes.modele(m.id)).ecarts, { 'chapitre.debut': 'page' }, 'l’ancienne belle page')
    // Une seconde fois : rien de plus.
    await serveur.reprendreModeles()
    assert.equal((await comptes.reglage('modeles.reprise'))['tat-poche'], cree)
  } finally {
    if (cree && !deja.has(cree)) await comptes.supprimerModeleInstance(cree, 'a4')
    await comptes.definirReglage('modeles.reprise', avant.reprise, null)
    await comptes.definirReglage('modeles.defaut', avant.defaut, null)
  }
})

// --- Les polices de l'instance (13/11/2026) ---
/** Un fichier de police d'essai : EB Garamond, renommée (même longueur de nom). */
function policeDEssai(fichier, famille) {
  assert.equal(famille.length, 'EB Garamond'.length)
  const octets = new Uint8Array(readFileSync(new URL(`../../design/polices/${fichier}`, import.meta.url)))
  const utf16 = (t) => [...t].flatMap((c) => [0, c.charCodeAt(0)])
  const [de, vers] = [utf16('EB Garamond'), utf16(famille)]
  for (let i = 0; i + de.length <= octets.length; i++) if (de.every((o, k) => octets[i + k] === o)) octets.set(vers, i)
  return octets
}
const envoyerPolice = (cookie, octets, nom) =>
  fetch(`${base}/api/admin/polices`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/octet-stream', 'x-amend-fichier': encodeURIComponent(nom) },
    body: octets,
  }).then(async (r) => ({ statut: r.status, json: await r.json() }))

test('polices de l’instance : l’administrateur envoie, la famille est lue dans le fichier, un modèle la prend, la suppression est gardée', async () => {
  const admin = await personneAvecAdresse('Ada', adresse('admin2'))
  // (La liste des administrateurs est fixée au démarrage : on réutilise ADMIN.)
  const ada = await personneAvecAdresse('Ada', ADMIN)
  const a = { cookie: ada.cookie }
  const famille = `Essai ${randomUUID().slice(0, 5)}`
  assert.equal(famille.length, 11)
  assert.equal(
    (await appel('GET', '/api/admin/polices', { cookie: admin.cookie })).statut,
    403,
    'réservé aux administrateurs',
  )
  assert.equal((await envoyerPolice(admin.cookie, new Uint8Array(20), 'x.ttf')).statut, 403)

  // Refus : pas une police ; une famille fournie avec amend.ink.
  assert.equal((await envoyerPolice(ada.cookie, new Uint8Array(64), 'x.ttf')).json.code, 'police-format')
  const reservee = await envoyerPolice(
    ada.cookie,
    new Uint8Array(readFileSync(new URL('../../design/polices/EBGaramond-Regular.ttf', import.meta.url))),
    'EBGaramond-Regular.ttf',
  )
  assert.deepEqual([reservee.statut, reservee.json.code], [409, 'police-reservee'])

  // Trop lourd : refusé par la route avant lecture (le domaine le refuse aussi).
  const lourd = await envoyerPolice(ada.cookie, new Uint8Array(10 * 1024 * 1024 + 1), 'lourd.ttf').catch((e) => e)
  assert.ok(lourd.statut === 413 || lourd instanceof Error, 'trop lourd : refusé (413 ou connexion coupée)')

  // Envoi du romain : la famille et le style viennent du fichier, pas de son nom.
  const romain = await envoyerPolice(ada.cookie, policeDEssai('EBGaramond-Regular.ttf', famille), 'n’importe quoi.ttf')
  assert.equal(romain.statut, 201)
  assert.deepEqual([romain.json.famille, romain.json.style], [famille, 'romain'])
  assert.equal(
    (await envoyerPolice(ada.cookie, policeDEssai('EBGaramond-Regular.ttf', famille), 'bis.ttf')).json.code,
    'police-en-double',
  )
  // Deux envois simultanés du même style : un seul passe.
  const gras = policeDEssai('EBGaramond-SemiBold.ttf', famille)
  const course = await Promise.all([envoyerPolice(ada.cookie, gras, 'a.ttf'), envoyerPolice(ada.cookie, gras, 'b.ttf')])
  assert.deepEqual(course.map((r) => r.statut).sort(), [201, 409], 'un seul des deux envois simultanés est gardé')
  await appel('DELETE', `/api/admin/polices/${course.find((r) => r.statut === 201).json.id}`, a)
  let liste = (await appel('GET', '/api/admin/polices', a)).json
  let f = liste.familles.find((x) => x.famille === famille)
  assert.deepEqual(f.manquants, ['italique', 'gras', 'gras-italique'], 'une famille incomplète est acceptée, et le dit')
  assert.equal(f.fichiers[0].fichier, 'n’importe quoi.ttf')
  assert.ok(liste.fournies.includes('EB Garamond'))
  const italique = await envoyerPolice(ada.cookie, policeDEssai('EBGaramond-Italic.ttf', famille), 'i.ttf')
  assert.equal(italique.json.style, 'italique')

  // Le fichier se lit, pour qui est connecté ; pas sans session.
  const lu = await fetch(`${base}/api/polices/${romain.json.id}`, { headers: { cookie: admin.cookie } })
  assert.equal(lu.status, 200)
  assert.equal((await lu.arrayBuffer()).byteLength, policeDEssai('EBGaramond-Regular.ttf', famille).length)
  assert.equal((await fetch(`${base}/api/polices/${romain.json.id}`)).status, 401)

  // La famille entre au catalogue : un modèle de l'instance la prend, et le
  // modèle complet porte les adresses de ses fichiers.
  const modeles = (await appel('GET', '/api/admin/modeles', a)).json
  assert.ok(modeles.polices.includes(famille) && modeles.polices.includes('EB Garamond'))
  const { json: m } = await appel('POST', '/api/admin/modeles', { ...a, corps: { nom: `Avec ${famille}` } })
  const regle = await appel('PUT', `/api/admin/modeles/${m.id}`, { ...a, corps: { ecarts: { police: famille } } })
  assert.deepEqual(regle.json, { ecarts: { police: famille } })
  const complet = (await appel('GET', '/api/admin/modeles', a)).json.modeles.find((x) => x.id === m.id).complet
  assert.deepEqual(
    [...complet.polices].sort(),
    [`/api/polices/${romain.json.id}`, `/api/polices/${italique.json.id}`].sort(),
  )
  assert.equal(
    (await appel('PUT', `/api/admin/modeles/${m.id}`, { ...a, corps: { ecarts: { police: 'Inconnue' } } })).json.code,
    'reglage-hors-bornes',
  )

  // Un modèle d'équipe qui dérive du modèle de l'instance hérite de la police
  // sans l'écrire dans ses écarts : il compte aussi (audit du 13/11/2026).
  const { gaelle: gestionnaire, eq: equipe } = await equipeEtDocument()
  await appel('POST', `/api/equipes/${equipe.id}/modeles`, {
    cookie: gestionnaire.cookie,
    corps: { nom: 'Dérivé', base: m.id },
  })

  // Supprimer : un fichier part ; le dernier d'une famille utilisée, non.
  assert.equal((await appel('DELETE', `/api/admin/polices/${italique.json.id}`, a)).statut, 200)
  const dernier = await appel('DELETE', `/api/admin/polices/${romain.json.id}`, a)
  assert.deepEqual(
    [dernier.statut, dernier.json.code, dernier.json.modeles],
    [409, 'police-utilisee', [`Avec ${famille}`, 'Dérivé']],
    'le modèle d’équipe qui hérite de la police compte aussi',
  )
  await appel('DELETE', `/api/admin/modeles/${m.id}`, a)
  assert.equal((await appel('DELETE', `/api/admin/polices/${romain.json.id}`, a)).statut, 200)
  liste = (await appel('GET', '/api/admin/polices', a)).json
  assert.equal(
    liste.familles.some((x) => x.famille === famille),
    false,
  )
})
