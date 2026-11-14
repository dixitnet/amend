# Audit partiel avant fusion (2026-11-14)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 229309 signes envoyés, 2247 reçus (et 3180 de réflexion) ; réflexion `low` ; 9 s ; arrêt : stop
- Diff audité : `v2/` de `b6aa77e` à `83745e4` (4 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Diff très court : une correction d'espacement dans les tiroirs du format S (feuille CSS, test de pile), la mise à jour de la décision correspondante dans l'ADR 0008, et une note de campagne mise à jour. Le fond est correct et la décision de Sylvain est bien tracée. Le principal écart est formel : la nouvelle règle CSS ne porte pas la clé de réglage qu'exige l'ADR 0008 pour les feuilles de `design/feuilles/`.
## Constats
1. **[important]** Grille 1/9 (design décidé), `v2/design/feuilles/telephone.css:103-106` — La nouvelle règle `.amend-volet-onglets .mantine-Tabs-panel { padding-top: var(--mantine-spacing-sm); }` est commentée avec la date de la décision de Sylvain, mais pas avec la clé du réglage au format `/* réglage : css.telephone.volets */` exigé par l'ADR 0008 (révision du 08/11/2026 : « chaque règle porte la clé d'un réglage de cette table ») et vérifié par le contrat statique `contrats/statiques/design-decide.test.js`. La décision existe bien dans la table (`v2/adr/0008-design.md:157`), mais la feuille et la table ne sont pas reliées par la clé : le contrat devrait échouer, ou la clé est manquante par oubli. Proposer d'ajouter le commentaire `/* réglage : css.telephone.volets */` sur la règle.
2. **[mineur]** Grille 7 (tests), `v2/contrats/pile/telephone.test.js:309` — Le test vérifie `haut >= 8` alors que le réglage décidé est l'espacement `sm` de Mantine (12 px) : un réglage dégradé à `xs` (10 px) ou même 8 px passerait encore, et le seuil 8 est une valeur choisie par le test, pas la décision. Proposer de comparer à la variable (`var(--mantine-spacing-sm)` résolue) ou au moins à 12, pour que le contrat suive le réglage et non un seuil approximatif.
3. **[question]** Grille 7, `v2/exploitation/campagne/reference.json:33-37` — La note dit que l'échec en ligne « n'est pas reproduit, cause non établie » et le verdict « en ligne » passe à `passe`, mais le statut global reste `connu` (l'échec local persiste). Si c'est bien l'intention (l'écart de pile locale reste à comprendre), rien à changer ; sinon, préciser dans la note que seul l'échec local maintient le statut `connu`, pour éviter qu'un lecteur croie la campagne faussement en échec.
## Points de grille sans remarque
2, 3, 4, 5, 6, 8, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides

## Réponse de Claude

1. *Faux*, avec la preuve : la règle suit directement le bloc `/* réglage : css.telephone.volets */`, qui couvre les deux règles ; une seconde ligne pour la même clé fait échouer le contrat `design-decide.test.js` (une clé, un commentaire).
2. *Juste*, corrigé : le test compare à la valeur résolue de `--mantine-spacing-sm`, plus à un seuil de 8 px.
3. *Hors sujet* : c'est l'intention ; le statut reste « connu » tant que l'échec de la pile locale (Chromium L) subsiste, la note le dit déjà.

## Arbitrage de Sylvain

(À compléter.)
