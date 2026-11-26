# Audit partiel avant fusion (2026-11-26)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 464763 signes envoyés, 2497 reçus (et 6574 de réflexion) ; réflexion `low` ; 33 s ; arrêt : stop
- Diff audité : `v2/` de `7d6dc4c` à `4fffd41` (15 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le lot « surlignage » est bien placé : extension couche 3 dépendant seulement de BlockNote, adaptateur et design mis à jour avec leurs réglages décidés, i18n complet (fr et en), tests de pile et unitaires présents. Le code est sobre et respecte le graphe des dépendances et l'ADR 0008. Je relève surtout des points de correction mineurs (un cas limite d'export, un style devenu `{}`) et deux questions de couverture de test.

## Constats
1. **[question]**, grille 6, `v2/adaptateurs/blocknote/export.js:54` — `marquerExposants` retourne tel quel un contenu en ligne qui n'est pas un tableau ; un bloc dont `content` serait un objet unique (cas prévu par le modèle de BlockNote) garderait son style `surligne` dans les blocs transformés. Le `styleMapping` (`export.js:193`) couvre le PDF, mais le Markdown (`blocsPourMarkdown`) n'a peut-être pas d'équivalent. Vérifier ce cas et, s'il existe, appliquer le retrait avant la ligne 54.
2. **[mineur]**, grille 6, `v2/adaptateurs/blocknote/export.js:66` — pour un nœud de texte sans `styles`, l'ancien code laissait `styles` absent ; le nouveau écrit systématiquement `styles: {}` (via `sans`, ligne 56-57). Vérifier que l'exporteur et `blocsPourMarkdown` traitent `{}` comme l'absence de style ; sinon ne poser `styles` que s'il existait.
3. **[mineur]**, grille 4, `v2/adaptateurs/blocknote/palette.js:13-15` — `boutonsGardes` accepte désormais un objet seul ou un tableau ; seule la forme tableau est utilisée par l'adaptateur (`index.jsx:247-250`), la forme objet ne sert plus qu'aux tests (`tests/unitaires/blocknote-palette.test.js:40-42`). Simplifier en n'acceptant que le tableau et mettre les tests à jour.
4. **[question]**, grille 7, `v2/contrats/pile/editeur.test.js:681-696` — le contrat vérifie la couleur du surlignage en thème clair uniquement (`lime.2`) ; la variante sombre (`--mantine-color-lime-light`, `design/feuilles/editeur.css:195-197`), qui est un choix délibéré et fragile (translucide, nuance pleine écartée), n'est pas testée. Proposer une assertion en thème sombre, comme le fait la procédure (« clair et sombre »).
5. **[mineur]**, grille 9, `v2/contrats/pile/editeur.test.js:674` — le libellé « Surligner » est écrit en dur dans le test alors que le même test lit `fr.drag_handle.delete_menuitem` (ligne 719) pour ne pas dépendre des textes de BlockNote. Utiliser la clé du catalogue pour rester indépendant des traductions.

## Points de grille sans remarque
1, 2, 3 (partiellement couvert par A3), 5, 8, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. **Faux.** Dans le modèle de BlockNote, le contenu d'un bloc est une liste d'éléments en ligne, un tableau (`tableContent`) ou rien (`undefined`) : jamais un élément seul. Les trois cas sont traités ; le chemin Markdown passe tout entier par `marquerExposants`.
2. **Réponse.** Un texte en ligne de BlockNote porte toujours `styles` (un objet, vide s'il n'a pas de style) : `{}` est sa forme normale, et c'est ce que l'ancien code rendait déjà pour un texte sans style.
3. **Juste, corrigé.** `boutonsGardes` ne prend plus qu'une liste ; les essais sont à jour.
4. **Juste, corrigé.** L'essai de pile vérifie aussi le fond en sombre (`lime-light` de Mantine), différent de celui du clair.
5. **Juste, corrigé.** L'essai lit le libellé dans le catalogue (`document.surligner`).

## Arbitrage de Sylvain

(À compléter.)
