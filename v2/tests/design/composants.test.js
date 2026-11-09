// T4 : les composants de présentation, rendus sans navigateur (React côté
// serveur, chargé par Vite pour le JSX et les feuilles de style), en
// français, en anglais et en pseudo-langue.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { creerTraducteur, CATALOGUES, LANGUE_SOURCE, cles } from '../../i18n/index.js'

const V2 = new URL('../..', import.meta.url).pathname
let vite, design
before(async () => {
  vite = await createServer({
    root: V2,
    configFile: false,
    logLevel: 'error',
    server: { middlewareMode: true },
    appType: 'custom',
  })
  design = await vite.ssrLoadModule(`${V2}design/index.js`)
})
after(() => vite?.close())

const LANGUES = ['fr', 'en', 'pseudo']
/** Rendu dans le cadre de design (fournisseur Mantine), comme dans l'application. */
const rendre = (el) => renderToStaticMarkup(h(design.CadreDesign, null, el))
const echapper = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

test('chaque message de chaque langue se formate (pseudo-langue comprise)', () => {
  const exemple = {
    id: 'essai',
    n: 2,
    etat: 'connecte',
    code: 'test',
    auteur: 'Carla',
    avant: 'loin',
    apres: 'à l’écart',
    titre: 'La gare',
    role: 'correcteur',
    nom: 'Carla',
    courriel: 'carla@exemple.fr',
    date: '9 nov. 2026',
  }
  for (const l of LANGUES) {
    const t = creerTraducteur(l)
    for (const cle of cles(CATALOGUES[LANGUE_SOURCE])) assert.ok(t(cle, exemple).length > 0, `${l}:${cle}`)
  }
})

test('la pseudo-langue allonge d’au moins 30 % et encadre chaque texte', () => {
  const fr = creerTraducteur('fr')
  const ps = creerTraducteur('pseudo')
  for (const cle of cles(CATALOGUES[LANGUE_SOURCE]).filter((c) => !c.includes('participants') && !c.includes('etat'))) {
    const valeurs = {
      id: 'x',
      code: 'y',
      n: 2,
      auteur: 'A',
      avant: 'b',
      apres: 'c',
      titre: 'T',
      role: 'r',
      nom: 'N',
      courriel: 'c@d.fr',
      date: 'D',
    }
    const p = ps(cle, valeurs)
    assert.match(p, /^⟦[\s\S]*⟧$/, cle)
    assert.ok(p.length >= fr(cle, valeurs).length * 1.3, cle)
  }
})

test('page d’édition : tous ses textes s’affichent, dans chaque langue, avec les bons rôles', () => {
  for (const l of LANGUES) {
    const t = creerTraducteur(l)
    const textes = {
      titre: t('document.titre', { id: 'essai' }),
      etat: t('document.etat', { etat: 'connecte' }),
      participants: t('document.participants', { n: 2 }),
    }
    const html = rendre(h(design.PageEdition, { ...textes, editeur: h('div', { id: 'editeur' }) }))
    for (const [nom, texte] of Object.entries(textes)) assert.ok(html.includes(echapper(texte)), `${l} : ${nom}`)
    assert.match(html, /<main[ >]/, 'le contenu principal garde son repère')
    assert.doesNotMatch(html, /role="document"/)
    assert.match(html, /role="status"/)
    assert.match(html, /id="editeur"/, 'l’éditeur reçu en emplacement est rendu')
  }
})

test('écran de connexion : champ étiqueté, bouton, textes de chaque langue', () => {
  for (const l of LANGUES) {
    const t = creerTraducteur(l)
    const html = rendre(
      h(design.EcranConnexion, {
        titre: t('connexion.dev.titre'),
        explication: t('connexion.dev.explication'),
        libelleNom: t('connexion.dev.nom'),
        libelleBouton: t('connexion.dev.bouton'),
        surEntrer: () => {},
      }),
    )
    for (const cle of ['connexion.dev.titre', 'connexion.dev.explication', 'connexion.dev.nom', 'connexion.dev.bouton'])
      assert.ok(html.includes(echapper(t(cle))), `${l} : ${cle}`)
    const pour = /<label[^>]*for="([^"]+)"/.exec(html)?.[1]
    assert.ok(pour, 'une étiquette désigne un champ')
    assert.match(
      html,
      new RegExp(`<input[^>]*id="${pour}"[^>]*name="nom"|<input[^>]*name="nom"[^>]*id="${pour}"`),
      'le champ « nom » a son étiquette',
    )
    assert.match(html, /<button[^>]*type="submit"/)
  }
})

