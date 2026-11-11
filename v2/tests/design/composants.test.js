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
    signes: 12345,
    mots: 2000,
    zoom: 150,
    liste: 'La gare, Le quai',
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
      equipe: 'E',
      numero: '2',
      commit: 'c',
      lien: 'L',
      texte: 'X',
      corrections: 2,
      commentaires: 2,
      max: 4000,
      signes: 2,
      mots: 2,
      zoom: 50,
      liste: 'L',
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

test('bandeau : le choix du mode (Modifier, Suggérer, Relire), seulement s’il est demandé, sur sa valeur', () => {
  const voletGauche = { libelle: 'Plan', surClic: () => {} }
  assert.doesNotMatch(rendre(h(design.Bandeau, { voletGauche, titre: 'x' })), /type="radio"/)
  const modes = (valeur) => ({
    libelle: 'Mode',
    valeur,
    options: [
      { valeur: 'ecrire', libelle: 'Modifier' },
      { valeur: 'suggerer', libelle: 'Suggérer' },
      { valeur: 'relire', libelle: 'Relire' },
    ],
    surChange: () => {},
  })
  const html = rendre(h(design.Bandeau, { voletGauche, titre: 'x', modes: modes('suggerer') }))
  assert.equal(html.match(/type="radio"/g)?.length, 3)
  for (const l of ['Modifier', 'Suggérer', 'Relire']) assert.ok(html.includes(l), l)
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
        mention: t('document.modeSuggestion'),
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
    assert.ok(html.includes(echapper(t('document.modeSuggestion'))), `${l} : mention du mode`)
    assert.match(html, /data-connexion="connecte"/, 'l’état de la connexion, en attribut')
  }
})

test('volet « Documents » : recherche, création, arbre imbriqué, menu « … » nommé par entrée', () => {
  const t = creerTraducteur('fr')
  const action = (cle, libelle) => ({ cle, libelle, picto: 'renommer', surClic: rien })
  const html = rendre(
    h(design.VoletDocuments, {
      recherche: { libelle: t('documents.rechercher'), valeur: '', surChange: rien },
      boutons: [{ cle: 'n', libelle: t('documents.nouveau'), picto: 'nouveau', surClic: rien }],
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
  assert.ok(html.includes(echapper(t('documents.nouveau'))))
  assert.match(html, /aria-expanded="true"[\s\S]*href="#d1"/, 'le document dans son dossier ouvert')
  assert.ok(
    html.includes(echapper(t('documents.actionsDe', { nom: 'La gare' }))),
    'le menu « … » porte le nom de l’entrée',
  )
  assert.match(html, /aria-expanded="false"[\s\S]*Partagé avec moi/, 'un espace fermé')
  const vide = rendre(
    h(design.VoletDocuments, {
      recherche: { libelle: 'r', valeur: '', surChange: rien },
      boutons: [],
      entrees: [],
      vide: t('documents.aucun'),
      libelleActions: () => '',
    }),
  )
  assert.ok(vide.includes(echapper(t('documents.aucun'))))
})

test('volet « Documents » : tri, et document de la corbeille sans lien avec son détail', () => {
  const t = creerTraducteur('fr')
  const html = rendre(
    h(design.VoletDocuments, {
      recherche: { libelle: t('documents.rechercher'), valeur: '', surChange: rien },
      boutons: [],
      tri: {
        libelle: t('documents.trier'),
        valeur: 'modifies',
        options: [
          { value: 'modifies', label: t('documents.triModifies') },
          { value: 'titre', label: t('documents.triTitre') },
        ],
        surChange: rien,
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
  assert.ok(html.includes(echapper(t('documents.trier'))), 'le sélecteur de tri est nommé')
  assert.ok(html.includes(echapper(t('documents.triModifies'))))
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

test('export et modèles : la fenêtre « Exporter » (format, modèle, case « retenir »), la liste et le formulaire des modèles', () => {
  const t = creerTraducteur('fr')
  const libelles = {
    format: t('export.format'),
    modele: t('export.modele'),
    retenir: t('export.retenir'),
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
      modeles: [{ group: 'amend.ink', items: [{ value: 'tat-poche', label: 'TàT - Poche' }] }],
      modele: 'tat-poche',
      retenir: { coche: false, surChange: () => {} },
      enCours: false,
    }),
  )
  for (const cle of ['export.format', 'export.modele', 'export.retenir', 'export.exporter'])
    assert.ok(pdf.includes(echapper(t(cle))), cle)
  assert.match(pdf, /value="TàT - Poche"/)
  const md = rendre(
    h(design.PanneauExport, { ...base, format: 'markdown', modeles: null, retenir: null, enCours: true }),
  )
  assert.ok(!md.includes(echapper(t('export.modele'))), 'pas de modèle pour le Markdown')
  assert.ok(!md.includes(echapper(t('export.retenir'))))
  assert.match(md, /data-loading/, 'l’export en cours se voit sur le bouton')

  const liste = rendre(
    h(design.PanneauModeles, {
      libelles: {
        defaut: t('modeles.defaut'),
        nom: t('modeles.nom'),
        base: t('modeles.base'),
        creer: t('modeles.creer'),
        modifier: t('modeles.modifier'),
        supprimer: t('modeles.supprimer'),
        aucun: t('modeles.aucun'),
        modifierDe: (nom) => t('modeles.modifierDe', { nom }),
        supprimerDe: (nom) => t('modeles.supprimerDe', { nom }),
      },
      defaut: { options: [{ value: 'tat-poche', label: 'TàT - Poche' }], valeur: 'tat-poche', surChange: () => {} },
      modeles: [{ cle: 'm1', nom: 'Essais', detail: 'TàT - Poche', parDefaut: t('modeles.parDefaut') }],
      bases: [{ value: 'tat-poche', label: 'TàT - Poche' }],
      surCreer: () => {},
      surModifier: () => {},
      surSupprimer: () => {},
    }),
  )
  assert.ok(
    liste.includes(echapper(t('modeles.modifierDe', { nom: 'Essais' }))),
    'chaque bouton est nommé par sa ligne',
  )
  assert.ok(liste.includes(echapper(t('modeles.parDefaut'))))
  assert.match(liste, /name="nom"/)

  const formulaire = rendre(
    h(design.FormulaireModele, {
      libelles: { nom: t('modeles.nom'), enregistrer: t('modeles.enregistrer'), annuler: t('interface.annuler') },
      nom: 'Essais',
      champs: [
        {
          cle: 'page.largeur',
          type: 'nombre',
          libelle: t('modeles.reglage.page.largeur'),
          valeur: 120,
          min: 80,
          max: 450,
          pas: 0.5,
        },
        { cle: 'grille.lignes', type: 'entier', libelle: t('modeles.reglage.grille.lignes'), valeur: 31, min: 1 },
        { cle: 'chapitre.bellePage', type: 'booleen', libelle: t('modeles.reglage.chapitre.bellePage'), valeur: true },
        {
          cle: 'police',
          type: 'police',
          libelle: t('modeles.reglage.police'),
          valeur: 'EB Garamond',
          options: [{ value: 'EB Garamond', label: 'EB Garamond' }],
        },
      ],
      surEnregistrer: () => {},
      surAnnuler: () => {},
    }),
  )
  for (const cle of ['page.largeur', 'grille.lignes', 'chapitre.bellePage', 'police'])
    assert.ok(formulaire.includes(echapper(t(`modeles.reglage.${cle}`))), cle)
  assert.match(formulaire, /value="Essais"/)
  assert.match(formulaire, /role="switch"[^>]*checked=""|checked=""[^>]*role="switch"/)
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
