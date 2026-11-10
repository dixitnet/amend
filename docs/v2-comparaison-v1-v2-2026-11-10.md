# amend.ink : comparaison des fonctions de la v1 et de la v2, et plan de travail de la v2 (10/11/2026)

Statut : **proposé**, à arbitrer par Sylvain (réponse par numéros). Rien n'est lancé.

Demande de Sylvain (10/11/2026) : « Lance une comparaison détaillée des fonctionnalités des v1 et v2, identifie ce qui manque à la v2 et propose des arbitrages. Regarde dans Docs et d'autres applis proches si d'autres fonctionnalités existent et propose de les retenir ou pas. Je veux établir un plan de travail v2. »

Sources :
- v1 : le code (`client/src`, `server`, `shared`), `docs/journal-decisions.md`, `docs/ecarts-editeur.md` ;
- v2 : le code de `v2/` au commit `bd671c5` (volet « Documents »), les plans d'étape, `docs/v2-renoncements.md`, `docs/v2-veille.md` ;
- Docs : le code de `suitenumerique/docs`, cloné le 10/11/2026 (commit `8918bd2` ; dernière version publiée v6.0.4 du 26/10/2026 ; BlockNote 0.57 et export PDF par Typst dans la partie non publiée) ;
- autres applications : recherche sur le web (Google Docs, Fidus Writer, Stylo, Overleaf, Reedsy, Atticus, Scrivener, Ulysses, Manuscripts), surtout des pages de présentation et des revues, peu de documentation officielle : à prendre comme des indications.

