# amend.ink v2 : plan de l'étape 8, « IA » (Margo)

Statut : **arbitré par Sylvain le 10/11/2026** (A oui, B non, C fil, D non ; « alléger au max en termes d'interface et de dev » ; puis « ajoute un bouton Corriger dans la barre flottante, sinon ok » et « ajoute Fable aux modèles mobilisables »). **Développé le 10/11/2026** (« et lance le dev », Sylvain), sur la branche `claude/clever-pascal-wa0gee`, pas encore fusionné : lots 1 à 4 ci-dessous, puis audit partiel (`docs/v2-revues/2026-11-10-2151-audit-partiel-glm-5.3.md`). Revue d'ouverture faite le 10/11/2026 (GLM-5.3, `docs/v2-revues/2026-11-10-etape-8-ouverture.md`) : plan corrigé en conséquence ; questions arbitrées par Sylvain le même jour (« 1b, 2 ok, 3 non, reprends seulement le modèle qui a bien marché pour la v1 »). Avant le lot 1 : la vérification technique ci-dessous.

## Ce que fait Docs (vérification n° 0)

Lu dans `suitenumerique/docs` (commit du 10/11/2026) :

- **Pas de panneau IA.** L'IA est dans l'éditeur : un bouton dans la barre de mise en forme sur sélection (`components/AI/AIToolbarButton.tsx`) et le menu de BlockNote AI (`components/AI/AIMenu.tsx`, paquet `@blocknote/xl-ai`) : quelques actions toutes faites et un champ libre, puis Accepter, Refuser ou Réessayer.
- **Le navigateur fait le travail** : il envoie l'état du document ; le serveur (`ai-proxy`, `core/services/ai_services/blocknote.py`) ne fait que relayer vers le modèle ; le navigateur applique les opérations (`applyDocumentOperations`), avec un curseur « IA » visible des autres.
- Pas de conversation conservée. Droit : qui peut modifier le document ; limite de débit par document et par personne. Un ancien mode « sélection → remplacement » (corriger, reformuler, résumer, traduire) subsiste.

### Ce qu'est `xl-ai`

`@blocknote/xl-ai` est le module d'IA de BlockNote (licence GPL-3.0 ou commerciale, comme les autres paquets `xl-` ; la v2 en utilise déjà deux pour le PDF, la licence n'est donc pas l'obstacle). Il ajoute à l'éditeur un menu d'IA et une mécanique complète : il décrit le document au modèle (blocs en HTML ou JSON), lui donne un outil pour le modifier (insérer, remplacer, supprimer des blocs), applique la réponse **dans le navigateur** au fil de l'écriture, la montre en différences (barré, souligné), et propose d'accepter ou de refuser **le tout**. Il parle au modèle par le Vercel AI SDK, à travers un relais côté serveur (chez Docs, `ai-proxy`).

Pourquoi on y renonce (renoncement à inscrire) :

1. il travaille sur ce que le navigateur peut envoyer d'un coup : un livre entier ne tient pas dans un aller-retour ;
2. c'est le navigateur qui écrit : l'auteur des modifications serait déclaré par le client, pas posé par le serveur ;
3. on accepte ou refuse le tout, dans le seul navigateur de la personne ; chez nous, les propositions de Margo doivent être des suggestions comme les autres, triées une par une, visibles des autres éditeurs ;
4. les limites en signes et les journaux doivent rester sur le serveur.

## Leçons de la v1

1. Deux moteurs pour un même besoin (Corrections IA et Margo) : deux consignes, deux jeux de garde-fous, deux modèles à entretenir.
2. Les actions nommées par un verbe marchent mieux qu'un champ libre pour corriger (13/10/2026).
3. La boucle côté serveur, avec des outils, a permis de relire un livre entier.
4. Les défauts venaient surtout du contenu des réponses : remplacements « à l'identique », lots refusés sans motif, coût sur un livre entier. La signature commune « Margo (IA) » est une limite connue, acceptée par Sylvain sans développement (journal, § 22).
5. Le choix du modèle au back-office, sans code, a tenu.

## Ce que fait l'étape

### Interface

1. **Onglet Margo (IA)** du volet droit (déjà réservé) : un fil de conversation et une zone de saisie en bas. Ni demandes toutes faites, ni choix du modèle, ni réglages.
2. **Portée automatique** : la sélection s'il y en a une, sinon tout le texte ; une ligne discrète au-dessus de la saisie le dit. Pas de sélecteur, pas de portée « Section ».
3. **Réponses** : les blocs cités sont des liens qui y mènent ; chaque demande finit par une ligne de bilan (« 3 corrections, 2 commentaires, dans Modifications »).
4. **Bouton « Corriger » dans la barre flottante** (barre de mise en forme de BlockNote, sur sélection), comme le bouton IA de Docs : il envoie à Margo la demande « Corriger » sur la sélection et ouvre l'onglet Margo sur la conversation. C'est la seule demande toute faite ; elle passe par le même moteur.
5. **Rien n'est écrit directement** : tout arrive en suggestions dans l'onglet Modifications, acceptées ou refusées comme celles d'une personne.
6. **Le fil reste dans le navigateur** le temps de l'onglet ; le serveur ne le garde pas. Un bouton « Nouvelle conversation ».
7. **Téléphone (format S)** : le même onglet ; le bouton « Corriger » dans la barre flottante si elle y est présente.

### Technique

8. **Un seul moteur, sur le serveur** (écart avec Docs, voir plus haut), outils réécrits pour la v2 : `lire`, `chercher`, `proposer`, `commenter`. `retirer` et `modifications` attendent un besoin constaté.
9. **Un seul modèle pour Margo** (pas de profils). Aux lots 1 à 3, il est lu dans la configuration du serveur ; son choix au back-office vient avec la rubrique IA du back-office (étape 9).
10. **Modèles mobilisables** au départ :
    - Anthropic : Sonnet 5.5 (`claude-sonnet-5-5`), Haiku 5.5 (`claude-haiku-5-5`), **Fable 5.2 (`claude-fable-5-2`)** ;
    - Scaleway : DeepSeek V4.1 Flash (`deepseek-v4.1-flash-1017`) seulement, le modèle qui a bien marché pour Margo dans la v1 (en production depuis le 04/11/2026) ; **modèle par défaut de Margo**.

    Fable 5.2, **mobilisable sans réserve** (Sylvain, 10/11/2026) ; à savoir :
    - le plus capable des modèles d'Anthropic ; contexte d'1 M jetons, sortie jusqu'à 128 K ;
    - **cher** : 8 $ / 40 $ par million de jetons (entrée / sortie), soit quatre fois Sonnet 5.5 ; lecture du cache à 0,20 $ ;
    - la réflexion ne se coupe pas (la v1 l'envoie désactivée pour les corrections : refusé par Fable) ; on règle seulement l'effort (`low` à `max`) ;
    - pas d'outil imposé (`tool_choice` `any` ou `tool` refusé) : seulement `auto` ;
    - un refus de sécurité possible (`stop_reason: refusal`) : à traiter, avec un modèle de repli déclaré ;
    - **conservation de 30 jours exigée chez Anthropic** : incompatible avec l'objectif « vos textes ne sont pas conservés » (journal, § 24). Sylvain l'accepte (Q1, réponse b) ; la formulation d'accueil du § 24 ne pourra donc pas être employée tant que Fable est proposé.
    - modèle de repli en cas de refus : le modèle de Margo par défaut.
11. **Attribution** : les suggestions signent « Margo (IA) », posées par le serveur. La signature par personne et par demande attend un besoin constaté.
12. **Droits** : capacité `utiliserMargo`, éditeurs seulement (Sylvain, 10/11/2026 : pas le correcteur).
13. **Signes** : comptés et journalisés côté serveur ; rien d'affiché dans le panneau ; une limite ne bloque que si elle existe (message par code) ; seuils fixés sur les journaux réels.
14. **Consigne** : une seule, plus celle de « Corriger », dans le catalogue des consignes, **en français seulement** (renoncement n° 14 : tout document est en français ; le catalogue reste prêt pour d'autres langues, règle 30) ; garde-fous repris de la v1 dans le domaine : nombre d'étapes, coupe-circuit sur les refus en série.
15. **Adaptateur `ia/`** : Anthropic (SDK officiel) et Scaleway, rien d'autre au départ.

### Renoncements à inscrire (`docs/v2-renoncements.md`)

`xl-ai` ; les demandes toutes faites autres que « Corriger » ; le banc d'essai **du back-office** (la page `#/admin/ia/banc` de la v1 ; le banc Montfaucon, lui, reste le critère de sortie) ; le connecteur « Inviter Claude » (MCP). Les deux derniers peuvent revenir plus tard sur les mêmes outils si le besoin se confirme.

## Vérification avant le lot 1

- Le serveur de la v2 peut-il écrire une suggestion au nom d'un auteur qui n'est pas une personne (« Margo (IA) ») ? Seul point technique incertain.
- La barre flottante de BlockNote accepte-t-elle un bouton à nous par son point d'extension public (comme Docs le fait) ?

## Lots

Une couche par lot (règle 5 ; constat 3 de la revue d'ouverture) :

1. **Adaptateur `ia/`** : Anthropic et Scaleway, en flux, avec son contrat (appel d'outils, refus, comptage des jetons et des signes).
2. **Domaine** : capacité `utiliserMargo`, garde-fous (étapes, refus en série), comptage en signes, consignes (catalogue français).
3. **Serveur** : route en flux, quatre outils, suggestions signées par le serveur ; modèle lu dans la configuration ; essai sur un texte de test, sans interface.
4. **Client** : onglet Margo (fil, saisie, portée automatique, liens vers les blocs, bilan) et bouton « Corriger » ; composants techniques sans style, l'apparence par `v2/design/` (composants de Mantine sans réglage nouveau) ; tous les textes dans `i18n/`, pluriels compris (« 3 corrections, 2 commentaires »), messages de limite rendus par code.
5. **Design**, seulement si Sylvain veut régler quelque chose après l'avoir vu.

Clôture (critère du § 8 des règles) : **banc Margo rejoué**, c'est-à-dire le texte et les consignes de `docs/banc-margo-montfaucon.md` passés dans la vraie boucle de la v2 sur un document d'essai, résultats notés ; puis revue de clôture.

## Ce qui a été fait (10/11/2026)

- Lot 1, adaptateur `ia/` : SDK officiel d'Anthropic (1.5.0) et API de Scaleway ; essai réel avec DeepSeek.
- Lot 2, domaine : `utiliserMargo`, garde-fous, signes, recherche d'un passage, consignes en catalogue (`i18n/consignes/fr.json`).
- Lot 3, serveur : route en flux, quatre outils, identité « margo » dans y/hub (branche des suggestions seulement), commentaires signés margo, repli, journal en nombres ; `exploitation/prod/margo.sh` pour les clés.
- Lot 4, client : composant de design `PanneauMargo` (commits de design à part), onglet Margo, bouton « Corriger », format S.
- Vérification avant le lot 1 : faite. Le serveur écrit une suggestion attribuée à « margo » (test de service), et la palette de BlockNote accepte notre bouton par son point d'extension public (`Components.FormattingToolbar.Button`, comme Docs).
- Écart avec le point 15 : pas de `fallbacks` côté Anthropic ; le repli est celui du plan (le modèle par défaut reprend la demande).
- Le choix du modèle au back-office, prévu à l'étape 9, a été fait le 11/11/2026 sur demande de Sylvain (« backoffice (simple) ») : `docs/v2-back-office-plan.md`, rubrique IA.
- Renoncements n° 16 à 19 inscrits au registre (11/11/2026 ; le n° 15 est celui des modèles de mise en page, étape 7).
- Clôture : banc rejoué (`docs/v2-tests/etape-8-banc-montfaucon.md`), revue de clôture (`docs/v2-revues/2026-11-11-etape-8-cloture.md`) ; arbitrée par Sylvain le 11/11/2026 : **étape 8 close** (consigne renforcée et banc rejoué, 71 / 87 ; pas de lot de design ; clé d'Anthropic posée).
- Le repli d'un modèle qui refuse n'a été essayé qu'avec un modèle simulé (pas de clé Anthropic dans l'environnement de Claude).
