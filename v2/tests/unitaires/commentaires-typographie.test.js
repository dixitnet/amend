// Les messages des commentaires reçoivent la typographie du document à l'envoi
// (adaptateurs/blocknote/commentaires.js) : l'éditeur des commentaires de
// BlockNote ne prend pas notre extension de frappe.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MagasinFils } from '../../adaptateurs/blocknote/commentaires.js'

const I = '\u00A0'
const F = '\u202F'

test('un message de commentaire part typographié ; le bloc et ses autres champs restent', async () => {
  const recu = []
  const service = {
    lister: async () => [],
    evenements: () => () => {},
    repondre: async (fil, corps) => (recu.push(corps), { id: 'c1' }),
  }
  const m = new MagasinFils(service, ['commenter', 'ecrire'], 'moi', false, 'fr')
  m.getThread = () => ({ comments: [{ id: 'c1' }] })
  await m.addComment({
    threadId: 'f1',
    comment: {
      body: [{ type: 'paragraph', props: {}, content: [{ type: 'text', text: 'Pourquoi "ici" ?', styles: {} }] }],
    },
  })
  const bloc = recu[0][0]
  assert.equal(bloc.content[0].text, `Pourquoi «${I}ici${I}»${F}?`)
  assert.deepEqual(bloc.props, {})
  assert.deepEqual(bloc.content[0].styles, {})
})
