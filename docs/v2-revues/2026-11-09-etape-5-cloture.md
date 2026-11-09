# Revue de clôture de l'étape 5, « Relecture » (2026-11-09)

- Relecteur : **Claude** (grille du § 6 des règles appliquée au diff de l'étape, `36f528f..e5b0b99`) ; audit partiel de GLM-5.3 avant la fusion (`docs/v2-revues/2026-11-09-audit-partiel-glm-5.3.md`).
- Statut : revue écrite ; étape fusionnée dans `main` le 09/11/2026 (accord de Sylvain).

## Grille

1. **Couches** : domaine (droits par branche, droits des commentaires), adaptateurs (y/hub : permissions par branche, identité interne, client à part ; Yjs : branche des suggestions, lecture des auteurs ; BlockNote : modes, afficheur, magasin de fils, historique, pose d'ancre côté serveur ; PostgreSQL, nouveau : dépôt des commentaires), application (routes des commentaires, noms, relais de développement ; écran), design (panneau des suggestions, bouton bascule, emplacements de la page), i18n. Design et technique dans des commits séparés. **Règle 1 révisée une seconde fois** (Sylvain, 09/11) pour l'ancre posée par le serveur (`prosemirror-transform`, `lib0`), contrat d'une seule copie étendu.
2. **API publique** : contrat vert ; vérifié pour `isSuggestionDoc`, `decodeContentMap`, `lib0/buffer`, `configureYProsemirror`, `createYHubVersionStorage`, le `PATCH /ydoc` et le `changeset` de y/hub.
3. **Comment Docs le fait** (règle ajoutée pendant l'étape) : lu dans son code (Docs est sur y/hub depuis sa 6.0.0). Repris : permissions par rôle traduites pour y/hub, commentaires en base avec droits côté serveur, routes REST des fils. **Écarts signalés et décidés** : ancre posée par le serveur pour le correcteur (Docs n'a pas de commentateur actif dans l'interface) ; présence du correcteur (Docs ne montre que qui modifie) ; mode suggestion sur une branche (absent de Docs) ; historique par le panneau de BlockNote, avec versions nommées (Docs a sa propre liste, sans noms) ; prévenir les navigateurs par un flux d'événements (Docs passe par la présence).
4. **Redondance avec l'amont** : aucune fondation modifiée. Code à nous là où ni BlockNote ni Docs ne fournissent : relecture des auteurs dans y/hub et reconstruction de l'affichage, liste des suggestions pour le panneau, pose d'ancre par le serveur. Défauts amont notés dans la veille (remplacements à la frappe en mode suggestion, `getSuggestionAtSelection`, découpage des suggestions par Yjs), à signaler sur décision de Sylvain.
5. **Simplicité** : notes de bas de page retirées et archivées (décision de Sylvain) ; essais menés avant chaque choix (suggestions, ancre, trois dispositions, auteurs tardifs) ; deux fausses pistes écartées après mesure (« corruption » venue du script de test ; remontage de l'éditeur, inutile, retiré).
6. **Sécurité et droits** : y/hub garantit qu'un correcteur n'écrit pas le texte principal (test de service) ; commentaires vérifiés par le domaine à chaque requête ; identité interne de notre serveur limitée à lire et écrire le texte principal ; jeton comparé à temps constant ; plus de repli d'identifiants de base hors développement (audit). Provisoire jusqu'à l'étape 6 : accès et noms en mémoire, noms visibles de toute personne connectée.
7. **Tests** : 118 rapides, 35 sur la pile (dont 6 parcours de relecture), campagne v2 de 298 vérifications sans échec (`docs/v2-tests/etape-5-rapport.md`). Critère de sortie 5 réécrit sur décision de Sylvain (campagne v2 sur des invariants au lieu de la campagne de la v1).
8. **Licences** : `postgres` (Unlicense) et `prosemirror-transform` (MIT), déjà présents comme dépendances de y/hub et de BlockNote ; contrat vert.
9. **Mémoire** : serveur 31 Mo au repos (26 avant) après chargement paresseux de BlockNote ; collaboration +75 à 80 Mo ici (seconde branche, fils de calcul de y/hub, 3 sur cette machine) ; au repos sur le VPS : serveur 22 Mo, collaboration 31 Mo (pointe 43). **Mesure sous relecture sur le VPS à faire** (Sylvain).

## Critères de sortie

1. Un correcteur ne peut que proposer : **tenu** (y/hub, test de service et parcours).
2. Accepter, refuser, une ou toutes, résultat qui survit au rechargement et converge : **tenu**.
3. Commentaires selon les rôles, vérifiés côté serveur : **tenu**.
4. Historique (révisé : pour tous) ; l'éditeur revient à une version : **tenu**.
5. Campagne v2 et scénarios de relecture ; T0 à T5 verts ; audit partiel : **tenu**.

## Limites et suites

- Après un retour au « Début du document », la première suggestion s'affiche mal chez l'éditeur (données justes, rechargement suffisant).
- La lectrice ne voit pas les curseurs des autres ; une suggestion toute fraîche reste un instant sans nom.
- Plus tard (décisions de Sylvain) : Annuler en mode suggestion ; notes de bas de page simplifiées sur le montage des commentaires ; panneau des suggestions à côté du texte (étape 6b) ; signalements en amont.
