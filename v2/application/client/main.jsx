import { createRoot } from 'react-dom/client'
import { CadreDesign } from '../../design/index.js'
import { App } from './App.jsx'

createRoot(document.getElementById('racine')).render(
  <CadreDesign>
    <App />
  </CadreDesign>,
)
