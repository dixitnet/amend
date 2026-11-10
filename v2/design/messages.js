// Les messages passagers (notifications de Mantine), comme les toasts de Docs
// (useClipboard, ModalRemoveDoc) : vert quand c'est fait, rouge en cas
// d'erreur, quelques secondes (Sylvain, 10/11/2026). L'application donne le
// texte traduit ; le design choisit l'apparence (réglages décidés).
import { notifications } from '@mantine/notifications'
import { REGLAGES } from './reglages.js'

/** Montre un message passager ; `erreur` : en rouge. */
export function montrerMessage(texte, { erreur = false } = {}) {
  notifications.show({
    message: texte,
    autoClose: REGLAGES.messages.duree,
    ...(erreur ? REGLAGES.messages.erreur : {}),
  })
}
