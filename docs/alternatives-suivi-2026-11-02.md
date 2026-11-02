# Suivi des modifications : alternatives au code maison (02/11/2026)

Question posée : au-delà de corriger les seize écarts un par un (`docs/diagnostic-editeur-2026-11-02.md`), existe-t-il des solutions qui les règlent par construction, ou qui simplifient la gestion des modifications ? Étude sur pièces : paquets téléchargés et lus (code et documentation), recherches web. Rien n'a été installé dans amend.ink.

## Rappel : d'où viennent les écarts

Cinq familles. Trois tiennent à **notre réécriture en suivi** (A : une seule forme de transaction suivie ; B : sélections sur plusieurs blocs ; C : identité des marques), une à **la synchronisation** y-prosemirror 1.x (D : marques réécrites sur tout le paragraphe, curseur accroché à droite), une à des **règles assumées** (E). Une alternative vaut par les familles qu'elle supprime.

## Les candidats

### 1. Réécrire notre suivi « pas par pas » (sans dépendance nouvelle)

Notre `rewriteForTracking` ne connaît qu'une transaction d'un pas « remplacement ». Les deux bibliothèques étudiées ci-dessous font l'inverse : **une fonction par type de pas** (`replace`, `replaceAround`, ajout/retrait de marque, attribut de nœud, marque de nœud), appliquée à **chaque pas** d'une transaction, positions rebasées d'un pas à l'autre. C'est ce qui manque pour Entrée sur une sélection (deux pas), le collage, le gras, les attributs (titre ↔ paragraphe).

- Règle : A (entièrement), C (en grande partie), B (en partie : la jointure suivie reste à concevoir).
- Ne règle pas : D.
- Coût : moyen à lourd (une réécriture de `client/src/suivi/reecriture.js`, environ 450 lignes, avec la campagne pour filet). On garde tout le reste : schéma, panneau, rôles, IA, exports, serveur.

### 2. `@handlewithcare/prosemirror-suggest-changes` (MIT, v0.1.8, 14/10/2026)

Un `dispatchTransaction` décoré, comme le nôtre, mais **pas par pas** (sept gestionnaires, un par type de pas) ; marques `insertion` / `deletion` / `modification` (cette dernière pour les marques et attributs changés : le gras, un titre) ; insertion et suppression de **blocs** (avec un ¶ dessiné) ; la frontière de paragraphe supprimée est portée par un caractère invisible marqué, donc **la jointure est suivie**. Prévu pour y-prosemirror : les transactions distantes (`y-sync$`) et l'historique sont ignorés.

- Manques pour nous : **pas d'auteur ni de date** sur les marques (seulement un `id`, nombre ou chaîne — on peut y loger un identifiant et tenir l'auteur à part) ; **effacer un ajout l'efface pour de bon, quel qu'en soit l'auteur** (contraire à notre règle D2 : une correctrice ne fait pas disparaître la proposition d'un éditeur) ; une seule personne de maintenance, version 0.x.
- Règle : A, C, B (y compris la jointure). Ne règle pas D.
- Usage possible : **référence d'implémentation** pour le candidat 1, plutôt que dépendance.

### 3. `@manuscripts/track-changes-plugin` (Apache-2.0, v2.4.0, 20/06/2026)

Le plugin d'Atypon (plateforme d'édition scientifique Manuscripts / Literatum) : traitement **par type de pas**, chaque changement porte **auteur, date, opération** (`insert`, `delete`, `set_attrs`, `wrap_with_node`…) dans un attribut `dataTracked` des marques et des nœuds ; changements de blocs et d'attributs suivis ; un `ChangeSet` regroupe les changements voisins et **rapproche un ajout d'une suppression** (notre écart 13) ; filtre des transactions à ignorer (`skipTrsWithMetas`, utilisable pour `y-sync$`).

- Points d'attention : il agit en `appendTransaction` (il annule la transaction puis la rejoue suivie), ce qu'il faut valider avec y-prosemirror ; il dépend de `prosemirror-history` (nous utilisons l'annulation de y-prosemirror) ; des métadonnées dans les attributs des nœuds, à traiter avec soin (le README le dit) ; l'usage collaboratif avec Yjs n'est pas documenté.
- Règle : A, C, B, et l'auteur par changement est natif. Ne règle pas D.
- Le plus proche de notre public (édition scientifique) et le plus complet. **Le meilleur candidat de dépendance**, sous réserve d'un essai avec Yjs.

### 4. `@y/prosemirror` v2 + Yjs 14 : suggestions natives (MIT, pré-version)

Vu au point précédent de la discussion : les suggestions vivent dans un **document de suggestions** superposé au document de base ; Yjs 14 sait qui a inséré, supprimé, mis en forme ; accepter / rejeter fournis. Toute modification, quelle que soit sa forme, devient une suggestion.

- Règle : A, C, l'essentiel de B **et D** (écriture incrémentale vers Yjs, plus de remplacement du document entier). C'est le seul candidat qui règle aussi D.
- Contre : **pré-version** (`@y/prosemirror` 2.0.0-15, `@y/y` 14.0.0-rc.29 ; le README conseille de rester en 1.3.7) ; migration de **tout** en même temps, serveur compris (`server/agentTexte.js`, correcteur, modèles, outils) ; réécriture du suivi, du panneau, des exports qui lisent nos marques ; un serveur de confiance doit attribuer les modifications. BlockNote prépare la même chose (FOSDEM 2026).

### 5. Tiptap — extension « Tracked Changes » (payante)

`@tiptap-pro/extension-tracked-changes` : mode suggestion compatible Yjs, attribution par personne, accepter / rejeter, suggestions de l'IA. Paquet **Pro, sous licence payante, déclaré expérimental** ; tarif non publié. Suppose de passer notre ProseMirror nu à Tiptap (refonte de l'éditeur, de la barre, des greffons).

