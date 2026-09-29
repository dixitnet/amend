// Le moteur de diff vit dans shared/ depuis le 29/09/2026 : le serveur s'en
// sert aussi (server/agentTexte.js), pour que les propositions d'un agent
// invité se découpent mot à mot exactement comme celles de l'IA du panneau.
export { diffChars, diffWords } from '../../shared/diff.js'
