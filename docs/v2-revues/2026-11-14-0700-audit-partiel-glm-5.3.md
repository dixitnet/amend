# Audit partiel avant fusion (2026-11-14)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 224164 signes envoyés, 2769 reçus (et 7511 de réflexion) ; réflexion `low` ; 16 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `6b43b86` (9 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff retire le comportement « le format S ouvre en Lire » au profit d'« ouvre en mode d'écriture sans clavier » (décision du 13/11/2026, renoncement n° 13), adapte proprement l'adaptateur, l'application et les tests, et outille la campagne (presse-papiers Firefox, coupure réseau, défaut connu B10 documenté). L'ensemble est cohérent avec les règles ; je relève surtout des points de robustesse des tests et deux questions de définition et de veille amont.

## Constats
1. **[question]** Grille 6 (correction) — `v2/application/client/Edition.jsx:670`
   La nouvelle condition `avecVoletDroit && (suggestions || peutMargo || listeFils)` utilise une variable `avecVoletDroit` qui n'apparaît nulle part dans le diff ; je ne peux pas vérifier qu'elle est bien définie et calculée (probablement ailleurs dans le fichier, hors diff). À confirmer avant fusion.
2. **[mineur]** Grille 7 (tests) — `v2/contrats/pile/telephone.test.js:258-264`
   L'assertion « volet de droite en Éditer » somme les comptes de deux boutons différents (`Corrections, commentaires et Margo (IA)` et `Relecture`) et ne vérifie que le total dépasse 0 : le test passe même si le mauvais sélecteur est présent, et ne dit pas lequel. Proposer d'asserter explicitement le bouton attendu au format S (comme le fait `ouvrirCorrections` dans `gestes.mjs:166`).
3. **[mineur]** Grille 6 (correction) — `v2/exploitation/campagne/gestes.mjs:170-173`
   Dans `ouvrirOnglet`, le `waitFor(...).catch(() => {})` avale silencieusement l'échec : si le volet ne s'ouvre pas, l'échec se manifestera plus loin (clic sur un onglet absent) avec un diagnostic trompeur. Proposer de laisser remonter l'erreur ou de journaliser la cause.
4. **[question]** Grille 6 (correction) — `v2/exploitation/campagne/gestes.mjs:191-197`
   Le collage Firefox passe par un vrai `Control+V`. Le format L vise le Mac (règle 21 bis) : si la campagne tourne un jour sur macOS, `Control+V` ne colle pas (c'est `Meta+V`). Si la campagne ne tourne que sur Linux/nuage, rien à faire ; sinon, dériver la touche de `process.platform`.
5. **[question]** Grille 3 (redondance avec l'amont) — `v2/contrats/pile/relecture.test.js:427-431` et `v2/exploitation/campagne/reference.json:262-264`
   Le défaut B10 (acceptChanges d'une plage sans effet quand l'auteure de la suggestion est aussi celle du texte voisin) est un défaut de fondation, correctement documenté et couvert par un test « à faire ». Mais rien dans le diff ne montre un signalement en amont (règle § 4.4 : « un défaut d'une fondation se signale en amont, avec un cas minimal reproductible ») ni une entrée dans `docs/v2-veille.md` (le commentaire y renvoie sans preuve). À vérifier hors diff ; si absent, l'ajouter.

## Points de grille sans remarque
1, 2, 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. *Faux* : `avecVoletDroit` est défini plus haut dans `Edition.jsx` (`const avecVoletDroit = mode !== 'lire'`) ; lint et tests passent.
2. *Juste* : le test attend maintenant le bouton « Relecture » du format S.
3. *Voulu* : l'attente ne doit pas échouer quand l'onglet n'existe pas (une lectrice n'a pas l'onglet des corrections) ; le clic suivant échoue alors avec la cause.
4. *Juste* : la touche vient de la plateforme (Meta sur macOS).
5. *Juste en partie* : la veille a l'entrée (`docs/v2-veille.md`, 14/11/2026) ; **le signalement à l'amont n'est pas fait** : il attend l'accord de Sylvain (publication).

## Arbitrage de Sylvain

(À compléter.)
