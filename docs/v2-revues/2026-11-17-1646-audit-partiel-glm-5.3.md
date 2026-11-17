# Audit partiel avant fusion (2026-11-17)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 295825 signes envoyés, 3662 reçus (et 8628 de réflexion) ; réflexion `low` ; 47 s ; arrêt : stop
- Diff audité : `v2/` de `c50f675` à `500e1b2` (14 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot du 17/11/2026 : présence au milieu du bandeau avec couleurs de personne, picto d'état de connexion sur L/M, sélection gardée visible (extension CSS Custom Highlight), et retour des émojis dans le menu « / ». L'architecture est respectée (extension isolée, réglages inscrits à l'ADR 0008, feuilles avec clé de réglage). Les points faibles : le retour des émojis contredit le renoncement n° 23 sans décision citée ni mise à jour du registre ; la couleur de présence lue dans l'état awareness peut diverger de la palette décidée ; et le libellé d'état semble assembler une phrase avec un code brut.

## Constats
1. **[important]** Grille 1/11 (renoncements) — `v2/adaptateurs/blocknote/index.jsx:243`, `v2/adaptateurs/blocknote/index.jsx:867`, `v2/contrats/pile/editeur.test.js:156`. Les émojis sont réintroduits dans le menu « / » et via `EmojiPickerController`, alors que le renoncement n° 23 du registre liste explicitement « emoji » parmi les fonctions de Docs non reprises. Le commentaire cite la date (17/11/2026) mais aucune décision de Sylvain, et le registre des renoncements n'est pas mis à jour (règle 9). Proposer à Sylvain de confirmer la décision et de lever l'entrée « emoji » du n° 23, ou de revenir en arrière.
2. **[question]** Grille 6 — `v2/adaptateurs/yjs/index.js:95`. La couleur de présence est lue dans `etat.user.color` (état awareness), tandis que le rond du compte vient de `couleurAuteur(personne.id)` (`v2/application/client/commun.js:46`), et l'ADR 0008 dit que les couleurs de personnes viennent de `design/auteurs.js`. Si la couleur posée dans awareness par le client n'est pas celle de `couleurAuteur`, le rond d'une personne diffère de la couleur de son curseur, contrairement à la décision `couleurDePersonne`. Vérifier que le client écrit bien dans awareness la couleur de `auteurs.js` ; sinon, dériver la couleur de la même source des deux côtés.
3. **[question]** Grille 9 — `v2/application/client/Edition.jsx:797`. `t('document.etat', { etat: connexion })` passe le code brut de connexion (`connecte`, `connexion`…) en paramètre du message : si le catalogue l'insère tel quel, l'infobulle affiche un code non traduit, et c'est une phrase assemblée à partir d'un code (règle 25). Vérifier le catalogue : soit des clés par état (`document.etat.connecte`…), soit un paramètre déjà traduit.
4. **[mineur]** Grille 4 — `v2/extensions/selection-gardee/index.js:30`. `montrer` et `NOM` sont exportés mais `NOM` n'est utilisé que dans le module (le design y fait référence par la chaîne littérale `amend-selection` dans `::highlight`, `v2/design/feuilles/editeur.css:174`) et `montrer` n'a pas d'appelant hors du fichier. Si aucun test n'importe ces exports, les retirer pour ne garder que `extensionSelectionGardee`.
5. **[mineur]** Grille 7 — `v2/contrats/pile/editeur.test.js:539`. `waitForTimeout(500)` pour vérifier que « : » n'ouvre rien est une attente arbitraire : le test peut passer de chance ou échouer sur machine lente. Préférer une attente sur une condition (absence stable après la frappe, ou `waitForFunction` bornée).
6. **[question]** Grille 7 — `v2/contrats/pile/editeur.test.js:540`. Le sélecteur `.bn-frimousse-picker` : je ne peux pas vérifier que c'est bien la classe publique du sélecteur d'émojis de BlockNote (le nom français est surprenant pour une fondation). Si c'est une classe maison ou erronée, la première assertion (`count() === 0`) passe trivialement. Vérifier la classe réelle rendue par `EmojiPickerController` et la citer depuis le code de la fondation.

## Points de grille sans remarque
2 (API publique), 3 (redondance amont), 5 (sécurité et droits), 8 (exports), 10 (licences).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides

## Réponse de Claude

1. Juste : décision de Sylvain du 17/11/2026 (« activer les émojis », puis choix du menu « / » sans « : »). Registre des renoncements mis à jour (n° 23).
2. Faux : le client écrit dans awareness la couleur de `couleurAuteur(personne.id)` (`Edition.jsx:85`, `moi`), la même source que le rond du compte.
3. Faux : le message est `{etat, select, connecte {…} connexion {…} other {…}}` : le code est un sélecteur, jamais affiché ; même usage qu'au téléphone.
4. Juste, corrigé : `NOM` et `montrer` ne sont plus exportés.
5. Juste, mineur : attente de 500 ms pour une absence ; laissée (une absence ne s'attend pas sur une condition).
6. Faux : `bn-frimousse-picker` est la classe rendue par le sélecteur de BlockNote (vérifiée en capture) ; la seconde partie du test l'attend visible, donc la première assertion n'est pas triviale.

## Arbitrage de Sylvain

Fusion demandée par Sylvain le 17/11/2026 (« si la pile est verte »).
