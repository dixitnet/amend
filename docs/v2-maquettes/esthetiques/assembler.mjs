import fs from 'node:fs'
const dir = 'dist/assets/'
const files = fs.readdirSync(dir)
const css = files.filter(f => f.endsWith('.css')).map(f => fs.readFileSync(dir + f, 'utf8')).join('\n')
const js = files.filter(f => f.endsWith('.js')).map(f => fs.readFileSync(dir + f, 'utf8')).join('\n').replace(/\uFFFD/g, '\\uFFFD')
const out = `<title>Esthétiques amend.ink</title>
<meta name="description" content="Scénarios d'évolution du design d'amend.ink, à comparer">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,600;1,400&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap">
<style>${css.replace(/<\/style/gi, '<\\/style')}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:200;background:var(--mantine-color-body)}
</style>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>
`
fs.writeFileSync('dist/maquette-esthetiques.html', out)
console.log(out.length)
