// Composant de présentation : le panneau des suggestions (disposition C,
// choix de Sylvain, 09/11/2026), une carte par suggestion avec Accepter et
// Refuser, et « Tout accepter », « Tout refuser » en tête. Chaque carte cite
// le passage (texte ajouté, texte supprimé, en `ins` et `del` comme BlockNote
// dans le texte), les boutons juste dessous, Accepter en vert, Refuser en
// rouge (Sylvain, 12/11/2026) ; cliquer la carte fait défiler le texte
// jusqu'à la suggestion (`surMontrer`), comme un commentaire. Composants
// Mantine ; ses textes lui arrivent traduits, les gestes remontent par les
// fonctions de rappel (l'indice de la carte). Hors relecture, une invitation
// (un texte et un bouton) remplace la liste. `actionsGlobales` : « Tout
// accepter », « Tout refuser » même sans carte. Sans `surAccepter`, la liste
// se consulte seulement : ni Accepter, ni Refuser, ni leurs variantes « Tout »
// (le correcteur voit tout, sans arbitrer ; Sylvain, 12/11/2026).
import { Stack, Group, Text, Button, Paper, UnstyledButton } from '@mantine/core'
import { REGLAGES } from '../reglages.js'

/** Le passage : ce qui est supprimé, puis ce qui est ajouté. */
const Passage = ({ passage }) => (
  <Text>
    {passage.avant ? <del>{passage.avant}</del> : null}
    {passage.avant && passage.apres ? ' ' : null}
    {passage.apres ? <ins>{passage.apres}</ins> : null}
  </Text>
)

export function PanneauSuggestions({
  titre,
  lignes,
  libelles,
  surAccepter,
  surRefuser,
  surMontrer,
  active,
  surToutAccepter,
  surToutRefuser,
  invitation,
  actionsGlobales = false,
}) {
  const { carte, pile, entete, auteur, boutons, accepter, refuser } = REGLAGES.suggestions
  const arbitre = Boolean(surAccepter)
  return (
    <Stack component="section" aria-label={titre}>
      {/* Pas de titre visible (« 45 suggestions » : le nombre est sur l'onglet ;
          Sylvain, 12/11/2026) : il nomme la section pour les lecteurs d'écran,
          et se lit seulement quand la liste est vide (« Aucune correction »). */}
      {!lignes.length && !invitation && !actionsGlobales ? <Text>{titre}</Text> : null}
      {invitation ? (
        <>
          <Text>{invitation.texte}</Text>
          {invitation.bouton ? (
            <Group>
              <Button onClick={invitation.surClic}>{invitation.bouton}</Button>
            </Group>
          ) : null}
        </>
      ) : null}
      {arbitre && (lignes.length || actionsGlobales) ? (
        <Group>
          <Button {...accepter} onClick={surToutAccepter}>
            {libelles.toutAccepter}
          </Button>
          <Button {...refuser} onClick={surToutRefuser}>
            {libelles.toutRefuser}
          </Button>
        </Group>
      ) : null}
      <Stack component="ol" className="amend-suggestions-liste">
        {lignes.map((l, i) => (
          <Paper component="li" key={l.cle} {...carte} data-active={active === i || undefined}>
            <Stack {...pile}>
              {/* L'auteur et les boutons sur une ligne, le passage dessous. */}
              <Group {...entete}>
                {/* Le nom aussi amène le texte à la suggestion (Sylvain, 12/11/2026) ;
                    au clavier, le passage dessous fait la même chose (hors de
                    la tabulation, le nom reste lu). */}
                <UnstyledButton onClick={() => surMontrer?.(i)} tabIndex={-1}>
                  <Text {...auteur}>{l.auteur}</Text>
                </UnstyledButton>
                {arbitre ? (
                  <Group {...boutons}>
                    {/* Un nom par ligne pour les lecteurs d'écran (audit du 10/11/2026). */}
                    <Button {...accepter} aria-label={libelles.accepterDe(l.texte)} onClick={() => surAccepter(i)}>
                      {libelles.accepter}
                    </Button>
                    <Button {...refuser} aria-label={libelles.refuserDe(l.texte)} onClick={() => surRefuser(i)}>
                      {libelles.refuser}
                    </Button>
                  </Group>
                ) : null}
              </Group>
              <UnstyledButton onClick={() => surMontrer?.(i)} aria-label={l.texte} data-amend-carte>
                {l.passage ? <Passage passage={l.passage} /> : <Text>{l.texte}</Text>}
              </UnstyledButton>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Stack>
  )
}
