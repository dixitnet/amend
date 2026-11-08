# Revue de clôture de l'étape 2, « Droits » (2026-11-08)

- Relecteur : **Claude** (Mistral suspendu depuis le 08/11/2026, règles de la v2, § 6) ; grille de revue du § 6 appliquée au diff de l'étape.
- Diff relu : `662ccdb..` (branche `claude/determined-edison-rybime`), 23 fichiers de `v2/`.
- Statut : revue écrite ; arbitré par Sylvain le 08/11/2026.

## Grille

1. **Couches** : un lot par couche (contrat statique ; domaine ; serveur ; design ; client et traductions, avec l'adaptateur BlockNote). Le domaine (`domaine/droits.js`) n'importe rien. Le serveur ne décide rien lui-même : il appelle `roleEffectif`, `capacites` et `acces`. Le client lit les capacités, jamais le nom du rôle. L'adaptateur y/hub est inchangé. Rien à corriger.
2. **API publique** : contrat statique `contrats/statiques/api-publique.test.js` : tout import vise un sous-chemin déclaré dans les `exports` du paquet, jamais un fichier interne ni `node_modules`. Les imports actuels le respectent tous.
3. **Redondance avec l'amont** : aucune vérification d'écriture chez nous ; y/hub applique la lecture seule, BlockNote rend l'éditeur non modifiable (`editable`). Rien de refait.
4. **Simplicité** : une méthode inutilisée de la table des accès (`existe`) retirée pendant la revue. La route de développement des rôles ne porte que deux règles, nécessaires à la cohérence de la table (pas de second propriétaire, propriétaire intouchable) ; les règles complètes de gestion des accès restent à l'étape 6.
5. **Sécurité et droits** :
   - droits décidés côté serveur et appliqués par y/hub ; écriture forcée depuis le navigateur refusée (T5) ; client Yjs qui écrit quand même refusé (T2) ;
   - document fermé et document inconnu indiscernables (404 identiques) ;
   - rôles piégés sans effet (le plus restrictif ; `Object.hasOwn` et le contrôle de type évitent `__proto__` et `['editeur']`) ;
   - **limite assumée** : la session de développement est un simple nom, et l'identifiant en dérive. En ligne (`v2.amend.ink`, derrière le mot de passe de Caddy), toute personne qui a ce mot de passe peut se présenter sous le nom d'une autre et prendre ses droits. Le critère « session forgée » est tenu pour un cookie forgé ou modifié (signature), pas pour cette usurpation, qui disparaît avec le lien magique (étape 6). À ne pas oublier : ne pas ouvrir `v2.amend.ink` au-delà des personnes de confiance d'ici là ;
   - retrait d'un rôle pendant une connexion : effet à la connexion suivante seulement (rapport, constat 2 ; étape 6).
6. **Tests** : couverture complète des scénarios retenus (`docs/v2-tests/etape-2-rapport.md`).
7. **Exports propres** : sans objet.
8. **Licences** : aucune dépendance nouvelle.
9. **Design et technique** : la mention de lecture seule est un lot de design à part (`design/` seul) ; le code technique ne contient ni style ni texte.

## Critères de sortie

1. Un lecteur et un correcteur ne peuvent pas modifier un document, par l'interface, par une WebSocket directe ou par un cookie forgé : **tenu** (T2, T3, T5), avec la limite de la session de développement ci-dessus.
2. Droits décidés à un seul endroit : **tenu** (`domaine/droits.js`).
3. T0 à T5 verts : **tenu** dans la session (Chromium) ; WebKit et Firefox : CI GitHub.
4. Aucun import d'un chemin interne d'une fondation : **tenu** (contrat statique).

## Arbitrage de Sylvain

08/11/2026 : étape close, fusion dans `main`.
