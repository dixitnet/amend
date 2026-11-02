# Campagne de tests de l'interface d'édition (02/11/2026)

Question posée : l'éditeur d'amend.ink se comporte-t-il comme Google Docs (mode suggestion) dans toutes les configurations — suivi des modifications à plusieurs, commentaires, et surtout **sélectionner un ou plusieurs mots puis taper directement**, le texte sélectionné devant être remplacé par la frappe ?

## Méthode

- **Instance locale jetable** (`tools/instance-test.js`) avec quatre vrais comptes sur le même document : Alice (éditrice, propriétaire), Bruno (éditeur), Chloé (correctrice), Louis (lecteur). Partage par invitation, comme en vrai. Chacun a son propre Chromium (Playwright) ; on agit comme une personne : clic, double-clic, triple-clic, glisser à la souris, Maj+Ctrl+→, frappe au clavier, texte d'un bloc (le chemin de la dictée et de la saisie prédictive), **touche morte** (^ puis e → ê, par composition, comme sur un clavier de Mac), collage, Entrée, Ctrl+Z.
- **Oracle** : le geste fait sans suivi donne la référence. En suivi, on exige : l'ancien texte barré, le nouveau juste après, au nom de la bonne personne, le curseur derrière la frappe, une seule carte au panneau ; **« tout accepter » doit donner exactement le texte obtenu sans suivi**, **« tout rejeter » exactement le texte de départ** ; Ctrl+Z ramène au départ, Ctrl+Maj+Z refait ; les trois personnes connectées voient le même texte ; la console reste sans erreur.
- **Production** : les cas clés rejoués avec le compte de test de Claude (un seul auteur, deux onglets), dans le document « TEST — campagne éditeur ». Tous les écarts marqués « confirmé en production » ci-dessous s'y reproduisent à l'identique.
- **Volume** : matrice de **624 cas** (3 modes × 13 natures de sélection × 1 à 4 gestes × 8 saisies), **4 635 vérifications** ; **39 scénarios** à plusieurs et sur les commentaires (120 vérifications) ; deux endurances (frappe simultanée, touches mortes) ; 12 vérifications en production.

Les échecs dus à l'outil lui-même (touches enchaînées sans délai, triple-clic trop rapide, sélections mal posées) ont été vérifiés un par un au rythme d'une main, corrigés, et les cas rejoués ; ils ne figurent pas ci-dessous.

## Ce qui est conforme

