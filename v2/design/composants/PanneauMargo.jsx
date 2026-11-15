// Composant de présentation : l'onglet Margo (IA) du volet droit (étape 8,
// docs/v2-etape-8-plan.md). Un fil de conversation en bulles, comme un échange
// de SMS (Sylvain, 15/11/2026 : bulles, « Nouvelle conversation » dans un menu
// « … », portée au-dessus de la saisie, trois points pendant que Margo travaille),
// la portée de la demande et une zone de saisie en bas. Composants Mantine ; les textes lui arrivent traduits, les gestes remontent par
// les fonctions de rappel. Les numéros de blocs cités par Margo sont des liens.
import { useEffect, useRef } from 'react'
import {
  Stack,
  Group,
  Text,
  Textarea,
  Button,
  Anchor,
  Loader,
  Badge,
  Paper,
  Menu,
  ActionIcon,
  VisuallyHidden,
} from '@mantine/core'
import { PictoDe } from '../pictos.jsx'
import { REGLAGES } from '../reglages.js'

/**
 * @param {object} p
 * @param {string} p.titre  nom de la zone pour les lecteurs d'écran
 * @param {Array<{ cle: string, auteur: 'personne' | 'margo', etiquette: string, morceaux: Array<{ texte: string } | { lien: string, surClic: () => void, libelle: string }>, bilan?: string | null }>} p.messages
 * @param {string} p.accueil  quand le fil est vide
 * @param {string | null} p.enCours  ce que fait Margo (demande en cours), ou null
 * @param {string | null} p.erreur
 * @param {string} p.portee  « Sur la sélection » ou « Sur tout le texte »
 * @param {{ libelle: string, valeur: string, surChange: (v: string) => void, surEnvoi: () => void, envoyer: string, desactive: boolean }} p.saisie
 * @param {{ libelle: string, libelleMenu: string, surClic: () => void } | null} p.nouvelle  `libelleMenu` : le nom du bouton « … »
 * @param {boolean} [p.visible]  le volet montre ce panneau : à son ouverture, et à chaque
 *   nouvel échange, la fin de la conversation et la saisie sont amenées à l'écran
 */
/** Un texte avec ses retours à la ligne (les réponses de Margo sont en lignes). */
const avecRetours = (texte) =>
  String(texte)
    .split('\n')
    .flatMap((ligne, i) => (i ? [<br key={i} />, ligne] : [ligne]))

export function PanneauMargo({ titre, messages, accueil, enCours, erreur, portee, saisie, nouvelle, visible = true }) {
  // Le bas de l'échange, amené à l'écran à l'ouverture du volet et à chaque
  // message (Sylvain, 13/11/2026).
  const fin = useRef(null)
  useEffect(() => {
    if (visible) fin.current?.scrollIntoView({ block: 'end' })
  }, [visible, messages.length, enCours])
  const envoyer = (evenement) => {
    evenement.preventDefault()
    if (!saisie.desactive) saisie.surEnvoi()
  }
  return (
    <Stack component="section" aria-label={titre} {...REGLAGES.margo.section}>
      {nouvelle ? (
        <Group {...REGLAGES.margo.menu}>
          <Menu>
            <Menu.Target>
              <ActionIcon aria-label={nouvelle.libelleMenu}>
                <PictoDe role="autres" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={nouvelle.surClic}>{nouvelle.libelle}</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      ) : null}
      {messages.length ? (
        <Stack component="ol" aria-live="polite" aria-relevant="additions" {...REGLAGES.margo.fil}>
          {messages.map((m) => {
            const mienne = m.auteur === 'personne'
            return (
              <Stack component="li" key={m.cle}>
                <VisuallyHidden>{m.etiquette}</VisuallyHidden>
                <Paper
                  {...REGLAGES.margo.bulle.commune}
                  {...(mienne ? REGLAGES.margo.bulle.personne : REGLAGES.margo.bulle.margo)}
                >
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
                </Paper>
              </Stack>
            )
          })}
        </Stack>
      ) : (
        <Text>{accueil}</Text>
      )}
      {enCours ? (
        <Paper role="status" {...REGLAGES.margo.bulle.commune} {...REGLAGES.margo.bulle.margo}>
          <VisuallyHidden>{enCours}</VisuallyHidden>
          <Loader {...REGLAGES.margo.attente} aria-hidden="true" />
        </Paper>
      ) : null}
      {erreur ? <Text role="alert">{erreur}</Text> : null}
      <form onSubmit={envoyer}>
        <Stack>
          <Group>
            <Badge {...REGLAGES.margo.portee}>{portee}</Badge>
          </Group>
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
          </Group>
        </Stack>
      </form>
      <div ref={fin} />
    </Stack>
  )
}
