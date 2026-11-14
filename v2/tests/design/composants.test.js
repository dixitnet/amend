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
    equipe: 'Éditions',
    numero: '2.023',
    commit: 'abc1234',
    lien: 'https://v2.amend.ink/#x',
    texte: 'Carla ajoute « loin »',
    corrections: 3,
    commentaires: 1,
    max: 4000,
    mo: 12.5,
    signes: 12345,
    mots: 2000,
    zoom: 150,
    liste: 'La gare, Le quai',
    processus: 'Serveur',
    min: '92 Mo',
    dernier: '120 Mo',
    methode: 'GET',
    chemin: '/api/documents',
    e: 1,
    d: 2,
    famille: 'Garamond',
    style: 'italique',
    styles: 'gras, gras italique',
    fichier: 'Garamond-Italic.ttf',
    raison: 'format refusé',
    modeles: 'Poche, Essai',
    taille: 1.2,
    largeur: 135,
    hauteur: 210,
    police: 'EB Garamond',
    // `code` sert aussi au nom du modèle du code (modèles de l'instance).
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
      e: 1,
      d: 3,
      famille: 'F',
      style: 's',
      styles: 'S',
      fichier: 'f',
      raison: 'r',
      modeles: 'M',
      taille: 1,
      largeur: 1,
      hauteur: 1,
      police: 'P',
      auteur: 'A',
      avant: 'b',
      apres: 'c',
      titre: 'T',
      role: 'r',
      nom: 'N',
      courriel: 'c@d.fr',
      date: 'D',
      equipe: 'E',
      numero: '2',
      commit: 'c',
      lien: 'L',
      texte: 'X',
      corrections: 2,
      commentaires: 2,
      max: 4000,
      mo: 2,
      signes: 2,
      mots: 2,
      zoom: 50,
      liste: 'L',
      processus: 'P',
      min: 'm',
      dernier: 'd',
      methode: 'M',
      chemin: 'C',
    }
    const p = ps(cle, valeurs)
    assert.match(p, /^⟦[\s\S]*⟧$/, cle)
    assert.ok(p.length >= fr(cle, valeurs).length * 1.3, cle)
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
  const voletGauche = { libelle: 'Plan', surClic: () => {} }
  const html = rendre(h(design.Bandeau, { voletGauche, titre: '<script>alert(1)</script>' }))
  assert.doesNotMatch(html, /<script>/)
  assert.doesNotMatch(html, /Lecture seule/, 'pas de mention sans texte')
  const avec = rendre(h(design.Bandeau, { voletGauche, titre: 'x', mention: 'Lecture seule' }))
  assert.match(avec, />Lecture seule</)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
})

test('bandeau : le choix du mode (Éditer, Corriger, Lire), seulement s’il est demandé, sur sa valeur', () => {
  const voletGauche = { libelle: 'Plan', surClic: () => {} }
  assert.doesNotMatch(rendre(h(design.Bandeau, { voletGauche, titre: 'x' })), /type="radio"/)
  const modes = (valeur) => ({
    libelle: 'Mode',
    valeur,
    options: [
      { valeur: 'ecrire', libelle: 'Éditer' },
      { valeur: 'suggerer', libelle: 'Corriger' },
      { valeur: 'lire', libelle: 'Lire' },
    ],
    surChange: () => {},
  })
  const html = rendre(h(design.Bandeau, { voletGauche, titre: 'x', modes: modes('suggerer') }))
  assert.equal(html.match(/type="radio"/g)?.length, 3)
  for (const l of ['Éditer', 'Corriger', 'Lire']) assert.ok(html.includes(l), l)
  assert.match(html, /value="suggerer"[^>]*checked=""|checked=""[^>]*value="suggerer"/)
})

test('panneau des suggestions : hors relecture, une invitation à la place de la liste', () => {
  const libelles = {
    accepter: 'A',
    refuser: 'R',
    accepterDe: (x) => x,
    refuserDe: (x) => x,
    toutAccepter: 'TA',
    toutRefuser: 'TR',
  }
  const html = rendre(
    h(design.PanneauSuggestions, {
      titre: 'Suggestions',
      lignes: [],
      libelles,
      invitation: { texte: 'Des suggestions attendent.', bouton: 'Relire', surClic: () => {} },
    }),
  )
  assert.match(html, /Des suggestions attendent\./)
  assert.match(html, />Relire</)
  assert.doesNotMatch(html, />TA</)
})