1. **Sans suivi, tout est juste** : 208 cas, 745 vérifications, aucun échec — aucune marque parasite, remplacement exact, curseur au bon endroit.
2. **Remplacer une sélection dans un seul paragraphe, en suivi** (un mot, plusieurs mots, un bout de mot, début ou fin de paragraphe, gras partiel, titre, citation ; frappe, texte d'un bloc, collage) : barré puis ajout, au nom de la personne, une seule carte « remplacement », Ctrl+Z / Ctrl+Maj+Z, tout accepter / tout rejeter — conforme pour l'éditrice comme pour la correctrice.
3. **Synchronisation** : les trois personnes voient toujours le même texte (hors les deux défauts 5 et 6) ; aucune erreur de console sur 624 cas.
4. **Rôles** : la correctrice ne peut ni désactiver le suivi ni accepter ; le lecteur ne peut rien modifier ; un éditeur accepte ou rejette la proposition d'un autre depuis sa propre vue.
5. **À plusieurs** : supprimer son propre ajout l'efface vraiment, supprimer l'ajout d'un autre le barre ; taper dans l'ajout d'un autre ; Entrée en suivi puis rejet recolle les paragraphes ; deux personnes qui remplacent deux mots différents du même paragraphe en même temps ; tout accepter avec trois auteurs ; les propositions survivent au rechargement ; chacun garde son propre mode suivi ; Ctrl+Z ne défait que ses propres gestes ; typographie française (« : », guillemets) proposée en suivi ; Maj+Fin puis frappe.
6. **Commentaires** : vus de tous, y compris correctrice et lecteur (qui peuvent commenter, comme le rôle « commentateur » de Google Docs) ; réponse dans la marge ; résolution partout ; remplacer hors suivi un passage commenté garde le fil sur le nouveau texte ; taper au bord du passage ne l'étend pas ; commentaire sur deux paragraphes.

## Écarts — perte de texte ou de traçabilité

1. **Sélection puis Entrée, en suivi : le texte sélectionné est supprimé pour de bon.** Il n'est pas barré, n'apparaît pas au panneau, et « tout rejeter » ne le rend pas. Systématique (26 cas sur 26 : mot, mots, bout de mot, titre, citation, plusieurs paragraphes…). Confirmé en production. Pour la correctrice, le geste est refusé (rien ne se passe). Piste : `rewriteSplitForTracking` (`client/src/suivi/reecriture.js`) ne traite qu'une coupure sans sélection (`isPureSplitStep` exige `from === to`) ; avec une sélection, la réécriture renvoie `null` et la transaction d'origine passe hors suivi.
2. **Ctrl+A puis frappe, en suivi : aucune lettre n'apparaît.** Tout le document est barré, mais la frappe est perdue, dès la première lettre. Hors suivi, le même geste marche.
3. **Texte d'un bloc (dictée, saisie prédictive) sur une sélection qui va d'un titre à un paragraphe, ou d'un paragraphe à une citation : la fin du paragraphe est dupliquée.** Proposé : `du {+gris beau ce matin, dit-elle.+}[-salon.-]⏎[-Il fait-] beau ce matin, dit-elle.` ; une fois accepté, « beau ce matin, dit-elle. » figure deux fois. Éditrice et correctrice. Piste : `effacementMultiBloc` reprend comme « texte tapé » tout le texte de la tranche, qui contient aussi le reste du bloc que ProseMirror reconstruit.
4. **Collage sur une sélection qui va d'un paragraphe à une citation, en suivi : la sélection disparaît sans être barrée** (`du vert beau ce matin`). Refusé pour la correctrice.
5. **Deux personnes qui tapent au même endroit, en même temps, en suivi : des espaces entrent hors suivi.** 6 tours sur 6 en endurance. Avec la correctrice, c'est **8 tours sur 8, y compris quand l'autre personne tape ailleurs dans le paragraphe** : ses espaces entrent dans le texte sans proposition, et le serveur le signale lui-même (« un correcteur ne modifie le texte qu'en suivi de modifications »), sans le bloquer dans le mode par défaut `CORRECTEUR_ETANCHE=observer`. Taper contre l'ajout de quelqu'un, sans simultanéité, ne produit rien de tel. Hypothèse : chaque lettre tapée en suivi porte sa propre marque (horodatage par frappe), et la conversion ProseMirror ↔ Yjs de y-prosemirror perd la marque d'une espace quand une mise à jour distante arrive pendant la frappe.
6. **Vu une fois, non reproduit (48 essais ciblés) : une touche morte laisse un « ^ » dans le texte, puis la vue d'Alice décroche.** Après « tout accepter », Bruno et Chloé voient le texte accepté, Alice garde sa version, et ses modifications suivantes ne parviennent plus aux autres (aucune erreur en console). Rare, mais la conséquence — une personne qui écrit dans le vide sans le savoir — justifie de le garder en tête ; le scénario exact est dans le journal de la campagne (sélection au clavier en début de paragraphe, en suivi, ^ puis e).

## Écarts — résultat différent de Google Docs, sans perte

7. **Sélection sur plusieurs paragraphes, en suivi** : le nouveau texte se place **avant** le barré (alors que c'est « ancien barré, puis nouveau » dans un seul paragraphe, choix du 09/10), et **après acceptation la coupure de paragraphe reste** : `du blanc⏎ beau ce matin` au lieu de `du blanc beau ce matin`. Ordre inversé dans 62 cas sur 70, coupure restante après acceptation dans 69 sur 70 (deux et trois paragraphes, titre, citation). Confirmé en production.
8. **Remplacer un passage déjà barré par quelqu'un d'autre** : la suppression d'Alice passe au nom de Bruno ; rejeter la proposition de Bruno annule aussi celle d'Alice. Google Docs garde les deux propositions distinctes.
9. **Un commentaire disparaît quand on accepte la suppression ou le remplacement de son passage** (en suivi), ou quand Ctrl+Z retire le texte commenté. Google Docs garde le fil.
10. **La mise en forme en suivi (gras, Ctrl+B) est appliquée directement, sans proposition** pour un éditeur ; Google Docs propose « Format : gras ». (Pour la correctrice, elle est bien bloquée ou proposée.)
11. **Deux personnes qui remplacent le même mot en même temps : les lettres se mêlent** (`bloaunxc` pour « blanc » et « roux »), **hors suivi aussi**. Situation rare ; la cause est dans la reprise du curseur sur un passage supprimé, pas dans le suivi.
12. **Suppr. en fin de paragraphe (ou retour arrière en début) en suivi fusionne les paragraphes hors suivi.** C'est une limite assumée dans le code (« cette opération-là reste hors suivi »), mais Google Docs la propose.

## Écarts mineurs, ou à trancher

13. **Deux cartes au lieu d'un « remplacement »** quand on passe par une touche morte (ê, î, ô…), ou par retour arrière / Suppr. puis frappe (125 cas sur 126, confirmé en production). Google Docs les lit comme un seul remplacement. Fréquent au clavier français.
14. **Retour arrière lettre à lettre puis frappe** : le nouveau texte vient **avant** le barré (`{+roux+}[-noir-]`), alors que sélectionner puis taper donne `[-noir-]{+roux+}`. À trancher : garder la logique du curseur qui recule, ou aligner sur l'ordre « ancien, puis nouveau ».
15. **En suivi, taper sur un mot en italique perd l'italique** (hors suivi, il est conservé). Même chose pour un lien : le nouveau texte sort du lien.
16. **Raccourcis de Google Docs absents** : Ctrl+Alt+M (commenter), Ctrl+Alt+1…6 et Ctrl+Alt+0 (titres, paragraphe).

## Non couvert

Firefox et Safari (seul Chromium est disponible ici — à faire sur le Mac pour Safari), tactile et iPhone, méthodes de saisie asiatiques, notes de bas de page, listes et tableaux en suivi, images, exports après acceptation, coupures réseau (déjà couvertes par `tools/fuzz-collab.js`).

## Outils (dans `tools/campagne/`)

- `matrice.mjs` : la matrice « sélectionner puis taper » (`--filtre=<regex>`, `--rapide`, `--port`, `--sortie=fichier.json`) — environ 30 min.
- `scenarios.mjs` : les 39 scénarios à plusieurs et commentaires (`--filtre=<regex>`) — environ 1 min 15.
- `endurance.mjs` : frappe simultanée en suivi (`--tours`, `--qui=chloe,alice`) ; `composition.mjs` : touches mortes.
- `prod.mjs` : les cas clés en production, avec le compte de test (document « TEST — campagne éditeur »).
- `outils.mjs` : instance, comptes, partage, et les gestes d'une personne ; lecture du document sous la forme `texte [X-barré-] {X+ajouté+}` (X = initiale de l'auteur).

Prérequis : `npm ci` à la racine et dans `client/`, puis `npm run build:client`.
