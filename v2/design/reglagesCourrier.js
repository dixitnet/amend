// Les valeurs de design des courriers (Sylvain, 18/11/2026) : celles de la palette et de la
// police de Mantine, écrites en clair parce qu'un courrier ne peut pas lire les variables
// d'une page (messageries) ; les styles sont en ligne pour la même raison. Un courrier garde les
// gris et le noir de Mantine, sans la couleur de l'instance : à décider plus tard. Chaque valeur
// renvoie à l'ADR 0008 (`courrier.gabarit`).
// Mantine : `gray.0` (fond), blanc (carte), `gray.9` (texte et bouton), `gray.6` (notes), `gray.3`
// (trait) ; la police est `DEFAULT_THEME.fontFamily`.
const FOND = '#f8f9fa'
const CARTE = '#ffffff'
const TEXTE = '#212529'
const DISCRET = '#868e96'
const TRAIT = '#dee2e6'
const POLICE = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
const LARGEUR = '520px'

export const COURRIER = {
  page: `margin:0;padding:24px;background:${FOND};font-family:${POLICE};color:${TEXTE};`,
  carte: `max-width:${LARGEUR};margin:0 auto;background:${CARTE};border-radius:8px;padding:28px 30px;`,
  titre: 'margin:0 0 18px;line-height:1.5;font-size:19px;font-weight:600;',
  intro: 'margin:0 0 24px;line-height:1.5;',
  bouton: `display:inline-block;background:${TEXTE};color:${CARTE};text-decoration:none;padding:12px 26px;border-radius:6px;`,
  paragrapheBouton: 'margin:0 0 24px;',
  copier: `margin:0 0 6px;font-size:13px;color:${DISCRET};`,
  adresse: 'margin:0 0 24px;font-size:13px;word-break:break-all;',
  trait: `border:0;border-top:1px solid ${TRAIT};margin:0 0 16px;`,
  apres: `margin:0;font-size:13px;line-height:1.5;color:${DISCRET};`,
  marque: `max-width:${LARGEUR};margin:14px auto 0;font-size:12px;color:${DISCRET};text-align:center;`,
}
