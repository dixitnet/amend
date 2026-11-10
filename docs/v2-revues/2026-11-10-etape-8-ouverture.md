# Revue d'ouverture de l'étape 8, « IA » (Margo) (2026-11-10)

- Relecteur : **GLM-5.3** (Scaleway), réflexion `low`, sur le plan `docs/v2-etape-8-plan.md`, avec les règles de la v2 et le registre des renoncements. Envoyé : environ 45 500 signes ; reçu : environ 2 600 jetons (dont 1 100 de réflexion).
- Réponses de Claude, point par point, à la suite de l'avis. Plan corrigé le même jour. Sylvain arbitre les questions Q1 à Q3.

## Avis de GLM-5.3 (tel que reçu)

## Constats

1. **important** — Conservation de 30 jours chez Anthropic vs engagement de confidentialité. Le plan cite : « **conservation de 30 jours exigée chez Anthropic** : incompatible avec l'objectif “vos textes ne sont pas conservés” (journal, § 24). À réserver aux essais, ou à un choix explicite, tant que la question n'est pas tranchée », mais le même plan inscrit Fable 5.2 dans les « modèles mobilisables au départ ». Proposition : sortir Fable de la liste initiale et l'inscrire comme « activable après décision de Sylvain » ; tant que la question § 24 n'est pas tranchée, le back-office ne doit pas permettre de l'activer par erreur. À arbitrer par Sylvain avant le lot 1.

