// Les pictos de l'interface (Tabler, ADR 0008), désignés par un nom de rôle :
// la technique dit « lien », « historique »… et le design choisit le dessin.
// Taille et trait de Tabler par défaut.
import {
  IconListTree,
  IconPencilCheck,
  IconDots,
  IconLink,
  IconShare,
  IconDownload,
  IconPrinter,
  IconCopy,
  IconHistory,
  IconTrash,
  IconFiles,
  IconFileText,
  IconFolder,
  IconWand,
  IconMessage,
  IconUser,
  IconUsers,
  IconUsersGroup,
  IconPlus,
  IconLogout,
  IconWifiOff,
  IconSettings,
  IconPencil,
  IconArrowBack,
  IconStar,
  IconStarFilled,
} from '@tabler/icons-react'

const PICTOS = {
  plan: IconListTree,
  modifications: IconPencilCheck,
  autres: IconDots,
  lien: IconLink,
  partager: IconShare,
  exporter: IconDownload,
  imprimer: IconPrinter,
  dupliquer: IconCopy,
  historique: IconHistory,
  supprimer: IconTrash,
  documents: IconFiles,
  document: IconFileText,
  dossier: IconFolder,
  margo: IconWand,
  commentaires: IconMessage,
  moi: IconUser,
  partages: IconUsers,
  equipe: IconUsersGroup,
  nouveau: IconPlus,
  deconnexion: IconLogout,
  horsLigne: IconWifiOff,
  administration: IconSettings,
  renommer: IconPencil,
  retour: IconArrowBack,
  favori: IconStar,
  favoriActif: IconStarFilled,
}

/** Le picto d'un rôle, ou rien si le rôle est inconnu. */
export function PictoDe({ role }) {
  const Dessin = PICTOS[role]
  return Dessin ? <Dessin aria-hidden="true" /> : null
}
