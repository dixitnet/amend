import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CadreDesign } from '../../design/index.js'
import { App } from './App.jsx'

/** L'apparence de l'instance (back-office) : celle par défaut jusqu'à la
 * lecture de la configuration. */
function Racine() {
  const [apparence, setApparence] = useState(null)
  return (
    <CadreDesign apparence={apparence}>
      <App surApparence={setApparence} />
    </CadreDesign>
  )
}

createRoot(document.getElementById('racine')).render(<Racine />)
