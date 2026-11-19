// Ce que tous les écrans partagent : le traducteur (initialisé une seule fois, avant
// tout rendu), les appels JSON, les noms traduits et le compte du bandeau.
import { creerTraducteur, choisirLangue, libelleDuRole, libelleDuRoleEquipe, LANGUE_PSEUDO } from '../../i18n/index.js'
import { AUTEUR_MARGO, AUTEUR_CLAUDE } from '../../domaine/index.js'
import { couleurAuteur, COULEUR_AGENTS } from '../../design/index.js'
import { nomsDe, appel } from './commentaires.js'

// La langue : celle demandée dans l'adresse (?langue=fr|en|pseudo, pour les
// essais et les captures), sinon celle du navigateur.
const demandee = new URLSearchParams(location.search).get('langue')
export const t = creerTraducteur(
  demandee === LANGUE_PSEUDO ? LANGUE_PSEUDO : choisirLangue([demandee, ...navigator.languages]),
)
document.documentElement.lang = t.langue
document.title = t('application.nom')

export const lireJson = (r) => r.json().catch(() => ({}))

/** La couleur d'un auteur (curseur, présence, corrections, cartes du volet) : celle de la personne, ou la
 * couleur réservée aux agents, Margo et Claude (Sylvain, 19/11/2026). */
export const couleurDe = (id) => (id === AUTEUR_MARGO || id === AUTEUR_CLAUDE ? COULEUR_AGENTS : couleurAuteur(id))

/** Les noms des personnes, et ceux des agents, Margo et Claude par le
 * connecteur (le serveur rend un code) ; chacun avec sa couleur, que BlockNote
 * donne à ses corrections dans le texte (`color` de ses utilisateurs). */
export const nomsAvecMargo = (ids) =>
  nomsDe(ids).then((l) =>
    l.map((p) => ({
      ...p,
      color: couleurDe(p.id),
      ...(p.id === AUTEUR_MARGO
        ? { username: t('interface.margo') }
        : p.id === AUTEUR_CLAUDE
          ? { username: t('interface.claude') }
          : {}),
    })),
  )

export const envoyerJson = appel

/** Se déconnecter : la session est fermée côté serveur, la page repart de zéro. */
export async function seDeconnecter() {
  await envoyerJson('POST', '/api/deconnexion').catch(() => {})
  location.reload()
}

/** Le compte, dans le bandeau : l'administration (administrateurs de
 * l'instance), l'aide quand l'instance en a une (pages statiques, lot du
 * 11/11/2026 ; comme le lien de documentation de Docs, `HelpMenu.tsx`) et un
 * seul « Se déconnecter » (Sylvain, 09/11/2026). */
export function compteDe(personne, config) {
  const sortir = seDeconnecter
  return {
    libelle: t('interface.compte'),
    nom: personne.nom,
    couleur: couleurAuteur(personne.id),
    actions: [
      ...(personne.admin === true
        ? [
            {
              cle: 'admin',
              libelle: t('admin.titre'),
              picto: 'administration',
              surClic: () => (location.hash = '#/admin'),
            },
          ]
        : []),
      ...(config?.aide
        ? [
            {
              cle: 'aide',
              libelle: t('interface.aide'),
              picto: 'aide',
              surClic: () => window.open(config.aide, '_blank', 'noopener'),
            },
          ]
        : []),
      { cle: 'sortir', libelle: t('documents.deconnexion'), picto: 'deconnexion', surClic: sortir },
      {
        cle: 'supprimer',
        libelle: t('compte.supprimer'),
        picto: 'supprimer',
        surClic: () => (location.hash = '#/compte'),
      },
    ],
  }
}

/** Le bouton du volet gauche, dans le bandeau. */
export const boutonGauche = (volets) => ({
  libelle: t('telephone.planEtDocuments'),
  ouvert: volets.gauche,
  surClic: volets.basculerGauche,
})

export const nomDuRole = (role) => libelleDuRole(t, role)
export const nomDuRoleEquipe = (role) => libelleDuRoleEquipe(t, role)

/** Les noms des modèles de Margo (identifiants de l'adaptateur IA). */
const NOMS_MODELES = {
  'deepseek-v4.1-flash-1017': () => t('admin.modeles.deepseek'),
  'claude-sonnet-5-5': () => t('admin.modeles.sonnet'),
  'claude-haiku-5-5': () => t('admin.modeles.haiku'),
  'claude-fable-5-2': () => t('admin.modeles.fable'),
}
export const nomDuModele = (id) => NOMS_MODELES[id]?.() ?? id
