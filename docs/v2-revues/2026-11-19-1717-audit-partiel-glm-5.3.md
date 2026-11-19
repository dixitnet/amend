# Audit partiel avant fusion (2026-11-19)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 902892 signes envoyés, 3092 reçus (et 10881 de réflexion) ; réflexion `low` ; 53 s ; arrêt : stop
- Diff audité : `v2/` de `0bc9e33` à `da0e50c` (14 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff fait trois choses : déplacer `DOMAINE_ESSAI` du serveur vers le domaine et exempter les adresses d'essai du plafond d'invitations ; corriger le gabarit Typst pour que l'alinéa d'un style de bloc (citation) s'applique réellement (enveloppement dans `par()`) ; mettre à jour l'ADR 0008 (reformatage de la table, deux confirmations de Sylvain). L'architecture est respectée et les tests suivent les changements. Les points à examiner portent sur la portée de l'exemption d'essai (contournement du plafond, accumulation d'invitations) et sur la vérification des livres de référence après le correctif Typst.

## Constats
1. **[question]** Sécurité et droits — `v2/domaine/partage.js:55`, `v2/application/serveur/comptes.js:129`. `DOMAINE_ESSAI` et `estAdresseDEssai` passent dans le domaine, qui est aussi livré au client : la liste d'exemption du plafond devient publique dans le paquet, et une personne malveillante peut créer sans limite des invitations vers `@essai.amend.invalid` (aucun courrier, mais des lignes en base via `comptes.inviter`, `v2/application/serveur/comptes-acces.js:115`). Le code étant AGPL public, ce n'est pas un secret, mais la décision du 19/11/2026 visait la recette, pas une trappe ouverte à tous. Proposer à Sylvain de confirmer que ce contournement (invitations illimitées vers le domaine d'essai) est accepté, ou de limiter l'exemption à une clé d'essai vérifiée côté serveur.
2. **[mineur]** Tests — `v2/tests/services/partage.test.js:235`. Le nouveau test vérifie qu'un partage vers une adresse d'essai passe quand le plafond est atteint, mais pas que ces partages ne consomment pas le plafond (`noterEnvoi` sauté, `v2/application/serveur/comptes.js:135`), ni le chemin des invitations d'équipe (`v2/application/serveur/comptes-equipes.js:107`). Ajouter : après des envois d'essai, un partage réel dispose bien de ses 30 envois ; et un cas d'équipe.
3. **[question]** Tests — `v2/tests/donnees/livre-de-reference/a4.typ:9` (aussi `a5.typ:9`, `livre-de-poche.typ:9`, `tat-poche.typ:9`). Les quatre livres de référence sont corrigés à la main pour suivre le nouveau gabarit (`par(it.body)` dans la citation) ; le critère de sortie de l'étape 7 est un export « identique à l'attendu ». Le correctif change le rendu réel des citations (l'alinéa, ignoré par Typst, s'applique désormais) : les PDF de référence ont-ils été régénérés et relus ? À confirmer, sinon régénérer.
4. **[question]** Correction — `v2/domaine/miseEnPage.js:267`. La condition `st.retraitSuspendu || st.alinea` s'applique à tous les styles passant par `bloc()`, pas seulement à la citation nommée dans le test (`v2/tests/unitaires/miseEnPage.test.js:524`). Pour un style dont le contenu était déjà un paragraphe, l'enveloppement supplémentaire est probablement sans effet, mais tout style de bloc avec un `alinea` (légende, bibliographie) verra son rendu changer. Vérifier qu'aucun autre style réglé avec un alinéa ne change d'apparence dans les exports existants, ou restreindre le comportement si un écart apparaît.

## Points de grille sans remarque
1, 2, 3, 4, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides

## Réponse de Claude

1. **Juste, corrigé.** L'exemption ne vaut plus que pour un partage fait **par un compte d'essai** vers une adresse d'essai (`horsPlafond`, `application/serveur/comptes.js`). Un compte d'essai ne s'ouvre qu'avec la clé d'essai : une personne ordinaire reste plafonnée, même vers `@essai.amend.invalid` (test ajouté : 429). Le nom du domaine d'essai dans le code n'est pas un secret (code public, adresses sans courrier).
2. **Juste, corrigé.** Test ajouté (`tests/services/partage.test.js`) : 35 partages d'un compte d'essai vers des adresses d'essai passent, une invitation d'équipe aussi, et le compte garde ensuite ses 30 courriers entiers vers de vraies adresses avant d'être plafonné.
3. **Faux pour « à la main », juste sur le fond.** Les quatre sources de référence sont régénérées par le contrat (`MAJ_REFERENCE=1`), pas retouchées ; le nombre de pages de chaque livre n'a pas changé (fichiers `.json` intacts). Le rendu a été relu sur un PDF A5 : la citation commence par son alinéa, en plus de son retrait. Ce changement de rendu est la décision de Sylvain du 19/11/2026 (« 5 corriger »), notée au journal.
4. **Vérifié, voulu.** La règle vaut pour tout style de bloc : c'est le réglage « retrait de 1re ligne » du formulaire, offert à tous. Dans les cinq modèles du code et de l'instance, seule la citation a un alinéa non nul (A4 simple, A5, Livre de poche, TàT - Poche) ; aucun autre style ne change. Un modèle d'équipe qui aurait réglé un alinéa sur un autre style le voit maintenant appliqué, ce qui est ce que le réglage annonçait.

Après corrections : `npm run format:check`, `npm run lint` et `npm test` (541 tests) au vert.

## Arbitrage de Sylvain

(À compléter.)
