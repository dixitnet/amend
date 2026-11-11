# Audit partiel avant fusion (2026-11-11)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 134053 signes envoyés, 3192 reçus (et 4770 de réflexion) ; réflexion `low` ; 15 s ; arrêt : stop
- Diff audité : `v2/` de `ac5ce23` à `077c6b9` (9 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse

Ce lot ajoute l'esthétique « Atelier » (vermillon, Source Serif 4, page sur plan de travail) conformément à l'ADR 0008 révisée : les valeurs sont dans la table, la feuille porte les clés de réglages, la licence OFL est jointe. L'architecture est respectée (design seul, contrats libres d'importer). Restent des doutes sur un prop d'esthétique que rien n'utilise encore, un effet de bord à l'import du module de design, et un test de pile dont l'attente dépend du réglage qu'il vérifie.

## Constats

1. **[question]** Grille 4 (option « au cas où ») — `v2/design/Cadre.jsx:43`. Le prop `esthetique` de `CadreDesign` ne semble servi par aucun appelant du diff : l'esthétique est un réglage d'instance (`reglages.js:29`) et le choix back-office est « plus tard » (ADR 0008). Si rien ne le passe aujourd'hui, c'est une option anticipée contraire à la sobriété ; à confirmer avec l'usage réel côté application.
2. **[mineur]** Grille 6 (cas limite) — `v2/design/Cadre.jsx:37` et `v2/design/Cadre.jsx:45`. `poser(REGLAGES.esthetique)` s'exécute à l'import du module, puis l'effet repose le nom du prop : si un prop différent de l'instance était passé, la racine porterait l'esthétique de l'instance jusqu'au premier effet (bref écart visuel), et resterait sur la dernière valeur après démontage. Proposer de ne poser l'attribut que dans le rendu/effet, ou de documenter que seul le réglage d'instance existe aujourd'hui.
3. **[question]** Grille 2 (API publique) — `v2/design/feuilles/esthetique-atelier.css:46`. Le sélecteur `.mantine-AppShell-main` repose sur le nom de classe généré par Mantine (préfixe `mantine-` configurable via `classNamesPrefix` du thème) ; c'est une classe d'implémentation plutôt qu'un point d'extension documenté. Vérifier si Mantine offre un sélecteur stable (attribut `data-mantine-*` ou prop `className` posée par nos composants de présentation, comme `data-amend-colonne`).
4. **[mineur]** Grille 7 (test qui ne vérifie pas ce qu'il annonce) — `v2/contrats/pile/pile.test.js:148-149`. Le contrat lit `REGLAGES.esthetique` pour construire son attente : si le réglage et le comportement déraillent ensemble, le test reste vert. Il vérifie bien la présence de l'attribut et la police attendue, mais une attente figée (« atelier » → Source Serif 4) serait plus robuste, ou un second cas avec `origine`.
5. **[question]** Grille 1/6 — `v2/design/feuilles/esthetique-atelier.css:46` et `v2/design/composants/Coquille.jsx:87`. La page grise s'applique à tout `AppShell.Main` contenant un `data-amend-colonne`, or `ColonneTexte` semble servir aussi la liste des documents (réglage `css.coquille.texte` : « la colonne du texte et de la liste »), alors que le réglage décidé `css.atelier.page` ne parle que de « la colonne du texte ». Vérifier les usages de `ColonneTexte` ; si la liste est concernée, c'est un écart avec la décision notée dans l'ADR 0008.
6. **[mineur]** Grille 4 — `v2/design/Cadre.jsx:35`. La garde `typeof document !== 'undefined'` protège d'un rendu serveur qui n'existe pas dans l'application (client navigateur uniquement) ; c'est du code défensif « au cas où ». La retirer ou la justifier.

## Points de grille sans remarque

3, 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides

## Réponse de Claude

Lot : esthétique « Atelier » en vermillon et couche d'esthétiques (décision de Sylvain du 11/11/2026). Contrôles après corrections : `lint` et `format:check` propres ; 311 tests rapides, 310 passés, 1 sauté (essai réel de Margo) ; 60 parcours de la pile, 59 passés, 1 sauté (idem). Rendu vérifié sur captures de l'application (L et M en clair et en sombre, S en clair et en sombre).

1. **Juste, corrigé.** La propriété `esthetique` de `CadreDesign` était une option anticipée : retirée. `CadreDesign` lit `REGLAGES.esthetique` ; le lot du back-office l'ajoutera s'il en a besoin.
2. **Juste, réglé par 1.** Sans propriété, il n'y a plus d'effet ni d'écart possible : l'attribut est posé une fois, au chargement, avec l'esthétique de l'instance.
3. **Faux.** Les classes `mantine-*` sont les « classes statiques » documentées de l'API de styles de Mantine, prévues pour être ciblées ; `classNamesPrefix` n'est pas réglé chez nous, et `coquille.css` les emploie déjà (`.mantine-AppShell-main`, `.mantine-NavLink-root`).
4. **Assumé.** Le contrat 5 vérifie que l'éditeur est dans le fournisseur de l'application ; l'attente suit l'esthétique de l'instance pour que le contrat reste juste quand l'instance en change (choix au back-office). Il vérifie séparément l'attribut posé et la police associée à chaque esthétique ; une régression du réglage seul (attribut absent, police d'une autre esthétique) le fait échouer.
5. **Faux.** `ColonneTexte` n'a qu'un appelant, l'éditeur (`application/client/App.jsx`, `<ColonneTexte>{editeur}</ColonneTexte>`) ; la liste des documents n'en use pas.
6. **Faux.** La garde sert : `tests/design/composants.test.js` rend `CadreDesign` sans navigateur (React côté serveur), où `document` n'existe pas. Commentaire ajouté dans `Cadre.jsx`.

Résumé : une correction (option anticipée retirée), rien de bloquant.

## Arbitrage de Sylvain

(À compléter.)
