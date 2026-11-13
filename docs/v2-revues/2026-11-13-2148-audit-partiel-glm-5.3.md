# Audit partiel avant fusion (2026-11-13)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 230519 signes envoyés, 2724 reçus (et 6561 de réflexion) ; réflexion `low` ; 12 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `da2e801` (8 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff retire l'essai « barre en bandeau » (code, feuille, réglage, ADR, tests) et le remplace par le masquage de la palette mobile pendant le défilement, piloté par un attribut `data-amend-defile` posé côté application et lu par la feuille du téléphone. Le retrait de l'essai est propre et cohérent (adaptateur, application, design, ADR, tests). Le nouveau mécanisme est simple et au bon niveau ; il reste des interrogations sur un import non visible et sur la portée réelle du test.

## Constats
1. **[question]** Grille 6 (correction), `v2/application/client/aidesEdition.jsx:71` — la fonction `useDefilementEnCours` utilise `REGLAGES.paletteMobile.reapparitionMs`, mais le diff ne montre aucun ajout d'import de `REGLAGES` (depuis `v2/design/reglages.js`) dans `aidesEdition.jsx`. Si l'import n'existe pas déjà, le code échoue ; s'il existe déjà, tout est en ordre. À vérifier (le lint le dirait, mais l'arête application → design est permise).
2. **[mineur]** Grille 7 (tests), `v2/contrats/pile/telephone.test.js:226` — le test intitulé « la palette flottante est cachée pendant le défilement » ne vérifie pas la palette réelle de BlockNote (qui ne se monte que clavier ouvert sous iOS), mais une `div` factice de même classe injectée dans `body` (lignes 232-237). Le commentaire l'annonce honnêtement, mais le contrat ne couvre donc que la règle CSS et l'attribut, pas le montage réel de la barre sur iPhone. Proposer, si un banc iOS existe, un essai réel en complément ; sinon noter la limite dans `docs/v2-veille.md`.
3. **[question]** Grille 3 (redondance avec l'amont), `v2/application/client/aidesEdition.jsx:63` — la règle 0 (« Comment Docs le fait-il ? ») demande que tout développement s'inspire de Docs et qu'un écart se justifie. Rien dans le diff ni dans l'ADR 0008 (ligne 155) ne dit si Docs masque sa barre mobile pendant le défilement ou comment il traite le suivi de la zone visible de Safari. Si Docs a une solution, on refait l'amont ; sinon, une phrase dans l'ADR suffirait à clore la question.
4. **[mineur]** Grille 6 (correction), `v2/application/client/aidesEdition.jsx:74-75` — l'écouteur `scroll` en capture sur `document` attrape aussi les défilements internes sans rapport avec la zone de l'éditeur (volets, menus déroulants de Mantine), ce qui cache la palette alors que le texte ne bouge pas. Comportement probablement acceptable au téléphone (un seul volet à la fois), mais à confirmer sur l'appareil ; sinon, restreindre l'écouteur à la zone qui défile.

## Points de grille sans remarque
1, 2, 5, 8, 9, 10 (couches et API publiques respectées : l'attribut est un nom de rôle sémantique, la feuille porte la clé du réglage ; pas de texte en dur, pas de dépendance nouvelle).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides

## Réponse de Claude

1. *Faux* : `aidesEdition.jsx` importe déjà `REGLAGES` (zoom, délai hors ligne) ; lint et tests passent.
2. *Juste, limite connue* : la barre mobile de BlockNote ne se monte que clavier ouvert (iOS) ; le test couvre la règle de la feuille et l'attribut, pas le montage réel. Il n'y a pas de banc iOS ici : le contrôle réel est l'essai de Sylvain sur iPhone (noté dans `docs/v2-veille.md`).
3. *Juste* : Docs n'a pas encore été lu sur ce point (annoncé à Sylvain, à faire avant l'étude de l'application à hauteur fixe). Le correctif d'aujourd'hui est volontairement minimal.
4. *Voulu, à confirmer sur l'appareil* : tout défilement cache la palette un instant ; au téléphone un seul volet est ouvert à la fois.

## Arbitrage de Sylvain

(À compléter.)
