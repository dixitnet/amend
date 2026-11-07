# Revue d’ouverture de l’étape 1 (2026-11-07)

- Relecteur : Mistral, modèle `mistral-large-latest` ; consommation : 11892 jetons en entrée, 1150 en sortie
- Pièces : `docs/v2-regles-developpement.md`, `docs/v2-renoncements.md`, `docs/v2-veille.md`, `v2/adr/0001-architecture-docs-allege.md`, `v2/adr/0002-couches.md`, `v2/adr/0003-blocknote.md`, `v2/adr/0004-yhub.md`, `v2/adr/0005-connexion.md`, `v2/adr/0006-licence.md`, `v2/adr/0007-relecteur-ia.md`, `v2/adr/0008-design.md`, `v2/adr/0009-traductions.md`, `docs/v2-etape-1-plan.md`, `Arborescence de v2/ (fichiers suivis)`
- Commit relu : `da1f947`
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis du relecteur

## Synthèse
Le plan de l'étape 1 est bien aligné sur les règles et ADR validées. Il pose solidement les fondations techniques et architecturales (couches, lint, traductions, design) avec un minimum de code, tout en mesurant les contraintes réelles (mémoire). Aucun blocage identifié, mais plusieurs points importants à clarifier avant développement (ADR 0008/0009, dépendances, tests de contrat). L'étape peut être lancée après corrections mineures et validation des ADR proposées.

---

## Constats

**R1** **[important]** **1, 2, 8** – *v2/adr/0008-design.md* et *v2/adr/0009-traductions.md*
Les ADR 0008 (design) et 0009 (traductions) sont marquées "proposées" alors que l'étape 1 en dépend (jetons CSS, catalogues, lint). Leur statut doit être validé par Sylvain avant le développement, sinon les règles de lint et de structure ne seront pas stables.
→ **Proposition** : Valider ces ADR en urgence (elles sont cohérentes avec les règles) ou reporter leur application à l'étape 2.

---

**R2** **[important]** **1, 3** – *docs/v2-etape-1-plan.md* (section "Fondations épinglées")
Les versions des fondations sont listées sans préciser si elles sont compatibles entre elles (ex: `@y/y` 14 rc avec `@y/prosemirror` 2 rc). BlockNote utilise-t-il ces versions exactes dans ses exemples de collaboration ?
→ **Proposition** : Ajouter un tableau de compatibilité dans le plan, ou un lien vers le `package.json` de référence de BlockNote (ex: leur exemple `07-collaboration`).

---

**R3** **[important]** **5, 6** – *docs/v2-etape-1-plan.md* (section "Adaptateurs minimaux")
L'authentification de y/hub est marquée "provisoire" (identité factice), mais le plan ne précise pas comment les tests de contrat (critère de sortie) vérifieront les droits réels (ex: "un utilisateur non authentifié ne peut pas écrire"). Sans cela, la sécurité de l'étape 3 sera difficile à valider.
→ **Proposition** : Ajouter un test de contrat minimal pour y/hub (ex: rejet d'une connexion sans cookie valide) et le lister dans les critères de sortie.

---

**R4** **[mineur]** **4** – *docs/v2-etape-1-plan.md* (section "Design minimal")
Le composant de présentation "page d'édition" est mentionné sans préciser s'il inclut des éléments spécifiques à BlockNote (ex: barre d'outils, menu "/"). Cela pourrait créer une dépendance technique dans le design.
→ **Proposition** : Limiter le composant à un conteneur générique (ex: `<div role="document">`) et reporter les éléments BlockNote à l'étape 4 (extensions).

---

**R5** **[mineur]** **8** – *docs/v2-etape-1-plan.md* (section "Fondations épinglées")
La licence de `@y/hub` (AGPL-3.0 ou commercial) n'est pas explicitement vérifiée pour compatibilité avec l'AGPL-3.0 de la v2. Bien que le plan mentionne que les paquets `xl-` de BlockNote sont utilisables (GPL-3.0), une confirmation pour y/hub est manquante.
→ **Proposition** : Ajouter une note dans le plan confirmant que la version de y/hub utilisée est sous AGPL-3.0 (ou que la licence commerciale n'est pas activée).

---

**R6** **[question]** **6** – *docs/v2-etape-1-plan.md* (section "Tests")
Les tests de contrat pour BlockNote et y/hub ne sont pas détaillés. Par exemple, pour BlockNote : "un document rechargé retrouve son contenu" est un test bout-en-bout, pas un contrat. Quels comportements précis des fondations seront vérifiés ?
→ **Proposition** : Lister dans le plan les contrats minimaux pour chaque fondation (ex: pour y/hub : "persistance du document après redémarrage du worker", pour BlockNote : "sérialisation JSON d'un bloc de paragraphe").

---

**R7** **[mineur]** **10** – *docs/v2-etape-1-plan.md* (section "Traductions minimales")
Le plan prévoit des catalogues `fr.json` et `en.json` avec les mêmes clés, mais ne précise pas si les textes anglais sont des traductions complètes ou des placeholders (ex: "TODO: translate"). Cela pourrait fausser le test de complétude.
→ **Proposition** : Ajouter une règle : les textes anglais doivent être soit traduits, soit identiques au français (pour les termes techniques comme "BlockNote"), mais jamais des placeholders.

---

## Points de grille sans remarque
3, 7, 9, 11.

## Réponse de Claude

- **R1 (ADR 0008 et 0009 « proposées »)** : *accepté, à trancher par Sylvain*. Juste : le lint et l'ossature de l'étape 1 en dépendent. Les deux ADR sont soumises à sa validation avant tout développement ; je ne lance rien sans.
- **R2 (compatibilité des versions)** : *corrigé*. Le plan donne désormais un tableau des versions et de ce que chaque paquet exige, relevé dans les dépendances déclarées sur npm : `@y/y` 14.0.0-rc.29 est la seule version qui satisfait à la fois BlockNote 0.57.0 (^14.0.0-rc.26) et y/hub 0.10.1 (^14.0.0-rc.29), et c'est celle de l'adaptateur y/hub de Docs.
- **R3 (contrat de sécurité de y/hub)** : *corrigé*, avec une nuance. Les droits par rôle restent l'objet de l'étape 3, mais le greffon provisoire refuse dès maintenant toute connexion sans session valide, et un contrat le vérifie (critère de sortie 1). Cela fixe la forme de l'adaptateur sans anticiper l'étape 3.
- **R4 (page d'édition et BlockNote)** : *corrigé*. Le composant de présentation devient un conteneur générique qui reçoit l'éditeur en emplacement ; l'apparence propre de BlockNote reste habillée par le thème jusqu'à l'étape 4.
- **R5 (licence de y/hub)** : *corrigé*. y/hub est publié sous « AGPL-3.0 OR PROPRIETARY » ; nous l'utilisons sous AGPL-3.0, sans licence commerciale, ce qui est compatible avec la v2 (ADR 0006). Mention ajoutée au tableau des versions.
- **R6 (contrats non détaillés)** : *corrigé*. Cinq contrats listés dans le plan (une seule copie de Yjs 14 ; écriture et relecture BlockNote/Yjs, y compris côté serveur ; dictionnaire français ; y/hub : refus sans session, écriture, persistance après redémarrage ; jetons de design jusqu'au thème de BlockNote).
- **R7 (textes anglais d'attente)** : *corrigé*. Règle ajoutée : vraies traductions seulement ; texte identique admis uniquement sur une liste d'exceptions ; vérifié par le test de complétude.

## Arbitrage de Sylvain

(À compléter.)
