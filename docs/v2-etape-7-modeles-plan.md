# amend.ink v2 : export PDF et modèles de documents, avec modèles d'équipe (étape 7, suite)

Statut : **proposé** le 10/11/2026, à arbitrer par Sylvain (réponse par numéros, § 7). Rien n'est lancé.

Demande de Sylvain (10/11/2026) : « Export pdf et modèles de documents. Précise l'architecture et le plan de développement. Intègre une logique de modèles d'équipe. »

Sources : plan du lot 1 de l'étape 7 (`docs/v2-etape-7-plan.md`), plan de la suite (`docs/v2-plan-suite.md`, § E), étude et arbitrage des équipes (`docs/v2-etude-dossiers-equipes.md`, plan de la 6d), journal des décisions de la v1 (§ 11, 11 bis et 12 : modèles CSS de la v1), code de Docs (§ 1).

## 0. De quoi parle-t-on

« Modèle » recouvre deux choses qu'il faut séparer :

- **le modèle de mise en page** (gabarit) : comment le texte est composé à l'export (format, marges, grille, police, chapitres, folio). C'est ce qui existe déjà avec « TàT - Poche ». **Ce plan porte sur lui.**
- **le document modèle** (contenu de départ) : un document qu'on recopie pour en commencer un autre (une trame de rapport, une fiche). Traité à part, au § 6, parce qu'il ne touche ni l'export ni la mise en page.

## 1. Comment fait Docs

Lu dans `suitenumerique/docs` (branche principale au 10/11/2026, et l'étiquette `v3.0.0` pour l'historique) :

1. **Export** : tout dans le navigateur, fenêtre « Exporter » (`doc-export/components/ModalExport.tsx`) avec **un seul choix, le format** (PDF par défaut, Word, ODT, HTML, Markdown) ; le PDF passe par les paquets Typst de BlockNote. C'est le montage que la v2 a déjà repris au lot 1.
2. **Modèles de mise en page : Docs en avait, puis les a retirés.** En v3.0.0, `core/models.py` a un objet `Template` (code HTML et CSS, `is_public`) et des accès `TemplateAccess` **par personne ou par équipe**, avec des rôles ; la fenêtre d'export proposait de choisir un modèle, et le PDF était composé sur le serveur (WeasyPrint). Dans le code actuel, `Template` n'existe plus : l'export est passé dans le navigateur, sans choix de modèle. Une demande générique de modèle d'export reste ouverte chez eux (`docs/v2-veille.md`, ticket 680).
3. **Documents modèles** : Docs n'a pas de bibliothèque de modèles de contenu. Il a « Dupliquer » (`duplicate`, avec ou sans les accès) et un document d'accueil recopié pour chaque nouveau compte (`USER_ONBOARDING_SANDBOX_DOCUMENT`, contenu lu dans y/hub puis réécrit au nom de la personne).

Conséquence : **des modèles de mise en page, et a fortiori des modèles d'équipe, sont un écart avec Docs d'aujourd'hui**. Il se justifie par notre objet (le livre composé, que Docs ne vise pas) et il a un précédent chez eux (des modèles avec accès par équipe). L'écart est à noter dans le journal si Sylvain le décide (règle 11). On reprend de Docs la forme qu'il avait donnée aux droits (le modèle a des accès, l'équipe en est un) mais pas son support (HTML et CSS sur le serveur) : le nôtre reste Typst dans le navigateur.

## 2. Ce que la v1 nous a appris

La v1 a eu des modèles riches (journal, § 11 à 12) : feuille CSS par modèle, catégories, modèles d'instance copiés depuis le code puis modifiables par les administrateurs, éditeur en sept onglets avec spécimen. Trois leçons :

