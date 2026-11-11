// Adaptateur BlockNote (couche 2) : l'historique, avec le stockage de
// BlockNote pour y/hub (`createYHubVersionStorage`, sur les routes `activity`,
// `changeset`, `version` et `rollback` de y/hub). Tout le monde voit tout
// l'historique (Sylvain, 08/11/2026) ; nommer une version, la supprimer et
// revenir à une version sont réservés à qui peut restaurer : pour les autres,
// ces actions sont retirées du stockage, et le panneau de BlockNote ne les
// propose pas. y/hub refuse de toute façon (permissions par branche).
// Docs a sa propre liste, sans versions nommées ; le panneau de BlockNote fait
// la même chose avec les versions nommées que Sylvain a demandées.
import { YVersioningExtension, createYHubVersionStorage } from '@blocknote/core/y'

const ACTIONS = ['create', 'rename', 'restore', 'remove']
// Une version par période de travail : un arrêt de 5 minutes en ouvre une
// nouvelle (BlockNote : une heure par défaut ; Sylvain, 10/11/2026).
const ECART_ENTRE_VERSIONS = 5 * 60 * 1000

/**
 * @param {{ api: string, docId: string, fragment: any }} contexte
 * @param {boolean} peutRestaurer
 * @param {string} nomAvantRetour  le nom de la version enregistrée avant un retour
 */
export function extensionHistorique(contexte, peutRestaurer, nomAvantRetour) {
  const complet = createYHubVersionStorage({
    baseUrl: contexte.api,
    org: 'amend',
    docId: contexte.docId,
    queryParams: { branch: 'main' },
    activityParams: { groupMaxGap: ECART_ENTRE_VERSIONS },
    fragment: contexte.fragment,
    beforeRestoreName: nomAvantRetour,
  })
  const storage = peutRestaurer
    ? complet
    : Object.fromEntries(
        Object.entries(Object.getOwnPropertyDescriptors(complet))
          .filter(([cle]) => !ACTIONS.includes(cle))
          .map(([cle, d]) => [cle, 'value' in d ? d.value : complet[cle]]),
      )
  return YVersioningExtension({ storage })
}
