// Les modèles de mise en page d'une équipe.
import { useState } from 'react'
import { PanneauModeles, FormulaireModele, REGLES_MODELES, MODELES_LIVRE } from '../../design/index.js'
import { messageErreur } from '../../i18n/index.js'
import { appliquerEcarts, valeurDuReglage } from '../../domaine/index.js'
import { modeleMaison } from './exports.js'
import { t, envoyerJson } from './commun.js'

/** Les noms des modèles d'amend.ink et des réglages ouverts aux équipes
 * (catalogue des textes) ; un modèle ou un réglage ajouté au design s'ajoute ici. */
const NOMS_MAISON = { 'tat-poche': () => t('modeles.maison.tat-poche') }
const NOMS_REGLAGES = {
  'page.largeur': () => t('modeles.reglage.page.largeur'),
  'page.hauteur': () => t('modeles.reglage.page.hauteur'),
  'marges.haut': () => t('modeles.reglage.marges.haut'),
  'marges.interieure': () => t('modeles.reglage.marges.interieure'),
  'marges.exterieure': () => t('modeles.reglage.marges.exterieure'),
  'grille.corps': () => t('modeles.reglage.grille.corps'),
  'grille.interligne': () => t('modeles.reglage.grille.interligne'),
  'grille.lignes': () => t('modeles.reglage.grille.lignes'),
  police: () => t('modeles.reglage.police'),
  alinea: () => t('modeles.reglage.alinea'),
  'chapitre.bellePage': () => t('modeles.reglage.chapitre.bellePage'),
  'titre.corps': () => t('modeles.reglage.titre.corps'),
  'sousTitre.corps': () => t('modeles.reglage.sousTitre.corps'),
}
const nomMaison = (id) => NOMS_MAISON[id]?.() ?? id
const optionsMaison = () => MODELES_LIVRE.map((m) => ({ value: m.id, label: nomMaison(m.id) }))
/** Les modèles d'amend.ink, puis ceux d'une équipe, en groupes d'un Select. */
export const groupesDeModeles = (equipe, modeles) => [
  { group: t('export.groupeMaison'), items: optionsMaison() },
  ...(equipe && modeles.length
    ? [{ group: t('export.groupeEquipe', { equipe }), items: modeles.map((m) => ({ value: m.id, label: m.nom })) }]
    : []),
]

/** Les modèles de mise en page d'une équipe (étape 7, ADR 0011), pour son
 * gestionnaire : le modèle par défaut, la liste, la création, le réglage. */
export function ModelesEquipe({ vue, confirmer, surChangement }) {
  const [message, setMessage] = useState(null)
  const [enReglage, setEnReglage] = useState(null)
  const base = `/api/equipes/${encodeURIComponent(vue.equipe.id)}`
  const essayer = async (f, succes = null) => {
    try {
      await f()
      setMessage(succes)
      return true
    } catch (e) {
      setMessage(messageErreur(t, e.code || 'reseau'))
      return false
    } finally {
      surChangement()
    }
  }
  const modeles = vue.modeles ?? []
  const regle = modeles.find((m) => m.id === enReglage)
  if (regle && modeleMaison(regle.base)) {
    const depart = modeleMaison(regle.base)
    const calcul = depart ? appliquerEcarts(depart, regle.ecarts, REGLES_MODELES) : null
    const complet = calcul?.ok ? calcul.modele : depart
    const polices = REGLES_MODELES.polices.map((p) => ({ value: p.famille, label: p.famille }))
    return (
      <FormulaireModele
        key={regle.id}
        libelles={{ nom: t('modeles.nom'), enregistrer: t('modeles.enregistrer'), annuler: t('interface.annuler') }}
        nom={regle.nom}
        champs={REGLES_MODELES.reglables.map((r) => ({
          cle: r.cle,
          type: r.type,
          libelle: NOMS_REGLAGES[r.cle]?.() ?? r.cle,
          valeur: valeurDuReglage(complet, r.cle),
          min: r.min,
          max: r.max,
          pas: r.pas,
          options: r.type === 'police' ? polices : undefined,
        }))}
        message={message}
        surEnregistrer={async ({ nom, valeurs }) => {
          if (
            await essayer(
              () => envoyerJson('PUT', `${base}/modeles/${encodeURIComponent(regle.id)}`, { nom, ecarts: valeurs }),
              t('modeles.enregistre'),
            )
          )
            setEnReglage(null)
        }}
        surAnnuler={() => (setEnReglage(null), setMessage(null))}
      />
    )
  }
  const defaut = vue.modeleDefaut ?? MODELES_LIVRE[0].id
  return (
    <PanneauModeles
      libelles={{
        defaut: t('modeles.defaut'),
        nom: t('modeles.nom'),
        base: t('modeles.base'),
        creer: t('modeles.creer'),
        modifier: t('modeles.modifier'),
        supprimer: t('modeles.supprimer'),
        aucun: t('modeles.aucun'),
        modifierDe: (nom) => t('modeles.modifierDe', { nom }),
        supprimerDe: (nom) => t('modeles.supprimerDe', { nom }),
      }}
      defaut={{
        options: groupesDeModeles(vue.equipe.nom, modeles),
        valeur: defaut,
        // Le premier modèle d'amend.ink, choisi par défaut, s'enregistre comme
        // « aucun choix » : il suit le premier modèle si le design en change (audit du 11/11/2026).
        surChange: (choix) =>
          essayer(() =>
            envoyerJson('PUT', `${base}/modele-defaut`, { modele: choix === MODELES_LIVRE[0].id ? null : choix }),
          ),
      }}
      modeles={modeles.map((m) => ({
        cle: m.id,
        nom: m.nom,
        detail: t('modeles.detail', { titre: nomMaison(m.base), n: m.documents }),
        parDefaut: m.id === vue.modeleDefaut ? t('modeles.parDefaut') : null,
      }))}
      bases={optionsMaison()}
      message={message}
      surCreer={(nom, depart) => essayer(() => envoyerJson('POST', `${base}/modeles`, { nom, base: depart }))}
      // Un modèle dont la base a quitté le design ne se règle plus : on le dit (audit du 11/11/2026).
      surModifier={(id) =>
        modeleMaison(modeles.find((m) => m.id === id)?.base)
          ? (setEnReglage(id), setMessage(null))
          : setMessage(messageErreur(t, 'modele-introuvable'))
      }
      surSupprimer={async (id) => {
        const m = modeles.find((x) => x.id === id)
        if (
          await confirmer({
            titre: t('modeles.supprimer'),
            texte: t('modeles.confirmerSuppression', { nom: m.nom, n: m.documents }),
            libelle: t('modeles.supprimer'),
            danger: true,
          })
        )
          essayer(() => envoyerJson('DELETE', `${base}/modeles/${encodeURIComponent(id)}`))
      }}
    />
  )
}
