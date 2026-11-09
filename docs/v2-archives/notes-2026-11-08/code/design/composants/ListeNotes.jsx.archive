// Composant de présentation : la liste des notes, en fin de document, en
// lecture (affichage B, décision de Sylvain). Composants Mantine sans réglage ;
// les styles du texte des notes rendus par leurs balises de sens.
import { Stack, Title, List } from '@mantine/core'

const BALISES = { bold: 'strong', italic: 'em', underline: 'u', strike: 's' }

function Morceau({ texte, styles }) {
  return Object.keys(BALISES)
    .filter((s) => styles?.[s])
    .reduceRight((contenu, s) => {
      const Balise = BALISES[s]
      return <Balise>{contenu}</Balise>
    }, texte)
}

/** @param {{ titre: string, notes: Array<Array<{ texte: string, styles: object }>> }} p */
export function ListeNotes({ titre, notes }) {
  if (!notes.length) return null
  return (
    <Stack component="aside">
      <Title order={2}>{titre}</Title>
      <List type="ordered">
        {notes.map((morceaux, i) => (
          <List.Item key={i}>
            {morceaux.map((m, j) => (
              <Morceau key={j} {...m} />
            ))}
          </List.Item>
        ))}
      </List>
    </Stack>
  )
}