- Contre : dépendance commerciale sur le cœur du produit, en contradiction avec « auto-hébergé » ; refonte lourde. **Écarté.**

### 6. CKEditor 5 — Track changes + collaboration temps réel (commercial)

Le plus mûr et le plus proche de Word / Google Docs. Mais la collaboration temps réel et le suivi exigent une **clé de licence commerciale** ; le serveur de collaboration est un service CKEditor ou une installation « on-premises » sous licence. Changer d'éditeur, de modèle de document et de serveur : on repart de zéro.

- **Écarté** (refonte totale, dépendance commerciale).

### 7. Changer de moteur de synchronisation : Loro, Automerge

Loro (`loro-prosemirror` 0.4.4, MIT) et Automerge (`@automerge/prosemirror` 0.2.0, MIT, algorithme Peritext) traitent la mise en forme concurrente plus proprement que Yjs 13 (Peritext a été conçu contre ce type d'anomalie). Mais **aucun ne fournit de suivi des modifications** ; Automerge impose son propre schéma de texte riche ; il faudrait réécrire le serveur (réplique, compactage, versions, agents).

- Règle D seulement, pour un coût maximal. **Écarté.**

### 8. Suivi « par différence » (concept, sur notre pile)

Ne plus intercepter les transactions : chacun écrit dans le document ; une **version de base** (le dernier état accepté) est gardée ; les modifications affichées sont la **différence** base → document courant, calculée par `prosemirror-changeset` (Marijn Haverbeke, v2.4.6, MIT) et attribuée par personne via Yjs. Accepter fait avancer la base sur le passage, rejeter y ramène le texte. C'est l'idée de Yjs 14, refaite à la main sur Yjs 13.

- Règle A, B, C par construction (aucune forme de geste n'échappe), et donne au correcteur une garantie simple : la base ne bouge que par une acceptation.
- Contre : c'est une refonte complète du suivi, des corrections de l'IA et des commentaires, et précisément ce que Yjs 14 apportera clé en main. **Pas avant d'avoir évalué le candidat 4.**

## Mesures d'accompagnement, indépendantes du choix

1. **Fuite d'espaces (D.5) sans attendre** : un même horodatage pour une frappe continue (moins de morceaux de marques, donc moins de réécritures concurrentes), ou un correctif local d'y-prosemirror (`updateYText` limité au passage modifié). À mesurer avec `tools/campagne/endurance.mjs`.
2. **Garde-fou serveur** : `CORRECTEUR_ETANCHE=refuser` existe déjà ; vérifier sa valeur en production et son effet sur la synchronisation (un refus ne doit pas laisser le client du correcteur diverger) avant de l'activer.
3. **Refuser en suivi, aussi pour un éditeur, ce qu'on ne sait pas suivre** : ferme les pertes de traçabilité (famille A) quel que soit le candidat retenu ensuite.

## Synthèse

| Candidat | A | B | C | D | Coût | Risque |
|---|---|---|---|---|---|---|
| 1. Suivi maison pas par pas | oui | en partie | oui | non | moyen-lourd | faible (on maîtrise tout) |
| 2. suggest-changes | oui | oui | oui | non | moyen + adaptations (auteur, D2) | 0.x, une personne |
| 3. Manuscripts | oui | oui | oui | non | moyen + essai Yjs | usage Yjs non documenté |
| 4. Yjs 14 / y-prosemirror v2 | oui | oui (sauf fusions) | oui | **oui** | lourd | pré-version |
| 5. Tiptap Pro | oui | ? | oui | ? | lourd | commercial — écarté |
| 6. CKEditor 5 | oui | oui | oui | oui | refonte totale | commercial — écarté |
| 7. Loro / Automerge | non | non | non | oui | très lourd | écarté |
| 8. Suivi par différence | oui | oui | oui | non | lourd | conception maison |

## Sources

- Paquets lus : `@y/prosemirror` 2.0.0-15 (et dépôt `yjs/y-prosemirror`, branche `main`), `@handlewithcare/prosemirror-suggest-changes` 0.1.8, `@manuscripts/track-changes-plugin` 2.4.0, `loro-prosemirror` 0.4.4, `@automerge/prosemirror` 0.2.0, `prosemirror-changeset` 2.4.6.
- Tiptap, extension Tracked Changes : https://tiptap.dev/docs/editor/extensions/functionality/tracked-changes ; tarifs : https://tiptap.dev/pricing.md
- CKEditor 5, collaboration temps réel : https://docs.ckeditor.com/ckeditor5/latest/features/collaboration/overview.html
- FOSDEM 2026, « BlockNote, Prosemirror and Yjs 14: Versioning and Track Changes » : https://archive.fosdem.org/2026/schedule/event/8VKQXR-blocknote-yjs-prosemirror/
- Forum Yjs, « Live tracking / Track changes » : https://discuss.yjs.dev/t/live-tracking-track-changes/293
