# Audit partiel avant fusion (2026-11-12)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 256472 signes envoyés, 4084 reçus (et 17723 de réflexion) ; réflexion `low` ; 64 s ; arrêt : stop
- Diff audité : `v2/` de `6dfe64a` à `59dd1ad` (22 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot cohérent avec le plan du 12/11/2026 (modèles de l'instance, reprise de « TàT - Poche », options de mise en page) : couches respectées, l'application passe par le domaine (`resoudreModele`) et le design porte les valeurs décidées. Les droits administrateur sont vérifiés côté serveur et testés. Les constats portent surtout sur des cas limites de la reprise au démarrage, une assertion de test plus faible que son intitulé, et quelques points à confirmer (doublon potentiel de `nomDuModele`, configuration des administrateurs).

## Constats
1. **[important]** grille 6 (condition de course / cas limite) — `v2/application/serveur/comptes-modeles.js:242-246` : la reprise n'est pas atomique par modèle ; si le serveur s'interrompt entre `creerModele` (ligne 242) et l'écriture du réglage `modeles.reprise` (ligne 246), le modèle est créé mais non noté, et un redémarrage en crée un doublon (avec reprise des références vers le doublon). Proposer d'écrire le marqueur `faits[r.id]` dans la même transaction que la création, ou de vérifier l'existence d'un modèle de l'instance homonyme avant de créer.
2. **[mineur]** grille 7 (test qui ne vérifie pas ce qu'il annonce) — `v2/contrats/statiques/typst.test.js:187-216` : le test s'intitule « titre courant, folio en haut, chapitre continu, séparateurs » mais n'asserte que la compilation du PDF (`%PDF-`), pas la présence de ces éléments (folio en haut, titre courant, astérisme). Ajouter au moins une assertion sur la source Typst (par ex. `#amend-separateur` remplacé par l'astérisme, ou la fonction de folio) pour l'une des variantes.
3. **[mineur]** grille 6 — `v2/adaptateurs/postgres/comptes-reglages.js:26-27` : `definirReglage` efface le réglage pour `null` **et** pour `undefined`, alors que le commentaire (ligne 24) ne documente que `null` ; un appel oubliant de passer la valeur effacerait silencieusement un réglage. Restreindre l'effacement à `null` ou documenter `undefined`.
4. **[mineur]** grille 7 — `v2/tests/services/modeles.test.js:266-267` : seuls `GET` et `POST` de `/api/admin/modeles` sont testés à 403 pour un non-administrateur ; `PUT` (réglage, défaut) et `DELETE` ne le sont pas. Ajouter un refus 403 sur `PUT /api/admin/modele-defaut` et `DELETE /api/admin/modeles/<id>`.
5. **[question]** grille 4 (redondance) — `v2/application/client/Administration.jsx:5` importe `nomDuModele` de `./commun.js`, tandis que `v2/application/client/Modeles.jsx:82` exporte aussi un `nomDuModele` : deux définitions du même nom dans la couche application risquent de diverger (le modèle du code y est probablement traité différemment). Vérifier si `commun.js` redéfinit ou réexporte ; sinon, importer depuis `Modeles.jsx`.
6. **[question]** grille 5 — `v2/application/serveur/index.js:549-551` : `listeAdministrateurs(CONF.administrateurs)` puis `administrateurs.size > 0 && …` ; si `CONF.administrateurs` est absent ou vide, aucune personne n'est administratrice et les modèles de l'instance deviennent inaccessibles (403 pour tous). Confirmer que c'est voulu (et que `listeAdministrateurs` tolère l'absence de la clé).
7. **[mineur]** grille 9 — `v2/application/serveur/comptes-modeles.js:138` (et `:239`, `:247`) : messages en français en dur dans le serveur ; l'exception de l'ADR 0010 (règle 23) ne couvre que les scripts d'exploitation, pas le code applicatif. Ces lignes ne sont pas destinées aux utilisatrices, mais si le lint des chaînes s'applique au serveur, elles pourraient le faire échouer ; à harmoniser (codes + journal, ou exception explicite).
8. **[mineur]** grille 6 — `v2/application/serveur/comptes-modeles.js:238-240` : si la reprise d'un modèle échoue (`!v.ok`), on `continue` sans rien noter : l'erreur sera rejouée, avec son log, à chaque démarrage du serveur, sans fin. Prévoir un marqueur d'échec (noté dans `modeles.reprise` avec la raison) ou un signalement à la veille.

## Points de grille sans remarque
1 (couches), 2 (API publique), 3 (redondance avec l'amont, hors question A5), 8 (exports : NFC et échappement inchangés, testés), 10 (licences : aucune dépendance nouvelle).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides
- 8 : citations valides

## Réponse de Claude

1. *Juste*, corrigé : avant de créer, la reprise cherche un modèle de l'instance du même nom sur l'A4 (créé par une reprise interrompue) et le reprend, sans doublon.
2. *Juste*, corrigé : le test vérifie aussi la source (signe du séparateur, folio en haut, titre courant, aucun folio).
3. *Juste*, corrigé : seul `null` efface un réglage.
4. *Juste*, corrigé : refus 403 vérifiés aussi pour `PUT /api/admin/modele-defaut`, `PUT` et `DELETE /api/admin/modeles/<id>`.
5. *Faux* : `nomDuModele` de `commun.js` nomme les modèles de Margo (IA), celui de `Modeles.jsx` les modèles de mise en page ; deux choses distinctes, chacune importée là où elle sert.
6. *Voulu* : sans `V2_ADMINS`, pas de back-office du tout (règle existante, `listeAdministrateurs` tolère l'absence) ; les modèles de l'instance existants restent utilisés par les documents.
7. *Voulu* : ce sont des traces du journal d'exploitation (`[admin]`, `[modèles]`), comme les autres traces du serveur, jamais montrées à une personne.
8. *Voulu* : une reprise impossible doit se voir à chaque démarrage tant qu'elle n'est pas corrigée ; la noter comme faite l'enterrerait.

## Arbitrage de Sylvain

(À compléter.)
