# Audit partiel avant fusion (2026-11-12)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 239756 signes envoyés, 4269 reçus (et 11044 de réflexion) ; réflexion `low` ; 36 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `64d2385` (19 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le lot « notes de bas de page » respecte l'architecture : l'extension vit dans `v2/extensions/note/`, n'importe que l'API publique de BlockNote, l'adaptateur et le design jouent leurs rôles, les réglages et pictos sont inscrits dans l'ADR 0008, les catalogues fr et en sont complets. Les constats se concentrent sur la logique de comptage des suggestions (heuristique fragile, notes adjacentes fusionnées), la perte des notes dans les tableaux à l'export Markdown, et des cas limites (texte multi-ligne, position périmée, accessibilité clavier). Aucune dépendance nouvelle, aucune couche violée.

## Constats
1. **[important]** grille 6 (correction), `v2/adaptateurs/blocknote/suggestions.js:259` — Dans `compterSuggestions`, deux notes adjacentes attribuées au même auteur sont comptées pour une seule : la première met `dansUnPassage` à `true`, la deuxième voit `!dansUnPassage` faux et n'incrémente pas. Pour du texte, fusionner des lettres contiguës est voulu ; pour des notes, chacune est une proposition distincte. Corriger en comptant chaque note attribuée individuellement, et ajouter un test.
2. **[important]** grille 6 (correction), `v2/adaptateurs/blocknote/suggestions.js:258` — La détection d'un attribut proposé par `JSON.stringify(x.attrs ?? {}).includes('"attribution"')` est fragile : une note dont le texte contient littéralement `attribution` serait comptée à tort, et le format interne du delta peut changer à la montée de version de Yjs. Chercher l'attribution par structure (clé connue dans `attrs`), pas par sérialisation.
3. **[important]** grille 6 (cas limite), `v2/adaptateurs/blocknote/export.js:112` — `appels` n'est appliqué qu'aux contenus en ligne tableaux ; une note posée dans une cellule de tableau traverse `marquerExposants` (qui gère `tableContent`) mais jamais `appels` : l'élément `note` arrive tel quel dans `blocksToMarkdownLossy` et son texte est perdu de l'export. Étendre le parcours aux cellules (comme le fait `marquerExposants`) et couvrir par un test.
4. **[mineur]** grille 6 (cas limite), `v2/adaptateurs/blocknote/export.js:119` — Le texte d'une note saisi dans une `Textarea` (`v2/design/composants/Coquille.jsx:511`) peut contenir des retours à la ligne ; la définition Markdown `[^n]: …` n'en garde que la première ligne, le reste du texte se retrouve collé au paragraphe suivant. Normaliser (rejeter ou aplatir les sauts de ligne) ou échapper à l'export.
5. **[mineur]** grille 6 (cohérence), `v2/adaptateurs/blocknote/export.js:169` — Le chemin Typst passe le texte par `nfc` et `chaineTypst` mais pas par `sansMarques`, contrairement au chemin Markdown (ligne 86) : des caractères à usage privé tapés par une personne se retrouveraient dans la source Typst. Appliquer `sansMarques` aux deux.
6. **[mineur]** grille 5/22 (accessibilité), `v2/extensions/note/index.js:27` — L'appel de note porte `role="button"` mais `tabindex="-1"` : il n'est pas atteignable au clavier, une personne qui ne peut pas cliquer ne peut ni lire ni modifier la note. Le rendre focusable et ouvrir la fenêtre à l'activation clavier.
7. **[mineur]** grille 6 (condition de course), `v2/adaptateurs/blocknote/index.jsx:602` — `nouvelleNote` capture `selection.to` avant l'ouverture de la fenêtre ; si le document bouge (collaborateur) pendant la saisie, l'insertion se fait à une position périmée. Convertir en position relative (Yjs) ou re-lire la sélection à l'enregistrement.
8. **[question]** grille 7 (tests), `v2/contrats/pile/relecture.test.js:225` — Le test couvre la lecture en Suggérer, l'ajout par un correcteur et l'acceptation, mais rien ne couvre la ligne « modifie une note » (`type: 'note'`, marque `y-attributed-attrs` de `v2/adaptateurs/blocknote/suggestions.js:142`) ni le comptage des notes dans `compterSuggestions`. Est-ce volontairement reporté, ou un manque à combler ?
9. **[question]** grille 6, `v2/adaptateurs/blocknote/suggestions.js:147` — L'auteur d'une note modifiée est lu comme le premier `userId` de la première entrée de `changes` ; si plusieurs personnes modifient le même texte de note, l'auteur affiché est arbitraire. Est-ce le comportement voulu (dernier auteur ?) ou un cas jugé impossible ?

## Points de grille sans remarque
1, 2, 3, 4 (hors constat 9, classé question), 8, 9, 10.

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

## Réponse de Claude

1. *Voulu* : le compte suit la liste du panneau, qui réunit en une ligne les propositions contiguës d'un même auteur dans un même bloc (règle du 09/11/2026, découpage de Yjs gardé) ; deux notes collées d'un même correcteur font une ligne, acceptée d'un geste. Cas rare ; à revoir si une relecture réelle le montre.
2. *Juste*, corrigé : l'attribution est lue dans la structure (`attrs.texte.attribution`), plus par sérialisation.
3. *Juste*, corrigé : les appels sont posés aussi dans les cellules des tableaux ; test ajouté.
4. *Juste*, corrigé : une note tient sur une ligne, les sauts de ligne deviennent des espaces à l'enregistrement.
5. *Juste*, corrigé : le texte d'une note passe aussi par `sansMarques` vers Typst.
6. *Juste*, corrigé : l'appel est atteignable au clavier (`tabindex="0"`), Entrée ou Espace ouvre la fenêtre.
7. *Juste*, corrigé : la position est relue à l'enregistrement ; ProseMirror suit la sélection pendant la saisie, même quand d'autres écrivent.
8. *Voulu* : en Suggérer, le texte d'une note est en lecture seule (limite de Yjs, veille) ; la ligne « modifie une note » ne sert qu'aux propositions d'attribut antérieures ou venues d'ailleurs, que « Tout accepter » traite. Le compte des notes ajoutées est couvert par le parcours de la pile (compteur et panneau).
9. *Cas qui ne se produit plus* : sans modification de note en Suggérer, l'auteur d'une proposition d'attribut n'apparaît pas en pratique ; s'il en vient d'ailleurs, « Quelqu'un » s'affiche.

## Arbitrage de Sylvain

(À compléter.)
