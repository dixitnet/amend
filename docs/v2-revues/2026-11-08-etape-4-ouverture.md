# Revue d'ouverture de l'étape 4, « Éditeur » (2026-11-08)

- Relecteur : **Claude** (Mistral suspendu depuis le 08/11/2026, règles de la v2, § 6) ; grille du § 6 appliquée au plan `docs/v2-etape-4-plan.md`.
- Statut : revue écrite ; arbitrage de Sylvain à venir.

## Grille

1. **Couches** : un lot par couche (domaine, extensions, adaptateur, tests). La règle de typographie est dans le domaine, parce que Margo s'en servira aussi (étape 8). Rien à corriger.
2. **API publique** : tout passe par les points d'extension publics de BlockNote. **Point à trancher** : un greffon ProseMirror (`prosemirrorPlugins`) demanderait d'importer `prosemirror-state` dans `extensions/`, ce que la règle 1 interdit. Le plan propose d'essayer d'abord sans (question 3).
3. **Redondance avec l'amont** : BlockNote n'a ni notes de bas de page ni typographie française (étude du 07/11/2026 : aucun ticket). Rien de refait ; les deux sont des candidats à proposer en amont (décision de Sylvain).
4. **Simplicité** : le plan retire du schéma ce qu'un livre n'utilise pas (question 1) et propose trois renoncements (question 5). Les notes choisissent le modèle qui demande le moins de code à nous (a). La typographie garde ses cinq règles, sans en ajouter.
5. **Sécurité et droits** : ni la typographie ni les notes ne doivent permettre à un lecteur ou un correcteur d'écrire : scénario T5 prévu ; y/hub reste la garantie.
6. **Tests** : scénarios par couche (`docs/v2-tests/etape-4-scenarios.md`), dont des données piégées pour la typographie, et une recette sur vrai clavier et vrai iPad.
7. **Exports propres** : la typographie à la frappe et au collage, et le passage en NFC au collage, servent directement la propreté des exports ; les notes devront rester lisibles par les exports (étape 7) : le modèle a garde leur texte dans le document, avec sa mise en forme.
8. **Licences** : aucune dépendance nouvelle prévue.
9. **Design et technique** : l'apparence des notes est une décision de design (captures soumises, rien d'inventé) ; les extensions ne posent que des éléments et attributs sémantiques. Incohérence relevée et corrigée dans les règles : la règle 19 disait encore que les extensions « posent des classes », ce que le lint interdit désormais hors de `v2/design/`.

## Risques

- **Mode suggestion (étape 5)** : la typographie remplace des caractères pendant la frappe ; en mode suggestion, il faudra que le remplacement reste une seule suggestion propre (la v1 avait dû traiter ce cas). À vérifier à l'étape 5, noté dans le plan.
- **Saisie composée** (touches mortes, iPad, dictée) : un raccourci clavier peut ne pas voir certains caractères ; c'est l'objet de l'essai de la typographie avant tout développement.

## Arbitrage de Sylvain

(À compléter.)
