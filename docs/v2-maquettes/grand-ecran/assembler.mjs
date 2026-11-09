import fs from 'node:fs'
const dir = 'dist/assets/'
const files = fs.readdirSync(dir)
const css = files.filter(f => f.endsWith('.css')).map(f => fs.readFileSync(dir + f, 'utf8')).join('\n')
const js = files.filter(f => f.endsWith('.js')).map(f => fs.readFileSync(dir + f, 'utf8')).join('\n').replace(/\uFFFD/g, '\\uFFFD')
const out = `<title>Maquette iPad et Mac</title>
<meta name="description" content="Maquette visuelle de l'interface iPad et Mac">
<style>${css.replace(/<\/style/gi, '<\\/style')}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:200;background:var(--mantine-color-body)}
</style>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>
`
fs.writeFileSync('dist/maquette-grand-ecran.html', out)
console.log(out.length)