1. **Copier un modèle livré le coupe de ses corrections** (« une correction ultérieure du code n'atteint pas un modèle déjà copié, sauf à le rétablir »). Dans la v2, un modèle d'équipe **dérive** d'un modèle d'amend.ink et n'enregistre que ses écarts.
2. **Le support libre (CSS) a coûté** : liste fermée, filtrage des `url()`, avertissements, lecture seule finalement. Dans la v2, **pas de Typst libre** : une liste fermée de réglages, bornés.
3. **Beaucoup de réglages ont été ajoutés d'un coup** (§ 12) avant d'avoir des livres pour les éprouver. Dans la v2, un réglage n'entre que quand un livre réel le demande (règle 4).

## 3. Architecture proposée

### 3.1 Trois sortes de modèles, une seule forme

| | Modèles d'amend.ink | Modèles d'équipe | Modèles personnels |
|---|---|---|---|
| Où | `v2/design/reglages.js` (`livre.modeles`), dans le code | base PostgreSQL, table `amend.modeles` | **aucun** (proposition) |
| Qui décide | Sylvain (règle 21, ADR 0008) | les gestionnaires de l'équipe (§ 7, Q3) | — |
| Contenu | toutes les valeurs du modèle | **une base** (un modèle d'amend.ink) **et des écarts** sur une liste fermée de réglages | — |
| Qui s'en sert | tout le monde | tout document de l'équipe, et quiconque exporte un tel document, membre ou non | — |

Un auteur seul qui veut son propre modèle crée une équipe dont il est le seul membre : la création d'équipe est déjà ouverte à toute personne connectée (arbitrage 6d). Pas de troisième portée à coder.

Le modèle complet est toujours **calculé** : `modele = appliquerEcarts(base, ecarts)`. Une correction de Sylvain sur « TàT - Poche » atteint donc tous les modèles d'équipe qui en dérivent, sauf sur les réglages qu'ils ont changés.

### 3.2 Par couche (règles de la v2, § 2)

**Domaine** (`domaine/miseEnPage.js`, JavaScript pur, sans fondation) :
- `appliquerEcarts(base, ecarts, reglables)` : le modèle complet ; un écart hors de la liste fermée ou hors de ses bornes est refusé avec un code (`reglage-inconnu`, `reglage-hors-bornes`) ;
- `grille(modele)`, déjà là, garde son rôle de contrôle de cohérence (`modele-impossible` : lignes qui ne tiennent pas, folio hors de la page) ; il s'applique au modèle calculé, à l'enregistrement comme à l'export ;
- `modeleDuDocument({ choisi, defautEquipe, premierModele })` : le modèle retenu pour un document (§ 3.4) ;
- droits : `peutGererModeles(capsMembre)` et `peutChoisirModele(capsDocument)`, dans `domaine/equipes.js` et `domaine/droits.js`, en codes comme le reste.

**Design** (`design/reglages.js`, décisions de Sylvain) :
- les modèles d'amend.ink (aujourd'hui « TàT - Poche ») ;
- **la liste des réglages ouverts aux équipes et leurs bornes** (`livre.reglables`) : par exemple format (largeur, hauteur), marges, corps, interligne, nombre de lignes, police (parmi le catalogue), alinéa, chapitre en belle page ou non. Le domaine reçoit cette liste en paramètre : il vérifie, il ne décide pas ;
- **le catalogue des polices** (`design/polices/`, licences OFL) : un modèle d'équipe choisit une famille du catalogue, il n'en dépose pas ;
- les composants de présentation : fenêtre « Exporter », liste et formulaire des modèles d'équipe.

**Adaptateurs** :
- `adaptateurs/blocknote/export.js` : inchangé dans son principe (il reçoit un modèle complet, comme aujourd'hui) ;
- `adaptateurs/postgres/` : la table et les colonnes du § 3.3.

**Application technique** :
- serveur : routes des modèles (§ 3.5), contrôles par le domaine ;
- client : `application/client/exports.js` reçoit le modèle retenu au lieu de prendre `MODELES_LIVRE[0]`, charge les polices de la famille choisie, compile dans le navigateur comme aujourd'hui.

Le serveur **ne compose jamais** de PDF : la compilation reste dans le navigateur (26 Mo de WebAssembly chargés à la première demande, rien sur le VPS de 1 Go).

### 3.3 Données

```
amend.modeles
  id           uuid
  equipe       uuid  → amend.equipes (on delete cascade)
  nom          text  (nettoyé comme les noms d'équipe : NFC, longueur bornée)
  base         text  (identifiant d'un modèle d'amend.ink, ex. 'tat-poche')
  ecarts       jsonb (seulement les réglages changés)
  cree_par, cree_le, modifie_par, modifie_le

amend.documents.modele        text, nullable  ('amend:tat-poche' ou l'id d'un modèle d'équipe)
amend.equipes.modele_defaut   text, nullable  (même forme)
```

Pas de version des modèles : l'historique est celui du document, pas de son gabarit. Un PDF déjà exporté ne change pas.

### 3.4 Quel modèle pour un document

Dans l'ordre :
1. le modèle choisi pour le document (`documents.modele`), s'il existe encore et s'il est permis au document (un modèle d'amend.ink, ou un modèle de **l'équipe qui possède le document**) ;
2. sinon le modèle par défaut de son équipe ;
3. sinon le premier modèle d'amend.ink.

Conséquences, à valider :
- **un correcteur extérieur** qui exporte un document de l'équipe obtient le modèle de l'équipe : le modèle suit le document, pas l'appartenance à l'équipe. Le serveur le renvoie avec le document ; il n'ouvre pas pour autant la liste des modèles de l'équipe à ce correcteur ;
- **un document qui sort de l'équipe** (geste du gestionnaire, arbitrage 5.1) perd un modèle d'équipe : il revient au premier modèle d'amend.ink ; la confirmation de sortie le dit ;
- **un modèle d'équipe supprimé** : les documents qui l'avaient retombent sur le défaut de l'équipe ; la confirmation donne leur nombre (la v1 refusait la suppression d'un modèle utilisé ; voir Q5).

### 3.5 Routes du serveur (esquisse)

- `GET /api/equipes/:id/modeles` : les modèles de l'équipe (membres) ;
- `POST /api/equipes/:id/modeles`, `PATCH`/`DELETE /api/equipes/:id/modeles/:modele` : créer à partir d'une base, renommer, changer les écarts, supprimer (droit selon Q3) ;
- `PUT /api/equipes/:id/modele-defaut` ;
- `PUT /api/docs/:id/modele` : choisir le modèle du document (éditeurs du document, selon Q4) ;
- le modèle retenu (complet, calculé) accompagne les informations du document que le client charge déjà.

Toutes les réponses sont des codes ; aucun texte (règle 23).

### 3.6 Interface

1. **Fenêtre « Exporter »**, comme celle de Docs (`Modal` de Mantine) : un choix de format (PDF, Markdown ; Word quand il viendra) ; pour le PDF, un choix de modèle (ceux d'amend.ink, puis ceux de l'équipe du document, sous l'intitulé de l'équipe), présélectionné sur le modèle retenu (§ 3.4) ; un indicateur pendant la compilation (limite 6 du lot 1). Elle remplace les deux entrées actuelles du menu « Autres actions » et donne enfin une entrée au téléphone (picto à choisir).
2. **Modèles de l'équipe** : un onglet ou une section dans la fenêtre de l'équipe (là où sont déjà les membres). Liste, « Nouveau modèle » (choix de la base), formulaire des réglages ouverts, regroupés comme dans la v1 (Format, Texte, Chapitres) mais limités à la liste fermée ; modèle par défaut de l'équipe.
3. **Aperçu** : la v1 l'avait écarté (« pas d'aperçu PDF », § 11 bis). Proposition minimale : un bouton « Exporter le document ouvert avec ce modèle », sans spécimen à nous (Q7).

