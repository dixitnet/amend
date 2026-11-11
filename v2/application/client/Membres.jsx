// Les membres d'une équipe.
import { useState } from 'react'
import { PanneauPartage } from '../../design/index.js'
import { messageErreur } from '../../i18n/index.js'
import { t, envoyerJson, nomDuRoleEquipe } from './commun.js'

export function Membres({ vue, surChangement }) {
  const [message, setMessage] = useState(null)
  const base = `/api/equipes/${encodeURIComponent(vue.equipe.id)}`
  const agir =
    (f, succes) =>
    async (...a) => {
      try {
        const r = await f(...a)
        setMessage(succes ? succes(r, ...a) : null)
      } catch (e) {
        setMessage(messageErreur(t, e.code || 'reseau'))
      }
      surChangement()
    }
  const options = (roles) => roles.map((r) => ({ value: r, label: nomDuRoleEquipe(r) }))
  return (
    <PanneauPartage
      titre={t('documents.membres')}
      libelles={{
        courriel: t('partage.courriel'),
        role: t('partage.role'),
        inviter: t('partage.inviter'),
        retirer: t('partage.retirer'),
        annuler: t('partage.annuler'),
        roleDe: (nom) => t('partage.roleDe', { nom }),
        retirerDe: (nom) => t('partage.retirerDe', { nom }),
        annulerDe: (courriel) => t('partage.annulerDe', { courriel }),
      }}
      roles={options(vue.rolesDonnables)}
      acces={vue.membres.map((m) => ({
        cle: m.personne,
        nom: m.nom || m.courriel,
        role: m.role,
        roles: options(vue.rolesDonnables),
      }))}
      invitations={vue.invitations.map((i) => ({
        courriel: i.courriel,
        texte: t('partage.invite', { courriel: i.courriel, role: nomDuRoleEquipe(i.role) }),
      }))}
      message={message}
      surInviter={agir(
        (courriel, role) => envoyerJson('POST', `${base}/membres`, { courriel, role }),
        (r, courriel) =>
          r.invitation ? t('partage.invitationEnvoyee', { courriel }) : t('partage.accesDonne', { courriel }),
      )}
      surChangerRole={agir((cle, role) => envoyerJson('PUT', `${base}/membres/${cle}`, { role }))}
      surRetirer={agir((cle) => envoyerJson('DELETE', `${base}/membres/${cle}`))}
      surRetirerInvitation={agir((courriel) =>
        envoyerJson('DELETE', `${base}/invitations/${encodeURIComponent(courriel)}`),
      )}
    />
  )
}
