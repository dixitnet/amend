# Audit partiel avant fusion (2026-11-12)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 165483 signes envoyés, 2842 reçus (et 5045 de réflexion) ; réflexion `low` ; 14 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `92609aa` (7 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff ajoute la palette du format S (retrait du sélecteur de type de bloc), place la barre flottante du téléphone en haut de la zone visible, et allège l'arbre des documents de leurs pictos. L'ensemble est petit, testé côté palette, et les décisions de Sylvain sont citées dans l'ADR 0008 et les commentaires. Les réserves portent sur la robustesse du CSS (variables `--bn-vv-*` de BlockNote, sélecteur dupliqué, `padding-bottom` inexpliqué) et sur une branche du volet Documents qui perd son picto alors que le commentaire dit que seuls les documents le perdent.

## Constats
1. **[question]** Grille 2 (API publique), `v2/design/feuilles/telephone.css:61` — La règle CSS s'appuie sur les variables `--bn-vv-left`, `--bn-vv-top`, `--bn-vv-scale` de BlockNote. Le commentaire dit « les variables que BlockNote tient à jour », mais rien dans le dossier ne montre qu'elles font partie de son API publique documentée (elles ressemblent à des variables internes de suivi du *visual viewport*) ; une montée de version de BlockNote pourrait les renommer sans que nos contrats le voient. À vérifier dans la documentation de BlockNote ; si elles ne sont pas publiques, prévoir un contrat ou un signalement amont.
2. **[mineur]** Grille 4 (simplicité), `v2/design/feuilles/telephone.css:59-60` — Le sélecteur `.bn-root .bn-mobile-formatting-toolbar, .bn-mobile-formatting-toolbar` est redondant : le second branche couvre déjà le premier. Garder une seule forme, avec un commentaire si la version préfixée visait un cas précis.
3. **[mineur]** Grille 6 (correction), `v2/design/feuilles/telephone.css:63` — `padding-bottom: 0` annule apparemment un retrait que BlockNote ajoute sous la barre, mais rien ne l'explique (le reste du bloc est commenté). Une ligne de commentaire dirait si c'est lié au déplacement en haut, et éviterait qu'il soit retiré comme parasite.
4. **[question]** Grille 6 (correction), `v2/design/composants/VoletDocuments.jsx:61` — La branche `component="div"` (entrée sans `href` ni `onClick`) perd aussi son `leftSection`, alors que le commentaire des lignes 57-58 dit « Dossiers et espaces gardent le leur ». Si cette branche est un dossier ou un espace, le retrait contredit la décision citée ; si c'est bien un document (non cliquable), le commentaire gagnerait à le préciser. À confirmer avec l'auteur.
5. **[mineur]** Grille 7 (tests), `v2/tests/unitaires/blocknote-palette.test.js:67-69` — Le test du format S ne couvre que `boutonsDuFormatS(boutonsGardes(…))` ; la combinaison réellement utilisée en mode suggestion au téléphone (`boutonsDuFormatS(boutonsGardesEnSuggestion(…))`, `v2/adaptateurs/blocknote/index.jsx:150-158`) n'est pas vérifiée. Une assertion de plus (le bouton de commentaire reste, aucun bouton de forme ne réapparaît) ferait le tour.

## Points de grille sans remarque
1, 3, 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. *Juste* : les variables `--bn-vv-*` et la classe `.bn-mobile-formatting-toolbar` ne sont pas documentées par BlockNote. Contrat ajouté (`contrats/statiques/blocknote-mobile.test.js`) : une montée de version qui les renommerait fait échouer les tests ; ligne ajoutée à la veille.
2. *Juste*, corrigé : la barre est rendue dans `body`, hors de `.bn-root` ; la forme préfixée ne servait à rien et est retirée.
3. *Juste*, corrigé : commentaire ajouté (la marge de BlockNote sous la barre, pour l'indicateur d'accueil, n'a plus lieu d'être en haut).
4. *Juste*, précisé : cette branche est un document de la corbeille ; le commentaire le dit.
5. *Juste*, corrigé : le test vérifie aussi la palette du format S en Suggérer (aucun bouton de forme, le commentaire reste).

## Arbitrage de Sylvain

(À compléter.)
