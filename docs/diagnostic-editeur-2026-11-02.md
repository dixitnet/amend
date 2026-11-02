# Diagnostic des écarts de l'éditeur (02/11/2026)

Suite de la campagne du même jour (`docs/campagne-editeur-2026-11-02.md`) : la cause de chaque écart, avant toute correction. Aucune ligne de l'application n'a été modifiée.

## Méthode

Un client compilé pour l'occasion (non commité) exposait la vue ProseMirror et journalisait chaque transaction : sélection de départ, pas produits par le navigateur, résultat après la réécriture en suivi, texte hors suivi côté ProseMirror **et côté Yjs**, origine (locale ou reçue). Chaque geste fautif a été rejoué dans Chromium avec ce journal ; les défauts à plusieurs, avec deux journaux en parallèle. Versions : prosemirror-view 1.42.6, prosemirror-state 1.4.4, y-prosemirror 1.3.7, yjs 13.6.33.

## Les causes, par famille

Les seize écarts viennent de cinq causes. Les corriger par famille évitera de traiter seize symptômes.

### A. La réécriture en suivi ne connaît qu'une forme de transaction (écarts 1, 4, 10, 12)

`rewriteForTracking` (`client/src/suivi/reecriture.js`) ne sait réécrire qu'**une transaction d'un seul pas, de type « remplacement »**, plus deux cas particuliers (coupure simple, effacement sur plusieurs blocs). Tout le reste renvoie `null`, et le répartiteur (`greffons.js:264`) **applique alors la transaction d'origine hors suivi pour un éditeur**, ou la refuse pour un correcteur (avec le message « Cette modification ne peut pas être suivie »).

1. **Sélection puis Entrée** : ProseMirror envoie **deux pas** (effacer la sélection, puis couper le bloc). Refusé dès `reecriture.js:290` (`tr.steps.length !== 1`) ; `rewriteSplitForTracking` ne traite de toute façon qu'une coupure sans sélection (`isPureSplitStep`, `reecriture.js:171`).
4. **Collage d'une ligne sur une sélection paragraphe → citation** : ProseMirror produit un `replaceAround`. Le chemin multi-blocs s'écarte devant tout collage (`reecriture.js:246`, « un collage a son propre chemin ») ; mais ce chemin, `richPastePlugin`, ne prend que le collage **de plusieurs lignes dans un seul bloc** (`greffons.js:47` et `:50`) ; la voie normale refuse le `replaceAround` (`reecriture.js:298`). Aucun chemin ne le prend.
10. **Gras en suivi** : pas `addMark`, refusé à `reecriture.js:298`. Le suivi ne couvre pas la mise en forme.
12. **Suppr. en fin de paragraphe** : pas de jointure, sans texte à barrer ; `reecriture.js:421` renvoie `null`. C'est le périmètre assumé dans le code (« cette opération-là reste hors suivi »).

Conséquence commune : pour un éditeur en suivi, **le suivi est contourné sans avertissement**. La règle « en suivi, rien ne passe hors suivi » n'est garantie nulle part ; elle dépend de la forme de la transaction.

### B. Le chemin « sélection sur plusieurs blocs » (écarts 2, 3, 7)

`effacementMultiBloc` (`reecriture.js:243`) barre la sélection et insère la frappe.

2. **Ctrl+A puis frappe** : la sélection « tout » commence à la position 0, **entre les blocs**, pas dans un texte. La frappe est insérée à `mapping.map(from)` (`:267`), position refusée par `positionUtilisable` (`:268`) : l'insertion est sautée sans bruit ; seuls les barrés restent.
3. **Dictée / saisie prédictive sur une sélection titre → paragraphe ou paragraphe → citation** : pour un texte entré d'un bloc, ProseMirror remplace la plage **jusqu'à la fin du second bloc** par un bloc neuf qui contient la frappe **et le reste de ce bloc** (« gris beau. »). `texteDeLaTranche` (`:254`) prend tout ce texte pour de la frappe et l'insère, alors que « beau. » reste en place : doublon. Au clavier, ProseMirror produit un `replaceAround` qui ne contient que la lettre : pas de doublon.
7. **Ordre et coupure** : (a) la frappe est insérée **au début** (`:267`), selon la convention d'avant le 09/10 (« ancien barré, puis nouveau ») qui n'a été reportée que dans la voie d'un seul bloc ; `richPastePlugin` fait de même. (b) Seul le **texte** est barré ; la frontière entre les deux blocs n'est marquée nulle part. À l'acceptation, le texte barré part et les blocs restent séparés : il manque l'inverse de `trackedBreak`, une **jointure suivie**.

### C. L'identité des marques de suivi (écarts 8, 13, 15)