test('un texte piégé s’affiche comme du texte, jamais comme du code', () => {
  const html = rendre(
    h(design.PageEdition, { titre: '<script>alert(1)</script>', etat: '<b>x</b>', participants: '&', editeur: null }),
  )
  assert.doesNotMatch(html, /<script>|<b>/)
  assert.doesNotMatch(html, /Lecture seule/, 'pas de mention sans texte')
  const avec = rendre(h(design.PageEdition, { titre: 'x', mention: 'Lecture seule', editeur: null }))
  assert.match(avec, />Lecture seule</)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
})

test('couleur d’auteur : stable, prise dans la palette de Mantine, ni grise ni noire', () => {
  for (const id of ['alice', 'bruno', 'dev-xyz', '', '👩🏽\u200D💻']) {
    const c = design.couleurAuteur(id)
    assert.equal(c, design.couleurAuteur(id))
    assert.match(c, /^var\(--mantine-color-[a-z]+-filled\)$/)
    assert.doesNotMatch(c, /-(gray|dark)-/)
  }
})

test('la marque (picto décoratif et nom) en haut de page et sur l’écran de connexion', () => {
  const page = rendre(h(design.PageEdition, { nomApplication: 'amend.ink', titre: 'x', editeur: null }))
  assert.match(page, /<header[\s\S]*class="amend-picto" aria-hidden="true"><svg[\s\S]*amend\.ink[\s\S]*<h1/)
  const connexion = rendre(
    h(design.EcranConnexion, { nomApplication: 'amend.ink', titre: 'Connexion', surEntrer: () => {} }),
  )
  assert.match(connexion, /<h1[^>]*><span class="amend-picto" aria-hidden="true"><svg[\s\S]*amend\.ink<\/h1>/)
  assert.match(connexion, /<h2[^>]*>Connexion<\/h2>/, 'le titre de l’écran passe au niveau 2 sous la marque')
  const sans = rendre(h(design.PageEdition, { titre: 'x', editeur: null }))
  assert.doesNotMatch(sans, /amend-picto/, 'sans nom, pas de marque')
})

test('l’icône de l’onglet reprend le dessin de référence, qui ne contient que du dessin', async () => {
  const { readFile } = await import('node:fs/promises')
  const lire = (f) => readFile(`${V2}design/picto/${f}`, 'utf8')
  const reference = await lire('amend-ink.svg')
  assert.equal((await lire('favicon.svg')).replace('#2f9e44', 'currentColor'), reference)
  // Le picto est injecté tel quel dans la page (Picto.jsx) : ni script, ni
  // attribut d'événement, ni contenu étranger, ni lien.
  assert.doesNotMatch(reference, /<script|<foreignObject|\son\w+=|href=|<style/i)
  // apple-touch-icon.png (binaire, rendu par Chromium) n'est pas contrôlé ici.
})

// Étape 6b : la coquille des formats M et L (docs/v2-formats-M-L.md).
const rien = () => {}
// Les textes de l'interface n'entrent au catalogue qu'avec l'application qui
// s'en sert (lot « Application » de l'étape 6b) : ici, en clair.
const INTERFACE = {
  voletGauche: 'Plan et documents',
  voletDroit: 'Modifications et Margo (IA)',
  autresActions: 'Autres actions',
  compte: 'Mon compte',
  presence: 'Personnes sur ce document',
  terminer: 'Terminer',
  plan: 'Plan',
  documents: 'Documents',
  planVide: 'Ce document n’a pas encore de titre.',
  relecture: 'Relecture',
  modifications: 'Modifications',
  margo: 'Margo (IA)',
  margoBientot: 'Margo arrive bientôt ici.',
  horsLigne: 'Hors ligne : vos modifications sont gardées et partiront au retour de la connexion.',
  largeurVolet: 'Largeur du volet',
  copierLien: 'Copier le lien',
  fermer: 'Fermer',
  valider: 'Valider',
  annuler: 'Annuler',
}
const I = (cle) => INTERFACE[cle.slice('interface.'.length)]
function coquilleDocument(t, { droite = true } = {}) {
  return h(
    design.Coquille,
    {
      connexion: 'connecte',
      gaucheOuvert: true,
      droiteOuvert: droite,
      libelleRedimension: I('interface.largeurVolet'),
      alerte: h(design.AlerteHorsLigne, { texte: I('interface.horsLigne') }),
      bandeau: h(design.Bandeau, {
        voletGauche: { libelle: I('interface.voletGauche'), ouvert: true, surClic: rien },
        titre: 'La gare',
        mention: t('document.modeSuggestion'),
        terminer: { libelle: I('interface.terminer'), surClic: rien },
        presence: { libelle: I('interface.presence'), personnes: [{ cle: 'c', nom: 'Claire Martin' }] },
        partager: { libelle: t('document.partager'), surClic: rien },
        actions: {
          libelle: I('interface.autresActions'),
          elements: [{ cle: 'lien', libelle: I('interface.copierLien'), picto: 'lien', surClic: rien }],
        },
        compte: { libelle: I('interface.compte'), nom: 'Sylvain', courriel: 's@exemple.fr', actions: [] },
        voletDroit: { libelle: I('interface.voletDroit'), nombre: 3, ouvert: droite, surClic: rien },
      }),
      voletGauche: h(design.VoletPlanDocuments, {
        marque: { nom: 'amend.ink', href: '#' },
        onglets: { plan: I('interface.plan'), documents: I('interface.documents') },
        plan: [
          { cle: 'a', niveau: 2, libelle: '1. La fin de l’étalement', actif: true },
          { cle: 'b', niveau: 3, libelle: 'La chronotopie' },
        ],
        surTitre: rien,
        videPlan: I('interface.planVide'),
        documents: [{ cle: 'd', nom: 'Réparons la ville', href: '#/d', actif: true }],
      }),
      voletDroit: h(design.VoletRelecture, {
        titre: I('interface.relecture'),
        onglets: { modifications: I('interface.modifications'), margo: I('interface.margo') },
        modifications: h('div', { id: 'suggestions' }),
        margo: h(design.TexteDeVolet, { texte: I('interface.margoBientot') }),
      }),
    },
    h(design.ColonneTexte, null, h('div', { id: 'editeur' })),
  )
}

