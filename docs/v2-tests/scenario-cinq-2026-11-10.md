# amend.ink v2 : scénario de relecture à cinq (10/11/2026)

Demande de Sylvain : « un test du fonctionnement de l'éditeur, des commentaires et du suivi de modification. Scénario simple, texte de 10 000 signes, 5 intervenants avec différents statuts. »

- Script : `v2/exploitation/campagne/scenario-cinq.mjs` (pile complète locale, Chromium, comme les tests T5). En ligne, le proxy de la session de Claude bloque les WebSocket : la collaboration en direct ne s'y essaie pas.
- Texte : 10 paragraphes, 9 958 signes, collés par la propriétaire.
- Intervenants : Paule (propriétaire), Edith (éditrice), Carla et Cyril (correcteurs), Lucie (lectrice), chacun dans son navigateur.

## Résultat (cinq exécutions)

| Étape | Résultat |
|---|---|
| Ouverture par les cinq | OK |
| Paule colle le texte ; il arrive chez les quatre autres | OK, en 0,2 s |
| Edith écrit directement ; tout le monde le voit, Lucie comprise | OK |
| Carla propose un ajout | OK, au nom de Carla dans le panneau de Paule |
| Cyril propose un remplacement | OK |
| Lucie ne voit ni suggestions ni panneau ; son texte ne bouge pas | OK |
| Lucie essaie d'écrire : rien ne change | OK |
| Carla commente un mot ; l'ancre se voit chez Paule et Edith, pas chez Lucie | OK |
| Edith répond au fil ; Paule voit deux messages et le résout ; Lucie ne lit pas les fils | OK |
| **Edith active le suivi des modifications** | **ÉCHEC dans 4 essais sur 5 : son écran devient blanc** |
| Paule accepte une à une la suggestion de Carla, refuse celle de Cyril | OK |
| « Tout accepter » | dépend de l'étape d'Edith |
| Les cinq ont le même texte ; il survit au rechargement | OK chez les quatre autres ; Edith, plantée, n'a plus le texte |

## Le défaut trouvé

- **Ce qui se passe** : un éditeur active le suivi des modifications peu après qu'un fil de commentaire a été **résolu** ; son éditeur est recréé en mode suggestion et plante (`[lib0/delta] diffing deletes unsupported`, levée par le calcul de l'affichage des suggestions de `@y/prosemirror` et `lib0`). La page devient blanche ; un rechargement la rétablit, le texte n'est pas perdu (les autres l'ont, il survit au rechargement).
- **Ce qui le déclenche** : sans commentaire, pas de plantage ; avec un commentaire non résolu, pas de plantage ; avec un fil résolu, plantage quand la bascule suit de près la résolution (quelques secondes plus tard, plus de plantage dans l'essai court). Un correcteur qui ouvre ensuite le document, ou qui le recharge, ne plante pas dans les essais faits.
- **Niveau** : une fondation (`@y/prosemirror` / `lib0`), sur ce que fait BlockNote quand un fil est résolu (il modifie la marque du commentaire dans le texte). À confirmer par un cas minimal hors d'amend.ink avant de le signaler en amont.

## Les autres défauts relevés

- **Accepter une à une la suggestion d'un éditeur** ne fait rien (« Tout accepter » marche) : déjà en veille, contourné par le scénario.
- **Une insertion au milieu d'un paragraphe s'affiche en deux lignes dans le panneau, mal découpées** : Carla insère « Note de Carla. » au milieu d'une phrase ; le texte est juste, mais le panneau montre « Carla ajoute « Note de Ca » » et « Carla ajoute « la.r » ». Probablement le découpage des suggestions par Yjs (veille) ; à reproduire seul.

## Ce que le scénario ne couvre pas

Réponse au fil et résolution passées par l'API, pas par l'interface ; Chromium et format L seulement ; frappe de robot (pas d'écriture simultanée au même endroit) ; historique et retour à une version non essayés.

## Ce qui a été corrigé en chemin

Dans le script : la touche Fin va au bout de la ligne affichée, pas du paragraphe ; le collage en texte brut ne fait pas de paragraphes. (Le premier de ces écarts a fait apparaître le défaut d'affichage d'une insertion en milieu de phrase.)