2. **important** — Le critère de sortie contredit un renoncement du plan. Clôture : « banc Margo rejoué (critère du § 8 des règles) » ; renoncements à inscrire : « le banc d'essai ». Si le banc d'essai est renoncé, que signifie « banc Margo rejoué » ? Proposition : préciser dans le plan ce que « banc Margo » désigne (un jeu de scénarios rejouables, distinct du banc d'essai interactif renoncé ?) et l'écrire comme tel dans le renoncement, sinon le critère de sortie est inexécutable.

3. **important** — Le lot 1 touche trois couches. Règle 5 : « Un lot de développement ne touche qu'une couche, plus au besoin l'adaptateur qui la relie à une fondation. » Le lot 1 : « adaptateur `ia/`, domaine (capacité, garde-fous, signes), route serveur en flux, quatre outils, suggestions signées par le serveur » — couches 2, 4 et 5. Proposition : redécouper en trois lots (adaptateur `ia/` + contrat ; domaine ; serveur/application), chacun vérifiable seul, même s'ils se fusionnent vite.

4. **question** — Consignes « par langue de document » alors que la langue par document a été renoncée. Règle 30 : « par langue de document » ; renoncement 14 : « Langue enregistrée par document (règle 28) […] tout document est en français ». Le plan point 14 : « une seule, dans le catalogue par langue (règle 30) ». Faut-il une consigne unique en français pour l'instant, avec le mécanisme de catalogue prêt pour d'autres langues ? Proposition : le dire explicitement dans le plan pour éviter un développement de catalogues multi-langues sans besoin.

5. **question** — La signature commune « Margo (IA) » était un défaut constaté en v1. Leçon 4 : « les défauts venaient du contenu des réponses : […] signature commune “Margo (IA)” » ; le plan point 11 la reconduit : « les suggestions signent “Margo (IA)”, posées par le serveur ». S'agissait-il d'un défaut de contenu (à corriger) ou seulement d'une limite acceptée ? Si c'était un défaut, le report (« attend un besoin constaté ») contredit la leçon ; à clarifier avec Sylvain.

6. **question** — `tool_choice` limité à `auto` pour Fable : le moteur serveur repose sur l'appel d'outils (`lire`, `chercher`, `proposer`, `commenter`). Avec `auto` seulement, le modèle peut répondre sans outil. Les garde-fous de la v1 (« coupe-circuit sur les refus en série ») couvrent-ils aussi le cas « réponse sans proposition » ? Proposition : ajouter ce cas aux garde-fous du domaine et au banc.

7. **mineur** — Modèle de repli non précisé. « un refus de sécurité possible (`stop_reason: refusal`) : à traiter, avec un modèle de repli déclaré » : lequel, et sa rétention de données (voir constat 1) ? Proposition : nommer le repli dans le plan et vérifier qu'il respecte § 24.

8. **mineur** — Choix du modèle « au back-office » alors que le back-office est à l'étape 9. Lot 1 : « essai sur un texte de test, sans interface ». Comment le modèle est-il choisi pour cet essai (fichier de configuration ?) et le lot 1 inclut-il déjà l'écran back-office ? Proposition : préciser que le lot 1 utilise la configuration, l'écran de choix venant avec l'étape 9, ou découper.

9. **mineur** — Textes de l'interface Margo et traductions. Lot 2 : « onglet Margo (fil, saisie, portée automatique, liens vers les blocs, bilan) et bouton “Corriger”, composants de Mantine tels quels » — rien sur les catalogues `i18n/` (règle 23) ni sur le respect de la séparation présentation/technique (règles 16-17) : « composants de Mantine tels quels » laisse croire que le lot 2 pose du design. Proposition : préciser que le lot 2 écrit les composants techniques qui délèguent à `v2/design/`, et que tous les textes (bilan, messages de limite par code, « Nouvelle conversation ») passent par les catalogues avec pluriel (règle 26 : « 3 corrections, 2 commentaires »).

10. **mineur** — Coût de Fable sans garde de coût spécifique. « 8 $ / 40 $ par million de jetons […] quatre fois Sonnet 5.5 », avec une portée par défaut « tout le texte » et « seuils fixés sur les journaux réels ». Les seuils seront-ils par modèle (une limite en signes Sonnet autorise 4× le coût en Fable) ? Proposition : prévoir des limites par modèle au domaine, pas seulement globales.

11. **question** — Rétention chez Scaleway. Le plan note la rétention d'Anthropic mais rien sur celle de Scaleway (DeepSeek V4.1 Flash, GLM-5.3), qui serait le modèle par défaut de production. Faut-il vérifier et noter leurs conditions de conservation au même titre, pour cohérence avec § 24 ?

## Synthèse

Le plan est fidèle aux leçons de la v1 (un seul moteur, serveur, suggestions comme les autres) et ses écarts avec Docs sont justifiés et signalés. Trois points bloquants avant le lot 1 : la contradiction Fable/conservation § 24, le critère de sortie « banc Margo » face au renoncement du banc d'essai, et le lot 1 qui touche trois couches. Le reste est de la précision à apporter, à arbitrer avec Sylvain.
## Réponses de Claude

1. **Juste.** Fable 5.2 a été ajouté à la demande de Sylvain ; la contradiction avec la conservation de 30 jours est réelle. Le plan le garde dans la liste, mais signalé ; question **Q1** pour Sylvain.
2. **Juste.** Deux choses portaient le même nom. Le renoncement vise la page « banc » du back-office de la v1 ; le critère de sortie, c'est le texte et les consignes de `docs/banc-margo-montfaucon.md` rejoués dans la vraie boucle de la v2. Le plan le dit maintenant.
3. **Juste** (règle 5). Lot 1 redécoupé en trois lots : adaptateur, domaine, serveur. Le lot client devient le 4.
4. **Juste.** Consignes en français seulement (renoncement n° 14), catalogue prêt pour d'autres langues. Corrigé.
5. **Juste sur la forme.** La signature commune n'est pas un défaut du contenu des réponses : c'est une limite acceptée par Sylvain (journal, § 22). Leçon 4 réécrite ; le plan reste inchangé sur le fond.
6. **Écarté.** Une réponse sans outil est légitime (une question, un avis). Les garde-fous visent les boucles qui échouent, pas les réponses courtes. Le journal du serveur notera l'arrêt de chaque demande, comme dans la v1.
7. **Juste.** Repli : le modèle de Margo par défaut. Ajouté, dans la question Q1.
8. **Juste.** Le modèle est lu dans la configuration du serveur pendant les lots 1 à 4 ; son choix au back-office vient avec la rubrique IA (étape 9). Corrigé.
9. **Juste.** Le lot client précise maintenant : composants techniques sans style, apparence par `v2/design/`, textes dans `i18n/` avec pluriels, messages de limite par code.
10. **Écarté pour l'instant** (règle 6 de `CLAUDE.md` : pas de seuil sur des hypothèses). Les limites restent en signes ; le coût par modèle se lira dans les journaux avant de fixer quoi que ce soit. Q1 limite déjà Fable aux essais.
11. **Juste.** Question **Q3** : conditions de conservation de Scaleway à vérifier et à noter, avec un engagement écrit avant toute promesse (journal, § 24).

## Questions pour Sylvain

- **Q1.** Fable 5.2 : (a) mobilisable seulement pour des essais, tant que la conservation de 30 jours n'est pas tranchée ; ou (b) mobilisable sans réserve. Repli en cas de refus : le modèle par défaut de Margo.
- **Q2.** Découpage en cinq lots (adaptateur, domaine, serveur, client, design) au lieu de trois : d'accord ?
- **Q3.** Je vérifie et note les conditions de conservation de Scaleway (documentation publique) avant le lot 3 ?