test('panneau des suggestions en consultation (sans surAccepter) : les cartes, sans Accepter ni Refuser', () => {
  const html = rendre(
    h(design.PanneauSuggestions, {
      titre: 'Suggestions',
      lignes: [{ cle: 'a', texte: 'Carla ajoute « donc »', auteur: 'Carla', passage: { avant: '', apres: 'donc' } }],
      libelles: {
        accepter: 'A',
        refuser: 'R',
        accepterDe: (x) => x,
        refuserDe: (x) => x,
        toutAccepter: 'TA',
        toutRefuser: 'TR',
      },
      surMontrer: () => {},
    }),
  )
  assert.match(html, /Carla/)
  assert.match(html, /<ins>donc<\/ins>/)
  assert.doesNotMatch(html, />A<|>R<|>TA<|>TR</)
})

test('liste des fils : le filtre (Ouverts, Résolus, Tous) sur sa valeur, puis l’emplacement de la liste', () => {
  const html = rendre(
    h(design.ListeDesFils, {
      filtre: {
        libelle: 'Fils',
        valeur: 'open',
        options: [
          { valeur: 'open', libelle: 'Ouverts' },
          { valeur: 'resolved', libelle: 'Résolus' },
          { valeur: 'all', libelle: 'Tous' },
        ],
        surChange: () => {},
      },
      cible: () => {},
    }),
  )
  assert.equal(html.match(/type="radio"/g)?.length, 3)
  for (const l of ['Ouverts', 'Résolus', 'Tous']) assert.ok(html.includes(l), l)
})

test('couleur d’auteur : stable, prise dans la palette de Mantine, ni grise ni noire', () => {
  for (const id of ['alice', 'bruno', 'dev-xyz', '', '👩🏽\u200D💻']) {
    const c = design.couleurAuteur(id)
    assert.equal(c, design.couleurAuteur(id))
    assert.match(c, /^var\(--mantine-color-[a-z]+-filled\)$/)
    assert.doesNotMatch(c, /-(gray|dark)-/)
  }
})

