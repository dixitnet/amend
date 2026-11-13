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
  IconRestore,
  IconHelp,
  IconSuperscript,
  IconListDetails,
  IconLetterT,
  IconNote,
  IconCalendar,
  IconAsterisk,
  IconLetterTSmall,
  IconLetterP,
  IconLetterL,
  IconTextSize,
  IconCheck,
} from '@tabler/icons-react'
import { REGLAGES } from './reglages.js'

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
  corbeille: IconTrash,
  restaurer: IconRestore,
  aide: IconHelp,
  // 11/11/2026 (comparaison v1 / v2, points 19, 6, zoom) : dessins proposés, à confirmer.
  exposant: IconSuperscript,
  tableDesMatieres: IconListDetails,
  titre: IconLetterT,
  note: IconNote,
  date: IconCalendar,
  noteDePage: IconAsterisk,
  noteDePageMenu: IconAsterisk,
  sousTitre: IconLetterTSmall,
  // La légende d'une image ou d'un tableau (13/11/2026).
  legende: IconLetterL,
  // Le style « Paragraphe » de la palette : un P, pas le T de BlockNote, qui
  // se confondait avec ceux du titre et du sous-titre (Sylvain, 13/11/2026).
  paragraphe: IconLetterP,
  zoom: IconTextSize,
  choisi: IconCheck,
}

/** Le picto d'un rôle, ou rien si le rôle est inconnu. */
export function PictoDe({ role }) {
  const Dessin = PICTOS[role]
  // Les pictos qui s'ajoutent aux boutons de BlockNote (palette, menu « / »)
  // prennent leur taille, pour ne pas paraître plus gras (réglage pictos.editeur).
  const size = REGLAGES.pictos.editeur[role]
  return Dessin ? <Dessin aria-hidden="true" {...(size ? { size } : null)} /> : null
}
