# Audit partiel avant fusion (2026-11-09)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 57016 signes envoyés, 1730 reçus (et 1581 de réflexion) ; réflexion `low` ; 9 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `3f8beee` (2 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Diff très court : un paragraphe dans l'ADR 0008 et un nouveau picto SVG dans `v2/design/picto/`. Le placement dans la couche design et l'usage de `currentColor` respectent l'ADR 0008 et la règle 17. Deux points de vigilance : les valeurs graphiques du SVG vivent hors du mécanisme `reglages.js` / `feuilles/` prévu par la règle 18, et l'actif est ajouté sans emploi décidé ni contrat associé.
## Constats
1. **[question]**, grille 1/9 (design), `v2/design/picto/amend-ink.svg:1` — Le picto est un élément d'apparence dans `v2/design/`, ce qui est conforme, mais il porte des valeurs de design (épaisseurs de trait aux lignes 3-6, cadrage `viewBox` ligne 1) hors du seul mécanisme prévu par la règle 18 et l'ADR 0008 (`reglages.js` ou `design/feuilles/` avec clé de réglage). L'ADR documente le choix de la variante par Sylvain, mais pas ces valeurs-là ; je ne sais pas si le lint et le contrat statique `contrats/statiques/design-decide.test.js` couvrent ce fichier ou l'ignorent. À vérifier auprès de Claude : le picto passe-t-il le lint, et faut-il l'exclure explicitement du contrat ?
2. **[mineur]**, grille 4 (simplicité), `v2/design/picto/amend-ink.svg:1` — L'actif est ajouté alors que son emploi (bouton, onglet, icône) et sa taille « restent à décider » (`v2/adr/0008-design.md:31`) : rien ne l'utilise dans ce diff. Ce n'est pas bloquant (c'est une décision documentée de Sylvain, pas une option « au cas où » de Claude), mais je propose de noter dans le plan de l'étape 6 le premier emploi concret, pour que le picto ne reste pas un actif orphelin.
## Points de grille sans remarque
2, 3, 5, 6, 7, 8, 10 (pas de code applicatif, de dépendance, de texte ni de traduction dans ce diff ; grille 10 sans objet).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides

## Réponse de Claude

1. **Juste en partie, précisé.** Le lint ne lit que les `.js`, `.mjs` et `.jsx`, et le contrat `design-decide` que les feuilles de style : le SVG passe les deux sans exclusion à ajouter. Ses valeurs ne sont pas des réglages de Mantine mais le dessin même, choisi par Sylvain sur le canevas (variante 3h, recadrée, 08/11/2026). L'ADR 0008 le dit désormais : le fichier est la référence, aucune de ses valeurs ne change sans nouvelle décision. Il ne porte aucune couleur (`currentColor`).
2. **Juste, noté.** L'emploi du picto devient le point ouvert 4 de l'ADR 0008, à traiter avec le travail sur l'interface.

## Arbitrage de Sylvain

(À compléter.)
