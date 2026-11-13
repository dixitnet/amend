# amend.ink v2 : procédure de test de l'éditeur, du suivi des modifications et des commentaires

> **Remplacée le 13/11/2026** par la campagne de test (`procedure-campagne.md`) : trois navigateurs, trois formats, état de référence, bilan. Ce document garde la liste d'origine des scénarios.

Statut : **proposée** le 10/11/2026 (Sylvain : « une procédure de test complète… on finalise les tests, on fait le bilan et seulement ensuite on corrige »). Aucun correctif tant que le bilan n'est pas fait (le correctif du plantage trouvé par le scénario à cinq est mis de côté : `docs/v2-tests/correctif-suivi-en-attente.patch`).

## Comment

- Chaque famille est un script de la campagne (`v2/exploitation/campagne/scenarios-<famille>.mjs` : `editeur` A, `suivi` B, `correcteurs` C, `commentaires` D, `roles` E, `robustesse` F, `historique` G ; outils communs dans `commun.mjs`), joué sur la pile complète locale : plusieurs navigateurs, un par personne, comme les tests T5. Chaque étape vérifie le texte **chez chacun**, le panneau des suggestions, les ancres, et relève toute erreur de la page (écran blanc, erreur de console).
- Chaque scénario est joué **trois fois** (les défauts de synchronisation ne se montrent pas à chaque fois), dans **Chromium, WebKit et Firefox** (flux `v2-campagne` de GitHub ; Firefox, laissé de côté le 10/11/2026, repris le 13/11/2026 à la demande de Sylvain). Les formats M et S restent à faire.
- Le bilan : un tableau par scénario (passé, échoué, fréquence), chaque défaut décrit avec sa reproduction minimale, son niveau (notre code ou une fondation) et sa gravité. Les corrections viennent après, sur décision.

## Scénarios

### A. Éditeur seul (une personne, puis deux en direct)

1. Frappe, Entrée, Retour arrière en début de paragraphe (fusion), titres, listes, gras et italique ; Annuler et Rétablir.
2. Collage : texte brut, HTML (traitement de texte), long texte (10 000 et 100 000 signes).
3. Typographie à la frappe et au collage (espaces, guillemets, apostrophes).
4. Deux éditeurs qui écrivent en même temps, dans des paragraphes différents, puis dans le même paragraphe.

### B. Suivi des modifications par un éditeur (interrupteur)

1. Activer, taper à la fin d'un paragraphe, arrêter : une suggestion à son nom ; l'accepter, la refuser (une à une, puis tout).
2. Activer et arrêter plusieurs fois de suite, vite, en tapant entre chaque bascule.
3. En suivi : supprimer un mot, un paragraphe entier, une sélection à cheval sur deux paragraphes ; remplacer un mot.
4. En suivi : insérer au **début**, au **milieu** et à la fin d'un paragraphe ; couper un paragraphe (Entrée) ; en fusionner deux.
5. En suivi : Annuler, puis arrêter le suivi et Annuler encore.
6. En suivi : mise en forme (gras, titre, liste).
7. Basculer pendant qu'un correcteur ou un autre éditeur écrit ; basculer juste après la création, la réponse, la **résolution** d'un fil de commentaire (défaut connu).
8. Deux éditeurs au même paragraphe, l'un en suivi, l'autre en direct.
9. Recharger en suivi (l'interrupteur revient arrêté ; les suggestions restent).
10. Pendant le suivi, la liste des suggestions est masquée ; l'arrêter et arbitrer, y compris ses propres suggestions (défaut connu : l'acceptation une à une).

### C. Correcteurs

1. Ajout, suppression, remplacement, au début, au milieu (défaut d'affichage connu) et à la fin d'une phrase.
2. Deux correcteurs au même endroit ; une suggestion sur une suggestion.
3. Nouveau paragraphe proposé ; paragraphe supprimé proposé.
4. Arbitrage de l'éditeur pendant que le correcteur continue d'écrire.

### D. Commentaires, par l'interface

1. Créer (éditeur, correcteur), répondre, modifier, supprimer son message, réagir.
2. Résoudre, rouvrir ; supprimer un fil ; le fil reste à qui l'a ouvert (Q4).
3. Commenter un passage puis le modifier, le supprimer, le proposer en suggestion.
4. Échec d'ancrage (sélection sur deux paragraphes) : le message (Q3).

### E. Rôles et accès

1. Lecteur, correcteur, éditeur, propriétaire : ce que chacun voit et peut faire.
2. Changer le rôle de quelqu'un pendant qu'il a le document ouvert.

### F. Robustesse

1. Coupure du réseau d'une personne pendant qu'elle écrit (en direct, en suivi), puis retour.
2. Rechargement en plein travail ; deux onglets pour la même personne.
3. Redémarrage du service de collaboration pendant une séance.

### G. Historique

1. Versions qui s'enregistrent ; revenir à une version ; ce que deviennent les suggestions et les commentaires.

## Ce qui manque à Claude pour tester

- **Les comportements anormaux que Sylvain a vus** : quoi, dans quel ordre, quel navigateur et quel format (Mac, iPad, iPhone), sur v2.amend.ink ou ailleurs. Ce sont les premiers scénarios à écrire. Déjà signalé (10/11/2026) : « je n'arrive pas à accepter certaines de mes propres modifs, le bouton ne fait rien » (scénario B10).
- **Un texte réel** (un chapitre) si Sylvain le souhaite, plutôt que le texte fabriqué.
- **En ligne** : la session de Claude ne fait pas passer les WebSocket ; tout se joue sur la pile locale (même code). Les essais sur v2.amend.ink restent manuels, ou dans la CI de GitHub (qui, elle, passe).
- **Safari réel sur iPad et iPhone** : WebKit dans Playwright s'en approche sans être Safari ; un essai à la main de Sylvain sur ses appareils reste utile.
