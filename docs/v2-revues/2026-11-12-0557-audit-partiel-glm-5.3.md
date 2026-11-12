# Audit partiel avant fusion (2026-11-12)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 136675 signes envoyés, 2816 reçus (et 9252 de réflexion) ; réflexion `low` ; 18 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `cef293c` (5 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff porte deux sujets distincts : la gestion des lignes blanches à l'export Typst (adaptateur + contrat) et les onglets fixes des volets (design + ADR 0008). L'essentiel est conforme aux règles : le réglage `css.coquille.onglets` est bien décidé par Sylvain et noté dans la table de l'ADR 0008, la feuille porte la clé du réglage, le nouveau comportement d'export est testé. Restent des questions de couverture (cas des blocs non textuels autour des blancs, layout Mantine imbriqué) et une interrogation sur le découpage en lots.

## Constats
1. **[question]**, grille 6, `v2/adaptateurs/blocknote/export.js:169` — `sansBlanc` ne traite que `heading`, `divider` et `pageBreak` ; le commentaire dit « ces blocs ont déjà leur blanc », mais rien ne dit ce qu'il advient d'un paragraphe vide suivi d'un tableau, d'une image ou d'une citation : un `#amend-blanc` y sera inséré. Vérifier le rendu attendu pour ces blocs (ont-ils « leur blanc » ?) et le documenter, ou l'ajouter à `sansBlanc` si c'est un oubli.
2. **[mineur]**, grille 7, `v2/contrats/statiques/typst.test.js:65` — le test couvre le blanc entre deux textes et son absence après un titre, mais pas les cas `divider` et `pageBreak` pourtant cités dans le commentaire d'`export.js:166` comme supprimant le blanc. Ajouter un cas avec séparateur et saut de page pour verrouiller ce comportement.
3. **[question]**, grille 1, `v2/design/composants/Coquille.jsx:281` — `AppShell.Section` est désormais imbriqué dans `Tabs` (au lieu de l'inverse). Mantine attend ses sections comme enfants directs de l'`AppShell` pour le layout en flex ; le contournement passe par la classe `amend-coquille-onglets` (`flex: 1`, `min-height: 0`). Confirmer que le rendu est correct sur les formats M et L (volet redimensionnable inclus) ; si Mantine impose un jour la structure directe, ce montage cassera.
4. **[question]**, grille 1 (règle 5), `v2/adaptateurs/blocknote/export.js:164` et `v2/design/composants/Coquille.jsx:281` — le diff touche à la fois l'adaptateur BlockNote (avec son contrat) et la couche design : deux couches dans une même branche. Si ce sont bien deux lots fusionnés ensemble, c'est conforme ; sinon, redécouper pour que chaque lot reste sur une couche.
5. **[mineur]**, grille 1 (ADR 0008), `v2/design/feuilles/coquille.css:25` — la feuille implémente `display: flex ; flex-direction: column ; flex: 1 ; min-height: 0`, tandis que la ligne de l'ADR 0008 (`v2/adr/0008-design.md:85`) décrit « en-tête `flex: 0 0 auto`, contenu `overflow-y: auto` », valeurs qui n'apparaissent pas dans la feuille (le défilement vient de `ScrollArea`). Harmoniser la description de l'ADR avec ce que la feuille contient réellement, pour que le contrat statique (concordance code/table) reste lisible.

## Points de grille sans remarque
2, 3, 4, 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. *Voulu* : citation, tableau ou image n'ont pas de blanc propre sur la grille (espacement d'un pas, comme un paragraphe) ; deux sauts de paragraphe avant l'un d'eux donnent donc la ligne blanche demandée. Seuls titre, séparateur et saut de page ont déjà leur blanc.
2. *Juste*, corrigé : le contrat Typst couvre le séparateur et le saut de page (aucune ligne blanche en plus).
3. *Faux* : `AppShell.Section` est un simple bloc de Mantine (règle `data-grow` : `flex-grow: 1`), sans exigence d'être enfant direct ; vérifié par capture en format L (plan de 30 titres défilé, onglets en place). Les formats M et L utilisent le même composant ; le format S (tiroir) n'est pas touché.
4. *Conforme* : deux lots, deux commits, chacun sur une couche (design ; adaptateur et son contrat), fusionnés ensemble.
5. *Juste*, corrigé : la ligne de l'ADR décrit maintenant les valeurs de la feuille.

## Arbitrage de Sylvain

(À compléter.)
