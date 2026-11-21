# Audit partiel avant fusion (2026-11-21)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 452125 signes envoyés, 4096 reçus (et 8797 de réflexion) ; réflexion `low` ; 16 s ; arrêt : stop
- Diff audité : `v2/` de `55ec325` à `fbe9f0f` (12 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot mêlant un correctif d'interaction (clic sur un passage commenté sous WebKit), la mise en page de la page de connexion (réglages décidés, ADR à jour) et un renvoi Caddy 301→308 avec son script et ses tests. L'ensemble respecte les couches et les réglages décidés ; le point le plus sensible est la course entre le clic et la sélection du fil dans l'adaptateur BlockNote, où le nouveau mécanisme peut ouvrir l'ancien fil. Quelques doutes sur des imports et des assertions de test à vérifier.

## Constats
1. **[important]** (6. Correction) `v2/adaptateurs/blocknote/index.jsx:673` — Dans `ouvrirSiChoisi`, `clic = 0` est remis à zéro dès qu'un `selectedThreadId` existe. Si un fil A était déjà sélectionné et que la personne clique sur la marque du fil B, le `setTimeout(…, 0)` peut s'exécuter avant que WebKit ne mette la sélection à jour : `selectedThreadId` vaut encore A, `choisir()` ouvre le fil A et `clic` est remis à 0, si bien que l'abonnement, appelé ensuite quand la sélection passe à B, ne fait plus rien. Le fil ouvert peut être le mauvais. Proposition : ne remettre `clic` à zéro que lorsque le fil choisi a changé depuis le geste (retenir l'identifiant au moment du clic), ou ne consommer le geste qu'au changement d'état.
2. **[question]** (6. Correction) `v2/adaptateurs/blocknote/index.jsx:669` — La fenêtre de 1000 ms (`FENETRE_DU_CLIC_MS`) : si la sélection du fil met plus d'une seconde à suivre le clic (machine lente, onglet en arrière-plan), le clic est silencieusement oublié et le volet reste fermé, sans aucun retour. Est-ce un comportement acceptable (le clic peut être refait) ou faut-il un essai supplémentaire ? À trancher avec Sylvain ou à tester.
3. **[question]** (6. Correction) `v2/design/composants/EcranSimple.jsx:27` — Le diff ajoute l'usage de `REGLAGES.connexion.*` dans `EcranSimple.jsx` (lignes 27, 31, 43, 47) mais ne montre pas d'import de `../reglages.js` dans ce fichier (les lignes 1 à 14 ne sont pas dans le diff). Si l'import n'existe pas déjà, le composant lève une erreur au rendu. À vérifier ; l'import est bien ajouté dans `EcranCourriel.jsx:7`.
4. **[mineur]** (7. Tests) `v2/contrats/pile/telephone.test.js:524` — Le test cherche un `h1` contenant « amend.ink » ; or `Connexion.jsx:33` ne passe `nomApplication` que hors développement (`config.dev ? null : …`). Si la pile tourne en mode développement, `marque` est `undefined` et `getComputedStyle(marque)` lève une erreur. À sécuriser (assertion préalable que la marque existe, ou commentaire sur la configuration attendue de la pile).
5. **[mineur]** (7. Tests) `v2/contrats/pile/telephone.test.js:547` — `assert.equal(s.largeur, 390, …)` lie le test à la largeur exacte du contexte `TELEPHONE` définie ailleurs ; si ce gabarit change, le test échoue pour une raison qui n'est pas le défaut qu'il veille. Proposer `s.largeur === s.ecran` (toute la largeur du contexte, quelle qu'elle soit).
6. **[mineur]** (4. Simplicité) `v2/design/feuilles/coquille.css:84` — `.amend-connexion .mantine-Container-root { padding-inline: 0 }` neutralise le `Container` que chaque écran (`EcranCourriel`, `EcranConnexion`) pose en son sein : deux `Container` imbriqués dont le second est annulé par une règle CSS. Plus simple : ne pas rendre de `Container` dans les écrans quand ils sont portés par `CadreConnexion` (ou retirer le `Container` de ces écrans, qui ne servent plus que là), ce qui évite la règle d'annulation.
7. **[mineur]** (9. Design/règle 18) `v2/adr/0008-design.md:188` — L'entrée `connexion.pile.gap` porte comme décision « proposé par Claude avec le point 1 », sans validation explicite de Sylvain, contrairement aux autres entrées du lot (« 1, 2, 3, 4 ok »). La règle 18 exige que chaque valeur soit une décision de Sylvain notée. À faire confirmer (ou rattacher au « 1, 2, 3, 4 ok » si Sylvain l'a couverte).

## Points de grille sans remarque
1, 2, 3, 5, 8, 10 (le renvoi 308 et le script `adresse.sh` sont couverts par `v2/tests/unitaires/changement-adresse.test.js:154`, y compris l'idempotence ; aucune dépendance nouvelle ; les textes passent par les catalogues).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides

## Réponse de Claude

1. **Juste, corrigé.** L'état d'avant le geste est retenu. Le volet s'ouvre quand le fil choisi **change** après le geste (c'est alors celui du passage cliqué) ; s'il n'a pas changé au bout de 250 ms, c'est que le passage cliqué est celui du fil déjà choisi, et le volet s'ouvre sur lui. Il ne s'ouvre plus jamais sur l'ancien fil pendant que la sélection tarde.
2. **Accepté tel quel.** Passé une seconde sans fil choisi, le geste est oublié et le clic se refait ; un essai de plus ne dirait pas mieux quoi ouvrir. Limite notée ici.
3. **Faux.** `EcranSimple.jsx` importait déjà `REGLAGES` (ligne 7, hors du diff) ; le lint et les tests de rendu le confirment.
4. **Juste, corrigé.** Le test s'arrête avec un message clair si la marque manque. En développement, elle est portée par l'entrée par un nom ; en ligne, par le lien par courriel.
5. **Juste, corrigé.** Le test compare la largeur du cadre à celle de l'écran du contexte.
6. **Juste, corrigé.** Les deux écrans ne posent plus de `Container` : le cadre de la page le fait seul, et la règle d'annulation est retirée.
7. **Question pour Sylvain**, posée avec la demande de fusion : l'espacement `xl` entre les deux blocs de la page ne se voit qu'en développement (entrée par un nom, puis lien par courriel) ; en ligne, la page n'a qu'un bloc.

Après corrections : `npm run format:check`, `npm run lint`, `npm test` (549) au vert ; pile de la relecture, du téléphone et des comptes repassée. Les trois moteurs passaient dans GitHub avec la première version du correctif (run 44905245119) ; la version corrigée après cet audit est revérifiée avant la fusion.

## Arbitrage de Sylvain

(À compléter.)
