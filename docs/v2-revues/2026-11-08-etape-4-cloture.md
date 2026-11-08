# Revue de clôture de l'étape 4, « Éditeur » (2026-11-08)

- Relecteur : **Claude** (Mistral suspendu depuis le 08/11/2026) ; grille du § 6 des règles appliquée au diff de l'étape (`bec9478..`).
- Statut : revue écrite ; arbitré par Sylvain le 08/11/2026.

## Grille

1. **Couches** : domaine (typographie), extensions (typographie, note), adaptateur (schéma, branchement, menu), design (liste des notes, feuille des notes), application (branchement), i18n. **Écart** : les lots 3 et 4 ont chacun touché plusieurs couches dans un même commit (une fonction de bout en bout), contre la règle « un lot, une couche ». Le découpage des dossiers reste respecté, et le lint le vérifie ; à l'avenir, découper aussi les commits par couche.
2. **API publique** : contrat vert. `editor.prosemirrorState` (accesseur public, que BlockNote conseille de remplacer par `transact` quand c'est possible) est employé à dessein pour lire la sélection pendant une transaction en cours, cas où `transact` rendrait l'état d'avant.
3. **Redondance avec l'amont** : la typographie passe par le module de BlockNote ; seule notre annulation le remplace, à cause d'un défaut amont noté. Les bornes et les flèches de la note compensent un comportement connu des contenus en ligne à texte : candidats à proposer en amont avec les notes (décision de Sylvain : plus tard).
4. **Simplicité** : passe « seulement le code nécessaire » faite pendant l'étape ; une règle ajoutée puis reconnue inutile a été retirée (flèche au deuxième signe d'une note). Extension de note : une centaine de lignes, dont la moitié de commentaires.
5. **Sécurité et droits** : le correcteur ne peut ni taper, ni coller, ni insérer de note (T5) ; y/hub reste la garantie.
6. **Tests** : tous les scénarios ont leur test, sauf la recette sur vrai clavier et vrai iPad (Sylvain).
7. **Exports propres** : typographie et NFC à la frappe et au collage ; les notes gardent leur texte et sa mise en forme dans le document, prêtes pour les exports (étape 7).
8. **Licences** : aucune dépendance nouvelle (ProseMirror et le module de règles de saisie étaient déjà installés par BlockNote, MIT) ; contrat des licences vert.
9. **Design et technique** : la feuille des notes ne contient que des réglages liés à l'ADR 0008 (contrat). **À confirmer par Sylvain** sur capture : taille de l'appel, taille et couleur de la note ouverte, et l'absence d'espace entre l'appel et le texte ouvert.

## Critères de sortie

1. Typographie à la frappe et au collage, Retour arrière : **tenu**.
2. Note insérée, numérotée, modifiée à deux, rechargée, copiée-collée : **tenu**.
3. Schéma du livre, y compris au collage : **tenu**.
4. Aucune modification de BlockNote ; aucun élément de design hors de `v2/design/` ; T0 à T5 verts : **tenu** (Chromium ici, WebKit et Firefox par la CI).

## Arbitrage de Sylvain

08/11/2026 : étape close, fusion dans `main`. Restent ouverts : l'apparence des notes (tailles, couleur, espace après l'appel, à confirmer sur capture) et un raccourci clavier pour insérer une note.
