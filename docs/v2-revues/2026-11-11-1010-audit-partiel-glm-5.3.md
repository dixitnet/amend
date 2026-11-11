# Audit partiel avant fusion (2026-11-11)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 269211 signes envoyés, 4183 reçus (et 25621 de réflexion) ; réflexion `low` ; 38 s ; arrêt : stop
- Diff audité : `v2/` de `ac5ce23` à `d4694f9` (50 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Diff d'entretien et de durcissement : partage d'une réserve PostgreSQL, lien magique en deux temps (GET inoffensif, POST consommant), garde « une demande Margo à la fois », imports dynamiques soumis au lint, plusieurs correctifs de conditions d'erreur. L'ensemble est bien testé et respecte le graphe des couches. Deux points méritent attention : un plafond mémoire contredit par la mesure portée dans son propre commentaire, et un réglage de design de l'ADR 0008 dont la réalisation CSS a été retirée sans que la table soit mise à jour.

## Constats
1. **[important]** grille 6 (correction / exploitation), `v2/exploitation/prod/amend-v2.service:22` — Le commentaire ajouté aux lignes 17-21 mesure 211 Mo après la lecture d'un livre de 513 000 signes, alors que `MemoryMax=200M` (ligne 23) reste en vigueur : le service sera tué par systemd (OOM) sur un livre de cette taille, coupant la demande Margo en cours. Le commentaire dit les plafonds « à revoir après une mesure sur le VPS », mais la mesure existe déjà et dépasse. Proposer : relever MemoryHigh/MemoryMax maintenant (ou borner la taille lue), et garder la revue VPS pour l'ajustement fin.
2. **[important]** grille 1 / 9 (design, ADR à jour), `v2/design/feuilles/coquille.css:24` — La règle `css.coquille.volets` de l'ADR 0008 décrit « titre “ Relecture ” en graisse 500 ; bouton “ Nouveau document ” sur toute la largeur », mais le diff retire précisément `.amend-coquille-volet-tete h2 { font-weight: 500 }` et `.amend-coquille-volet-bouton { width: 100 % }` (lignes retirées sous la ligne 24). Si ces réglages ont été déplacés (Mantine, `reglages.js`), la table de l'ADR 0008 doit le dire ; sinon le réglage décidé a été perdu. Proposer : vérifier où vit désormais ce réglage et mettre la table de l'ADR 0008 (et le contrat `design-decide.test.js`) en concordance.
3. **[question]** grille 7 (tests), `v2/tests/unitaires/i18n.test.js:12` — Le test importe `libelleDuRole` et `libelleDuRoleEquipe` de `v2/i18n/index.js`, mais aucun changement de ce fichier n'apparaît dans le diff. Si ces exports n'existent pas déjà, le test échoue ; s'ils existent, rien à dire. À vérifier avant fusion.
4. **[mineur]** grille 6 (cas limite), `v2/exploitation/dev/pile.mjs:102` — Le journal capturé concatène des morceaux (`journaux[nom] + d`) : une frontière de morceau peut couper un caractère UTF-8 multi-octets, rendant un passage du journal illisible (les messages français contiennent des accents). Proposer : accumuler des `Buffer` et décoder en une fois à la lecture (`journaux()`).
5. **[mineur]** grille 3 / 11 (veille), `v2/tests/unitaires/blocknote-serveur.test.js:99` — Le test documente un comportement « à signaler » (Margo ne voit pas le texte des tableaux, `blocsATexteDe` saute les cellules), mais rien dans le diff n'ajoute l'entrée correspondante dans `docs/v2-veille.md` (règle § 4.3 : un défaut de fondation se signale en amont et se note dans la veille). Proposer : ajouter la ligne dans la veille avec le ticket amont à ouvrir.
6. **[question]** grille 6 (cas limite), `v2/application/serveur/comptes.js:427` — `donnerAcces` délègue désormais à `modifierAcces` et peut rendre `'dernier-proprietaire'` (silencieusement ignoré ici, dans le flux des invitations à la connexion). Le cas (la seule propriétaire du document reçoit une invitation à un rôle inférieur) est improbable mais produit un no-op sans trace. À trancher : journaliser le code rendu, ou l'ignorer explicitement avec un commentaire.
7. **[question]** grille 2 (API publique), `v2/adaptateurs/yhub/index.js:171` — `postgresOptions: { max: … }` est passé à `createYHub` : je ne peux pas vérifier dans ce diff que c'est une option publique documentée de y/hub (règle 2, seulement l'API publique). Si c'est bien documenté, rien à faire ; sinon, le noter dans le contrat y/hub.
8. **[mineur]** grille 4 (simplicité), `v2/i18n/fr.json:98` — La clé `trop-de-flux` (et son pendant anglais) est ajoutée sans qu'aucun usage n'apparaisse dans le diff. Si elle sert à un écran existant, rien à dire ; sinon c'est une clé « au cas où ». À vérifier (le test de complétude ne détecte pas les clés mortes).

