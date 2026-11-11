// Composant de présentation : l'onglet Margo (IA) du volet droit (étape 8,
// docs/v2-etape-8-plan.md). Un fil de conversation, la portée de la demande,
// une zone de saisie en bas et « Nouvelle conversation ». Composants Mantine
// sans réglage ; les textes lui arrivent traduits, les gestes remontent par
// les fonctions de rappel. Les numéros de blocs cités par Margo sont des liens.
import { Stack, Group, Text, Textarea, Button, Anchor, Loader } from '@mantine/core'

/**
 * @param {object} p
 * @param {string} p.titre  nom de la zone pour les lecteurs d'écran
 * @param {Array<{ cle: string, etiquette: string, morceaux: Array<{ texte: string } | { lien: string, surClic: () => void, libelle: string }>, bilan?: string | null }>} p.messages
 * @param {string} p.accueil  quand le fil est vide
 * @param {string | null} p.enCours  ce que fait Margo (demande en cours), ou null
 * @param {string | null} p.erreur
 * @param {string} p.portee  « Sur la sélection » ou « Sur tout le texte »
 * @param {{ libelle: string, valeur: string, surChange: (v: string) => void, surEnvoi: () => void, envoyer: string, desactive: boolean }} p.saisie
 * @param {{ libelle: string, surClic: () => void } | null} p.nouvelle
 */
/** Un texte avec ses retours à la ligne (les réponses de Margo sont en lignes). */
const avecRetours = (texte) =>
  String(texte)
    .split('\n')
    .flatMap((ligne, i) => (i ? [<br key={i} />, ligne] : [ligne]))

export function PanneauMargo({ titre, messages, accueil, enCours, erreur, portee, saisie, nouvelle }) {
  const envoyer = (evenement) => {
    evenement.preventDefault()
    if (!saisie.desactive) saisie.surEnvoi()
  }
  return (
    <Stack component="section" aria-label={titre}>
      {messages.length ? (
        <Stack component="ol" aria-live="polite" aria-relevant="additions">
          {messages.map((m) => (
            <Stack component="li" key={m.cle}>
              <Text>{m.etiquette}</Text>
              <Text>
                {m.morceaux.map((x, i) =>
                  'lien' in x ? (
                    <Anchor key={i} component="button" type="button" onClick={x.surClic} aria-label={x.libelle}>
                      {x.lien}
                    </Anchor>
                  ) : (
                    <span key={i}>{avecRetours(x.texte)}</span>
                  ),
                )}
              </Text>
              {m.bilan ? <Text>{m.bilan}</Text> : null}
            </Stack>
          ))}
        </Stack>
      ) : (
        <Text>{accueil}</Text>
      )}
      {enCours ? (
        <Group role="status">
          <Loader />
          <Text>{enCours}</Text>
        </Group>
      ) : null}
      {erreur ? <Text role="alert">{erreur}</Text> : null}
      <form onSubmit={envoyer}>
        <Stack>
          <Text>{portee}</Text>
          <Textarea
            label={saisie.libelle}
            value={saisie.valeur}
            onChange={(e) => saisie.surChange(e.currentTarget.value)}
            onKeyDown={(e) => {
              // Entrée envoie ; Maj+Entrée va à la ligne.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) envoyer(e)
            }}
          />
          <Group>
            <Button type="submit" disabled={saisie.desactive}>
              {saisie.envoyer}
            </Button>
            {nouvelle ? (
              <Button type="button" onClick={nouvelle.surClic}>
                {nouvelle.libelle}
              </Button>
            ) : null}
          </Group>
        </Stack>
      </form>
    </Stack>
  )
}