## 4. Ce qu'on écarte (renoncements proposés)

1. **Typst libre** dans un modèle d'équipe (ni code, ni import d'un fichier `.typ`) : la grille ne serait plus garantie, et il faudrait sécuriser et déboguer le code des autres. À rouvrir si un maquettiste réel en a besoin, et alors par un modèle d'amend.ink ajouté par Sylvain.
2. **Dépôt de polices** par une équipe : licences, poids, rendu non vérifié. Le catalogue est étendu par Sylvain à la demande.
3. **Modèles personnels** : couverts par une équipe d'une personne (§ 3.1).
4. **Composition sur le serveur** : non, comme Docs aujourd'hui.

## 5. Plan de développement

Un lot = une couche (règle 3), le design avant la technique quand il y a de l'interface (règle de séparation). Chaque lot avec ses tests, l'audit partiel avant fusion, et les contrôles habituels.

| Lot | Couche | Contenu | Dépend de |
|---|---|---|---|
| 7.2 | domaine | `appliquerEcarts`, bornes reçues en paramètre, codes de refus, `modeleDuDocument`, droits des modèles ; tests unitaires (dont : un écart qui rend la grille impossible est refusé) | Q1 à Q5 |
| 7.3 | design | fenêtre « Exporter » (format, modèle, indicateur), entrée au téléphone ; `livre.reglables` et catalogue des polices (valeurs données par Sylvain) | Q6, décisions de design |
| 7.4 | application (client) | fenêtre branchée, modèles d'amend.ink seulement, polices chargées selon la famille, test de la pile (export PDF avec chacun des modèles) | 7.2, 7.3 |
| 7.5 | adaptateur PostgreSQL + serveur | table et colonnes, routes, contrôles par le domaine, sortie d'équipe et suppression (§ 3.4) ; tests des services | 7.2 |
| 7.6 | design | liste et formulaire des modèles d'équipe, choix du modèle par défaut | 7.3 |
| 7.7 | application (client) | branchement des modèles d'équipe, choix du modèle du document, parcours de la pile (création, export par un membre et par un correcteur extérieur, suppression) | 7.5, 7.6 |
| 7.8 | domaine + design | réglages supplémentaires, **un par un, sur un livre réel** (candidats tirés de la v1 : position du folio, veuves et orphelines, césure, séparateur de scène, titre courant, table des matières produite à l'export, renoncement 5) | un besoin constaté |
| clôture | — | revue de clôture, export d'un livre de référence identique à l'attendu (critère du § 8 des règles) | 7.2 à 7.7 |

Les lots 7.2 à 7.4 apportent déjà la fenêtre de Docs et le choix entre modèles d'amend.ink : utiles même si les modèles d'équipe attendent. Word (Q8) s'insère après 7.4.

**Point bloquant hors de ce plan** : les **notes de bas de page**. Le schéma de la v2 n'en a pas (BlockNote n'en fournit pas) ; un essai ne s'exporte pas proprement sans elles. À traiter à part (étape 4 rouverte, ou proposition en amont), avant la clôture de l'étape 7.

