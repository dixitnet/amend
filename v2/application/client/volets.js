// Les volets des formats M et L (docs/v2-formats-M-L.md), comme
// `usePanelCoordination.tsx` de Docs : sous le seuil (`etroit`, iPad en
// portrait), un seul volet à la fois ; le volet fermé d'office se rouvre
// quand on referme l'autre ; en passant à l'étroit avec les deux ouverts, le
// gauche se ferme, et se rouvre en repassant au large. Le volet gauche est
// ouvert au départ, sauf à l'étroit.
import { useEffect, useRef, useState } from 'react'

export function useVolets(etroit) {
  const [gauche, setGauche] = useState(!etroit)
  const [droite, setDroite] = useState(false)
  const auto = useRef({ gauche: false, droite: false })
  const precedent = useRef(etroit)
  useEffect(() => {
    if (etroit && !precedent.current && gauche && droite) {
      setGauche(false)
      auto.current.gauche = true
    }
    if (!etroit && precedent.current && auto.current.gauche) {
      setGauche(true)
      auto.current.gauche = false
    }
    precedent.current = etroit
  }, [etroit, gauche, droite])

  const ouvrirDroite = () => {
    setDroite(true)
    if (etroit && gauche) {
      setGauche(false)
      auto.current.gauche = true
    }
  }
  const fermerDroite = () => {
    setDroite(false)
    if (auto.current.gauche) {
      setGauche(true)
      auto.current.gauche = false
    }
  }
  const basculerGauche = () => {
    if (gauche) {
      setGauche(false)
      if (auto.current.droite) {
        setDroite(true)
        auto.current.droite = false
      }
    } else {
      setGauche(true)
      if (etroit && droite) {
        setDroite(false)
        auto.current.droite = true
      }
    }
  }
  return {
    gauche,
    droite,
    basculerGauche,
    basculerDroite: () => (droite ? fermerDroite() : ouvrirDroite()),
    ouvrirDroite,
  }
}
