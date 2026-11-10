# amend.ink v2 : constats et préconisations, fin de la campagne de tests (10/11/2026)

Sources : campagne automatique (familles A à H, pile locale, Chromium et WebKit, trois fois chacune) ; essais à la main de Sylvain dans Chrome sur v2.amend.ink ; recherche dans l'amont (BlockNote, Yjs, `@y/prosemirror`, y/hub, Docs). Détails : `synthese-2026-11-10.md` (P1 à P24), `plan-amont-2026-11-10.md`, `bilan-scenarios-B-2026-11-10.md`.

**Pas vérifié en ligne à plusieurs comptes** : la série en ligne (`v2-campagne`, job `en-ligne`, comptes d'essai) est prête mais restée en file d'attente dans GitHub le 10/11 au soir (quota d'Actions probable). Les constats à plusieurs viennent de la pile locale (même code).

## Constats

### 1. Intégrité du texte et des suggestions (le plus grave)

| | Constat | Preuve |
|---|---|---|
| C1 | **Accepter la suppression d'un paragraphe abîme le texte** : en suivi, double-clic sur un paragraphe puis Suppr ; le panneau ne montre qu'un « ajout » ; l'accepter laisse « Ligne A ⏎ XLigne C ⏎ Ligne C » dans le texte principal (paragraphe non supprimé, dernière ligne en double) | H11, 3/3 en local (Chromium) ; Sylvain : paragraphe barré orphelin (constat 6) |
| C2 | **Un document peut ne plus jamais passer en suivi** (page blanche à chaque activation, `reading 'copy'` dans le rendu de Yjs 14) | Sylvain, document « Test Claude - verif v2 », à chaque rechargement ; recette non isolée (H11, H12 ne la reproduisent pas) |
| C3 | **Écran blanc en activant le suivi juste après la résolution d'un fil** | B7, 3/3 Chromium, 3/3 WebKit |
| C4 | **Les suggestions d'un éditeur disparaissent des panneaux** dès qu'il tape ailleurs : toujours affichées chez lui, plus listées nulle part, même après rechargement ; personne ne peut les arbitrer | H2, 3/3 ; B2 « ailleurs » 3/3 ; Sylvain (constat 2) |
| C5 | **Après l'arrêt du suivi, la frappe au contact d'une suggestion la prolonge** (on croit écrire en direct ; refuser la suggestion efface aussi ce texte) | B2, 3/3 partout ; Sylvain (« XW ») ; défaut amont connu, non corrigé |
| C6 | **Accepter ne fait rien** sur un paragraphe proposé par un correcteur, et sur certains ajouts | C3, 3/3 partout ; Sylvain (« INS1 ») |
| C7 | **Suppression d'un paragraphe par un correcteur** : absente du panneau | C3, 3/3 partout |
| C8 | **Une lectrice peut rester bloquée sur un texte périmé** : après deux éditeurs tapant au même endroit, Lucie n'a toujours pas le texte 30 s plus tard | H9, 2/3 ; A4, 3/6 |
| C9 | Ce qu'on tape en direct peut devenir une suggestion (le statut passe d'un paragraphe à l'autre) | Sylvain (constat 3), une fois ; non reproduit en local (H3) |

À l'inverse, **une suggestion de correcteur résiste** : Paule qui tape ailleurs (H1), qui active le suivi et recharge (H3) ne la perd pas.

### 2. Droits et historique

| | Constat | Preuve |
|---|---|---|
| C10 | **Retirer un accès ou rétrograder une éditrice ne prend effet qu'au rechargement de sa page** : une lectrice continue d'écrire en direct, une personne sans accès continue de proposer | E2, 3/3 partout ; l'outil pour couper existe dans notre version de y/hub, nous ne l'appelons pas |
| C11 | **Restaurer une version se fait sans confirmation** | H7, 3/3 ; Sylvain |
| C12 | Restaurer : en local, l'état d'avant est gardé (« Avant la restauration ») ; **en ligne, Sylvain a perdu ce qui avait été fait depuis le dernier instantané**, et les suggestions de la version sont devenues du texte | H7 local ; Sylvain (constat 5) ; écart à éclaircir en ligne |
| C13 | **Instantanés rares** : deux versions seulement (« Début », « Version actuelle ») après deux minutes de travail, ou dix minutes chez Sylvain | H8, 3/3 ; Sylvain |
| C14 | Fils résolus introuvables (ni liste, ni filtre, ni réouverture dans l'interface) | D2 ; Sylvain |

### 3. Gênes

| | Constat | Preuve |
|---|---|---|
| C15 | Typographie absente en suivi (et dans les réponses aux commentaires) | A3, 3/3 partout ; Sylvain |
| C16 | Gras en suivi : affiché, ni dans le texte ni dans le panneau | B6, 3/3 partout |
| C17 | « Quelqu'un » avant le nom de l'auteur, parfois durablement ; une fois un identifiant brut | toutes familles ; Sylvain |
| C18 | Panneau trompeur pour les coupures, fusions et suppressions à cheval | B3, B4 |
| C19 | Lettres entremêlées quand deux personnes tapent exactement au même endroit | A4, C2, 3/3 ; propriété de Yjs, rare en pratique |
| C20 | « deux:points » ouvre le sélecteur d'émojis | H10, 3/3 ; Sylvain |
| C21 | Info-bulle « Supprimé par » qui reste affichée | Sylvain |
| C22 | Clic en fin de ligne qui envoie le curseur au premier paragraphe | Sylvain, 5 fois ; **non reproduit** en local (H4 à H6, 9/9) : à revoir avec lui (souris, trackpad, longueur des lignes) |

**Retiré** : le collage de texte brut (artefact du collage simulé).

**Ce qui marche** : édition seule et à deux, collages (HTML, texte brut, 100 000 signes en moins d'une seconde), typographie hors suivi, corrections simples des correcteurs, commentaires (créer, répondre, modifier, supprimer, réagir, résoudre), ce que voit chaque rôle, coupures de réseau, rechargements, deux onglets, redémarrage du service de collaboration.

## Préconisations

### Avant tout usage réel (relecture d'un vrai texte, invités extérieurs)

1. **Ne pas ouvrir le suivi des modifications à de vrais documents en l'état** : C1 à C6 touchent à l'intégrité du texte (paragraphe dupliqué, suggestions perdues ou inarbitrables, document qui ne passe plus en suivi). Les corrections par les correcteurs dans un paragraphe (ajout, suppression, remplacement) sont fiables ; c'est ce qu'on peut garder.
2. **Corriger les droits à chaud (C10)** en reprenant le montage de Docs : à chaque changement d'accès, demander à y/hub de revérifier les connexions ouvertes ; côté navigateur, ne pas se reconnecter sur un refus, relire ses droits, recharger l'éditeur. Outil déjà dans notre version. Question d'accès : avant tout invité.
3. **Sécuriser la restauration (C11, C12)** : confirmation, et passage par la fonction de retour arrière de y/hub, qui garde l'état d'avant dans l'historique (comme Docs) ; éclaircir en ligne la perte constatée par Sylvain.

### Ensuite, de notre côté (sans attendre l'amont)

4. **Instantanés plus fréquents (C13)** : réglage à fixer avec Sylvain (par exemple à la pause d'écriture), en regardant ce que fait Docs.
5. **Liste des fils avec « Ouverts / Résolus » (C14)**, comme Docs (BlockNote la fournit).
6. **Lectrice bloquée (C8)** : à reproduire seul et à mesurer ; si le défaut est dans y/hub, le signaler (la version suivante change justement la synchronisation des lecteurs).
7. **Petits défauts chez nous** : nom de l'auteur (C17), « deux:points » (C20), info-bulle (C21), clic en fin de ligne (C22, à revoir avec Sylvain).

### Le suivi des modifications : décision de produit

8. **Restreindre le suivi, en attendant l'amont, à ce qui marche** : insertions, suppressions et remplacements à l'intérieur d'un paragraphe ; pas de suppression ni de création de paragraphe, pas de mise en forme en suivi (C1, C6, C7, C16) ; pour l'éditeur, l'interrupteur reste, avec l'avertissement que la frappe collée à une suggestion la prolonge (C5). C'est aussi la première étape prévue par Docs (insertions et suppressions d'abord, mise en forme plus tard).
9. **Appliquer les contournements sûrs et réversibles, dans l'adaptateur** : celui de l'écran blanc (C3) est prêt ; chacun inscrit dans la veille avec sa condition de retrait.
10. **Signaler en amont, avec des cas minimaux** : la suppression de paragraphe qui duplique le texte (C1), le document qui ne passe plus en suivi (C2, à isoler sur le document témoin de Sylvain), notre déclencheur de l'écran blanc (C3), les suggestions qui sortent du panneau (C4), Accepter sans effet (C6), et la fonction de BlockNote qui cherche des marques inexistantes.
11. **Rejouer toute la campagne à chaque montée de version** de BlockNote, `@y/prosemirror`, Yjs et y/hub, et lever les restrictions de 8 au fur et à mesure.

### À ne pas faire

Corriger nous-mêmes les fondations, ou construire un mode suggestion à nous à côté de celui de BlockNote : l'amont et Docs vont vers un autre modèle (une copie du document par suggestion), ce code serait à jeter.

### Pour finir les tests

12. **Débloquer la série en ligne dans GitHub** (quota d'Actions à vérifier), pour confirmer à plusieurs comptes sur v2.amend.ink : C1, C4, C6, C8, C10, C12.
13. **Garder le document « Test Claude - verif v2 »** de Sylvain : c'est le seul exemplaire de C2.
