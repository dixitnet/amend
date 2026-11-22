# Audit partiel avant fusion (2026-11-22)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 401689 signes envoyés, 2179 reçus (et 3631 de réflexion) ; réflexion `low` ; 9 s ; arrêt : stop
- Diff audité : `v2/` de `e2eee78` à `765f40a` (3 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Petit correctif cohérent : le glissement horizontal de la barre mobile de BlockNote ne doit plus masquer celle-ci pendant le défilement. Le découpage en couches est respecté (l'application importe l'adaptateur, la détection DOM vit dans l'adaptateur) et le test de pile couvre le nouveau comportement. Deux points méritent attention : la dépendance à une classe CSS de BlockNote qui n'est pas une API publique annoncée, et le fait que le contrat teste une barre factice plutôt que celle de BlockNote.

## Constats
1. **[question]** Grille 2 (API publique), `v2/adaptateurs/blocknote/palette.js:48` — `dansLaBarreMobile` s'appuie sur la classe `.bn-mobile-formatting-toolbar`, un détail de rendu de BlockNote plutôt qu'une API publique documentée ; une montée de version peut la renommer sans casser de contrat, et le défaut reviendait silencieusement (barre clignotante). Proposer de vérifier le statut de cette classe dans la documentation/l'amont, et de l'inscrire dans `docs/v2-veille.md` ou d'ajouter un contrat léger qui vérifie que la vraie barre de BlockNote porte bien cette classe.
2. **[mineur]** Grille 7 (tests), `v2/contrats/pile/telephone.test.js:245-256` — le test pose lui-même une fausse barre (commentaire ligne 245 : BlockNote ne monte la sienne que clavier ouvert), donc le nouveau comportement n'est vérifié que sur une imitation : ni la vraie classe de la barre, ni son vrai comportement de glissement ne sont couverts. C'est un compromis assumé et commenté, mais combiné au constat A1, la protection contre une régression amont est faible. Proposer, à la prochaine occasion, un test avec clavier virtuel ouvert (ou au minimum un contrat statique sur la classe).
3. **[mineur]** Grille 6 (cas limite), `v2/application/client/aidesEdition.jsx:72` — si un glissement de la barre déclenche aussi un défilement de la page (rebond iOS, barre posée sur le texte), l'événement dont la cible est dans la barre est ignoré et la page défile sans que la palette se cache ; cas improbable mais possible. À garder en tête lors des essais réels sur iPhone ; rien à changer tant qu'il n'est pas constaté.

## Points de grille sans remarque
1, 3, 4, 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides

## Réponse de Claude

1. **Déjà épinglé.** Le contrat `contrats/statiques/blocknote-mobile.test.js` (« BlockNote garde la barre mobile et les variables de la zone visible ») vérifie que la feuille publiée par BlockNote porte `.bn-mobile-formatting-toolbar` ; notre feuille du téléphone en dépend déjà (`css.telephone.palette`). Une montée de version qui renomme la classe y échoue.
2. **Compromis assumé.** La vraie barre ne se monte que clavier virtuel ouvert, que les navigateurs de test ne simulent pas (essai du 18/11/2026, noté dans le test). Le contrôle réel reste l'iPhone : demandé à Sylvain avec la fusion.
3. **Noté pour l'essai sur iPhone**, rien à changer tant que ce n'est pas constaté.

## Arbitrage de Sylvain

(À compléter.)