test('la marque (picto décoratif et nom) sur l’écran de connexion ; plus en tête des volets d’un document', () => {
  const t = creerTraducteur('fr')
  assert.doesNotMatch(rendre(coquilleDocument(t)), /amend\.ink<\/a>/, 'ni marque en tête du volet d’un document')
  const connexion = rendre(
    h(design.EcranConnexion, { nomApplication: 'amend.ink', titre: 'Connexion', surEntrer: () => {} }),
  )
  assert.match(connexion, /<h1[^>]*><span class="amend-picto" aria-hidden="true"><svg[\s\S]*amend\.ink<\/h1>/)
  assert.match(connexion, /<h2[^>]*>Connexion<\/h2>/, 'le titre de l’écran passe au niveau 2 sous la marque')
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
function coquilleDocument(t, { droite = true, relecture = {} } = {}) {
  return h(
    design.Coquille,
    {
      connexion: 'connecte',
      gaucheOuvert: true,
      droiteOuvert: droite,
      libelleRedimension: t('interface.largeurVolet'),
      alerte: h(design.AlerteHorsLigne, { texte: t('interface.horsLigne') }),
      bandeau: h(design.Bandeau, {
        voletGauche: { libelle: t('telephone.planEtDocuments'), ouvert: true, surClic: rien },
        titre: 'La gare',
        mention: t('document.lectureSeule'),
        terminer: { libelle: t('telephone.terminer'), surClic: rien },
        presence: { libelle: t('interface.presence'), personnes: [{ cle: 'c', nom: 'Claire Martin' }] },
        partager: { libelle: t('document.partager'), surClic: rien },
        actions: {
          libelle: t('telephone.autresActions'),
          elements: [{ cle: 'lien', libelle: t('telephone.copierLien'), picto: 'lien', surClic: rien }],
        },
        compte: { libelle: t('interface.compte'), nom: 'Sylvain', courriel: 's@exemple.fr', actions: [] },
        voletDroit: { libelle: t('interface.voletDroit'), nombre: 3, ouvert: droite, surClic: rien },
      }),
      voletGauche: h(design.VoletPlanDocuments, {
        marque: { nom: 'amend.ink', href: '#' },
        onglets: { plan: t('telephone.plan'), documents: t('telephone.documents') },
        plan: [
          { cle: 'a', niveau: 2, libelle: '1. La fin de l’étalement', actif: true },
          { cle: 'b', niveau: 3, libelle: 'La chronotopie' },
        ],
        surTitre: rien,
        videPlan: t('telephone.planVide'),
        documents: [{ cle: 'd', nom: 'Réparons la ville', href: '#/d', actif: true }],
      }),
      voletDroit: h(design.VoletRelecture, {
        titre: t('telephone.relecture'),
        onglets: { modifications: t('telephone.modifications'), margo: t('interface.margo') },
        modifications: h('div', { id: 'suggestions' }),
        margo: h('div', { id: 'margo' }),
        ...relecture,
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
      'telephone.planEtDocuments',
      'telephone.terminer',
      'telephone.autresActions',
      'interface.compte',
      'interface.voletDroit',
      'telephone.plan',
      'telephone.documents',
      'telephone.relecture',
      'telephone.modifications',
      'interface.margo',
      'interface.horsLigne',
    ])
      assert.ok(html.includes(echapper(t(cle))), `${l} : ${cle}`)
    assert.match(html, /<header[\s\S]*<h1[^>]*>La gare<\/h1>/, 'le titre du document est dans le bandeau')
    assert.doesNotMatch(html, /<nav[\s\S]*amend-picto/, 'plus de marque en tête du volet gauche (10/11/2026)')
    assert.match(html, /<aside/, 'volet droit')
    assert.match(html, /<main[\s\S]*id="editeur"/, 'le texte est dans le contenu principal')
    assert.match(html, /data-niveau="3"/, 'le niveau du titre passe au design')
    assert.match(html, /role="status"/, 'l’alerte hors ligne est annoncée')
    assert.match(html, />3</, 'le nombre de suggestions sur le bouton du volet droit')
    assert.ok(html.includes(echapper(t('document.lectureSeule'))), `${l} : mention du mode`)
    assert.match(html, /data-connexion="connecte"/, 'l’état de la connexion, en attribut')
  }
})

test('volet « Documents » : recherche, création, arbre imbriqué, menu « … » nommé par entrée', () => {
  const t = creerTraducteur('fr')
  const action = (cle, libelle) => ({ cle, libelle, picto: 'renommer', surClic: rien })
  const html = rendre(
    h(design.VoletDocuments, {
      recherche: { libelle: t('documents.rechercher'), valeur: '', surChange: rien },
      nouveau: {
        libelle: t('documents.nouveauMenu'),
        elements: [{ cle: 'n', libelle: t('documents.nouveau'), picto: 'nouveau', surClic: rien }],
      },
      entrees: [
        {
          cle: 'mes',
          nom: t('documents.mesDocuments'),
          picto: 'moi',
          ouvert: true,
          enfants: [
            {
              cle: 'd1',
              nom: 'La gare',
              picto: 'document',
              href: '#d1',
              actif: true,
              actions: [action('r', 'Renommer')],
            },
          ],
        },
        { cle: 'p', nom: t('documents.partagesAvecMoi'), picto: 'partages', enfants: [] },
      ],
      vide: t('documents.aucun'),
      libelleActions: (nom) => t('documents.actionsDe', { nom }),
    }),
  )
  assert.match(html, /type="search"/)
  // Le bouton du menu « Nouveau » ; ses éléments, rendus à l'ouverture, sont
  // vérifiés dans la pile (comptes.test.js, « Nouvelle note »).
  assert.ok(html.includes(echapper(t('documents.nouveauMenu'))))
  assert.match(html, /aria-expanded="true"[\s\S]*href="#d1"/, 'le document dans son dossier ouvert')
  assert.ok(
    html.includes(echapper(t('documents.actionsDe', { nom: 'La gare' }))),
    'le menu « … » porte le nom de l’entrée',
  )
  assert.match(html, /aria-expanded="false"[\s\S]*Partagé avec moi/, 'un espace fermé')
  const vide = rendre(
    h(design.VoletDocuments, {
      recherche: { libelle: 'r', valeur: '', surChange: rien },
      nouveau: { libelle: t('documents.nouveauMenu'), elements: [] },
      entrees: [],
      vide: t('documents.aucun'),
      libelleActions: () => '',
    }),
  )
  assert.ok(vide.includes(echapper(t('documents.aucun'))))
})

test('volet « Documents » : menu « Nouveau », et document de la corbeille sans lien avec son détail', () => {
  const t = creerTraducteur('fr')
  const html = rendre(
    h(design.VoletDocuments, {
      recherche: { libelle: t('documents.rechercher'), valeur: '', surChange: rien },
      nouveau: {
        libelle: t('documents.nouveauMenu'),
        elements: [{ cle: 'note', libelle: t('documents.nouvelleNote'), picto: 'note', surClic: rien }],
      },
      entrees: [
        {
          cle: 'corbeille',
          nom: t('documents.corbeille'),
          picto: 'corbeille',
          ouvert: true,
          enfants: [
            {
              cle: 'x',
              nom: 'Brouillon',
              picto: 'document',
              detail: t('documents.joursRestants', { n: 3 }),
              actions: [{ cle: 'r', libelle: t('documents.restaurer'), picto: 'restaurer', surClic: rien }],
            },
          ],
        },
      ],
      vide: '',
      libelleActions: (nom) => t('documents.actionsDe', { nom }),
    }),
  )
  assert.ok(html.includes(echapper(t('documents.nouveauMenu'))), 'le menu « Nouveau »')
  assert.ok(html.includes(echapper(t('documents.joursRestants', { n: 3 }))), 'les jours restants')
  assert.doesNotMatch(
    html.split('Brouillon')[0].split('Corbeille').pop(),
    /href=/,
    'pas de lien vers un document supprimé',
  )
})

test('bandeau d’un document : l’étoile des favoris et le titre qui se renomme d’un clic', () => {
  const voletGauche = { libelle: 'Plan', surClic: rien }
  const html = rendre(
    h(design.Bandeau, {
      voletGauche,
      titre: 'La gare',
      favori: { actif: true, libelle: 'Retirer des favoris', surBasculer: rien },
      renommer: { libelle: 'Renommer', valeur: 'La gare', surValider: rien },
    }),
  )
  assert.match(
    html,
    /aria-label="Retirer des favoris"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="Retirer des favoris"/,
  )
  assert.match(html, /<h1[^>]*><button[^>]*title="Renommer"[^>]*>La gare<\/button><\/h1>/)
  assert.doesNotMatch(
    rendre(h(design.Bandeau, { voletGauche, titre: 'x' })),
    /aria-pressed/,
    'sans étoile hors document',
  )
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
})

test('export et modèles : la fenêtre « Exporter » (format, modèle), la liste et le formulaire des modèles', () => {
  const t = creerTraducteur('fr')
  const libelles = {
    format: t('export.format'),
    modele: t('export.modele'),
    exporter: t('export.exporter'),
    annuler: t('interface.annuler'),
  }
  const formats = [
    { value: 'pdf', label: t('export.pdf') },
    { value: 'markdown', label: t('export.markdown') },
  ]
  const base = {
    libelles,
    formats,
    surFormat: () => {},
    surModele: () => {},
    surExporter: () => {},
    surAnnuler: () => {},
  }
  const pdf = rendre(
    h(design.PanneauExport, {
      ...base,
      format: 'pdf',
      modeles: [{ group: 'amend.ink', items: [{ value: 'a4', label: 'A4 simple' }] }],
      modele: 'a4',
      enCours: false,
    }),
  )
  for (const cle of ['export.format', 'export.modele', 'export.exporter'])
    assert.ok(pdf.includes(echapper(t(cle))), cle)
  assert.match(pdf, /value="A4 simple"/)
  const md = rendre(h(design.PanneauExport, { ...base, format: 'markdown', modeles: null, enCours: true }))
  assert.ok(!md.includes(echapper(t('export.modele'))), 'pas de modèle pour le Markdown')
  assert.match(md, /data-loading/, 'l’export en cours se voit sur le bouton')

  const liste = rendre(
    h(design.PanneauModeles, {
      libelles: {
        defaut: t('modeles.defaut'),
        nom: t('modeles.nom'),
        base: t('modeles.base'),
        creer: t('modeles.creer'),
        nouveau: t('modeles.nouveau'),
        annuler: t('interface.annuler'),
        regler: t('modeles.modifier'),
        dupliquer: t('modeles.dupliquer'),
        supprimer: t('modeles.supprimer'),
        actions: t('modeles.actions'),
        aucun: t('modeles.aucun'),
        colonnes: {
          nom: t('modeles.colonnes.nom'),
          format: t('modeles.colonnes.format'),
          police: t('modeles.colonnes.police'),
          documents: t('modeles.colonnes.documents'),
        },
        actionsDe: (nom) => t('modeles.actionsDe', { nom }),
        copieDe: (nom) => t('modeles.copieDe', { nom }),
      },
      defaut: { options: [{ value: 'a4', label: 'A4 simple' }], valeur: 'a4', surChange: () => {} },
      modeles: [
        {
          cle: 'm1',
          nom: 'Essais',
          adresse: '#/admin/modeles/m1',
          format: '120 × 180 mm',
          police: 'EB Garamond',
          detail: 'aucun document',
          parDefaut: t('modeles.parDefaut'),
        },
      ],
      bases: [{ value: 'a4', label: 'A4 simple' }],
      surCreer: () => {},
      surSupprimer: () => {},
    }),
  )
  assert.ok(liste.includes(echapper(t('modeles.colonnes.police'))), 'le tableau a ses colonnes')
  assert.match(liste, /href="#\/admin\/modeles\/m1"/, 'le nom mène à la page de réglage')
  assert.ok(liste.includes('EB Garamond') && liste.includes('120 × 180 mm'))
  assert.ok(
    liste.includes(echapper(t('modeles.actionsDe', { nom: 'Essais' }))),
    'le menu d’actions est nommé par sa ligne',
  )
  assert.ok(liste.includes(echapper(t('modeles.parDefaut'))))
  assert.ok(liste.includes(echapper(t('modeles.nouveau'))), 'un seul bouton de création')
  assert.doesNotMatch(liste, /name="nom"/, 'le formulaire de création est fermé tant qu’on ne l’ouvre pas')

  const page = rendre(
    h(design.PageReglageModele, {
      libelles: {
        nom: t('modeles.nom'),
        general: t('modeles.groupes.general'),
        retour: t('modeles.retour'),
        enregistrer: t('modeles.enregistrer'),
        annuler: t('interface.annuler'),
      },
      titre: 'Régler « Essais »',
      adresseRetour: '#/admin/modeles',
      nom: 'Essais',
      groupes: [{ cle: 'format', libelle: t('modeles.groupes.format') }],
      champs: [
        {
          cle: 'page.largeur',
          groupe: 'format',
          type: 'nombre',
          libelle: t('modeles.reglage.page.largeur'),
          valeur: 120,
          min: 80,
          max: 450,
          pas: 0.5,
        },
      ],
      surEnregistrer: () => {},
      surAnnuler: () => {},
    }),
  )
  assert.match(page, /href="#\/admin\/modeles"/, 'le retour à la liste')
  assert.ok(
    page.includes(echapper(t('modeles.groupes.general'))) && page.includes(echapper(t('modeles.groupes.format'))),
  )
  assert.match(page, /value="Essais"/, 'la première rubrique porte le nom du modèle')
})

test('onglet Margo : fil avec liens vers les blocs, bilan, portée, saisie étiquetée ; accueil quand le fil est vide', () => {
  const html = rendre(
    h(design.PanneauMargo, {
      titre: 'Margo (IA)',
      messages: [
        { cle: '1', etiquette: 'Vous', morceaux: [{ texte: 'Corrige <b>' }] },
        {
          cle: '2',
          etiquette: 'Margo (IA)',
          morceaux: [
            { texte: 'Deux corrections :\n- dans ' },
            { lien: '[2]', libelle: 'Aller au bloc 2', surClic: rien },
          ],
          bilan: '1 correction, aucun commentaire',
        },
      ],
      accueil: 'Bonjour',
      enCours: 'Margo travaille…',
      erreur: 'Erreur réseau',
      portee: 'Sur la sélection',
      saisie: {
        libelle: 'Votre demande',
        valeur: '',
        surChange: rien,
        surEnvoi: rien,
        envoyer: 'Envoyer',
        desactive: true,
      },
      nouvelle: { libelle: 'Nouvelle conversation', surClic: rien },
    }),
  )
  assert.match(html, /<section[^>]*aria-label="Margo \(IA\)"/)
  assert.match(html, /aria-live="polite"/)
  assert.match(html, /aria-relevant="additions"/, 'seuls les nouveaux messages sont annoncés')
  assert.doesNotMatch(html, /aria-atomic="true"/)
  assert.ok(html.includes('Corrige &lt;b&gt;'), 'le texte de la personne reste du texte')
  assert.match(html, /<button[^>]*aria-label="Aller au bloc 2"[^>]*>\[2\]<\/button>/)
  assert.ok(html.includes('1 correction, aucun commentaire'))
  assert.match(html, /Deux corrections :<br\/>- dans /, 'les retours à la ligne de Margo sont gardés')
  assert.match(html, /role="status"[\s\S]*Margo travaille…/)
  assert.match(html, /role="alert"[^>]*>Erreur réseau/)
  assert.match(html, /<label[^>]*>Votre demande/)
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled/)
  assert.ok(html.includes('Nouvelle conversation'))
  const vide = rendre(
    h(design.PanneauMargo, {
      titre: 'Margo',
      messages: [],
      accueil: 'Bonjour',
      enCours: null,
      erreur: null,
      portee: 'Sur tout le texte',
      saisie: {
        libelle: 'Votre demande',
        valeur: '',
        surChange: rien,
        surEnvoi: rien,
        envoyer: 'Envoyer',
        desactive: false,
      },
      nouvelle: null,
    }),
  )
  assert.ok(vide.includes('Bonjour') && vide.includes('Sur tout le texte'))
  assert.doesNotMatch(vide, /role="status"|role="alert"|Nouvelle conversation/)
})

test('format S : les boutons des tiroirs portent aria-expanded d\u2019après le tiroir ouvert', () => {
  const page = (volet) =>
    rendre(
      h(design.PageEditionS, {
        titre: 'Doc',
        libelles: { gauche: 'Plan', droite: 'Relecture', actions: 'Actions', terminer: 'Terminer', titre: 'Titre' },
        etat: '',
        enModification: false,
        surTerminer: rien,
        menu: [],
        voletGauche: { titre: 'Plan', onglets: [] },
        voletDroit: { titre: 'Relecture', onglets: [] },
        volet,
        surVolet: rien,
        editeur: null,
      }),
    )
  const etat = (html, libelle) => html.match(new RegExp(`aria-label="${libelle}"[^>]*aria-expanded="(\\w+)"`))?.[1]
  const ferme = page(null)
  assert.equal(etat(ferme, 'Plan'), 'false')
  assert.equal(etat(ferme, 'Relecture'), 'false')
  assert.equal(etat(page('gauche'), 'Plan'), 'true')
  assert.equal(etat(page('gauche'), 'Relecture'), 'false')
  assert.equal(etat(page('droite'), 'Relecture'), 'true')
})

test('volet de relecture : onglet ouvert piloté (« Corriger » ouvre Margo) ; sans Margo, pas d’onglet Margo', () => {
  const t = creerTraducteur('fr')
  const pilote = rendre(coquilleDocument(t, { relecture: { actif: 'margo', surOnglet: rien } }))
  assert.match(pilote, /role="tab"[^>]*aria-selected="true"[^>]*>[\s\S]*?Margo \(IA\)/)
  const sans = rendre(coquilleDocument(t, { relecture: { margo: undefined } }))
  assert.doesNotMatch(sans, /role="tab"[^>]*>[\s\S]{0,400}?Margo \(IA\)/)
  assert.match(sans, /id="suggestions"/)
})

// Le menu « … » (titres de groupe, choix cochés, pied) ne s'ouvre qu'au
// navigateur : vérifié dans la pile. Ici, la zone du zoom et les pictos.
test('zone du zoom et nouveaux pictos (11/11/2026)', () => {
  assert.match(rendre(h(design.ZoneZoom, { zoom: 150 }, 'texte')), /data-amend-zoom="150"/)
  assert.doesNotMatch(rendre(h(design.ZoneZoom, { zoom: 100 }, 'texte')), /data-amend-lecture/)
  assert.match(rendre(h(design.ZoneZoom, { zoom: 100, lecture: true }, 'texte')), /data-amend-lecture=""/)
  for (const role of ['exposant', 'tableDesMatieres', 'zoom', 'choisi'])
    assert.match(rendre(h(design.PictoDe, { role })), /<svg/, role)
})

test('supprimer son compte : ce que deviennent les documents, le refus, la confirmation par l’adresse', () => {
  const t = creerTraducteur('fr')
  const html = rendre(
    h(design.EcranSuppressionCompte, {
      titre: t('compte.supprimer'),
      explication: t('compte.explication'),
      groupes: [{ cle: 'supprime', titre: t('compte.supprimes'), elements: ['Brouillon'] }],
      refus: t('compte.refusDocuments', { liste: 'Essai' }),
      libelleCourriel: t('compte.courriel'),
      libelleBouton: t('compte.bouton'),
      libelleRetour: t('compte.retour'),
      surRetour: rien,
      surConfirmer: rien,
    }),
  )
  assert.ok(html.includes(echapper(t('compte.supprimes'))))
  assert.ok(html.includes('Brouillon'))
  assert.match(html, /role="alert"/, 'le refus est annoncé')
  assert.match(html, /type="email"/)
  assert.match(
    html,
    /type="submit"[^>]*disabled|disabled[^>]*type="submit"/,
    'bouton désactivé tant qu’il y a un refus',
  )
})

test('back-office : un menu des rubriques ; une rubrique peut porter des courbes, un texte quand elle est vide, des chiffres en cartes', () => {
  const memoire = {
    titre: 'Mémoire',
    courbes: [
      {
        libelle: 'Mémoire du serveur sur sept jours',
        legende: 'De 90 à 210 Mo',
        points: [
          { x: 0, y: 0 },
          { x: 0.5, y: 1 },
          { x: 1, y: 0.5 },
        ],
      },
    ],
    lignes: [],
  }
  const journal = { titre: 'Journal', vide: 'Rien à signaler.', lignes: [] }
  const doublons = {
    titre: 'Doublons',
    lignes: [
      { libelle: 'même date', valeur: 'un' },
      { libelle: 'même date', valeur: 'deux' },
    ],
  }
  const page = (rubriques) => rendre(h(design.PageAdministration, { titre: 'Administration', rubriques }))
  // Le menu nomme toutes les rubriques ; la première est montrée.
  const html = page([memoire, journal, doublons])
  for (const r of ['Mémoire', 'Journal', 'Doublons']) assert.match(html, new RegExp(`<button[^>]*>[\\s\\S]*?${r}`))
  assert.match(html, /aria-current="page"/)
  assert.match(html, /<svg[^>]*role="img"[^>]*aria-label="Mémoire du serveur sur sept jours"/)
  assert.match(html, /viewBox="0 0 100 25"/)
  // Le tracé : x sur la largeur, y renversé (1 en haut).
  assert.match(html, /points="0\.00,25\.00 50\.00,0\.00 100\.00,12\.50"/)
  assert.match(html, /<figcaption[^>]*>De 90 à 210 Mo<\/figcaption>/)
  assert.match(page([journal]), /Rien à signaler\./)
  assert.match(page([doublons]), />un<[\s\S]*>deux</, 'deux lignes de même libellé sont rendues toutes les deux')
  // Des chiffres en cartes, sans tableau.
  const chiffres = page([{ titre: 'Système', chiffres: true, lignes: [{ libelle: 'Documents', valeur: '42' }] }])
  assert.match(chiffres, /Documents[\s\S]*42/)
  assert.doesNotMatch(chiffres, /<table/)
})

test('back-office : une ligne peut porter un choix (modèle de Margo), étiqueté, options désactivables', () => {
  const html = rendre(
    h(design.PageAdministration, {
      titre: 'Administration',
      message: 'Enregistré.',
      rubriques: [
        {
          titre: 'IA',
          lignes: [
            {
              libelle: 'Modèle de Margo',
              choix: {
                valeur: 'b',
                surChange: rien,
                options: [
                  { valeur: 'a', libelle: 'Modèle A', desactive: true },
                  { valeur: 'b', libelle: 'Modèle B' },
                ],
              },
            },
            { libelle: 'Autre', valeur: 'valeur simple' },
          ],
        },
      ],
    }),
  )
  assert.match(html, /<select[^>]*aria-label="Modèle de Margo"/)
  assert.match(html, /<option value="a" disabled="">Modèle A<\/option>/)
  assert.match(html, /<option value="b" selected="">Modèle B<\/option>/)
  assert.ok(html.includes('valeur simple'))
  assert.match(html, /role="status"[^>]*>Enregistré\./)
})
