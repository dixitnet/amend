# Audit partiel avant fusion (2026-11-12)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 208836 signes envoyés, 4720 reçus (et 12412 de réflexion) ; réflexion `low` ; 22 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `bc98752` (21 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le lot suit globalement les règles : réglages de design inscrits dans l'ADR 0008 et `reglages.js`, textes passés par les catalogues, pas de dépendance nouvelle. Les constats portent surtout sur la cohérence du nouveau comptage et du défilement vers une suggestion : `montrer` utilise une position d'une nature différente de celle des actions accepter/refuser, et `compterSuggestions` semble ne compter que les ajouts. Quelques points de test fragiles et deux questions (API publique, montage Mantine) complètent la revue.

## Constats
1. **[important]** grille 6 (correction), `v2/adaptateurs/blocknote/index.jsx:362` — `montrer: (s) => montrerPosition(editeur, s.debut)` utilise `s.debut`, la position brute du rendu Yjs, alors que `accepter`/`refuser` utilisent `s.plage.debut`, la position ProseMirror convertie (`listeDesSuggestions` distingue explicitement les deux, `v2/adaptateurs/blocknote/suggestions.js:183-184`). `domAtPos` attend une position ProseMirror : le défilement peut atterrir au mauvais endroit dès que le document s'écarte du cas trivial du test. Proposer `montrerPosition(editeur, s.plage.debut)`.
2. **[important]** grille 6 (correction), `v2/adaptateurs/blocknote/suggestions.js:199-216` — `compterSuggestions` ne compte que les entrées `insert` de chaîne portant une attribution ; une suggestion de pure suppression (ou une suppression marquée autrement qu'en `insert` attribué par le rendu) ne semble pas comptée, alors que `listeDesSuggestions` la compte : le nombre en pastille différera de la liste affichée en relecture. Vérifier sur un cas de suppression pure (le test `relecture.test.js:186` n'en pose pas) et corriger le parcours du delta.
3. **[mineur]** grille 6 (cas limite), `v2/adaptateurs/blocknote/suggestions.js:210-212` — tout insert non-chaîne (mise en forme, saut de bloc) remet `dansUnPassage` à faux : deux passages attribués séparés par un insert de format seront comptés pour deux, là où `listeDesSuggestions` peut n'en voir qu'un. Harmoniser la règle de découpage avec celle de la liste, ou le noter.
4. **[mineur]** grille 6 (cas limite), `v2/application/client/Edition.jsx:103` — `suggestionActive` n'est remise à zéro que quand la longueur de la liste change ; accepter une suggestion pendant qu'une autre arrive (longueur constante) laisse un indice actif pointant sur une autre carte. Réinitialiser aussi sur changement du contenu de la liste (clés), pas seulement de sa longueur.
5. **[mineur]** grille 7 (test fragile), `v2/contrats/pile/outils.mjs:154` — le sélecteur `li button[aria-label]:not([aria-label*=":"])` suppose que seuls les libellés « Accepter/Refuser de … » contiennent « : » ; un passage cité contenant « : » (fréquent en français : « il dit : ») exclura la carte du panneau lu par le test. Donner aux cartes un attribut de rôle (`data-amend-role="carte"`) plutôt que ce filtrage négatif.
6. **[question]** grille 2 (API publique), `v2/adaptateurs/blocknote/index.jsx:73` — `editeur.prosemirrorView.domAtPos` : `prosemirrorView` est-il un membre public documenté de BlockNote, ou un accès de commodité comparable à un membre privé ? Si ce n'est pas documenté, préférer un point d'entrée public (par exemple la commande de sélection de BlockNote) ou le signaler en amont.
7. **[question]** grille 6 (test qui ne vérifie pas tout), `v2/contrats/pile/relecture.test.js:211` — `window.scrollTo(0, 0)` ne remonte que la fenêtre ; si l'éditeur défile dans une zone interne (AppShell/ScrollArea), le test peut passer sans avoir réellement vérifié le défilement vers la suggestion. Vérifier quel conteneur défile et ancrer l'assertion dessus.
8. **[question]** grille 6, `v2/application/client/Edition.jsx:450` et `v2/application/client/Edition.jsx:99` — hors capacité `arbitrer` (le correcteur), `surSuggestions` n'est pas branché : la pastille reste à 0 alors que ses propres suggestions existent. Comportement voulu (la pastille compte les tâches de l'éditrice) ou oubli ? À confirmer avec Sylvain.
9. **[question]** grille 1/6, `v2/design/composants/Coquille.jsx:290` et `v2/design/composants/Coquille.jsx:355` — `AppShell.Section` est imbriqué dans `Tabs`, alors que Mantine le destine aux enfants directs de `AppShell` ; le montage fonctionne dans le test, mais c'est un usage hors du schéma documenté, fragile aux montées de version. Vérifier la documentation Mantine ; si besoin, appliquer la colonne flexible sur le `Tabs.Panel` plutôt que d'englober la `Section`.

## Points de grille sans remarque
3 (redondance amont), 5 (sécurité et droits), 8 (exports : le nouveau blanc Typst est testé, NFC inchangé), 9 (traductions : catalogues mis à jour, y compris `en.json` et `exceptions.json`), 10 (licences : aucune dépendance nouvelle).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides
- 8 : citations valides
- 9 : citations valides

## Réponse de Claude

1. *Faux* : `debut` et `plage.debut` sont tous deux des positions ProseMirror (`listeDesSuggestions` les lit dans `tr.doc`) ; `plage` ne diffère que pour un bloc entier proposé (position avant le bloc). `debut` désigne le texte lui-même, le bon point pour `domAtPos`.
2. *Faux* : le rendu des différences rend une suppression comme un `insert` de chaîne marqué `attribution: { delete: [...] }` (relevé dans la pile le 12/11/2026 : « Il » supprimé apparaît ainsi) ; elle est comptée. Un paragraphe supprimé garde son texte marqué, compté de même.
3. *Faux* : une mise en forme reste un `insert` de chaîne (avec `format`) et ne coupe pas le passage ; seuls les nœuds (blocs, sauts) le coupent, comme le changement de bloc dans `listeDesSuggestions`. Écart restant, noté dans le code : deux auteurs côte à côte comptent pour un.
4. *Juste*, corrigé : la carte active est oubliée dès que la liste change (empreinte des clés).
5. *Juste*, corrigé : les cartes portent `data-amend-carte`, que les tests lisent.
6. *Faux* : `editor.prosemirrorView` est un membre public de BlockNote, déjà utilisé par l'adaptateur (plan, sélection) ; BlockNote s'en sert lui-même dans `selectThread`, que l'on imite.
7. *Faux* : le texte défile avec la fenêtre (en-tête et volets fixes) ; l'assertion lit la position de la suggestion dans la fenêtre, après un retour en haut.
8. *Voulu* (choix de Claude, à confirmer par Sylvain) : le correcteur n'accepte ni ne refuse ; ses tâches sont les commentaires ouverts, comptés.
9. Déjà répondu (revue de 05 h 57, constat 3) : `AppShell.Section` est un simple bloc de Mantine, sans exigence de place.

## Arbitrage de Sylvain

(À compléter.)
