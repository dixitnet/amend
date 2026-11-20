# Audit partiel avant fusion (2026-11-20)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 407964 signes envoyés, 3281 reçus (et 5339 de réflexion) ; réflexion `low` ; 40 s ; arrêt : stop
- Diff audité : `v2/` de `f68e443` à `11ba3cd` (6 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff ajoute l'ouverture du volet « Commentaires » et le défilement vers le fil choisi lors d'un clic sur un passage commenté, avec son réglage de design (`css.commentaires.filChoisi`) correctement inscrit dans l'ADR 0008 et porté par la feuille avec sa clé. Le principal point faible est que l'adaptateur BlockNote s'appuie désormais sur des noms de classes CSS internes de BlockNote (`.bn-thread-mark`, `.bn-thread.selected`) pour détecter le clic et trouver la carte, ce qui contourne l'API publique et fragilise les montées de version. Le reste (test de pile étoffé, feuille de style, ADR) est cohérent avec les règles.

## Constats
1. **[important]** grille 2 (API publique), `v2/adaptateurs/blocknote/index.jsx:650` et `v2/adaptateurs/blocknote/index.jsx:667` — L'adaptateur cible des classes CSS internes de BlockNote : `querySelector('.bn-thread.selected')` et `e.target.closest?.('.bn-thread-mark')`. Ce ne sont pas des points d'extension publics documentés ; un changement de classe dans une version 0.x cassera silencieusement l'ouverture du volet et le défilement (le code « renonce sans rien dire », ligne 645). Proposer : vérifier si l'état des commentaires (`CommentsExtension.store`, déjà utilisé ligne 641) offre un moyen public de savoir qu'un clic a choisi un fil, sinon épingler ces classes par un test de contrat BlockNote qui échoue à la montée de version, et le noter dans `docs/v2-veille.md`.
2. **[question]** grille 2, `v2/adaptateurs/blocknote/index.jsx:638` — `fils?.element` : le membre `element` de l'objet `fils` est-il une API publique documentée de la barre latérale de fils de BlockNote, ou un détail d'implémentation ? Si c'est le second cas, même fragilité que le constat 1 ; à vérifier dans la documentation avant de valider.
3. **[mineur]** grille 6 (cas limite), `v2/adaptateurs/blocknote/index.jsx:653` — Le second passage (`setTimeout(…, 400)`) re-déclenche un `scrollIntoView` 400 ms après le premier : si la personne a commencé à faire défiler la liste entre-temps, la liste lui échappe. Proposer de ne faire le second passage que si la carte n'est plus visible, ou de l'abandonner.
4. **[mineur]** grille 7 (tests), `v2/contrats/pile/relecture.test.js:602` et `v2/contrats/pile/relecture.test.js:619` — Le test repose sur des délais fixes (`attendre(1800)`) calés sur les 20 × 100 ms de l'adaptateur, et vérifie seulement que le fond du fil choisi diffère du fond ordinaire, pas la couleur décidée (`--mantine-primary-color-light`). Sur une machine lente, le renoncement silencieux de l'adaptateur (2 s de recherche) peut faire échouer le test sans que le défaut soit celui annoncé. Proposer d'attendre une condition (carte visible) plutôt qu'un délai, et de vérifier la valeur de la couleur de fond.
5. **[question]** grille 1 (couches), `v2/adaptateurs/blocknote/index.jsx:648-657` — La fonction `montrerLaCarte` pilote le défilement d'une liste rendue hors de l'éditeur (le volet de l'application), avec des constantes de temporisation (100 ms, 400 ms, 20 essais). C'est de la logique d'enchaînement d'écran qui pourrait relever de l'application ; son placement dans l'adaptateur est défendable (il faut connaître les classes de BlockNote), mais à confirmer avec Claude.

## Points de grille sans remarque
3, 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. **Juste, épinglé.** L'état public des commentaires dit quel fil est choisi, pas qu'un clic vient d'avoir lieu ; s'y fier seul rouvrait le volet sur d'autres changements et ne le rouvrait pas au second clic sur le même passage. Le clic se reconnaît donc à la classe du passage commenté, et la carte à la sienne. Ces classes sont déjà celles de notre feuille (`css.editeur.lecture`, `css.commentaires.cartes`) et de Docs. Un contrat les épingle (`contrats/statiques/fondations-suivi.test.js`) et la veille le note.
2. **Faux.** `fils` est un paramètre de notre adaptateur (`{ element, filtre }`, documenté dans son en-tête) : l'élément du volet où l'application fait placer la liste. Ce n'est pas un membre de BlockNote.
3. **Limite acceptée.** Le second passage a lieu 400 ms après le clic, sur la même carte, avec `block: 'nearest'` : il ne bouge rien si la carte est entière à l'écran. Il sert au cas, constaté, où la carte s'agrandit après avoir été choisie.
4. **Juste, corrigé.** Le test attend l'état voulu (volet ouvert, fil choisi et visible) au lieu d'un délai fixe, et vérifie que le fond de la carte est bien le fond clair de la couleur de l'interface.
5. **Placement maintenu.** L'application dit seulement « un fil est choisi » et ouvre le volet ; retrouver la carte demande les classes de BlockNote, qui ne sortent pas de son adaptateur (règle 2).

Après corrections : `npm run format:check`, `npm run lint`, `npm test` au vert ; pile de la relecture repassée.

## Arbitrage de Sylvain

(À compléter.)
