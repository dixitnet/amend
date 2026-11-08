# Captures jugées de l’étape 1 (2026-11-08)

- Relecteur : Mistral, modèle `mistral-large-latest` ; consommation : 8955 signes envoyés et 8 images, 2423 reçus
- Pièces : `Liste des captures, dans l’ordre des images`, `v2/design/jetons.css`, `v2/design/styles.css`, `v2/design/theme.js`, `v2/design/composants/PageEdition.jsx`, `v2/design/composants/EcranSimple.jsx`
- Commit relu : `26382dd`
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis du relecteur

## Synthèse
Les captures montrent une interface épurée et fonctionnelle, avec une bonne hiérarchie visuelle et un contraste adapté aux thèmes clair/sombre. Quelques ajustements mineurs sont nécessaires pour les écrans en pseudo-langue (débordements, coupures) et sur mobile. La cohérence des espacements et l'accessibilité sont globalement respectées, mais certains textes restent en dur.

---

## Constats

**V1. [important]**, *connexion-pseudo-clair-telephone.png*
**3. Débordements/coupures** : Le texte en pseudo-langue déborde du conteneur (ex. "⟦Vôtré nôm⟧" tronqué, bouton "⟦Entrér⟧" coupé à droite).
→ **Proposition** : Augmenter la largeur du conteneur `.ecran-simple` sur mobile via un média-query (`max-width: 90%` au lieu de `26rem`) et réduire légèrement la taille de police (`--taille-interface: 0.875rem` pour les écrans < 400px).

**V2. [mineur]**, *document-pseudo-sombre-telephone.png*
**4. Textes non traduits** : Les libellés "Synchronisé" et "Personne d'autre sur ce document" sont en dur (sans ⟦⟧).
→ **Proposition** : Vérifier que ces textes passent bien par les props `etat` et `participants` du composant `PageEdition` (fichier *PageEdition.jsx*).

**V3. [mineur]**, *connexion-fr-clair-ordinateur.png* et *connexion-fr-sombre-ordinateur.png*
**7. Accessibilité visible** : Le focus sur le champ de saisie et le bouton n'est pas visible en thème sombre (contraste insuffisant entre `--couleur-accent` et le fond).
→ **Proposition** : Ajouter un jeton `--couleur-focus: #e0956a` (thème sombre) et `--couleur-focus: #8a3b12` (thème clair) pour l'`outline`, avec un `outline-offset: 3px` pour améliorer la visibilité.

**V4. [mineur]**, *document-fr-clair-ordinateur.png* et *document-en-clair-telephone.png*
**5. Cohérence des espacements** : L'espacement entre l'en-tête et la zone d'écriture (`padding-top: var(--espace-4)`) semble trop généreux sur mobile.
→ **Proposition** : Réduire à `--espace-3` pour les écrans < 768px via un média-query dans *styles.css*.

**V5. [question]**, *document-pseudo-sombre-telephone.png*
**1. Lisibilité** : Le titre "Chapitre premier" en pseudo-langue est très long ("⟦Châpîtré prêmïér⟧") et pourrait déborder sur mobile.
→ **Proposition** : Limiter la largeur du titre à 100% avec `overflow-wrap: break-word` dans `.page-edition__titre`.

---

## Points de grille sans remarque
2. Contraste (clair/sombre)
6. Adéquation à un usage d'auteur (confort de lecture)

## Réponse de Claude

Claude a relu lui-même les huit captures (il lit les images). Le jugement de Mistral **n'est pas fiable** sur ce matériau, avec `mistral-medium-latest` comme avec `mistral-large-latest` :

- V1 *contesté* : sur `connexion-pseudo-clair-telephone.png`, rien n'est tronqué ni coupé ; tous les textes sont encadrés de ⟦ ⟧.
- V2 *contesté* : sur `document-pseudo-sombre-telephone.png`, « ⟦Syñçhrôñîsé…⟧ » et « ⟦Pérsôññé d’áütré…⟧ » sont bien encadrés.
- V5 *contesté* : « Chapitre premier » est le **texte du livre**, pas l'interface ; il n'a pas à être traduit.
- V3 et V4 : avis de goût, sans défaut constaté ; à reprendre au moment du design de l'éditeur (étape 4).
- Le premier passage (`mistral-medium-latest`) affirmait aussi un titre non encadré et un bouton sans focus visible sur une capture d'erreur : faux, et la capture d'erreur était elle-même fausse (prise avant l'affichage du message), corrigée dans `exploitation/dev/captures.mjs`.

**Défauts réels vus par Claude**, absents de l'avis de Mistral. Décision de Sylvain (08/11/2026) : le design vise les formats L (Mac) et M (iPad) seulement ; le format S (iPhone) viendra plus tard. Les défauts 1 et 3, propres au téléphone, sortent donc du périmètre ; le 2 reste à traiter dans un lot de design :

1. Sur téléphone, la carte de connexion touche les bords de l'écran (pas de marge latérale).
2. Le texte de l'éditeur est en retrait d'environ 54 px par rapport à l'en-tête (marge des poignées de BlockNote) : alignement à revoir, surtout sur téléphone.
3. Sur téléphone, le titre de niveau 1 du document est disproportionné (deux lignes pour « Chapitre premier »).

**Décision proposée** : le jugement visuel par Mistral n'est plus un test. Il est remplacé par des **vérifications programmées** dans le navigateur, déterministes et rapides (`v2/contrats/pile/affichage.test.js`) : en pseudo-langue, sur téléphone et sur ordinateur, en clair et en sombre, aucun texte d'interface hors ⟦ ⟧, aucun défilement horizontal, rien hors de l'écran, aucun texte coupé ; un test plante exprès un défaut pour prouver que le détecteur le trouve. Les captures restent produites à chaque clôture, et Claude les relit.

## Arbitrage de Sylvain

(À compléter.)