**Règle à réviser** (règle 6 des règles de la v2 : proposer de la réviser plutôt que la contourner) : l'ADR 0008 et la règle 17 disent qu'aucune valeur de design n'est fixée hors des réglages décidés par Sylvain. Un modèle d'équipe contient des valeurs choisies par une équipe. Proposition : **ADR 0011** « Modèles de mise en page : ceux d'amend.ink dans le design, ceux des équipes en données bornées » ; Sylvain fixe la liste des réglages ouverts et leurs bornes, l'équipe choisit dedans, comme elle choisit le texte de ses documents.

## 6. Documents modèles (contenu de départ)

Hors du périmètre de l'export, mais lié par le mot. Docs n'a que « Dupliquer » et un document d'accueil recopié. Options :

1. **Rien de plus que Docs** : ajouter « Dupliquer » au menu d'un document (copie du texte de base, sans les accès, sans les commentaires ni les suggestions), le modèle de mise en page suit. Une équipe range ses trames dans un dossier « Modèles » et les duplique.
2. Une marque « document modèle » dans une équipe, et « Nouveau document à partir de… » dans le volet « Documents ».
3. Rien pour l'instant.

Proposition : **1** quand le besoin se présente, pas avant ; le 2 alourdit le volet pour un usage que la duplication couvre déjà (règle 4).

## 7. Questions pour Sylvain

- **Q1. Périmètre** : (1) modèles de mise en page seulement, avec les modèles d'équipe (§ 3 à 5) ; (2) les mêmes plus « Dupliquer » (§ 6, option 1) ; (3) autre lecture de « modèles de documents ». Proposition : 1.
- **Q2. Forme d'un modèle d'équipe** : (1) une base d'amend.ink et des écarts sur une liste fermée et bornée ; (2) une copie complète, modifiable librement dans les mêmes bornes (comme la v1, qui perd alors les corrections de la base). Proposition : 1.
- **Q3. Qui crée et modifie les modèles d'une équipe** : (1) les gestionnaires ; (2) les éditeurs de l'équipe (comme pour les dossiers). Proposition : 1, un modèle change les exports de toute l'équipe.
- **Q4. Le modèle d'un document** : (1) enregistré avec le document, choisi par ses éditeurs, présélectionné à l'export, et changeable dans la fenêtre pour un seul export par quiconque peut exporter ; (2) choisi seulement au moment de l'export, rien d'enregistré (plus simple, mais deux membres peuvent sortir deux PDF différents). Proposition : 1.
- **Q5. Supprimer un modèle d'équipe utilisé** : (1) permis, les documents retombent sur le défaut de l'équipe, la confirmation dit combien ; (2) refusé tant qu'un document s'en sert (v1). Proposition : 1.
- **Q6. Réglages ouverts aux équipes, pour commencer** : (1) format, marges, corps, interligne, lignes, police, alinéa, chapitre en belle page ou non ; (2) les mêmes moins la police (une seule famille tant que le catalogue n'a qu'EB Garamond) ; (3) autre liste. Bornes à fixer par vous ; le catalogue des polices aussi.
- **Q7. Aperçu** : (1) aucun, comme la décision de la v1 ; (2) « Exporter le document ouvert avec ce modèle » depuis le formulaire. Proposition : 2, c'est l'export existant, sans code de spécimen.
- **Q8. Word** : (1) après 7.4, avec le modèle appliqué à ce que Word sait faire (format, marges, police, corps, chapitre en nouvelle page) ; (2) plus tard. 
- **Q9. Écart avec Docs et règle** : accord pour noter l'écart (modèles de mise en page et modèles d'équipe, que Docs a retirés) dans le journal, et pour l'ADR 0011 (§ 5) ?
- **Q10. Ordre** : (1) 7.2 à 7.4 d'abord (fenêtre et choix entre modèles d'amend.ink), puis les équipes ; (2) tout d'un trait. Proposition : 1, et ce plan après la clôture de l'étape 6 et les correctifs déjà prévus (plan de la suite, § B et C).
