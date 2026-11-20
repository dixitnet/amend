# Audit partiel avant fusion (2026-11-20)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 397605 signes envoyés, 2436 reçus (et 5960 de réflexion) ; réflexion `low` ; 23 s ; arrêt : stop
- Diff audité : `v2/` de `3747cf9` à `482d5b2` (4 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Diff très petit : une décision de design (premier niveau de l'arbre en gras), sa règle CSS dans `coquille.css`, un `className` posé dans le composant de présentation, et un test de pile. L'ensemble respecte les couches (la valeur vit dans le design, la clé dans l'ADR 0008) et est couvert par un test. Deux réserves : le sélecteur CSS structurel, fragile et sans rapport avec la convention `data-niveau` déjà utilisée dans la même feuille, et un léger décalage entre le sélecteur du test et celui de la règle.

## Constats
1. **[important]** Simplicité / robustesse — `v2/design/feuilles/coquille.css:78`. La nouvelle règle cible le premier niveau par un sélecteur structurel profond (`.amend-arbre-documents > div > .mantine-Group-root > button.mantine-NavLink-root .mantine-NavLink-label`), dépendant de l'imbrication interne des composants Mantine (Stack → div, Group, ordre des boutons), alors que la même feuille utilise déjà un attribut sémantique pour le même besoin (`coquille.css:70`, `.mantine-NavLink-root[data-niveau='1']`). Proposer de poser `data-niveau="1"` (ou une classe de rôle) sur les entrées de premier niveau dans `VoletDocuments.jsx`, et un sélecteur plat ; le test gagnerait en stabilité.
2. **[mineur]** Tests — `v2/contrats/pile/interface.test.js:200` et `v2/design/feuilles/coquille.css:78`. Le sélecteur du test (`> .mantine-Group-root > button .mantine-NavLink-label`, sans `.mantine-NavLink-root`) ne vérifie pas exactement la règle CSS : un bouton du `Group` qui ne serait pas une racine NavLink (le menu « … » s'il précède le lien dans le DOM) satisferait le test sans être couvert par la règle. Aligner le sélecteur du test sur celui de la règle (ou mieux, sur le `data-niveau` du constat 1).
3. **[question]** Correction — `v2/design/feuilles/coquille.css:76-77`. Le commentaire promet qu'« un document posé à ce niveau (résultat d'une recherche) reste en graisse ordinaire », garanti seulement si un document de premier niveau est rendu comme `a` et non `button.mantine-NavLink-root`. Je n'ai pas le rendu de `Entree` sous la main pour vérifier ; si un résultat de recherche peut être un `button` NavLink au premier niveau, il serait gras contrairement à la décision. À vérifier (et le test ne couvre pas ce cas).

## Points de grille sans remarque
1 (couches), 2 (API publique), 3 (redondance), 5 (sécurité), 7 (couverture, hors constats 2-3), 8 (exports), 9 (traductions), 10 (licences).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides

## Réponse de Claude

1. **Juste, corrigé.** Les espaces et dossiers du premier niveau portent l'attribut `data-amend-premier-niveau` (`VoletDocuments.jsx`), et la règle est un sélecteur plat sur cet attribut.
2. **Juste, corrigé.** Le test emploie le même sélecteur que la règle.
3. **Vérifié.** Un document est rendu comme un lien (`a`) ou un `div` (corbeille), jamais comme un bouton ; et seule la branche « dossier ou espace » de `Entree` pose l'attribut : un document de premier niveau reste en graisse ordinaire, par construction.

Après corrections : `npm run format:check`, `npm run lint`, `npm test` au vert ; pile de l'interface repassée.

## Arbitrage de Sylvain

(À compléter.)
