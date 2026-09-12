export async function mountHome(root) {
  root.innerHTML = ''
  const wrap = document.createElement('div')
  wrap.className = 'home'

  const h1 = document.createElement('h1')
  h1.textContent = 'Amend'
  const subtitle = document.createElement('p')
  subtitle.className = 'subtitle'
  subtitle.textContent = 'Édition collaborative avec suivi des modifications et assistance IA.'
  wrap.append(h1, subtitle)

  const styleLink = document.createElement('a')
  styleLink.href = '#/style'
  styleLink.className = 'style-admin-link'
  styleLink.textContent = 'Mise en page →'
  wrap.appendChild(styleLink)

  const form = document.createElement('form')
  form.className = 'new-doc-form'
  const input = document.createElement('input')
  input.placeholder = 'Titre du nouveau document'
  input.required = true
  const submit = document.createElement('button')
  submit.textContent = 'Créer'
  submit.type = 'submit'
  form.append(input, submit)
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const res = await fetch('/api/docs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: input.value }),
    })
    const doc = await res.json()
    location.hash = `#/doc/${doc.id}`
  })
  wrap.appendChild(form)

  const list = document.createElement('ul')
  list.className = 'doc-list'
  wrap.appendChild(list)
  root.appendChild(wrap)

  const res = await fetch('/api/docs')
  const { docs } = await res.json()
  if (docs.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'doc-list-empty'
    empty.textContent = 'Aucun document pour le moment.'
    list.appendChild(empty)
  }
  for (const doc of docs) {
    const item = document.createElement('li')
    const link = document.createElement('a')
    link.href = `#/doc/${doc.id}`
    link.textContent = doc.title || 'Sans titre'
    const date = document.createElement('span')
    date.className = 'doc-date'
    date.textContent = new Date(doc.updatedAt).toLocaleString('fr-FR')
    item.append(link, date)
    list.appendChild(item)
  }
}
