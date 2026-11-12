# Audit partiel avant fusion (2026-11-12)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 232424 signes envoyés, 3229 reçus (et 9082 de réflexion) ; réflexion `low` ; 63 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `ad65d58` (10 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le lot met en œuvre deux décisions de Sylvain du 12/11 (ascenseur le long de l'éditeur, cartes de suggestions resserrées) et les traduit proprement dans le design, l'adaptateur et l'ADR. Le principal angle mort est le format téléphone : le bandeau y reste fixe, mais la marge d'ancrage qui compensait sa hauteur est retirée sans équivalent, ce qui réintroduit le défaut que le réglage `css.coquille.ancres` corrigeait. Le reste est de l'ordre du commentaire obsolète et de questions sur les points d'ancrage CSS de BlockNote.

## Constats
1. **[important]** Grille 6 (correction, cas limite) — `v2/design/feuilles/coquille.css:68-73`, `v2/adaptateurs/blocknote/plan.js:44-46`. Le défilement dans une zone n'est actif qu'à partir de 48 em ; au téléphone, c'est la page qui défile et `hautDeLaZone` rend 0. Or le bandeau du format S reste **fixe en haut** (réglage `css.telephone.bandeau`) : un titre passant dessous est encore compté courant, et `scrollIntoView` l'amène sous le bandeau — exactement le défaut que `css.coquille.ancres` (`scroll-margin-top`) corrigeait, réintroduit au téléphone. Proposer soit de garder une marge d'ancrage au format S, soit de rendre au téléphone le haut du bandeau à `titreCourant` (une constante du réglage téléphone, pas une valeur inventée).
2. **[mineur]** Grille 4 (code mort, commentaire faux) — `v2/adaptateurs/blocknote/plan.js:35-37`. Le commentaire dit que `scroll-margin-top` est « posée par la couche design sous un bandeau fixe », mais la règle correspondante est retirée dans ce même diff (`coquille.css` : retrait de `.bn-block-outer { scroll-margin-top: … }`) : `marge()` rend désormais toujours 0. Retirer la fonction et son commentaire, ou documenter qu'elle vaut 0 par défaut.
3. **[question]** Grille 2 (API publique) — `v2/design/feuilles/editeur.css:109-110`. Les variables `--user-color-light` et `--user-color-dark` et la classe `.bn-suggestion-mark` sont-elles des points d'ancrage publics et stables de BlockNote (Docs les utilise-t-il ainsi) ? Si elles relèvent d'un détail interne, une montée de version cassera le réglage sans contrat pour l'annoncer. À vérifier dans le code de Docs et, le cas échéant, à couvrir par un contrat statique ou de rendu.
4. **[mineur]** Grille 6 (comportement plus large que le besoin) — `v2/adaptateurs/blocknote/index.jsx:553`. L'écoute du défilement en capture sur `document` reçoit aussi les défilements des volets (ScrollArea), des palettes et de tout élément défilant, pas seulement celui du texte. Le garde-fou (anti-rebond de 200 ms) limite le coût, mais un filtre sur `event.target` (la zone ou l'élément défilant du texte) serait plus juste.
5. **[mineur]** Grille 7 (fragilité de test) — `v2/contrats/pile/interface.test.js:55`, `v2/contrats/pile/relecture.test.js:211`. Les tests de pile dépendent du nom de classe `.amend-coquille-defilement`, détail d'implémentation du design ; un renommage silencieux dans `v2/design/` cassera des contrats de pile sans que le lien soit visible. Acceptable (les contrats peuvent tout importer), mais un commentaire dans `Coquille.jsx` notant que les tests s'y accrochent éviterait une casse incomprise.

## Points de grille sans remarque
2 (hors la question A3), 3, 5, 9, 10.

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. **Faux** : au téléphone, la page n'est pas dans l'AppShell (`PageEditionS.jsx`, bandeau `header.amend-bandeau` collant), donc `--app-shell-header-offset` n'y était pas défini et l'ancienne règle `css.coquille.ancres` y valait déjà 0. Le comportement du format S ne change pas ; ses tests de la pile passent (3 sur 3).
2. **Juste**, corrigé : `marge()` et son commentaire sont retirés de `plan.js`.
3. **Juste** sur le fond : ce sont des détails de la feuille de style de BlockNote, sans contrat public. Docs, lui, ne vise que `ins` et `[data-type='modification']`. Ajouté à la veille (`docs/v2-veille.md`) : vérifier ce réglage à chaque montée de BlockNote. Le test de relecture de la pile s'appuie déjà sur ces `ins`.
4. **Juste**, accepté tel quel : le défilement d'un volet recalcule le titre courant au plus une fois toutes les 200 ms, et rien n'est signalé si le résultat ne change pas (empreinte). Filtrer la cible ferait connaître à l'adaptateur la zone de la couche design.
5. **Juste**, corrigé : un commentaire dans `Coquille.jsx` signale que les tests de la pile s'appuient sur cette classe.

## Arbitrage de Sylvain

(À compléter.)