## Points de grille sans remarque
2, 8, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides
- 8 : citations valides

## Réponse de Claude

Lot : suite des préconisations de l'audit complet du 11/11. Par Claude : lien de connexion consommé par POST (2), Margo chargée à la demande et une demande à la fois par personne (1, en partie), branchement de la purge. Par un modèle plus léger (Sonnet), relus par Claude : adaptateurs (6), tests et garde-fous (8), exploitation et outil d'audit (9), design (11). Contrôles sur l'ensemble : `lint`, `format:check` et `knip` propres ; 351 tests rapides, 350 passés, 1 sauté (essai réel de Margo, volontaire) ; 60 parcours de la pile, 59 passés, 1 sauté ; tests de la collaboration passés trois fois de suite seuls ; 9 connexions ouvertes au plus sur la base pendant toute la pile (plafond du code : 12).

1. **Juste, décision ouverte.** Les mesures sont faites hors du service, sur un texte fabriqué ; le lot réduit déjà la mémoire au repos (BlockNote chargé à la première demande : 92 Mo au lieu de 117) et borne Margo à une demande par personne. Relever les plafonds demande d'installer le fichier de service sur le VPS (le déploiement automatique ne le reprend pas) : question pour Sylvain, avec une mesure réelle (rubrique Système du back-office, après une demande à Margo sur un livre).
2. **Juste, corrigé.** Les deux règles retirées étaient sans effet depuis le 10/11 (aucun composant ne posait ces classes) ; la ligne de l'ADR 0008 décrivait encore le titre et le bouton de l'ancienne maquette. Sa description est mise en accord avec ce qui reste ; aucune valeur n'est changée. À valider par Sylvain, l'ADR étant sa décision.
3. **Sans objet.** Ces exports existent (`v2/i18n/index.js`) ; les tests passent.
4. **Juste, très mineur, laissé** (outil de développement).
5. **Contesté sur le classement.** Ce n'est pas un défaut d'une fondation mais de notre lecture du texte (`blocsATexte`) : question de produit posée à Sylvain (Margo relit-elle les tableaux ?), pas une ligne de veille.
6. **Juste, commenté.** Le refus du dépôt est le comportement voulu ; une phrase le dit à l'appel.
7. **Vérifié.** `postgresOptions` est une option de la configuration publique de y/hub (`@y/hub/src/types.js`, schéma de configuration, renvoi à `API.md`).
8. **Faux.** Le code `trop-de-flux` est rendu par `application/serveur/commentaires.js` depuis le lot précédent.

Résumé : rien de bloquant ; l'ADR 0008 et un commentaire corrigés ; une décision reste ouverte (plafonds de mémoire du service, après mesure sur le VPS) et une question de produit (Margo et les tableaux).

## Arbitrage de Sylvain

(À compléter.)
