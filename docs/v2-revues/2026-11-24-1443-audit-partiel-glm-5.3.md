# Audit partiel avant fusion (2026-11-24)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 421787 signes envoyés, 4030 reçus (et 6558 de réflexion) ; réflexion `low` ; 101 s ; arrêt : stop
- Diff audité : `v2/` de `ff28f60` à `ef265e9` (6 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le lot ajoute un correctif temporaire (`correctif-forme.js`) pour un défaut d'affichage de Yjs 14, avec tests unitaires et de pile solides, et étend l'exception de lint à ce nouveau fichier. Le cœur du correctif repose sur des champs d'éléments Yjs (`left`, `right`, `content`) et sur la substitution de `emit` d'un objet de la fondation, ce qui interroge la règle « API publique seulement ». Enfin, les conditions des correctifs temporaires (§ 4.5) ne semblent pas toutes réunies dans le diff : ticket amont et inscription dans la veille ne paraissent pas.

## Constats
1. **[important]** Grille 1/2 (API publique), `v2/adaptateurs/blocknote/correctif-forme.js:25` et `v2/adaptateurs/blocknote/correctif-forme.js:30-33` — Le correctif lit les champs `left`, `right`, `content`, `parent` d'éléments Yjs et l'événement `beforeObserverCalls` ; le commentaire (lignes 16-18) affirme que c'est la « surface publique », mais rien dans le dossier ne le documente (règle 2 : seulement l'API publique, sinon on renonce ou on contribue). Proposer de vérifier dans la documentation de Yjs 14 que ces champs et cet événement sont publics et stables ; sinon, le noter comme écart assumé dans l'ADR/la veille, ou classer le correctif comme patch au sens du § 4.5.
2. **[important]** Grille 1/2 (API publique), `v2/adaptateurs/blocknote/correctif-forme.js:63-71` — `afficheur.emit` est remplacé à la volée sur un objet créé par la fondation : c'est une modification du comportement d'une fondation hors `patch-package`, non prévue par le § 4.5 ni par la règle 2. Même remarque que le constat 1 : à faire valider comme écart assumé, avec la raison, dans la veille.
3. **[important]** Grille 11 (documentation) / § 4.5, `v2/adaptateurs/blocknote/correctif-forme.js:1-5` — Les quatre conditions d'un correctif temporaire ne sont pas réunies visiblement : le fichier cite le défaut (rc.29, rc.30) et une date de réexamen, mais aucun **ticket amont ouvert** n'est référencé, et le diff ne montre pas d'entrée dans `docs/v2-veille.md` (« il est listé dans docs/v2-veille.md »). Ajouter le numéro du ticket signalé en amont et l'entrée dans la veille.
4. **[mineur]** Grille 1 (règle 1, exception), `v2/eslint.config.js:267-271` — L'exception d'import de `@y/y` est étendue à un quatrième fichier (`correctif-forme.js`) alors que la règle 1, révisée le 13/11/2026, n'en autorise que trois (« le lint ne le permet qu'à ces trois fichiers »). Une révision de règle passe par Sylvain et par la mise à jour du texte des règles ; proposer la rédaction et la faire valider.
5. **[mineur]** Grille 4 (simplicité), `v2/adaptateurs/blocknote/suggestions.js:34` — La valeur de retour de `brancherCorrectifForme(r)` (la fonction de débranchement, `correctif-forme.js:72-75`) est jetée : elle n'est jamais appelée, ni dans le code ni dans les tests. C'est une option « au cas où » ; soit on la garde avec un usage (un test de débranchement, par exemple), soit on simplifie le correctif en ne rendant rien.
6. **[question]** Grille 6 (correction), `v2/adaptateurs/blocknote/correctif-forme.js:46-70` — Si une transaction supprime des marqueurs mais ne déclenche aucun événement `'change'` de l'afficheur (par exemple un changement sans effet sur le rendu), `marqueurs` et `aRedessiner` restent posés et altéreront le prochain `'change'`, qui peut concerner autre chose. Le reset dans `avant` à chaque transaction limite la fenêtre, mais pas à zéro. À vérifier par un test (transaction avec marqueurs supprimés puis transaction sans `'change'`).
7. **[question]** Grille 7 (tests), `v2/contrats/pile/editeur.test.js:620` — Le test utilise `fr.link_toolbar` alors que le diff n'ajoute que l'import de `panneau` ; si `fr` (catalogue) n'était pas déjà importé dans ce fichier, le test ne tourne pas. Vérifier l'import existant.

## Points de grille sans remarque
3 (redondance amont : le correctif contourne un défaut signalé, il ne refait pas une fonction), 5 (sécurité et droits), 8 (exports), 9 (traductions), 10 (licences : aucune dépendance nouvelle).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides

## Réponse de Claude

1. **Juste, écart assumé et noté.** Les fonctions (`iterateStructsByIdSet`, `IdSet`, `Item`, `ContentFormat`) sont des exports de `@y/y`, mais les champs `left`, `right`, `parent`, `content` d'un élément et l'événement `beforeObserverCalls` ne sont pas documentés comme stables. L'en-tête du fichier et la veille le disent maintenant, avec la vérification à chaque montée. Même nature que `correctif-245.js`. **Question pour Sylvain** : accepter cet écart pour ce correctif.
2. **Juste, même réponse.** `emit` (et `destroy`) de l'afficheur sont enveloppés, sans `patch-package` : choisi parce que débranchable en retirant un appel, comme le correctif 245 qui règle `suggestionOrigins`. Noté dans la veille comme écart. **Question pour Sylvain**, avec le constat 1.
3. **En partie faux, en partie juste.** L'entrée de veille existe (`docs/v2-veille.md`, hors du diff de `v2/` que l'auditeur reçoit). Le test qui échoue sans le correctif existe (dernier test de `correctif-forme.test.js`). Manquaient : la date de réexamen au plus tard (ajoutée : 13/12/2026) et le ticket amont. Claude n'a pas accès au dépôt `yjs/yjs` : le texte du ticket est prêt dans la veille. **Question pour Sylvain** : l'ouvrir, ou laisser.
4. **Juste.** Le texte de la règle 1 nomme maintenant `correctif-forme.js` aux côtés de `correctif-245.js`, marqué « à valider par Sylvain ». **Question pour Sylvain.**
5. **Juste, corrigé.** Le correctif ne rend plus rien ; son écoute sur le document du texte part avec l'afficheur (`destroy`), ce qui évite qu'elle s'accumule quand l'éditeur est remonté. Test ajouté.
6. **Faux.** L'afficheur émet `'change'` à chaque transaction du document du texte, sans condition (`Renderer.js`, fin de l'écoute `beforeObserverCalls` de `prevDoc`), et notre écoute, posée avant la sienne sur le même événement, remet les deux ensembles à zéro au début de chaque transaction : il n'y a pas de transaction entre la pose et l'émission. Le deuxième test enchaîne retrait de forme puis frappe simple et reste juste.
7. **Faux.** `fr` est importé en tête du fichier (`import { fr } from '@blocknote/core/locales'`, ligne 7) ; l'essai passe dans la pile (Chromium, 24/24).

## Arbitrage de Sylvain

(À compléter.)
