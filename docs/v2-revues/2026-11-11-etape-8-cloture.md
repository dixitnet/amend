# Revue de clôture de l'étape 8, « IA » (Margo) (2026-11-11)

- Relecteur : **GLM-5.3** (Scaleway), réflexion `low`, sur le dossier de clôture : plan de l'étape, liste des commits, banc Montfaucon rejoué (`docs/v2-tests/etape-8-banc-montfaucon.md`), audit partiel du 10/11 et ses réponses, plan du back-office, règles et registre des renoncements. Envoyé : environ 64 000 signes ; reçu : environ 2 000 jetons.
- Le code ajouté après le premier audit partiel a eu son propre audit : `docs/v2-revues/2026-11-11-0626-audit-partiel-glm-5.3.md`.
- Réponses de Claude point par point à la suite. Statut : **arbitré par Sylvain le 11/11/2026 ; étape 8 close.**

## Avis de GLM-5.3 (tel que reçu)

## Constats

1. **[bloquant]** L'arbitrage de l'audit partiel n'a pas eu lieu : « ## Arbitrage de Sylvain — (À compléter.) ». Le déroulé du § 6 des règles prévoit que « Sylvain arbitre les désaccords, puis donne (ou non) son accord pour clore l'étape ». Claude conteste trois constats (A8, A9, A11) ; sans arbitrage, la clôture ne peut pas être prononcée. **Proposition** : faire arbitrer A8/A9/A11 (et valider les corrections A1–A7, A10) avant toute clôture.

2. **[bloquant]** La revue de clôture prévue n'existe pas encore. Le plan dit : « Clôture (critère du § 8 des règles) : banc Margo rejoué […] ; **puis revue de clôture** », et le § 6 exige à la clôture une « revue d'architecture **et** de code de tout ce que l'étape a produit ». Le dossier ne contient que l'audit partiel d'avant fusion (diff `bd671c5`→`2f1581e`), pas la revue du diff complet de l'étape. **Proposition** : lancer la revue de clôture (GLM-5.3) sur le diff de l'étape, Claude répond point par point, Sylvain arbitre.

3. **[important]** Les renoncements de l'étape 8 ne sont pas inscrits au registre. Le plan annonce : « Renoncements à inscrire (`docs/v2-renoncements.md`) : `xl-ai` ; les demandes toutes faites autres que "Corriger" ; le banc d'essai du back-office ; le connecteur "Inviter Claude" (MCP) », mais le registre s'arrête au n° 14 (10/11/2026) et ne contient aucune de ces entrées. Règle 9 : « Chaque renoncement est **écrit** dans le registre ». **Proposition** : ajouter les quatre lignes (n° 15 à 18) avec raison et condition de retour, avant clôture.

4. **[important]** Le critère de sortie est formellement atteint mais le résultat appelle une décision de Sylvain non prise. Le banc est « rejoué » et « résultats notés » (critère du plan), mais le constat central est : « **Retenue insuffisante sur le fond** dès que la consigne y pousse (consignes 1, 4, 5) », avec trois pistes dont « rien n'est lancé » et « à décider par Sylvain ». Clore sans arbitrage figerait un Margo moins retenu que la consigne ne l'exige, alors que la piste 1 (renforcer la consigne du catalogue) est peu coûteuse et au bon niveau (règle 30). **Proposition** : faire arbitrer les trois pistes par Sylvain ; si piste 1 retenue, rejouer le banc avant clôture.

5. **[question]** Confidentialité et Fable. Le plan note : « **conservation de 30 jours exigée chez Anthropic** : incompatible avec l'objectif "vos textes ne sont pas conservés" (journal, § 24). Sylvain l'accepte (Q1, réponse b) ; la formulation d'accueil du § 24 ne pourra donc pas être employée tant que Fable est proposé. » L'acceptation est actée, mais rien ne dit où est tracée l'interdiction d'employer cette formulation (journal ? ADR ? renoncement ?), ni ce que dit l'écran d'accueil aujourd'hui. **Proposition** : inscrire cette contrainte au journal des décisions (et vérifier qu'aucun texte d'interface actuel ne promet la non-conservation) ; à arbitrer avec le point 4.

6. **[mineur]** Écart assumé mais non arbitré dans le dossier : le plan dit « son choix au back-office vient avec la rubrique IA du back-office (**étape 9**) », or la rubrique IA a été faite le 11/11/2026 pendant l'étape 8 (« fait le 11/11/2026, version simple ("backoffice (simple)", Sylvain) », commit `f28896f`). L'accord de Sylvain est cité, mais le plan de l'étape 8 et celui de l'étape 9 devraient le refléter pour que la revue de clôture de l'étape 9 ne redécouvre pas ce code. **Proposition** : une ligne dans chaque plan (fait en avance, arbitré), et inclure ce diff dans la revue de clôture de l'étape 8.

