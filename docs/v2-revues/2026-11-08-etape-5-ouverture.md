# Revue d'ouverture de l'étape 5, « Relecture » (2026-11-08)

- Relecteur : Claude ; grille du § 6 des règles appliquée au plan `docs/v2-etape-5-plan.md`.
- Statut : revue écrite ; arbitré par Sylvain le 08/11/2026.

## Grille

1. **Couches** : suggestions, commentaires et historique viennent de BlockNote et de y/hub ; à nous : les permissions par branche (adaptateur y/hub et serveur), les routes des commentaires (si l'option a est retenue) et l'interface pour accepter et refuser. Rien dans une fondation.
2. **API publique** : `SuggestionsExtension`, `RESTYjsThreadStore`, `YHubVersioningExtension` et les composants de commentaires et d'historique sont exportés par BlockNote ; les branches de y/hub sont un paramètre documenté (`?branch=`).
3. **Redondance avec l'amont** : aucune ; la question des commentaires (option a ou b) est celle d'un choix entre deux montages fournis.
4. **Simplicité** : trois renoncements proposés (règle D2, couleurs stockées, cartes appariées), qui évitent du code à nous.
5. **Sécurité et droits** : l'option a met les droits des commentaires côté serveur ; les suggestions restent garanties par y/hub (branche principale fermée au correcteur).
6. **Tests** : scénarios par couche, dont l'écriture forcée d'un correcteur dans la branche principale, et la campagne de saisie de la v1.
7. **Exports propres** : la typographie en mode suggestion est le premier risque vérifié (lot 0).
8. **Licences** : rien de nouveau (BlockNote et y/hub déjà présents).
9. **Design et technique** : les composants de BlockNote tels quels ; la seule interface nouvelle (accepter, refuser) est soumise en captures.

## Arbitrage de Sylvain

08/11/2026 : voir « Arbitrage » dans `docs/v2-etape-5-plan.md`.