Remarque : `docs/v2-plan-suite.md` est en retard sur le code (A1, A2, B, C et D y sont « proposés » alors qu'ils sont faits). Ce document le prolonge et pourra le remplacer une fois arbitré.

## 1. Tableau comparatif

Légende de la colonne « Écart » : **=** la v2 couvre le besoin ; **≈** couvert autrement ou en partie ; **✗** manque ; **R** renoncé (numéro du registre). Importance dans la v1 : C centrale, S secondaire, M marginale, E en essai.

### 1.1 Comptes, documents, partage

| Fonction | v1 | v2 | Docs | Écart |
|---|---|---|---|---|
| Connexion par lien magique | C | fait (15 min, usage unique) | OIDC | = |
| Service fermé (adresses connues ou invitées) | liste d'attente | fait | — | = |
| Nom à la première connexion | C | fait | — | = |
| Changer son nom ensuite | S | route seulement, pas d'entrée à vérifier | oui | ≈ |
| Couleur choisie par la personne | S | couleur calculée par BlockNote | calculée | R 10 |
| Déconnecter partout | S | route sans entrée dans l'interface | — | ≈ |
| Suppression du compte (aperçu, transfert) | S | **absente** | administration Django | ✗ |
| Liste des documents | page « Mes documents » | volet « Documents » (arbre) | page d'accueil + volet | = |
| Tris (modifiés, titre, créés) | S | aucun ; **aucune date de modification enregistrée** | nom, date | ✗ |
| Recherche par titre | S | fait | fenêtre de recherche, plein texte possible | = |
| Favoris | S | fait | fait | = |
| Dossiers personnels | S (3 niveaux) | fait (imbriqués) | sous-documents | = |
| Équipes (dossiers d'équipe) | — | fait | modèle sans interface | v2 en avance |
| Corbeille (restaurer, vider) | S | **absente** : suppression définitive | fait (délai en jours) | ✗ |
| Dupliquer un document | — | — | fait | à décider |
| Importer un fichier (.md, .docx) | — | — | fait (service DocSpec externe) | à décider |
| Rôles en capacités | 3 rôles | 4 rôles (propriétaire, plusieurs possibles) | 5 rôles | = |
| Invitations nominatives | C (14 jours) | fait (7 jours) | fait | = |
| État du courrier d'invitation, renvoyer | S | absent | — | ≈ |
| Accès par lien (avec compte) | retiré | fait | lien public possible | = |
| Transférer la propriété | S | fait | fait | = |
| Quitter un document | S | fait (« Me retirer ») | fait | = |
| Demande d'accès sur un lien fermé | — | — | fait | à décider |

### 1.2 Éditeur

| Fonction | v1 | v2 | Docs | Écart |
|---|---|---|---|---|
| Paragraphe, titres | 1 à 6 | 1 à 5 | 1 à 3 au menu | = |
| Styles de paragraphe (Sous-titre, Légende) | S | non | non | R 6 |
| Citation, listes à puces et numérotées | C | fait (citation d'un seul paragraphe) | fait | ≈ R 3 |
| Liste de tâches | M | non | fait | R 8 |
| **Notes de bas de page** | C pour le public visé | **retirées le 08/11**, à reprendre « très simplifiées » | absentes | ✗ |
| **Images envoyées depuis l'ordinateur** | C (collage, bouton, réduction) | **absent** : le bloc existe, aucun envoi ni stockage | fait (antivirus, contrôle d'accès) | ✗ |
| Légende d'image | — | — | — | — |
| Tableaux | simples | ceux de BlockNote | fusion, couleurs | = |
| Saut de page | S | non | fait (`withPageBreak`) | ✗ (léger) |
| Séparateur | S | fait | fait | = |
| Table des matières | bloc du texte | volet « Plan » ; **pas dans l'export PDF** alors que le renoncement 5 l'y renvoyait | volet | ✗ (export) |
| Liens | S | fait | fait, plus liens entre documents | = |
| Gras, italique, souligné, barré | C | fait | fait | = |
| Exposant, petites capitales | — | non | non | à décider |
| Typographie française (frappe, collage, NFC) | C | fait, **coupée en mode suggestion** (défaut amont) | — | ≈ |
| Raccourcis Markdown à la saisie | M | ceux de BlockNote | ceux de BlockNote | = |
| Compteur de mots et de signes | S | **absent** | nombre de mots | ✗ |
| Rechercher / remplacer | — | — | fait (v5.6) | à décider |
| Zoom, numéros de bloc | M | non | non | à renoncer |
| Prévenir qu'une nouvelle version est en ligne | S (recharger) | non trouvé | — | à vérifier |

### 1.3 Relecture

| Fonction | v1 | v2 | Docs | Écart |
|---|---|---|---|---|
| Suivi des modifications (correcteur toujours en suivi) | C | fait (branche de suggestions de y/hub) | **absent** | = |
| Interrupteur du suivi pour l'éditeur | C | fait | — | = |
| Panneau des modifications, accepter / refuser, tout | C | fait ; **acceptation une à une d'une suggestion d'éditeur en panne** | — | ≈ |
| Parcours ‹ n / N › et compteurs dans le bandeau | S | non | — | à décider |
| Mise en forme suivie | non (écart 10) | à vérifier dans BlockNote | — | — |
| Règle D2 (ne pas effacer la proposition d'un autre) | C | non | — | R 9 |
| Commentaires en fils, résoudre | C (résoudre supprime) | fait (résolus gardés, réactions) | fait | v2 en avance |
| **Liste des commentaires dans un volet** | gouttière + parcours | **bulles seulement** | volet filtrable ouverts / résolus | ✗ |
| Lecteur qui commente | oui | non (décision Q1) | rôle commentateur | décidé |
| Historique, versions nommées, restaurer | S | fait (BlockNote) | fait | = |
| **Comparer deux versions** (mot à mot) | S | non | non | à décider |
| Restaurer « en avant », en suivi | S | non (restauration directe) | non | à décider |

### 1.4 Mise en page et exports

| Fonction | v1 | v2 | Docs | Écart |
|---|---|---|---|---|
| Modèles de mise en page | C : bibliothèque, éditeur en onglets, modèles personnels, écarts par document | **un seul modèle en code** (« TàT - Poche ») | aucun (modèle PDF unique) | ✗ |
| Choix du modèle par document | C | non | — | ✗ |
| Polices déposées par l'administrateur | S | non (EB Garamond) | — | à décider |
| Colonnes | M (export) | non | multi-colonnes à l'écran | R 7 |
| PDF Typst | C (serveur) | fait (navigateur, WebAssembly, grille) | fait (Typst) | = |
| **Word (.docx)** | C (feuille de style, notes en notes de fin) | **absent** | fait (`xl-docx`) | ✗ |
| Markdown | S | fait, **sans les images** | .zip avec médias | ≈ |
| ODT, HTML | — | — | faits | non |
| Variante « en cours » (suggestions visibles) | C | non (texte de base seulement) | — | à décider |
| Export au téléphone | retiré | absent | — | ≈ |
| Impression par le navigateur | — | — | fait | non |

### 1.5 IA, publication, administration

| Fonction | v1 | v2 | Docs | Écart |
|---|---|---|---|---|
| Corrections IA sur la sélection (Corriger, Raccourcir, Clarifier, consigne libre) | C | **absent** (étape 8) | actions sur la sélection (corriger, reformuler, résumer, traduire…) | ✗ |
| Margo, dialogue avec outils (lire, proposer, commenter) | C | **absent** (onglet vide) | BlockNote AI (`xl-ai`) | ✗ |
| Connecteur MCP « Inviter Claude » | E (administrateurs) | absent | non (ticket ouvert) | ✗ |
| Plusieurs fournisseurs (Anthropic, Mistral, Scaleway) | C | — | Mistral (SDK) | à examiner |
| Quotas en signes, garde-fous | C | — | limite de débit | ✗ (avec l'IA) |
| Banc de modèles (back-office) | E | — | — | à décider |
| Page publiée (trois mots, `noindex`) | S (surtout l'aide) | **absente** | pas de page publiée : lien public | ✗ |
| Accueil public, liste d'attente | S | — (v2.amend.ink fermé) | page d'accueil | à décider |
| Palette « Aide / avis » | E | absente | — | à décider |
| Aide en ligne | page publiée | absente | — | ✗ |
| Back-office : système | S | fait (lot 1) | Django | = |
| Back-office : personnes, invitations, retours, IA, images orphelines, sauvegarde | S | absents | Django | ✗ |
| Formats S, M, L | C | faits (S sans historique ni export, comme Docs) | faits | = |
| Hors ligne (copie locale) | — | alerte seulement | fait (v6.0) | plus tard |

## 2. Ce qui manque à la v2 : arbitrages proposés

Classement en trois paniers : **avant la bascule** (ce sans quoi Sylvain ne pourrait pas faire passer ses propres livres de la v1 à la v2), **après la bascule** (utile, pas bloquant), **renoncer** (à inscrire au registre). Pour chaque point : comment Docs le fait, et le niveau le plus bas qui le règle.

### Avant la bascule

1. **Images envoyées et stockées.** Fonction centrale de la v1, faite par Docs (téléversement, contrôle d'accès des médias, antivirus). Proposé : reprendre le montage de Docs (`uploadFile` de BlockNote, route d'images contrôlée par les droits du document, réduction à l'envoi) ; **sans** antivirus (images seulement, types vérifiés) ; une image copiée d'un autre document est recopiée dans celui-ci, pour ne pas reproduire la dépendance de la v1 (§ 6 du journal). Couche : serveur + adaptateur BlockNote.
2. **Notes de bas de page, version simple.** Centrales pour les essais et l'édition scientifique ; Docs n'en a pas. Archive et conditions de reprise : `docs/v2-archives/notes-2026-11-08/`. Proposé : contenu en ligne de BlockNote avec texte simple (sans mise en forme dans la note au premier lot), numérotation calculée, rendu dans le PDF, le Markdown (`[^1]`) et le Word. Point à étudier avant le lot : comment une note se comporte en mode suggestion. C'est le seul gros développement « chez nous » du panier ; à ouvrir par une étude courte.
3. **Corbeille.** Aujourd'hui, une suppression est définitive : risque réel de perte dès qu'il y a des textes de travail. Docs : suppression douce, délai en jours, restauration. Proposé : comme Docs, délai de 30 jours, purge automatique ; entrée « Corbeille » dans le volet « Documents ».
4. **Date de modification enregistrée et tri.** Sans elle, l'accueil ouvre le document le plus récemment *créé*, et la liste ne peut pas montrer « modifié il y a 2 h ». Docs l'enregistre (notification `content-updated` du travailleur y/hub). Proposé : la même chose, puis le tri « modifiés récemment » et la date dans la liste.
5. **Export Word.** Central dans la v1 (éditeurs et imprimeurs travaillent encore sous Word). Docs : `xl-docx-exporter` de BlockNote (licence compatible avec l'AGPL de la v2). Proposé : comme Docs, avec les notes (en notes de bas de page si l'exportateur le permet, sinon en notes de fin comme la v1), `nfc` sur tout le texte. Point E.12 du plan de la suite.
6. **Table des matières dans le PDF.** Le renoncement 5 l'avait promise à l'export ; elle n'y est pas. Petit lot de domaine (`miseEnPage.js`) : `outline` de Typst, profondeur réglée par le modèle.
7. **Choisir un modèle de mise en page par document, parmi des modèles écrits en code.** La v1 offre un éditeur de modèles complet (onglets, modèles personnels, écarts par document) : c'est lourd et peu de personnes s'en servent en dehors de Sylvain. Proposé : les modèles sont des fichiers du domaine (comme « TàT - Poche »), ajoutés sur demande de Sylvain (Poche, A4 de travail, un format KDP…) ; chaque document enregistre le nom de son modèle, choisi dans la fenêtre « Exporter » (point E.11, comme Docs). **Pas** d'éditeur de modèles dans l'interface (voir renoncements).
8. **Compteur de signes (espaces compris) et de mots.** Les éditeurs comptent en signes ; Docs affiche le nombre de mots dans le menu du document. Proposé : même place que Docs (menu « … »), en signes d'abord. Très petit.
9. **Margo, premier lot : corrections sur la sélection.** C'est la fonction d'IA la plus utilisée de la v1. Docs : actions sur la sélection, par son serveur (`ai-transform`), limite de débit. Proposé : ouvrir l'étape 8 par ce lot (Corriger, Raccourcir, Clarifier, consigne libre), propositions posées en suggestions attribuées à « Margo (IA) », limites en signes et garde-fous repris de la v1, un seul fournisseur au départ. Le dialogue et le MCP viennent ensuite (après la bascule si besoin).
10. **Faire entrer les textes de la v1.** Pas de migration (renoncement 1), mais Sylvain devra bien rouvrir ses livres en cours. Deux voies : le collage (déjà possible, typographié et NFC) ou un **import Markdown** dans un nouveau document (BlockNote sait lire le Markdown ; Docs passe par un service externe, DocSpec, que nous n'aurions pas à installer pour le Markdown). Proposé : essayer d'abord le collage d'un livre réel de la v1 dans la v2 ; ne faire l'import que si le collage perd quelque chose (notes, images). Les notes de la v1 doivent alors sortir en `[^1]` dans son export Markdown : à vérifier.
11. **Liste des commentaires dans un volet.** Pour relire un livre, il faut voir et parcourir les commentaires sans les chercher dans le texte. Docs a un volet filtrable (ouverts / résolus, tri par activité). Proposé : comme Docs, dans le volet droit à côté de « Modifications ».
12. **Réparer l'acceptation une à une d'une suggestion d'éditeur**, et suivre la typographie coupée en mode suggestion (défaut amont, au registre de veille). Le second point pèse lourd : un correcteur est toujours en suivi, donc ne profite jamais de la typographie à la frappe. Proposé : signaler le défaut en amont maintenant, et fixer avec Sylvain si la bascule l'attend.
13. **Suppression du compte.** Obligation envers les personnes (RGPD) dès qu'on ouvre au-delà de dixit. Proposé : reprendre la règle de la v1 (aperçu document par document, refus si un document ne peut passer qu'à des lecteurs), en s'appuyant sur les règles de propriété déjà écrites dans le domaine.
14. **Page d'aide et accueil public.** À la bascule, www.amend.ink doit encore montrer quelque chose aux visiteurs, et l'aide vit aujourd'hui dans une page publiée de la v1. Voir la question Q3.

### Après la bascule

15. **Dialogue Margo** (outils lire, proposer, commenter, comme la v1) puis **connecteur MCP « Inviter Claude »**. Docs suit le MCP par un ticket ; regarder où il en est à l'ouverture.
16. **Back-office** : personnes et invitations en attente, consommation de l'IA en signes, journaux. Les gestes (renvoyer une invitation, embarquer) seulement sur un besoin constaté.
17. **Export Markdown avec images** (archive `.zip`, comme Docs) et **entrée « Exporter » au téléphone**.
18. **Saut de page** : bloc de Docs (`withPageBreak`), simple à configurer ; rendu dans le PDF et le Word. Utile pour une page de titre ou une dédicace.
19. **Exposant** (siècles, « 1er », « Mme ») : typographie française correcte, qui est l'objectif général du produit. Style BlockNote à nous, petit. **Petites capitales** : à peser, seulement si un texte réel le demande (point E.15).
20. **Dupliquer un document** (Docs le fait) : pratique pour garder une version de travail ou partir d'un texte existant. Petit, côté serveur (copie de l'état y/hub).
21. **Rechercher / remplacer** dans le document (Docs, extension `FindAndReplace`). Utile à un éditeur (harmoniser un nom, une graphie). Attention à l'interaction avec le mode suggestion : un remplacement en suivi doit donner des suggestions.
22. **Parcours des modifications et des commentaires** (‹ n / N ›, compteurs dans le bandeau) : pratique de la v1, à reprendre si la liste du point 11 ne suffit pas.
23. **Comparer deux versions** (mot à mot, v1) : Docs ne le fait pas, Overleaf et Google Docs oui. Utile entre deux états d'un manuscrit ; à reprendre sur demande, avec `shared/diff.js` de la v1 comme base de domaine.
24. **Variante d'export « en cours »** (suggestions visibles) : dans la v1, elle sert à envoyer un état de relecture à quelqu'un qui n'a pas de compte. Meilleure forme à terme : **Word avec modifications suivies** (Google Docs fait sortir ses suggestions ainsi). À peser : c'est du code à nous dans l'exportateur.
25. **Hors ligne** (copie locale, Docs v6.0) : attendre que le montage de Docs soit stable, puis le reprendre tel quel.

### Renoncer (à inscrire au registre)

26. **Éditeur de modèles dans l'interface, modèles personnels, écarts par document, polices déposées par l'administrateur** : remplacés par des modèles en code (point 7). Ce qui ferait y revenir : d'autres maisons d'édition qui veulent leurs propres gabarits sans passer par nous.
27. **Zoom et numéros de bloc** (v1, marginaux ; les numéros servaient à Margo, qui citera autrement).
28. **Liste de tâches, sous-titre, légende comme styles** : déjà couverts par les renoncements 6 et 8 ; rien à ajouter.
29. **Palette « Aide / avis », liste d'attente, embarquement de testeurs** dans la v2 tant qu'elle est un service fermé : un courriel à contact@dixit.net suffit. À rouvrir avec la question Q3.
30. **Banc de modèles de Margo** dans le back-office : outil d'essai de la v1 ; les essais de modèles peuvent se faire hors de l'application (`tools/`).
31. **Restauration « en avant » en suivi** (v1) : la restauration directe de BlockNote, réservée à qui peut `restaurer`, suffit, puisque l'historique garde l'état d'avant.

## 3. Fonctions vues ailleurs : retenir ou non

| N° | Fonction (où on la voit) | Proposition | Raison |
|---|---|---|---|
| 32 | Mentions « @ » avec courriel (Docs) | plus tard, à peser | utile en relecture (« @Sylvain, à voir »), mais envoie des courriers : à cadrer avec le service fermé |
| 33 | Liens entre documents, lien vers un bloc (Docs) | non | un livre tient dans un document ; marginal |
| 34 | Sous-documents, arborescence de chapitres (Docs, Scrivener, Atticus) | non pour l'instant | un livre = un document ; à rouvrir seulement si un livre long pose un problème mesuré de performance ou d'usage |
| 35 | Recherche plein texte dans tous les documents (Docs) | non | la recherche par titre suffit au nombre de documents d'une personne |
| 36 | Import .docx (Docs, par DocSpec) | plus tard | demande un service de conversion à héberger ; le collage depuis Word passe déjà par BlockNote. À rouvrir si des auteurs arrivent avec des manuscrits Word |
| 37 | Demande d'accès sur un lien fermé (Docs) | plus tard | utile dès qu'on partage des liens hors des invitations |
| 38 | Bibliographie, citations, Zotero, BibTeX (Fidus Writer, Stylo, Overleaf) | non avant la bascule ; étude à part | nécessaire pour l'édition scientifique, troisième public visé ; c'est un chantier en soi (styles de citation, export) |
| 39 | Formules mathématiques (Docs, bloc `math` de BlockNote) | non avant l'édition scientifique | se configure (bloc de BlockNote) ; rendu Typst à écrire |
| 40 | Export ePub (Reedsy, Atticus, Scrivener, Fidus) | plus tard, à étudier | attendu des auteurs autoédités ; Typst ne le fait pas : il faudrait un exportateur à nous ou Pandoc |
| 41 | ICML (InDesign), TEI, JATS (Stylo, Manuscripts, Fidus) | non | publics très spécialisés (règle 4) ; l'ICML pourrait servir à des maisons qui composent sous InDesign, sur demande réelle |
| 42 | Thèmes de livre avec format de coupe (Atticus) | déjà couvert | ce sont nos modèles en grille (point 7) |
| 43 | Objectifs d'écriture, statistiques de session (Scrivener, Ulysses) | non | marginal pour le public visé (règle 4) |
| 44 | Instantanés avant réécriture (Scrivener), versions étiquetées (Overleaf) | déjà couvert | versions nommées de l'historique |
| 45 | Suggestions exportées en modifications suivies Word (Google Docs) | voir point 24 | |
| 46 | Mode présentation, callout, diagrammes, code, emoji (Docs) | non | renoncements 8 et 12 |
| 47 | Impression par le navigateur, ODT, HTML, copier en Markdown (Docs) | non | le PDF et le Word couvrent le besoin |
| 48 | Antivirus des fichiers (Docs) | non | nous n'acceptons que des images |

## 4. Plan de travail proposé

Les numéros renvoient aux points ci-dessus. Chaque étape garde ses règles (revue d'ouverture et de clôture, audit partiel avant chaque fusion). Les lots de design (Mantine, décisions de Sylvain) passent avant les lots techniques qui en dépendent.

| Ordre | Lot | Points | Étape | Taille |
|---|---|---|---|---|
| P1 | Fondations du document : date de modification, tri, corbeille | 3, 4 | 6 (complément) | petit |
| P2 | Images envoyées et stockées | 1 | 4 / 6 | moyen |
| P3 | Notes de bas de page simples (étude courte, puis lot) | 2 | 4 | gros |
| P4 | Exports : fenêtre « Exporter » et choix du modèle, table des matières, Word, compteur de signes | 5, 6, 7, 8 | 7 | moyen |
| P5 | Relecture : volet des commentaires, acceptation une à une, signalement amont de la typographie en suivi | 11, 12 | 5 (complément) | moyen |
| P6 | Margo, corrections sur la sélection, limites en signes | 9 | 8 | moyen |
| P7 | Essai de passage d'un livre réel de la v1 (collage, puis import Markdown si besoin) ; banc d'un livre long | 10 | bascule | petit |
| P8 | Suppression du compte ; accueil public et aide (selon Q3) | 13, 14 | 9 | moyen |
| — | **Bascule** : conditions du point H.20 du plan de la suite, plus P1 à P8 faits | | | |
| P9 | Dialogue Margo, puis MCP | 15 | 8 | gros |
| P10 | Back-office : personnes, invitations, consommation de l'IA | 16 | 9 | moyen |
| P11 | Petits ajouts d'édition : saut de page, exposant, dupliquer, rechercher / remplacer, Markdown avec images, export au téléphone | 17 à 21 | 4, 6, 7 | petits |
| P12 | Selon l'usage réel : comparer deux versions, Word en modifications suivies, mentions, ePub, hors ligne | 22 à 25, 32, 40 | — | à estimer |
| P13 | Édition scientifique : étude bibliographie, citations, formules | 38, 39 | nouvelle étape | étude |

## 5. Questions pour Sylvain

- **Q1.** Le panier « avant la bascule » (points 1 à 14) vous convient-il ? Points à retirer ou à ajouter ?
- **Q2.** Notes de bas de page (point 2) : d'accord pour une version simple (texte sans mise en forme dans la note, au premier lot) ?
- **Q3.** Après la bascule, que montre www.amend.ink aux visiteurs, et où vit l'aide ? (a) une page statique servie par Caddy, sans compte, et l'aide en PDF ou en page statique ; (b) une page publiée dans la v2, comme la v1 (point 14 devient un lot de publication) ; (c) garder la v1 en ligne pour ces seules pages un temps.
- **Q4.** Modèles de mise en page en code, choisis par document, sans éditeur dans l'interface (points 7 et 26) : d'accord ? Quels modèles après « TàT - Poche » ?
- **Q5.** Margo avant la bascule limitée aux corrections sur la sélection (point 9), le dialogue et le MCP après : d'accord ?
- **Q6.** La typographie coupée en mode suggestion (défaut amont, point 12) bloque-t-elle la bascule ?
- **Q7.** Renoncements 26 à 31 : à inscrire au registre ?
- **Q8.** Fonctions vues ailleurs (32 à 48) : les propositions vous conviennent-elles ?
- **Q9.** L'ordre P1 à P8 : à garder, ou autre priorité ?