7. **[mineur]** Le plan annonce un « lot 5, Design, seulement si Sylvain veut régler quelque chose après l'avoir vu ». Rien dans le dossier ne dit si Sylvain a vu l'onglet Margo et s'il renonce au lot 5. **Proposition** : une phrase d'arbitrage dans le plan (lot 5 renoncé ou à faire) avant clôture.

8. **[question]** Le banc a été joué sur DeepSeek V4.1 Flash uniquement. La piste 2 (« Rejouer le banc avec Sonnet 5.5 en référence ») est ouverte, et Fable 5.2 est « mobilisable sans réserve » sans avoir passé le banc. Le critère de sortie ne l'exige pas, mais : le repli sur « le modèle par défaut » en cas de refus de Fable a-t-il été testé ne serait-ce qu'une fois dans la boucle réelle ? **Proposition** : question à poser à Sylvain à l'arbitrage ; à défaut, le noter dans la veille ou le plan de l'étape 9.

9. **[mineur]** Points positifs à consigner pour la clôture : la vérification avant lot 1 est faite et documentée (« Le serveur écrit une suggestion attribuée à "margo" (test de service), et la palette de BlockNote accepte notre bouton par son point d'extension public ») ; l'audit partiel a produit des corrections réelles avec tests (A1 NFD, A2 historique borné) ; les couches sont respectées (un lot = une couche, commits design séparés : `09cce66`, `5601a13`, `08998a2`) ; les consignes vivent dans le catalogue (`i18n/consignes/fr.json`, règle 30) ; la signature « margo » est posée par le serveur. Rien à faire, c'est le socle qui rend la clôture possible une fois les points 1 à 4 réglés.

## Avis

L'étape ne peut pas être close en l'état : manquent l'arbitrage de Sylvain sur l'audit partiel, la revue de clôture par l'autre IA, l'inscription des quatre renoncements et l'arbitrage des pistes du banc (dont le renforcement de la consigne, peu coûteux). Sous ces quatre conditions remplies — et le banc rejoué si la consigne change —, le travail est au niveau demandé par les règles et la clôture paraît saine.
## Réponses de Claude

1. **Juste.** Les deux audits partiels attendent l'arbitrage de Sylvain : question **Q1**. La fusion du 10/11 a été faite avec son accord, après lecture du compte rendu des constats.
2. **Juste en partie.** Le présent document est la revue de clôture. La revue « de code de tout ce que l'étape a produit » est faite en deux audits partiels qui couvrent tout le diff de l'étape (`bd671c5` → `2f1581e`, puis `2f1581e` → fin) ; le second a été lancé à la suite de ce constat.
3. **Juste, corrigé.** Renoncements n° 15 à 18 inscrits au registre, avec leur raison et ce qui ferait y revenir.
4. **Juste.** Les pistes du banc sont la question **Q2**. Si la consigne change, je rejoue le banc avant de clore.
5. **Juste, noté.** La contrainte est écrite au journal des décisions (11/11/2026). Aucun texte de l'interface de la v2 ne promet aujourd'hui la non-conservation (aucune occurrence dans `v2/i18n/`).
6. **Juste, corrigé.** Le plan de l'étape 8 et celui du back-office disent que la rubrique IA a été faite en avance, sur demande de Sylvain ; son code est couvert par le second audit partiel.
7. **Juste.** Question **Q3** : lot 5 (design) à faire ou à abandonner, après avoir vu l'onglet en ligne.
8. **Juste.** Le repli n'a été essayé qu'avec un modèle simulé (noté au plan), et Fable n'a pas passé le banc : il faut la clé d'Anthropic dans la v2. Question **Q4**.
9. Rien à faire.

## Questions pour Sylvain

- **Q1.** Arbitrage des deux audits partiels : accord avec les réponses de Claude (constats faux écartés, constats justes corrigés) ?
- **Q2.** Retenue de Margo sur le fond (banc) : 1) renforcer la consigne et rejouer le banc ; 2) rejouer avec Sonnet 5.5 en référence (clé d'Anthropic) ; 3) ne rien changer.
- **Q3.** Lot 5 (design de l'onglet Margo) : à faire après l'avoir vu, ou abandonné ?
- **Q4.** Clé d'Anthropic dans la v2 (`margo.sh` la recopie si elle est dans le `.env` de la v1) : la prévoir, pour essayer Sonnet et Fable et leur repli ?
- **Q5.** Avec ces réponses : clore l'étape 8 ?

## Arbitrage de Sylvain (11/11/2026)

« 1 oui, 2 1, 3 ok, 4 fait, 5 ok » :

- Q1 : accord avec les réponses de Claude aux deux audits partiels.
- Q2 : piste 1. Consigne renforcée, banc rejoué : 71 / 87 au lieu de 54 / 87 (`docs/v2-tests/etape-8-banc-montfaucon.md`).
- Q3 : l'onglet Margo convient tel quel ; pas de lot de design.
- Q4 : clé d'Anthropic posée dans la v2 par Sylvain. Sonnet 5.5 et Fable 5.2 se choisissent au back-office ; ils n'ont pas été essayés par Claude (pas de clé dans son environnement).
- Q5 : étape 8 close.
