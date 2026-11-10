# Revue de clôture de l'étape 6, « Application » (2026-11-10)

- Relecteur : **Claude** (grille du § 6 des règles). L'audit complet du 10/11/2026 (GLM-5.3, tout `v2/`, chaque constat vérifié et corrigé ou arbitré : `docs/v2-audits/2026-11-10-0657-audit-complet.md`) sert de relecture approfondie de l'étape ; audits partiels avant chaque fusion.
- Statut : revue écrite ; à arbitrer par Sylvain.

## Ce que l'étape a livré

6a comptes, invitations et partage ; 6b interface des formats M et L (coquille de Mantine, volets, plan, lecture d'abord sur écran tactile, vert foncé) ; format S (téléphone) ; 6c dossiers personnels et Partagé avec moi ; 6d dossiers d'équipe ; back-office, lot 1 ; à la clôture, l'interrupteur du suivi des modifications (comme la v1).

## Grille

1. **Couches** : respectées, vérifiées par le lint, renforcé après l'audit (imports entre adaptateurs, imports dynamiques, textes en dur dans les expressions). Design et technique dans des lots séparés.
2. **API publique** : contrat vert.
3. **Comment Docs le fait** : lu à chaque lot (règle 11). Écarts décidés par Sylvain et notés : dossiers et équipes sur le modèle du serveur de fichiers (§ 36 du journal), compte dans le bandeau, interface en vert foncé, titres 4 et 5, sans alignement ; à la clôture, l'interrupteur du suivi des modifications (Docs n'a pas de mode suggestion).
4. **Redondance avec l'amont** : aucune fondation modifiée.
5. **Simplicité** : un audit complet a fait retirer du code mort et un script cassé ; une seule fonction d'appel côté client.
6. **Sécurité et droits** : droits vérifiés par le serveur à chaque requête ; en-têtes de sécurité (comme Docs) ; service fermé, entrée par lien ; sauvegarde nocturne de la base, restauration essayée sur le VPS.
7. **Tests** : 206 rapides, 52 sur la pile (Chromium ; Firefox et WebKit dans GitHub, dans l'image de Playwright), test en ligne chaque nuit et après chaque fusion.
8. **Licences** : contrat vert.
9. **Mémoire** (`npm run mesurer`, environnement de Claude) : 167 Mo au repos (serveur 34, collaboration 84, PostgreSQL 43, Redis 6) ; 252 Mo avec 10 documents ouverts ; 320 Mo pour un livre de 1 000 paragraphes ouvert par deux personnes (ouverture en 1,3 s). Le script de mesure lisait encore l'ancien texte d'état : corrigé.

## Critères de sortie

1. Parcours de bout en bout (se connecter, créer, partager, ranger, équipes, ouvrir, écrire, relire) : **tenu** (pile, trois navigateurs).
2. Pseudo-langue sans chaîne oubliée : **tenu**, étendue à la clôture aux listes, à Partagé avec moi, à une équipe, à la fenêtre de partage et au refus du back-office, en L et en S (les dates, données d'`Intl`, et les noms saisis ne sont pas des textes d'interface).
3. Catalogue anglais préparé : **tenu** (toutes les clés, traduites ; 6 identiques au français, des mots communs).
4. Langue du document : **renoncement n° 14** (Sylvain, 10/11/2026), tout document en français.

## Limites et suites

- Interrupteur du suivi : pendant le suivi, l'éditeur ne voit pas la liste à accepter (il arrête le suivi pour arbitrer), et la typographie à la frappe est coupée (défaut de BlockNote, déjà en veille). L'acceptation **une à une** d'une suggestion faite par un éditeur ne marche pas encore (« Tout accepter » marche, comme l'acceptation une à une des suggestions d'un correcteur) : à examiner.
- Lot de design en attente : fenêtres et notifications de Mantine à la place des boîtes du navigateur, noms accessibles des boutons par ligne, table de pictos unique, typographie du catalogue français.
