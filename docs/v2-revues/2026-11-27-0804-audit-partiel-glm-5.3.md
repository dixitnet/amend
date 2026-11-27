# Audit partiel avant fusion (2026-11-27)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 488579 signes envoyés, 3004 reçus (et 14209 de réflexion) ; réflexion `low` ; 43 s ; arrêt : stop
- Diff audité : `v2/` de `34b0cef` à `7b13d22` (14 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff ajoute les notes de bas de page aux outils de Margo et du connecteur Claude : lecture avec repères « ⟦k⟧ », ajout, correction et suppression en suggestions arbitrables une à une. Le découpage en couches est respecté (l'adaptateur BlockNote peut importer ses extensions ; le domaine reste pur), les traductions et les tests suivent, y compris un test de pile et un essai réel. Deux défauts de correction subsistent, tous deux dans le traitement des repères et du texte des notes : un décalage d'index possible avec des caractères hors plan multilingue de base, et une typographie française et NFC appliquée à l'ajout mais pas à la correction d'une note.

## Constats

**A1 — [important]**, grille 6 (correction), `v2/domaine/margo.js:63`
`avecAppels` parcourt le texte par points de code (`[...String(texte)]`) et utilise l'index de ce parcours pour retrouver la note (`parPlace.has(i)`), alors que la place `i` d'une note est calculée ailleurs en unités UTF-16 (`segments.push({ i: texte.length … })` dans `v2/adaptateurs/blocknote/serveur.js:169-175`, et `situerCitation`/`situerRemplacement` travaillent sur des chaînes). Dès qu'un bloc contient un caractère astral (un emoji, courant dans un texte d'auteur) avant un appel de note, le repère est posé au mauvais endroit ou pas posé. Proposer de parcourir la chaîne en unités UTF-16 (`texte.split('')` ou un index manuel) pour aligner `avecAppels` sur le reste.

**A2 — [important]**, grilles 6 et 8 (NFC, typographie), `v2/application/serveur/margo.js:553`
Le remplacement du texte d'une note par `proposer` assemble `note.texte.slice(0, r.debut) + r.apres + note.texte.slice(r.fin)` sans `normalize('NFC')` ni `typographier`, alors que la même fonction fait l'un et l'autre pour un texte de note ajouté (`v2/application/serveur/margo.js:613`) et pour un commentaire (`v2/application/serveur/margo.js:688`). Une correction de note peut donc introduire une forme décomposée ou une typographie non française dans le livre. Appliquer le même traitement (`typographier(String(...).normalize('NFC'))`) au fragment posé.

**A3 — [mineur]**, grille 6, `v2/domaine/margo.js:50`
`sansAppels` remplace tout repère « ⟦k⟧ » par l'atome, sans vérifier que `k` est bien le numéro de la note à cette place : un repère mal recopié par le modèle (⟦3⟧ pour ⟦1⟧) est silencieusement accepté au lieu d'être refusé comme citation inexacte. Vérifier le numéro attendu à la position (ou documenter cette tolérance).

**A4 — [question]**, grille 6, `v2/application/serveur/margo.js:627-628`
`ajouter_note` ne déduplique pas deux demandes portant le même passage : deux appels seraient posés au même décalage. Par ailleurs, l'insertion se fait à `ou.fin`, qui peut tomber sur la position d'un atome existant ; je ne peux pas vérifier dans ce diff si `plage` (côté adaptateur) accepte ou refuse ce cas. À vérifier par un test (deux notes sur le même passage, appel posé juste avant un appel existant).

## Points de grille sans remarque
1, 2, 3, 5, 7, 9, 10

## Citations vérifiées par le script

- A1 : citations valides
- A2 : citations valides
- A3 : citations valides
- A4 : citations valides

## Réponse de Claude

- **A1. Juste, corrigé.** `avecAppels` avance maintenant comme une chaîne (unités UTF-16), comme les places calculées par l'adaptateur ; essai avec un émoji devant l'appel.
- **A2. Faux.** Le fragment posé, `r.apres`, sort de `situerRemplacement`, qui le met en NFC et le typographie selon son contexte (`domaine/margo.js`) ; les deux tranches recopiées autour sont le texte existant de la note, inchangé.
- **A3. Voulu, documenté.** Le numéro d'un repère recopié ne sert qu'à situer le passage ; une correction qui touche un appel est refusée de toute façon (`structure`), et un repère dans un texte proposé aussi (`appel`). Dit dans le commentaire de `sansAppels`.
- **A4. Juste pour le doublon, corrigé ; vérifié pour le voisinage.** Deux notes demandées au même endroit dans le même appel : la seconde est refusée (`chevauche`), essai ajouté. Un appel posé juste avant ou juste après un appel existant est accepté et placé du bon côté : essai unitaire ajouté (trois notes qui se suivent).

## Arbitrage de Sylvain

(À compléter.)