test('coquille d’un document : bandeau, volets, alerte et texte, dans chaque langue', () => {
  for (const l of LANGUES) {
    const t = creerTraducteur(l)
    const html = rendre(coquilleDocument(t))
    for (const cle of ['document.partager']) assert.ok(html.includes(echapper(t(cle))), `${l} : ${cle}`)
    for (const cle of [
      'interface.voletGauche',
      'interface.terminer',
      'interface.autresActions',
      'interface.compte',
      'interface.voletDroit',
      'interface.plan',
      'interface.documents',
      'interface.relecture',
      'interface.modifications',
      'interface.margo',
      'interface.horsLigne',
    ])
      assert.ok(html.includes(echapper(I(cle))), `${l} : ${cle}`)
    assert.match(html, /<header[\s\S]*<h1[^>]*>La gare<\/h1>/, 'le titre du document est dans le bandeau')
    assert.match(html, /<nav[\s\S]*amend-picto/, 'le volet gauche porte la marque')
    assert.match(html, /<aside/, 'volet droit')
    assert.match(html, /<main[\s\S]*id="editeur"/, 'le texte est dans le contenu principal')
    assert.match(html, /data-niveau="3"/, 'le niveau du titre passe au design')
    assert.match(html, /role="status"/, 'l’alerte hors ligne est annoncée')
    assert.match(html, />3</, 'le nombre de suggestions sur le bouton du volet droit')
    assert.ok(html.includes(echapper(t('document.modeSuggestion'))), `${l} : mention du mode`)
    assert.match(html, /data-connexion="connecte"/, 'l’état de la connexion, en attribut')
  }
})

test('coquille de la liste : sans volet droit ; navigation et nouveau document', () => {
  const t = creerTraducteur('fr')
  const html = rendre(
    h(
      design.Coquille,
      {
        gaucheOuvert: true,
        libelleRedimension: I('interface.largeurVolet'),
        bandeau: h(design.Bandeau, {
          voletGauche: { libelle: I('interface.voletGauche'), ouvert: true, surClic: rien },
          titre: t('documents.mesDocuments'),
          compte: { libelle: I('interface.compte'), nom: 'Sylvain', actions: [] },
        }),
        voletGauche: h(design.NavigationListe, {
          marque: { nom: 'amend.ink', href: '#' },
          nouveau: { libelle: t('documents.nouveau'), surClic: rien },
          entrees: [
            { cle: 'moi', libelle: t('documents.mesDocuments'), picto: 'moi', href: '#', actif: true },
            { cle: 'p', libelle: t('documents.partagesAvecMoi'), picto: 'partages', href: '#/partages' },
          ],
        }),
      },
      h(design.ListeDocuments, { colonnes: [], lignes: [], vide: t('documents.vide') }),
    ),
  )
  assert.doesNotMatch(html, /<aside/)
  for (const cle of ['documents.nouveau', 'documents.partagesAvecMoi', 'documents.vide'])
    assert.ok(html.includes(echapper(t(cle))), cle)
  assert.doesNotMatch(html, /mantine-SegmentedControl/, 'sans onglets dans la page : ils sont dans le volet')
})

test('coquille : un texte piégé reste du texte ; un picto inconnu ne casse rien', () => {
  const html = rendre(
    h(design.Bandeau, {
      voletGauche: { libelle: '<b>x</b>', surClic: rien },
      titre: '<script>alert(1)</script>',
      actions: { libelle: 'a', elements: [{ cle: 'x', libelle: 'y', picto: 'inconnu', surClic: rien }] },
    }),
  )
  assert.doesNotMatch(html, /<script>|<b>/)
  assert.ok(I('interface.fermer'))
})
