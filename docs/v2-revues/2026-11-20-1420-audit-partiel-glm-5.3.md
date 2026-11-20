# Audit partiel avant fusion (2026-11-20)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 399246 signes envoyés, 3245 reçus (et 10741 de réflexion) ; réflexion `low` ; 70 s ; arrêt : stop
- Diff audité : `v2/` de `5e71c3a` à `3f0e8ce` (6 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce lot est un changement d'adresse d'exploitation (v2.amend.ink → app.amend.ink) : Caddyfile, script de migration `adresse.sh` idempotent avec retour arrière, mise à jour de l'installation et du déploiement, et un vrai jeu de tests qui rejoue le script sur des copies. L'ensemble est soigné et bien couvert ; les constats portent sur la suppression d'un test de sécurité existant, quelques fragilités de correspondance dans le script bash, et le comportement de `--essai` qui écrit réellement dans les fichiers qu'on lui donne.

## Constats
1. **[important]** Tests — `v2/tests/unitaires/adresse.test.js:4` : le test « les secrets des adresses sont masqués » (`adresseSansSecret`, lien de connexion, connecteur Claude) est supprimé et remplacé, sans que le diff montre le retrait du module `application/serveur/adresse.js`. Si le module existe toujours, il perd toute couverture (règle 13) ; s'il est supprimé, c'est un autre lot qui aurait dû le montrer. Vérifier et, si la fonction reste, lui rendre un test dédié plutôt que de recycler le fichier.
2. **[question]** Sécurité et droits — `v2/exploitation/prod/adresse.sh:21` : `--essai` « ne touche ni aux services ni au réseau », mais il modifie bien les fichiers `CADDYFILE` et `ENV` qu'on lui passe (sed, ajout de blocs, sauvegardes `.avant-adresse` en `adresse.sh:111-112`). Lancé par erreur avec les chemins par défaut (`/etc/caddy/Caddyfile`, `/opt/amend/v2.env`), il altère la production sans recharger. Proposer un refus (ou un avertissement sonore) quand `--essai` porte sur les chemins par défaut.
3. **[mineur]** Correction — `v2/exploitation/prod/adresse.sh:152` : le `sed` utilise `$ANCIENNE` (`v2.amend.ink`) comme expression régulière sans échapper les points ; idem `sed "1s/^$ANCIENNE/$NOUVELLE/"` en `adresse.sh:121` et les `grep`/`awk` des lignes 66-73. Le risque est théorique ici, mais un hôte futur contenant un métacaractère casserait silencieusement la détection. Échapper les points (ou comparer en chaîne fixe).
4. **[mineur]** Correction — `v2/exploitation/prod/adresse.sh:153-156` : si le redémarrage à la nouvelle adresse échoue, le script remet l'ancien `v2.env` et redémarre avec `|| true` : si ce second redémarrage échoue aussi, le message dit « l'ancienne est remise » alors que les services sont arrêtés. Distinguer les deux cas dans le message d'erreur (et suggérer `journalctl` pour les deux services).
5. **[mineur]** Correction — `v2/exploitation/prod/adresse.sh:60` : `version_de` attend un JSON compact (`"version":"…"` sans espace) ; une sérialisation avec espaces ferait échouer la détection et le script croirait que l'adresse ne répond pas. Rendre l'extraction insensible aux espaces, ou interroger un point d'entrée plus stable.
6. **[mineur]** Tests — `v2/exploitation/prod/adresse.sh:122` : les chemins d'échec de Caddy (bloc refusé à l'étape 1, renvoi refusé à l'étape 3) et le retour arrière après échec de redémarrage ne sont pas exercés, car `--essai` court-circuite `caddy validate`. Un test pourrait au moins vérifier que le fichier est bien restauré tel quel quand `recharger_caddy` échoue (en simulant via un `CADDYFILE` cassé et un `caddy validate` réel, si disponible).

## Points de grille sans remarque
1, 2, 3, 8, 9, 10.

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides

## Réponse de Claude

1. **Juste, et c'était une faute de ma part : corrigé.** J'avais écrit mon test dans `tests/unitaires/adresse.test.js`, qui existait déjà (le masquage des secrets des adresses dans le journal) : il était écrasé. Le fichier d'origine est rétabli tel qu'il était dans `main` (aucune différence), et le test du changement d'adresse est dans `tests/unitaires/changement-adresse.test.js`. Le module `application/serveur/adresse.js` n'a jamais été touché.
2. **Juste, corrigé.** `--essai` refuse les chemins de production : il demande `CADDYFILE=…` et `ENV=…` (test ajouté).
3. **Juste, corrigé.** Les deux noms sont employés en motifs avec leurs points échappés (`grep`, `sed`, `awk`) ; un test vérifie qu'un nom voisin (« v2xamend.ink ») n'est pas pris pour l'ancienne adresse.
4. **Juste, corrigé.** Deux messages distincts : l'ancienne adresse remise et la v2 repartie, ou les services arrêtés ; les deux journaux sont indiqués.
5. **Juste, corrigé.** L'extraction de la version admet des espaces autour des deux-points.
6. **Limite acceptée.** Les refus de Caddy et l'échec d'un redémarrage ne se jouent que sur le VPS (`caddy` et `systemctl` n'existent pas dans l'environnement de test) ; dans les trois cas le script remet la copie qu'il vient de prendre avant d'écrire, et s'arrête. Je n'ajoute pas de crochet de test dans un script de production pour les simuler.

Après corrections : `npm run format:check`, `npm run lint`, `npm test` au vert.

## Arbitrage de Sylvain

(À compléter.)