8. **Suppression d'un autre écrasée** : `markRangeForTrackedDeletion` pose la marque sur tout le passage (`reecriture.js:48`) sans sauter ce qui est déjà barré ; ProseMirror remplace une marque du même type : la suppression d'Alice devient celle de Bruno, et rejeter Bruno efface les deux. (La voie des touches d'effacement, elle, saute déjà le texte barré : `caractereAEffacer`.)
13. **Deux cartes au lieu d'un remplacement** : le panneau n'apparie une suppression et un ajout que s'ils portent **le même `groupe`, non nul** (`inventaire.js:133`). Touche morte : le « ^ » provisoire ouvre le groupe G1 (« noir » barré, « ^ » ajouté) ; son remplacement par « ê » est un nouveau remplacement, groupe G2 (`reecriture.js:345`) : « noir »/G1 et « ê »/G2 ne s'apparient plus. Retour arrière puis frappe : deux gestes, aucun groupe.
15. **Italique perdu en suivi** : la tranche de ProseMirror porte bien l'italique sur la lettre tapée ; la réécriture recrée le texte avec les marques **du début de la sélection** (`marquesDeMiseEnForme(state)`, `:380`), qui est hors de l'italique. Même cause pour le lien.

### D. La synchronisation par y-prosemirror (écarts 5, 11, et peut-être 6)

5. **Espaces entrées hors suivi** — preuve : l'espace tapée est **correctement marquée** dans ProseMirror et dans Yjs juste après la frappe ; c'est **la fusion avec la mise à jour concurrente de l'autre personne** qui la rend sans marque, dans Yjs, chez les deux à la fois. Mécanisme (`updateYText`, y-prosemirror `sync-plugin.js:1075`) : à chaque transaction, le texte nouveau est d'abord inséré **sans attribut**, puis les attributs sont réappliqués **sur tout le paragraphe**, morceau par morceau, avec `insertion: null` explicite sur chaque morceau non marqué. La passe concurrente de l'autre personne, faite sur une vue qui n'a pas encore l'espace, encadre l'endroit où elle s'insère de balises « sans insertion » ; après fusion, l'espace en hérite. Aggravant propre à amend.ink : chaque lettre tapée en suivi porte **son propre horodatage**, donc sa propre marque ; un paragraphe en cours de frappe compte des dizaines de morceaux, et chaque frappe relance la passe sur tous. Cela explique qu'il suffise de deux personnes dans le **même paragraphe**, et que des espaces soient touchées plutôt que des lettres (elles sont souvent en bord de morceau). Le serveur, qui compare la base avant/après, voit bien la violation pour un correcteur.
11. **Lettres mêlées au même endroit** : à chaque mise à jour reçue, y-prosemirror **remplace tout le document** puis restaure la sélection depuis une position relative accrochée au caractère **de droite** (`assoc = 0`, `lib.js:54`). Une lettre de l'autre insérée au même endroit passe donc devant le curseur, et les deux frappes alternent. Hors suivi aussi.
6. **Touche morte, « ^ » resté, éditrice bloquée (vu une fois)** — non reproduit en 48 essais ; à corriger dans le rapport de campagne : après l'incident, les trois personnes **voyaient le même texte**, mais l'éditrice ne pouvait plus rien modifier (ses remises à zéro restaient sans effet pour tous). C'est le tableau d'une **composition restée ouverte** chez elle (ProseMirror attend la fin de la composition et ignore la suite), que le pilotage automatique de la composition peut provoquer. y-prosemirror ne tient aucun compte d'une composition en cours quand il remplace le document. **Hypothèse, pas un diagnostic** : à vérifier à la main (point 1 de la liste Safari).

### E. Règles assumées, à rediscuter (écarts 9, 14, 16)

9. **Commentaire masqué à l'acceptation** : règle du 15/09 (« le commentaire d'un texte supprimé doit disparaître »), adoucie le 08/10 (masqué, rétabli par un rejet ou Ctrl+Z, effacé au bout de 7 jours : `DELAI_ORPHELIN_MS`, `comments.js:155`). Un remplacement tapé laisse volontairement le commentaire **sur l'ancien texte barré** (méta `remplacementFrappe`) ; l'accepter supprime ce texte, donc masque le fil. Google Docs le reporterait sur le nouveau texte.
14. **Retour arrière puis frappe : nouveau texte avant le barré** : voulu (le curseur recule à gauche de ce qu'il barre, pour enchaîner les retours arrière) ; diffère de « sélection puis frappe ».
16. **Raccourcis** : aucun Ctrl+Alt+M ni Ctrl+Alt+chiffre dans `raccourcis.js`.

## Ce que le diagnostic change dans le rapport de campagne

- Écart 6 : « vue décrochée » → « éditrice bloquée après une composition restée ouverte, hypothèse » (voir D.6).
- Écart 5 : ce n'est pas un défaut du suivi mais de la synchronisation, aggravé par une marque par lettre ; il touche **tout le monde**, la correctrice comme les éditeurs, dans Chromium comme dans WebKit.

## Ordre de traitement suggéré (pour la discussion, pas encore décidé)

1. Famille A, par une règle générale : en suivi, toute transaction que la réécriture ne sait pas suivre est **refusée aussi pour un éditeur**, avec le message déjà prévu ; puis on apprend à suivre les gestes les plus courants (Entrée sur une sélection, collage multi-blocs). Ferme d'un coup les pertes de traçabilité.
2. Famille B : position d'insertion (Ctrl+A, ordre), texte de la tranche (doublon), puis la jointure suivie (plus lourd : nouvel attribut de bloc, comme `trackedBreak`).
3. Famille D.5 : réduire le nombre de morceaux (même horodatage pour une frappe continue) et/ou n'écrire vers Yjs que la partie modifiée du paragraphe ; à mesurer avec `tools/campagne/endurance.mjs`.
4. Famille C : sauter le déjà-barré, garder le groupe d'une composition, prendre les marques de la tranche.
5. Familles D.11 et E : décisions de comportement plus que corrections.
