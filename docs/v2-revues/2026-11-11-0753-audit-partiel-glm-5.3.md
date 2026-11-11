# Audit partiel avant fusion (2026-11-11)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 188253 signes envoyés, 4397 reçus (et 16752 de réflexion) ; réflexion `low` ; 24 s ; arrêt : stop
- Diff audité : `v2/` de `5991f2a` à `2a78352` (25 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot cohérent, bien documenté (contournements datés et signés, veille citée), i18n complet des deux côtés, tests de pile et unitaires ajoutés au bon endroit. Le point le plus sérieux est un embranchement mort dans `App.jsx` : le message « suggestions invisibles » ne peut jamais s'afficher, la branche qui devrait le porter est inatteignable. Viennent ensuite une possible confusion entre fermeture de connexion transitoire et changement de droits dans l'adaptateur yjs, et un double appel de rappel quand les deux branches se ferment. Rien de grave sur les couches, l'API publique ou les licences.
## Constats
1. **[important]** Grille 6 (logique) — `v2/application/client/App.jsx:1647` : la branche `: invisibles ? { texte: t('suggestions.invisibles') } : null` est inatteignable. Elle n'est évaluée que si `mode !== 'relire' && suggestions.enAttente` (négation de la première condition) *et* `invisibles` vrai — or `invisibles` exige `mode === 'relire'` (ligne 1631). Le message `suggestions.invisibles` (fr.json:117, en.json:117) n'apparaît donc jamais, alors que le commentaire (ligne 1628) annonce l'inverse. Proposer d'afficher l'avis dans le panneau en mode `relire` (par exemple en complément du titre ou de l'invitation), et de couvrir ce cas par un test.
2. **[question]** Grille 6 (cas limite) — `v2/adaptateurs/yjs/index.js:64` : tout événement `closed` autre que 4404 est classé « droits ». Si `@y/websocket` émet `closed` aussi lors d'une coupure réseau ou d'un redémarrage de y/hub (et pas seulement à la fermeture définitive par le serveur), chaque coupure transitoire déclencherait une relecture des droits et un remontage complet de l'écran (`App.jsx:854`). Vérifier la sémantique de l'événement dans `@y/websocket` (contrat) ; si `closed` est émis à chaque déconnexion, filtrer sur le code de fermeture réellement reçu.
3. **[mineur]** Grille 6 (condition de course) — `v2/adaptateurs/yjs/index.js:63-66` : le même rappel est abonné aux deux fournisseurs (texte et suggestions) ; à un changement de droits, les deux connexions se ferment et le rappel part deux fois, donc deux `surDroitsChanges` et deux incrémentations de `lecture` (`App.jsx:854`). Sans conséquence fonctionnelle visible (le second remontage est un no-op relatif), mais un garde-fou (un appel unique par fermeture) éviterait le double remontage.
4. **[mineur]** Grille 6 (cas limite) — `v2/extensions/limites-du-suivi/index.js:29` : `fusionnerait` refuse aussi `Suppr` en fin de paragraphe lorsque le bloc suivant n'est pas un bloc de texte (image, séparateur) — la fusion n'aurait pas lieu mais le geste est refusé avec un message trompeur. Vérifier le type du bloc suivant avant de refuser, ou l'accepter comme limite connue du contournement temporaire (à noter dans le commentaire).
5. **[mineur]** Grille 7 (tests) — `v2/extensions/limites-du-suivi/index.js:20-30` : `aCheval` et `fusionnerait` sont des fonctions pures, triviales à tester unitairement (sélection vide, début/fin de paragraphe, bloc non textuel), mais seuls les scénarios de campagne (lents) les couvrent. Ajouter quelques tests unitaires au dossier `tests/unitaires/`, d'autant que l'extension est destinée à partir en amont.
6. **[mineur]** Grille 6 (cas limite) — `v2/application/client/App.jsx:1763-1765` : `surRefus` mappe tout code inconnu vers le message « à cheval » ; un futur code de refus de l'extension afficherait un message faux. Passer le code au catalogue (`t(\`suivi.${code}\`)` avec repli) ou expliciter l'énumération.
7. **[mineur]** Grille 6 (cas limite) — `v2/application/serveur/comptes.js:147-149` : `revoirEquipe` fait une requête y/hub (délai d'attente 5 s) par document d'équipe, séquentiellement, dans la requête HTTP du changement de rôle : une grosse équipe rend la route lente. Regrouper (une seule demande sans `personne` si y/hub le permet) ou noter la limite.
8. **[question]** Grille 6 — `v2/adaptateurs/blocknote/commentaires.js:82-84` : le contexte `avant` passé à `typographier` est le texte *transformé* du nœud précédent et se réinitialise à chaque bloc ; si un autre nœud en ligne (lien, saut) sépare deux nœuds de texte, le contexte est perdu (règle en début de segment mal appliquée). Est-ce voulu/acceptable pour des messages courts ? Si oui, un commentaire le dit ; sinon, conserver le contexte à travers les nœuds non textuels.
## Points de grille sans remarque
1, 2, 3, 5, 8, 9, 10

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

1. **Faux.** La branche est atteignable : quand `mode === 'relire'`, la première condition (`mode !== 'relire' && …`) est fausse, et c'est alors `invisibles` qui est évalué ; c'est précisément le cas visé (en relecture, liste vide, afficheur non vide).
2. **Juste en partie, corrigé.** `@y/websocket` n'émet `closed` que pour un code définitif (`defaultShouldReconnect` : 4400–4499, 1002, 1003, 1008, 1009), jamais pour une coupure réseau ni un redémarrage de y/hub (robustesse F1, F3 au vert). Mais tout code définitif autre que 4404 passait pour « droits » : seul 4401 relit maintenant les droits ; un autre code affiche un message.
3. **Juste, corrigé** : un seul rappel pour les deux connexions.
4. **Juste, accepté comme limite** du contournement, écrite dans le commentaire.
5. **Juste, corrigé** : `tests/unitaires/limites-du-suivi.test.js`.
6. **Juste, corrigé** : table explicite des codes, repli sur le message d'erreur générique.
7. **Juste en partie, corrigé** : les demandes partent en parallèle ; y/hub n'a pas de revérification par équipe (une par document).
8. **Accepté** pour des messages courts ; le commentaire le dit.

## Arbitrage de Sylvain

(À compléter.)
