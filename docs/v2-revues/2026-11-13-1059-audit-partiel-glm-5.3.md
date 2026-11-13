# Audit partiel avant fusion (2026-11-13)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 242669 signes envoyés, 3623 reçus (et 16150 de réflexion) ; réflexion `low` ; 49 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `aeaad0f` (7 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff outille la campagne de test multi-navigateurs/multi-formats : gestes factorisés dans `gestes.mjs`, verdicts purs dans `verdicts.mjs`, relevés JSON comparés à une référence, le tout dans la couche exploitation (imports permis) et sans dépendance nouvelle. L'ensemble est sobre, bien testé sur les fonctions pures et cohérent avec la référence commitée (les scénarios retirés H17/H21/H22 ont bien disparu de `reference.json`). Je relève un cas limite de détection du mode en formats M/S, deux redondances mineures et quelques points d'attention.

## Constats
1. **[important]** Grille 6 (correction), `v2/exploitation/campagne/gestes.mjs:44` — Quand le menu « … » offre à la fois « Passer en mode Éditer » et « Passer en mode Corriger », le mode courant manquant est « Lire », mais la fonction rend `'Corriger'` (le commentaire de la ligne 29 dit bien « celui qui manque est le mode courant »). Si `[data-amend-lecture]` (ligne 33) n'est pas encore rendu ou ne couvre pas ce cas, `pourEcrire` (ligne 59) ne basculera pas et la frappe échouera en Lire. Proposer de rendre `'Lire'` dans ce cas, ou d'éclaircir quand l'attribut `data-amend-lecture` est posé.
2. **[mineur]** Grille 4 (simplicité / redondance), `v2/exploitation/campagne/commun.mjs:183` et `v2/exploitation/campagne/verdicts.mjs:106` — La table des signes `SIGNES` est définie deux fois à l'identique. Importer celle de `verdicts.mjs` dans `commun.mjs`.
3. **[mineur]** Grille 4 (simplicité), `v2/exploitation/campagne/gestes.mjs:12` et `v2/exploitation/campagne/verdicts.mjs:6` — Deux exports nommés `FORMATS` avec des sémantiques différentes (configurations de fenêtre d'un côté, liste de lettres de l'autre), dans le même dossier. Renommer l'un des deux (par ex. `LETTRES_FORMATS`) pour éviter la confusion.
4. **[mineur]** Grille 6 (cas limite), `v2/exploitation/campagne/verdicts.mjs:23-25` — Avec `--fois=0`, `verdict` rend `'panne'` pour tout scénario (testé comme tel, ligne 20 du test) et la campagne échoue sur des scénarios jamais joués. Garantir `FOIS >= 1` dans `lancer` (`commun.mjs:189`) ou rendre `'echoue'`/ignorer quand `fois === 0`.
5. **[mineur]** Grille 6 (cas limite), `v2/exploitation/campagne/bilan.mjs:15` — `?.split('=')[1]` tronque toute valeur d'option contenant un « = » (chemin de rapport, commit). Utiliser `slice(nom.length + 1)` ou `indexOf`. Par ailleurs le message d'usage (ligne 18) omet `--referencer`, documenté seulement en tête de fichier.
6. **[question]** Grille 7 (tests), `v2/exploitation/campagne/bilan.mjs:33-53` et `v2/exploitation/campagne/commun.mjs:233-241` — Seules les fonctions pures de `verdicts.mjs` sont testées ; la lecture récursive des relevés, l'écriture du relevé par famille et le code de sortie du bilan ne le sont pas. Est-ce assumé pour des scripts d'exploitation (ADR 0010, exception pour l'exploitation), ou faut-il un test minimal de `bilan.mjs` sur un dossier d'artefacts ?
7. **[question]** Grille 6 (condition de course), `v2/exploitation/campagne/gestes.mjs:32` — `selecteur(page).count()` rend immédiatement 0 : si le bandeau n'est pas encore rendu à l'ouverture, `modeChoisi` emprunte le chemin du menu « … » pour un format L. Si c'est un risque réel, attendre brièvement le sélecteur ou le bandeau avant de trancher.

## Points de grille sans remarque
1 (couches : exploitation et tests importent tout, permis), 2 (API publique), 3 (redondance avec l'amont), 5 (sécurité et droits), 8 (exports propres et typographie), 9 (traductions : textes en dur en français dans l'exploitation, couverts par l'exception de l'ADR 0010), 10 (licences : aucune dépendance nouvelle).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides

## Réponse de Claude

1. **Juste**, corrigé : quand le menu n'offre pas « Lire » mais offre un mode d'écriture, le mode courant est « Lire » ; `null` seulement pour qui n'a aucun choix.
2. **Juste**, corrigé : une seule table des signes, dans `verdicts.mjs`.
3. **Juste**, corrigé : les configurations d'écran s'appellent `ECRANS` (`gestes.mjs`) ; `FORMATS` reste la liste des lettres.
4. **Juste**, corrigé : le lanceur joue chaque scénario au moins une fois.
5. **Juste**, corrigé : la valeur d'une option garde ses « = » ; le message d'usage cite `--referencer`.
6. **Juste**, corrigé : un test joue `bilan.mjs` sur un dossier de relevés (sous-dossier compris) et vérifie le rapport et le code de sortie, sur un scénario de la référence commitée.
7. **Accepté tel quel** : les gestes sont appelés sur une page déjà ouverte et connectée (`ouvrir` attend l'éditeur et la connexion) ; le bandeau est alors rendu.

## Arbitrage de Sylvain

(À compléter.)
