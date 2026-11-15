# Audit partiel avant fusion (2026-11-15)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 631565 signes envoyés, 5068 reçus (et 18529 de réflexion) ; réflexion `low` ; 32 s ; arrêt : stop
- Diff audité : `v2/` de `4a89aca` à `614c45d` (22 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot cohérent sur le fond : espacements en points, réglage du retrait pour tous les styles, familles fournies désactivables, deux formats de base (A5, livre de poche), avec tests et catalogues à jour. Les points faibles sont surtout de la documentation non tenue (ADR 0008 et 0011 contredites par le code) et quelques fragilités dans `completerModele`/`stylesEnPoints` (mutation d'objets partagés, style inconnu). Rien de bloquant côté sécurité : les routes admin restent derrière `administrateur` et les familles désactivées restent valides pour les modèles existants.

## Constats
1. **[important]** Grille 11 (documentation) — `v2/design/reglagesLivre.js:412`, `v2/adr/0008-design.md:183`, `v2/adr/0008-design.md:186`, `v2/adr/0011-modeles-equipe.md` (complément du 13/11/2026). L'ADR 0008 (table `livre.modeles` : « le modèle… par défaut et base de tous les autres : A4 simple » ; `livre.reprise` : seul « TàT - Poche » quitte le code) et l'ADR 0011 ne disent rien des deux nouveaux modèles de reprise A5 et livre de poche, qui sont pourtant ajoutés au code comme modèles de l'instance. Proposer une mise à jour des deux fiches (ou une décision de Sylvain citée dans la table).
2. **[important]** Grille 11 / 6 — `v2/domaine/miseEnPage.js:228`. `avantApres` passe aux points bruts (`above: ${pt(st.espaceAvant)}`) : le gabarit ne « replace plus le texte sur la grille après chaque bloc (`blancSurGrille`) », ce que l'ADR 0011 (complément du 13/11/2026) énonce encore comme le comportement du gabarit Typst. C'est la décision de Sylvain du 15/11/2026, mais l'ADR contredit le code ; la réviser (et noter la conséquence : un espacement en points quelconque peut faire dériver le texte hors grille).
3. **[mineur]** Grille 6 (fragilité) — `v2/domaine/miseEnPage.js:475`. La boucle `delete st.lignesAvant / lignesApres` parcourt *tous* les styles de `complet.styles`, y compris ceux qui, absents de `valeurs`, sont des références partagées avec le modèle par défaut (la fusion de `fusionner` ne copie pas les sous-objets non surchargés). Aujourd'hui sans effet (les valeurs du design n'ont plus ces clés), mais toute valeur par défaut future qui les porterait serait silencieusement mutée pour tous. Ne supprimer que sur les objets réellement issus de `valeurs`, ou copier en profondeur.
4. **[question]** Grille 6 (cas limite) — `v2/domaine/miseEnPage.js:465`. Si `valeurs.styles` contient un nom de style inconnu (donnée ancienne ou corrompue), `complet.styles[nom]` est `undefined` et `st.corps` lève une exception. `completerModele` est-il toujours appelé sur des données déjà validées par `verifierModele` ? Si oui, fermer ; sinon, ignorer les styles inconnus.
5. **[mineur]** Grille 4 — `v2/design/reglagesLivre.js:60`. Le commentaire « l'alinéa et le retrait, qui n'ont pas leur colonne, vont sous le tableau » est périmé : `BLOC` (lignes 65-76) et les colonnes du client (`v2/application/client/Modeles.jsx:106`) les incluent désormais dans le tableau. Mettre le commentaire à jour.
6. **[mineur]** Grille 4 — `v2/domaine/miseEnPage.js:230`. `avecRetrait` n'est utilisé que pour les titres de niveau 1, tandis que `bloc` (ligne 234) refait le même `pad(left: …)` en ligne : deux mécanismes pour le même retrait. Un seul suffirait (faire porter le `pad` par `avecRetrait` partout, ou s'en passer).
7. **[mineur]** Grille 4 — `v2/application/client/Modeles.jsx:580`. Le mappage de `fournies` (famille, actif, usage) duplique celui de `familles` (lignes 585-589) ; une petite fonction commune éviterait la divergence. Redondance légère, à juger.
8. **[mineur]** Grille 7 — `v2/contrats/statiques/typst.test.js:213`. Le nouveau test dépend de l'exécutable externe `pdfinfo` (absent → échec peu lisible) et itère sur `REPRISE_MODELES.filter(…)` : si les identifiants changeaient, la boucle passerait à vide sans échouer (couvert toutefois par `v2/tests/unitaires/modeles-livre.test.js:33`). S'assurer que `pdfinfo` est déclaré dans la préparation de l'environnement, et éventuellement échouer si la liste filtrée est vide.
9. **[mineur]** Grille 6 (condition de course) — `v2/application/serveur/polices.js:117`. Le PATCH d'une famille fournie fait une lecture-modification-écriture du réglage `polices.desactivees` sans verrou ni transaction : deux administrateurs concurrents peuvent se perdre une désactivation. Peu probable à cette échelle ; noter ou sérialiser.
10. **[question]** Grille 1 (un lot, une couche) — `v2/design/reglagesLivre.js`, `v2/domaine/miseEnPage.js`, `v2/application/client/Modeles.jsx`, `v2/i18n/fr.json`. Le diff touche design, domaine, application et i18n pour la même fonction (espacement en points), ce que la règle 5 veut éviter par découpage en lots. Le besoin traverse-t-il naturellement les couches (auquel cas le découpage par couche aurait été possible : valeurs du design, puis domaine, puis écrans) ? Question de process pour Sylvain, pas un défaut du code.

## Points de grille sans remarque
2, 3, 5, 8, 9, 10 (licences : Open Sans sous SIL OFL, fichier `OFL.txt` livré, conforme à `livre.polices` et à l'ADR 0006).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides
- 8 : citations valides
- 9 : citations valides
- 10 : **sans citation** (écarté d'office)

## Réponse de Claude

1. *Juste*, corrigé : la ligne `livre.reprise` de l'ADR 0008 cite A5 et « Livre de poche » (formats de base, valeurs à valider sur le PDF).
2. *Juste*, corrigé : l'ADR 0011 dit qu'avant et après un style sont des points, que `blancSurGrille` ne sert plus qu'à convertir les anciens modèles, et qu'un espacement quelconque peut écarter le texte de la grille.
3. *Juste*, corrigé : seuls les styles que le modèle enregistré portait (des copies, issues de `fusionner`) perdent `lignesAvant` et `lignesApres`.
4. *Juste*, corrigé : un style inconnu est ignoré à la conversion.
5. *Juste*, corrigé : commentaire mis à jour.
6. *Juste*, corrigé : `bloc` passe par `avecRetrait`, un seul mécanisme.
7. *Juste*, corrigé : `usageDe` commun aux familles et aux fournies.
8. *Juste en partie*, corrigé : le test échoue si les deux formats ne sont pas repris ; `pdfinfo` vient du même paquet que `pdftotext` (`poppler-utils`), déjà noté dans `v2/LISEZMOI.md`.
9. *Assumé* : deux administrateurs qui désactivent en même temps une famille fournie dans la même seconde ; l'effet d'une perte est de revoir la police proposée.
10. *Question de process* : le besoin traverse les couches par nature (valeur du design, forme du modèle, écran) ; les commits sont séparés par couche, et la fusion les reprend ensemble.

## Arbitrage de Sylvain

(À compléter.)
