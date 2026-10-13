// Les consignes toutes faites de Corrections IA (13/10/2026) — **une seule
// liste, lue par le client et par le serveur**.
//
// Le client en fait les boutons du panneau et envoie la `cle` du bouton cliqué
// avec la demande ; le serveur ne s'en sert que pour **compter les clics par
// bouton** (server/usageIa.js, affiché dans #/admin/ia) : une clé inconnue est
// rangée sous « autre ». Le texte de la consigne, lui, reste celui que le client
// envoie, et le serveur le borne comme avant.
//
// Pour ajouter un bouton : une entrée ici, rien d'autre (les tests vérifient que
// les clés sont uniques et que chaque consigne est renseignée). L'ordre est celui
// du panneau.

export const CONSIGNES_IA = [
  { cle: 'raccourcir', label: 'Raccourcir', instruction: 'Rends ce passage plus concis, sans en changer le sens.' },
  // « Corriger » remplace « Plus formel » (19/09) : changer de registre est
  // une demande rare et qu'on formule mieux soi-même ; corriger est ce
  // qu'on demande dix fois par jour. L'instruction dit explicitement de ne
  // pas réécrire — sans quoi le modèle en profite pour reformuler, et la
  // proposition devient illisible à relire.
  {
    cle: 'corriger',
    label: 'Corriger',
    instruction:
      "Corrige l'orthographe, la grammaire, la conjugaison et la typographie de ce passage. " +
      'Ne reformule pas, ne change pas le style, ne coupe rien : seules les fautes sont corrigées.',
  },
  { cle: 'clarifier', label: 'Clarifier', instruction: 'Clarifie ce passage pour le rendre plus facile à comprendre.' },
  {
    cle: 'reformuler',
    label: 'Reformuler',
    instruction:
      'Reformule ce passage avec d’autres mots et une autre tournure, en gardant exactement le même sens, ' +
      'le même ton et à peu près la même longueur.',
  },
  {
    cle: 'developper',
    label: 'Développer',
    instruction:
      'Développe ce passage : ajoute les précisions, les transitions ou les explications qui lui manquent, ' +
      'sans inventer de faits, de chiffres ni de références, et sans changer le ton.',
  },
  {
    cle: 'soutenu',
    label: 'Plus soutenu',
    instruction:
      'Réécris ce passage dans un registre plus soutenu, plus écrit, sans le rallonger inutilement ' +
      'et sans en changer le sens.',
  },
  {
    cle: 'direct',
    label: 'Plus direct',
    instruction:
      'Rends ce passage plus direct : va droit au but, préfère les phrases courtes et la voix active, ' +
      'supprime les précautions et les détours, sans changer le sens.',
  },
]

/** La clé sous laquelle compter un clic : celle d'un bouton connu, sinon « autre ». */
export function cleDeConsigne(cle) {
  return CONSIGNES_IA.some((c) => c.cle === cle) ? cle : 'autre'
}
