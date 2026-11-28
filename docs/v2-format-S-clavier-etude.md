# amend.ink v2 : écrire sur téléphone, étude d'après Craft

Statut : **étude et maquette, rien n'est développé** (Sylvain, 28/11/2026 : « étudie et fais des maquettes, pas de dev »). Point de départ : deux captures de Craft sur iPhone envoyées par Sylvain, et la documentation de Craft. Maquette : https://claude.ai/artifact/ChctoMjjZZ6rmwvutwX4Qc (dans la session de Claude, hors du dépôt).

## Ce que fait Craft

- **En lecture** : rien de fixe, des pastilles translucides flottent sur le texte ; un crayon fait entrer en écriture.
- **En écriture** : le haut se réduit au retour et à une coche bleue ; une barre de six pictos est posée sur le clavier (insérer, « Aa », « ⋮ », indenter, coller, fermer le clavier). « Aa » ouvre un panneau de mise en forme.
- La taille du texte suit le réglage du système.

Craft est une application native : elle n'a pas la barre de Safari entre elle et le clavier.

## Ce que nous avons déjà

- **La barre fixe existe.** C'est celle de BlockNote pour téléphone (`.bn-mobile-formatting-toolbar`), affichée tant que le clavier est ouvert. BlockNote la pose **sur le clavier** ; nous l'avons remontée **sous le bandeau** le 12/11/2026 (`css.telephone.palette`), parce que Safari (iOS 26) empile sa pastille d'adresse et sa barre de saisie au-dessus du clavier. Elle est cachée pendant le défilement (13/11) ; son glissement latéral a été corrigé le 22/11.
- Elle porte **tous les boutons** sur une ligne et **défile de côté** : style du bloc, gras, italique, souligné, barré, exposant, surligner, retraits, lien, commenter, note.
- Docs emploie la même barre de BlockNote (même version, 0.57.0), avec ses boutons par défaut ; il ne la déplace pas et n'a ni panneau « Aa » ni bouton pour fermer le clavier.

## Ce que BlockNote permet

- La barre du téléphone prend n'importe quel composant de barre (`formattingToolbar`, API publique) : en choisir les boutons est de la **configuration**, comme nous le faisons déjà (`palette.js`).
- Un bouton qui ouvre un panneau : BlockNote le fait pour le style du bloc ; en mode téléphone (`UIModeContext`), les panneaux sortent de la barre sans retirer le focus au texte, donc sans fermer le clavier. Un panneau « Aa » à nous serait une **extension** par ce point, à vérifier sur un vrai iPhone.
- Fermer le clavier : retirer le focus à l'éditeur. Simple ; à vérifier sur un vrai iPhone aussi.

## Les variantes de la maquette

1. **La barre** : celle d'aujourd'hui ; une barre courte en haut (« Aa », gras, italique, note, commenter, puis fermer le clavier), sans défilement ; la même posée sur le clavier, avec ou sans la barre de Safari.
2. **Sortir de l'écriture** : le mot « Terminer », ou une coche.
3. **Le bandeau pendant qu'on écrit** : complet, ou réduit à la sortie.
4. **La taille du texte** : un curseur, pour juger ce que donnerait le réglage du système.

## Avis de Claude

- **Barre courte, en haut** : le meilleur rapport entre gain et risque. Elle supprime le défilement de côté, cause des défauts du 13 et du 22/11. Les boutons retenus dans la maquette sont une proposition : à choisir par Sylvain.
- **Sur le clavier** : seulement si amend.ink est un jour installée sur l'écran d'accueil ; dans Safari, elle s'empile sur la barre du navigateur, raison de la décision du 12/11.
- **La coche** : sans risque.
- **Le bandeau allégé** : à peser ; il cache les volets (plan, corrections, Margo) pendant qu'on écrit.
- **La taille du système** : à étudier à part (nos tailles sont en pixels, et le zoom à paliers existe).

## Non vérifié

Rien n'a été essayé sur un vrai téléphone : le clavier et la barre de Safari de la maquette sont dessinés. Les pictos de Craft sans libellé sont interprétés d'après les captures.
