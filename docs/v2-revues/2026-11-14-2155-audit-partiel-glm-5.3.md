# Audit partiel avant fusion (2026-11-14)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 242733 signes envoyés, 2842 reçus (et 8770 de réflexion) ; réflexion `low` ; 13 s ; arrêt : stop
- Diff audité : `v2/` de `40af423` à `3f7aa80` (10 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le lot applique la décision de Sylvain du 14/11/2026 (« Corriger » sans volet, pastille animée) de façon cohérente sur les trois couches touchées, avec l'ADR 0008 et les deux catalogues mis à jour et des tests de pile adaptés. Les points à revoir portent surtout sur le message de bilan : une phrase assemblée par morceaux contrairement à la règle 26, et un chemin de succès non testé hors essai réel. Une redondance mineure dans les réglages et deux questions de conditions de course complètent l'audit.

## Constats
1. **[important]** grille 9 (traductions), `v2/application/client/Edition.jsx:430` — Le message de bilan est assemblé par morceaux : `[…].filter(Boolean).join(' ')` colle deux textes traduits avec une espace, contrairement à la règle 26 (« pas de phrase assemblée par morceaux »). Proposer une clé unique `margo.bilanAvecArret` avec paramètres nommés (ICU gère les parties optionnelles), ou deux messages distincts si l'arrêt se dit séparément.
2. **[question]** grille 9, `v2/application/client/Edition.jsx:417` et `v2/i18n/fr.json:560` — `margo.corrigeDebut` dit toujours « la sélection », mais le message ne dépend pas de `choisie` : si « Corriger » peut être déclenché sans sélection (ou sur tout le texte par un autre chemin), la phrase est fausse. Vérifier les déclencheurs possibles ; sinon, paramétrer la clé par la portée.
3. **[question]** grille 6 (correction), `v2/application/client/Edition.jsx:420-432` — L'effet se déclenche sur le passage de `margo.enCours` à faux, puis lit le *dernier* message de Margo dans `margo.fil`. Si l'état `enCours` et l'arrivée du bilan dans `fil` sont deux mises à jour distinctes, l'effet peut tomber sur un fil sans bilan (message absent) ou sur le bilan d'une demande précédente (message périmé, par exemple si la personne a envoyé une saisie manuelle entre-temps). Vérifier l'atomicité des mises à jour de `margo` et lier le message à la demande plutôt qu'au dernier élément du fil.
4. **[mineur]** grille 4 (simplicité), `v2/design/reglages.js:104` et `v2/design/composants/Coquille.jsx:335` — `margoOccupe.processing: true` est mort : la prop `processing={Boolean(occupe)}` est posée après le décomposition et l'écrase toujours. Retirer `processing` du réglage (et de la table ADR 0008, `v2/adr/0008-design.md:56`), ou l'omettre de la prop et laisser le réglage décider — un seul des deux.
5. **[mineur]** grille 7 (tests), `v2/contrats/pile/margo.test.js:64-86` — Le nouveau test ne couvre que le message de début et le cas d'erreur (« indisponible ») ; le chemin de succès (message de bilan après correction, ligne 427-431 d'`Edition.jsx`) n'est couvert que par l'essai réel (`REEL`). Un test avec réponse simulée (comme le fait `telephone.test.js:379` avec `p.route`) montrerait le bilan sans modèle réel.

## Points de grille sans remarque
1, 2, 3, 5, 8, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. *Juste*, corrigé pour ce lot : le bilan et la raison d'un arrêt sont deux messages, plus une phrase recollée. (L'assemblage du volet Margo, antérieur à ce lot, reste ; à reprendre avec la refonte en bulles.)
2. *Faux*, avec la preuve : `BoutonCorriger` n'appelle `surClic` que s'il y a une sélection (`if (selection) corriger.surClic(selection)`) ; « Corriger » n'existe pas sans sélection.
3. *Juste*, corrigé : le bilan lu est celui des messages ajoutés depuis l'envoi (`margo.fil.slice(avant)`), plus le dernier du fil. Les mises à jour du fil précèdent celle de `enCours` dans la même demande.
4. *Juste*, corrigé : `processing` n'est plus dans le réglage (posé par le composant), ligne ADR retirée, `size` seul décidé.
5. *Juste*, corrigé : un test avec réponse simulée vérifie le bilan et la raison de l'arrêt, sans modèle réel.

## Arbitrage de Sylvain

(À compléter.)
