// Composant de présentation : la page d'un document en format S (téléphone,
// vertical), d'après la maquette validée (docs/v2-format-S.md) : un bandeau
// fixe (volet gauche, titre, « Terminer » en modification, menu « … », volet
// droit tout à droite), le texte, deux tiroirs à onglets et, au besoin, un
// panneau plein écran (le partage). Mantine et Tabler tels quels ; réglages
// décidés dans design/feuilles/telephone.css (ADR 0008) ; textes traduits.
import { ActionIcon, Button, Drawer, Menu, Modal, NavLink, Tabs, Text, UnstyledButton } from '@mantine/core'
import { PictoDe } from '../pictos.jsx'
import { useEffect, useRef, useState } from 'react'
import { ElementsDeMenu, EtatConnexion, PictoCompte } from './Coquille.jsx'

/** Un tiroir à onglets, les deux de la même façon (Sylvain, 14/11/2026,
 * « harmoniser les volets gauche et droite avec une version réduite
 * uniquement avec picto », piste 1) : des onglets en pictos seuls sur toute la
 * largeur (nommés pour les lecteurs d'écran, nombre en pastille sur le picto),
 * et le nom de l'onglet ouvert en titre du tiroir. L'onglet ouvert peut être
 * piloté (`actif`, `surOnglet`). */
function Volet({ volet, position, ouvert, surFermer }) {
  const [local, setLocal] = useState(null)
  if (!volet) return null
  const valeur = volet.actif ?? local ?? volet.onglets[0]?.cle
  const titre = volet.onglets.find((o) => o.cle === valeur)?.libelle ?? volet.titre
  return (
    <Drawer opened={ouvert} onClose={surFermer} position={position} title={titre}>
      <Tabs value={valeur} onChange={volet.surOnglet ?? setLocal} className="amend-volet-onglets">
        <Tabs.List grow aria-label={volet.titre}>
          {volet.onglets.map((o) => (
            <Tabs.Tab
              key={o.cle}
              value={o.cle}
              aria-label={o.libelle}
              leftSection={<PictoCompte role={o.icone} nombre={o.nombre} />}
            />
          ))}
        </Tabs.List>
        {volet.onglets.map((o) => (
          <Tabs.Panel key={o.cle} value={o.cle}>
            {o.contenu}
          </Tabs.Panel>
        ))}
      </Tabs>
    </Drawer>
  )
}

/**
 * @param {{
 *   titre: string, surTitre?: () => void,
 *   libelles: { gauche: string, droite: string, actions: string, terminer: string, titre: string },
 *   etat: string, connexion?: string, mention?: string | null,
 *   enModification: boolean, surTerminer: () => void,
 *   menu: Array<{ cle: string, libelle: string, icone?: string, titre?: boolean, coche?: boolean, surClic?: () => void }>,
 *   piedMenu?: string, surOuvrirMenu?: () => void,
 *   voletGauche: { titre: string, onglets: Array<{ cle: string, libelle: string, icone: string, contenu: any }> },
 *   voletDroit?: { titre: string, nombre?: number, occupe?: boolean, onglets: Array<{ cle: string, libelle: string, icone: string, nombre?: number, contenu: any }>, actif?: string, surOnglet?: (cle: string) => void } | null,
 *   volet: 'gauche' | 'droite' | null, surVolet: (v: 'gauche' | 'droite' | null) => void,
 *   panneau?: { titre: string, contenu: any, surFermer: () => void } | null,
 *   editeur: any,
 * }} p
 */
export function PageEditionS({
  titre,
  surTitre,
  libelles,
  etat,
  connexion,
  mention,
  enModification,
  surTerminer,
  menu,
  piedMenu,
  surOuvrirMenu,
  voletGauche,
  voletDroit,
  volet,
  surVolet,
  panneau,
  editeur,
}) {
  // La hauteur du bandeau, pour la barre de mise en forme du téléphone, qui se
  // cale sous lui quand il est à l'écran (design/feuilles/telephone.css,
  // css.telephone.palette ; Sylvain, 12/11/2026).
  const bandeau = useRef(null)
  useEffect(() => {
    const el = bandeau.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const racine = document.documentElement
    const noter = () =>
      racine.style.setProperty(
        '--amend-bandeau-hauteur',
        // Sa place sous le haut de la page (marge de sécurité comprise), sans
        // dépendre du défilement au moment de la mesure.
        `${el.offsetHeight + (parseFloat(getComputedStyle(el).top) || 0)}px`,
      )
    const suivi = new ResizeObserver(noter)
    suivi.observe(el)
    noter()
    return () => {
      suivi.disconnect()
      racine.style.removeProperty('--amend-bandeau-hauteur')
    }
  }, [])
  const fermer = () => surVolet(null)
  return (
    <>
      <header className="amend-bandeau" data-connexion={connexion} ref={bandeau}>
        <ActionIcon aria-label={libelles.gauche} aria-expanded={volet === 'gauche'} onClick={() => surVolet('gauche')}>
          <PictoDe role="plan" />
        </ActionIcon>
        {/* L'état de la synchronisation (13/11/2026), entre le volet gauche et le titre, où était l'étoile. */}
        <EtatConnexion libelle={etat} connexion={connexion} />
        <div className="amend-bandeau-titre">
          {surTitre ? (
            <UnstyledButton onClick={surTitre} aria-label={libelles.titre}>
              <Text truncate="end">{titre}</Text>
            </UnstyledButton>
          ) : (
            <Text truncate="end">{titre}</Text>
          )}
        </div>
        {enModification ? <Button onClick={surTerminer}>{libelles.terminer}</Button> : null}
        <Menu onOpen={surOuvrirMenu}>
          <Menu.Target>
            <ActionIcon aria-label={libelles.actions}>
              <PictoDe role="autres" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <ElementsDeMenu elements={menu} pied={piedMenu} champPicto="icone" />
          </Menu.Dropdown>
        </Menu>
        {voletDroit ? (
          <ActionIcon
            className="amend-bandeau-volet-droit"
            aria-label={libelles.droite}
            aria-expanded={volet === 'droite'}
            onClick={() => surVolet('droite')}
          >
            <PictoCompte role="modifications" nombre={voletDroit.nombre} occupe={voletDroit.occupe} />
          </ActionIcon>
        ) : null}
      </header>
      <main>
        {mention ? <Text>{mention}</Text> : null}
        {editeur}
      </main>
      <Volet volet={voletGauche} position="left" ouvert={volet === 'gauche'} surFermer={fermer} />
      <Volet volet={voletDroit} position="right" ouvert={volet === 'droite'} surFermer={fermer} />
      {panneau ? (
        <Modal opened onClose={panneau.surFermer} title={panneau.titre} fullScreen>
          {panneau.contenu}
        </Modal>
      ) : null}
    </>
  )
}

/** Le plan d'un document : ses titres, en retrait selon le niveau. */
export function PlanDocument({ titres, vide, surChoix }) {
  if (!titres.length) return <Text>{vide}</Text>
  return titres.map((t) => (
    <NavLink
      key={t.id}
      component="button"
      className={`amend-plan-niveau-${t.niveau}`}
      label={t.texte}
      onClick={() => surChoix(t.id)}
    />
  ))
}
