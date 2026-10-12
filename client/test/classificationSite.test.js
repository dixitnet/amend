// Ce qu'un robot qui n'exécute pas le JavaScript voit d'amend.ink
// (03/10/2026).
//
// L'application est une page d'une seule balise vide, remplie par du
// JavaScript. Les filtres web d'entreprise et de Wi-Fi public rangent dans
// « non catégorisé » — donc bloquent — un site récent dont ils ne lisent
// rien : trois invités se sont heurtés à ce blocage. Ces tests vérifient ce
// qu'on peut garantir depuis le dépôt : un titre et une description, un
// texte lisible sans script, des pages légales avec un contact, un
// robots.txt qui laisse passer, et les bons types MIME pour les servir.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..')
const lire = (...p) => readFileSync(join(racine, ...p), 'utf8')
const INDEX = lire('index.html')

test('le titre et la description disent ce qu’est le service', () => {
  const titre = /<title>([^<]+)<\/title>/.exec(INDEX)[1]
  assert.ok(titre.length >= 30, `titre trop court : ${titre}`)
  assert.match(titre, /amend\.ink/)
  assert.match(titre, /éditeur de texte collaboratif/)
  const desc = /<meta\s+name="description"\s+content="([^"]+)"/.exec(INDEX)
  assert.ok(desc, 'meta description absente')
  assert.ok(desc[1].length >= 80 && desc[1].length <= 200, `description de ${desc[1].length} signes`)
})

test('les données structurées sont du JSON valide et décrivent l’application', () => {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(INDEX)
  assert.ok(m, 'JSON-LD absent')
  const j = JSON.parse(m[1])
  assert.equal(j['@type'], 'SoftwareApplication')
  assert.equal(j.name, 'amend.ink')
  assert.equal(j.publisher.name, 'dixit.net')
})

test('le texte est lisible sans JavaScript, avec les pages légales et le contact', () => {
  const m = /<noscript>([\s\S]*?)<\/noscript>/.exec(INDEX)
  assert.ok(m, '<noscript> absent')
  assert.match(m[1], /éditeur de texte collaboratif/)
  assert.match(m[1], /href="\/mentions-legales\.html"/)
  assert.match(m[1], /href="\/confidentialite\.html"/)
  assert.match(m[1], /contact@dixit\.net/)
})

test('chaque page légale existe, dit qui édite et qui héberge, et donne un contact', () => {
  for (const f of ['mentions-legales.html', 'confidentialite.html']) {
    assert.ok(existsSync(join(racine, 'public', f)), `${f} absent de public/`)
    const html = lire('public', f)
    assert.match(html, /<html lang="fr">/)
    assert.match(html, /<title>[^<]+— amend\.ink<\/title>/)
    assert.match(html, /name="description"/)
    assert.match(html, /contact@dixit\.net/)
    assert.match(html, /dixit\.net/)
  }
  const legales = lire('public', 'mentions-legales.html')
  assert.match(legales, /Gandi/)
  // L'identité de l'éditeur (LCEN, art. 6) : forme, numéro, siège, président.
  assert.match(legales, /dixit\.net<\/strong>, société par actions simplifiée/)
  assert.match(legales, /SIREN : 812 063 188/)
  assert.match(legales, /209 boulevard Auguste Péneau, 44300 Nantes/)
  assert.match(legales, /Président et directeur de la publication : Sylvain Grisot/)
  const vie = lire('public', 'confidentialite.html')
  for (const mot of ['Mailgun', 'Anthropic', 'Gandi', 'CNIL', 'cookie']) assert.match(vie, new RegExp(mot, 'i'))
})

test('robots.txt laisse passer les robots, sauf l’API et les connecteurs', () => {
  const r = lire('public', 'robots.txt')
  assert.match(r, /^User-agent: \*$/m)
  assert.match(r, /^Allow: \/$/m)
  assert.match(r, /^Disallow: \/api\/$/m)
  assert.match(r, /^Disallow: \/mcp\/$/m)
  assert.doesNotMatch(r, /^Disallow: \/\s*$/m, 'un Disallow: / fermerait tout le site')
})

test('security.txt donne un contact et une date d’expiration valide', () => {
  const s = lire('public', '.well-known', 'security.txt')
  assert.match(s, /^Contact: mailto:contact@dixit\.net$/m)
  const exp = /^Expires: (.+)$/m.exec(s)
  assert.ok(exp, 'Expires absent')
  assert.ok(!Number.isNaN(Date.parse(exp[1])), `date invalide : ${exp[1]}`)
})

test('la page d’accueil publique porte les liens légaux et le contact', () => {
  const home = lire('src', 'home.js')
  assert.match(home, /\/mentions-legales\.html/)
  assert.match(home, /\/confidentialite\.html/)
  assert.match(home, /mailto:contact@dixit\.net/)
})

test('le serveur sert les .txt en texte, pas en flux binaire', () => {
  const serveur = readFileSync(join(racine, '..', 'server', 'statique.js'), 'utf8')
  assert.match(serveur, /'\.txt':\s*'text\/plain; charset=utf-8'/)
})
