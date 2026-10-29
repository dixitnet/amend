# amend.ink — journal des décisions et état d'avancement

Document de reprise pour Claude Code. Établi le 26/10/2026 à partir de l'historique des échanges Cowork. Les rapports détaillés restent dans le Projet claude.ai « Amend » (noms entre parenthèses).

## 1. Produit et positionnement

- Éditeur collaboratif auto-hébergé : ProseMirror + Yjs, suivi des modifications, IA (Margo), exports PDF (Typst) / Word / Markdown, page publiée.
- Public visé (20/10/2026) : auteurs et éditeurs, d'abord essais et romans, puis édition scientifique.
- Objectif général (24/10/2026) : documents les plus propres possible à l'export (accents précomposés NFC, pas de remplacements parasites).
- Nom : « amend.ink », jamais « Amend » (17/09). Domaine amend.ink ; logo typographique « amend » + « .ink » façon insertion suivie ; vert amande #5f7a4a (clair) / #a9c68a (sombre).
- Société éditrice : dixit.net SAS (Nantes, créée en 2015, seul salarié : Sylvain Grisot). Contact : contact@dixit.net.
- Usage d'abord interne à dixit, partage et commercialisation possibles ensuite.

## 2. Hébergement et exploitation

- Production : VPS Gandi V-R1 (1 vCPU, 1 Go RAM, 2 Go swap), Debian 13, Node 24 LTS, Caddy (HTTPS auto), systemd `amend`. Choisi le 14/09 après abandon du tiny domestique (friction DDNS) ; Gandi pour l'hébergement français/européen.
- `basic_auth` retiré le 15/09 : l'accès repose entièrement sur l'authentification applicative (session + accès par document). Sans Mailgun fonctionnel, l'instance est inutilisable (lien magique ou invitation).
- Mailgun en zone **EU** (`api.eu.mailgun.net`). `SESSION_SECRET` obligatoire (sinon déconnexion générale à chaque redémarrage). `ADMIN_EMAILS` ouvre l'amorçage et les routes d'administration.
- Sauvegarde (10/10) : le NAS tire `data/` chaque nuit, puis envoi quotidien vers Proton Drive par script autonome (CLI officielle), données et secrets envoyés sans chiffrement supplémentaire au-delà de Proton.
- Déploiement toujours manuel / sur demande, via `deploy/livrer.sh`. Le Mac est l'environnement de dev et de test.
- Mise à jour système du VPS (apt upgrade + reboot) : commandes données le 24/10, à faire par Sylvain.
- Guide complet : `serveur-production-collabtext.md` (sections 0 à 14, journal des déploiements).

## 3. Rôles, accès, sécurité

- Rôles par document : éditeur, correcteur (propose en suivi, commente), lecteur. Les droits sont des **capacités** (`server/roles.js`) : ne jamais figer par nom de rôle (ex. ouvrir l'IA aux correcteurs doit rester possible).
- Invitations nominatives par e-mail (15/09) : lien valable 14 jours, réutilisable dans ce délai ; l'identité est prouvée par la réception du mail.
- Plus de document ouvert à tous (28/09). Lecteur étanche côté serveur depuis le 29/09, correcteur étanche depuis le 13/10 (`CORRECTEUR_ETANCHE`, d'abord en mode « observer »).
- IA fermée aux correcteurs (`canUseAI`), exigeant un document connu côté serveur.
- Plafond de participants supprimé (15/09) ; keep-alive WebSocket 30 s.
- Réplique Yjs côté serveur (29/09) : compactage fait par le serveur, un client dont l'opération est refusée recharge la page.
- Cap posé : centraliser la gestion des utilisateurs (aujourd'hui l'utilisateur n'est qu'une adresse répétée par document). C'est là que la structure devra bouger pour porter les quotas.

## 4. IA

- Margo (09/10) : « Margo (IA) » dans l'interface ; « Inviter Claude » reste « Claude (pour <prénom>) ». Sélecteur de portée du dialogue : « Tout le texte » / « La sélection ».
- Modèles : « Corriger » reste sur Haiku 5.5 ; le dialogue Margo doit passer à Sonnet 5.5 (décision du 11/10 — vérifier dans le code si c'est fait). Réflexion désactivée pour les corrections (bug de paragraphe tronqué, 30/09 ; `rapport-bug-ia-tronquee.md`).
- Limites et consommation toujours **en signes, espaces compris** (13/10). Garde-fous dans `server/garde-fous.js` (`garde-fous-ia.md`, `conception-limites-ia.md`).
- Modèle économique (hypothèse 13–14/09, révisé le 10/10, `revision-modele-economique.md`) : comptes FREE/PRO ; pas de revente d'IA en gros ; possibilité de brancher sa propre clé. Aucun seuil ni montant ne se fixe sans journaux réels.
- Fournisseur Mistral optionnel (`MISTRAL_API_KEY`) ; étude du passage européen et banc de modèles dans `etude-passage-europeen.md`, `protocole-banc-europeen.md`, `rapport-banc-*.md`.

## 5. Exports propres (lot livré, commit 1ffdc4b, 24/10)

- Cause : l'IA proposait des remplacements « à l'identique » (mots NFD/NFC différents, espace insécable vs espace simple) qui noyaient la revue.
- Correctif `shared/diff.js` : `memeJeton` neutralise ces écarts ; le raffinement caractère n'est appliqué qu'aux mots déjà NFC.
- Normalisation NFC (`nfc()` de `shared/propre.js`) dans tous les exports (md, docx, pdf), titres, noms de fichier, page publiée, source Typst côté serveur, et au collage.
- Menu « Insérer ▾ » rogné en format M vertical : corrigé par un popover `manual` (le confinement `container-type` neutralisait `position: fixed`).
- Non fait, à décider : normaliser aussi les documents déjà stockés ; `situer()` (le `avant` de Claude en NFC face à un texte NFD).

## 6. PDF : images copiées d'un autre document (livré, commit 25cd187)

- Symptôme (21/10) : « composition impossible — file not found (…/images/kT58dUJHwcL_R2iwLDN94g.png) ».
- Cause : `uploads.lister(docId)` ne dépose dans le dossier de rendu que les images du document exporté. Une image collée depuis un autre document garde son URL d'origine et manque au rendu.
- Correctif livré : `client/src/typstExport.js` (`docToTypst(..., docId)`, `cheminImage`), `server/typst.js` (nom d'image avec sous-dossier, `mkdirSync` du dossier parent), `server/routes/export.js` (`imagesDuRendu`, contrôle `storage.roleFor`, 300 images étrangères max), tests `client/test/exportPdf.test.js` et `server/test/images-etrangeres-pdf.test.js`.
- À vérifier : l'export PDF du document qui échouait (recharger les onglets). S'il échoue encore, demander le titre du document.
- Question ouverte (discuter, ne pas lancer) : copier réellement l'image au collage entre documents, pour ne plus dépendre du document donateur ; la page publiée a la même limite.

## 7. Aide utilisateur

- Le document « Aide amend.ink » est un document amend.ink édité depuis le Chrome de Sylvain (mis à jour le 23/10 : 88 blocs). Nouvelles sections : écran d'un document, images, versions, téléphone (format S), clavier, mise en page, Insérer, aide/avis. Brouillon des changements : `aide-mise-a-jour-2026-10-23.md`.
- La page d'aide publique n'est pas republiée : attendre son feu vert.

## 8. Interface multi-formats

- Trois plateformes / formats S, M, L (`architecture-interface-trois-plateformes.md`, `vues-reference-formats.md`, `journal-dev-format-S.md`, `journal-dev-format-L.md`, rapports de tests M et L4). Reste à tester : Insérer sur iPad en portrait. Reports anciens : import Google Fonts, iPhone en paysage.

## 9. Tâches de Sylvain en attente

- Ménage : `_a_supprimer/depot-cloud.tgz` et `_a_supprimer/banc-menu` ; résidus `.git/stale-*`, `.git/*.lock.stale*` (sans importance).
- Mise à jour apt du VPS + redémarrage.
- Rejeter les propositions bruitées du document « Chroniques », relancer la correction.
- `npm audit` : 1 vulnérabilité « high » (undici, dépendance de dev) — `npm audit fix` optionnel.

## 10. Méthodes à garder

- Tests d'interface : navigateur piloté sur un build réel ; bancs de charge exécutés hors du processus mesuré, avec une sonde indépendante ; ne jamais conclure sur une seule mesure.
- Un rapport écrit pour chaque lot important (documentation : point 80 de la feuille de route), un journal de développement par chantier.
- Les points 1 à 81 de la feuille de route (`feuille-de-route.md`) font foi pour l'historique des lots.

## 11. Modèles : stockage en CSS et catégories (28/10/2026)

- Décisions de Sylvain : un modèle est une feuille CSS d'impression ; les polices restent gérées à l'échelle de l'instance ; les colonnes sont réservées dans le profil ; pas de nouveau réglage de modèle pour ce lot ; chaque modèle a une catégorie et se lit « catégorie - nom » (« BOD - Livre poche », « dixit - rapport A4 paysage », « Aube - petit format »).
- Livré : `shared/profilCss.js` (lecture et écriture du profil, liste fermée, aucun `url()` / `@import` / `@font-face`, avertissements en français), `server/modeles.js` (un modèle = `<id>.css` + `<id>.json` pour nom, catégorie, portée, propriétaire, dates ; conversion automatique des anciens `.json` au démarrage, vérifiée par relecture), catégorie (`categorie`, 40 caractères, facultative ; `classer`, filtre, rangement), page Modèles avec filtre par catégorie, menu Exporter en « catégorie - nom — format ».
- Choix : le CSS écrit est **complet** (autonome) ; « Par défaut » reste `data/style.json` et les livrés restent dans le code, sans catégorie ; les écarts d'un document restent en JSON.
- Pile de polices : la première famille connue de l'instance gagne, sinon repli sur le générique avec avertissement ; une police retirée de l'instance reste nommée dans le CSS du modèle et reprend effet si elle revient.
- Retour arrière : une version d'avant ce lot ne lit pas les modèles convertis (leur mise en page est dans le `.css`). Sauvegarde du VPS avant livraison.
- Reste à décider (conception-interface-modeles.md §9) : export / import d'un fichier CSS, modèles de départ, aperçu PDF (écartés pour l'instant, cf. ci-dessous).

### 11 bis. Nouvelle présentation de la page Modèles (28/10/2026)

- Décisions de Sylvain : CSS en **lecture seule** ; classe de police à la main ; **pas d'aperçu PDF** ; ni export ni import CSS pour le moment ; pas de modèles de départ (Roman, Essai, Manuscrit) ; « on ne fait que la nouvelle présentation, les nouvelles options ensuite » ; pas de fiche livre (titres et mentions légales à la main) ; formats 15×21 et 16×24 supprimés ; **catégorie obligatoire**, dont une catégorie « amend.ink ».
- Catégorie obligatoire : refusée vide à la création et au classement (« catégorie obligatoire ») ; « Par défaut » et « Texte brut » portent la catégorie réservée **amend.ink**, que personne ne peut donner à un modèle (« la catégorie « amend.ink » est réservée ») ; pas d'héritage de la catégorie de la source. Les modèles d'avant, sans catégorie, restent listés sans catégorie jusqu'à ce qu'on les classe. Nom écrit « amend.ink » et non « amend » (règle de nommage).
- Modèles livrés (code) : Texte brut (amend.ink) ; KDP 15,6×23,39 cm et KDP 13,97×21,59 cm (les tailles de coupe de KDP France les plus proches du grand format et du broché 14×21 français ; KDP ne publie aucun classement de popularité ; tous les formats sont affichés en cm) ; BoD 12×19 et BoD 13,5×21,5 ; Aube - TàT grand (14×22 cm), TàT moyen (13×20 cm, provisoire : format non décrit par l'éditeur) et TàT poche (12×18 cm ; un autre poche de la collection fait 10,8×17,8 cm), dimensions relevées sur les fiches de editionsdelaube.fr, marges et corps de notre main, à ajuster par Sylvain ; dixit - P'tit papier (A5). Marges KDP tirées du tableau KDP (16 mm intérieur jusqu'à 500 pages, sans fond perdu) ; **marges et corps BoD, et valeurs du P'tit papier : choisis par nous, aucune source n'en donne** (P'tit papier : A5 déduit de « feuillets A4 pliés en deux », provisoire). Pas de marges miroir : gauche = droite (la marge intérieure).
- Page Modèles : cartes avec spécimen de page miniature (format, marges, police, corps, alignement, numéro), filtre par catégorie, résumé « police · corps ». Éditeur en six volets (Format et reliure, Texte, Titres et chapitres, Pages, Éléments, Avancé (CSS) en lecture seule) avec spécimen en direct à côté. Aperçu indicatif : le PDF fait foi.
- **Livrés modifiables (29/10/2026).** Décision de Sylvain : seul « Texte brut » reste dans le code ; tout le reste est modifiable par les administrateurs. Au premier démarrage qui les connaît, chaque livré (KDP, BOD, TàT, P'tit papier) est **copié** dans `data/modeles/` (`<id>.css` + `<id>.json`) comme modèle d'instance, avec son identifiant d'origine (`tat-grand`…) et `origine` dans le JSON ; `data/modeles/semis.json` retient ce qui a été copié, de sorte qu'un modèle supprimé ne revient pas et qu'un livré ajouté plus tard par le code est copié au démarrage suivant. Les administrateurs le règlent, le renomment, le reclassent, le suppriment (refusé s'il est utilisé, comme les autres). `POST /api/modeles/:id/retablir` (administrateurs) remet nom, catégorie et mise en page tels que le code les livre ; la page Modèles propose « Rétablir les valeurs d'origine » (deux clics) tant que le modèle s'en écarte (`ecartLivre`). Une correction ultérieure du code n'atteint pas un modèle déjà copié, sauf à le rétablir. Un livré supprimé ne peut pas être recréé depuis l'interface. Mise en œuvre : `Modeles.semer()` (appelé par `StylesDocuments`), `Modeles.retablir()`, `modeleLivreSemable()` dans `shared/modeles.js`.
- Limites connues : client non reconstruit (Vite) hors machine de développement, modules testés sous jsdom ; une version d'avant le lot CSS ne lit pas les modèles convertis (sauvegarde VPS avant livraison).

## 12. Mise en page « livre » : nouveaux réglages de modèle et onglets (28/10/2026)

- Décision de Sylvain : « ajouter uniquement » marges miroir (intérieure et extérieure), césure, veuves et orphelines, premier paragraphe sans retrait, début de chapitre (continuer / nouvelle page / nouvelle page à droite), descente en haut de page, position du numéro de page, pas de numéro sur les pages d'ouverture, notes de bas de page, séparateur de scène, légendes ; formulaire **en onglets** avec un onglet Images. Écartés : lettrine, numérotation romaine, formats nommés, pages de titre et mentions légales.
- Onglets : Format · Texte courant · Titres · Pages · Autres styles · Images · CSS (lecture seule). Marges miroir : « gauche » devient la marge intérieure, « droite » l'extérieure.
- Schéma (`shared/style.js`) : `margesMiroir`, `cesure` (oui), `veuvesOrphelines` (oui), `premierSansRetrait`, `debutChapitre` (`continuer` | `page` | `droite`), `descente` (0-120 mm), `notesReduction` (0-6 pt, 2 par défaut), `notesInterligne` (0 = comme le texte), `separateur` (`trait` | `asterisques` | `asterisme` | `blanc`), `pageNumbers.position` (`bas-centre` | `bas-exterieur` | `haut-exterieur`), `pageNumbers.sautOuverture`. L'ancienne case `titre1PageImpaire` est lue et convertie (`true` → `droite`, `false` → `continuer`) à la fusion des couches ; elle n'est plus écrite. Les livrés imprimés (KDP, BoD, TàT) passent à marges miroir + début de chapitre à droite ; ceux déjà copiés dans `data/modeles/` gardent leurs valeurs jusqu'à « Rétablir ».
- Profil CSS : variables `--amend-marges-miroir`, `--amend-cesure`, `--amend-veuves-orphelines`, `--amend-premier-sans-retrait`, `--amend-descente`, `--amend-notes-reduction`, `--amend-notes-interligne`, `--amend-separateur`, `--amend-numero-position`, `--amend-numero-saut-ouverture` ; `h1 { break-before: auto | page | recto }`. Aller-retour testé.
- Légende : **style de paragraphe** (nouveau bloc `caption`, « Légende »), pas un nœud d'éditeur : l'éditeur n'a pas de nœud « légende ». Centrée, italique, 9 pt par défaut.
- PDF (Typst) : composé et vérifié sur de vrais PDF (Typst 0.15). Marges miroir via `inside`/`outside` ; les blocs image lisaient `page.margin.left`, qui n'existe pas en miroir : corrigé (fonction `largeur-marges`, trouvé seulement en compilant). Veuves et orphelines : `costs` à 0 % quand décoché (Typst les évite par défaut). Descente : un espacement non faible posé après le saut de page.
- Word : marges miroir par `<w:mirrorMargins/>` ajouté à `settings.xml` avec JSZip (dépendance déclarée dans `client/package.json` ; repli sur le .docx tel quel si la réécriture échoue) ; césure `autoHyphenation` ; veuves `widowControl` ; début de chapitre par une **section par titre 1** (page suivante / page impaire) ; numéro côté extérieur par pieds de page pairs et impairs ; « pas de numéro sur les pages d'ouverture » par « première page » de chaque section, donc seulement quand les chapitres commencent sur une nouvelle page. Notes : notes de fin, taille et interligne réglables.
- Limites connues (dites dans les infobulles) : en Word, la première page d'un chapitre prend toujours le côté droit pour le numéro (sa parité n'est pas connue à l'écriture) ; la césure de Word coupe aussi le texte non justifié ; le « titre 1 courant » reste le titre du document. Vérifié en .docx ouvert par LibreOffice, pas dans Word.
- Tests : `exportMiseEnPageLivre.test.js` (Typst et Word), schéma et profil CSS (serveur), éditeur à onglets (client), cas de compilation réelle dans `typstReel.test.js` (ignoré sans Typst, tourne sur le VPS).

### 12 bis. Colonnes (28/10/2026)

- Décision de Sylvain : un **réglage du modèle** (global au document, pas un bloc à insérer dans l'éditeur), dans l'onglet **Format** : `colonnes` (1, 2 ou 3) et `gouttiere` (2-30 mm, 6 par défaut, masquée à une colonne). Profil CSS : `--amend-colonnes`, `--amend-gouttiere`.
- PDF (Typst) : `columns: N` sur la page, `#set columns(gutter: …)`. Titres, en-têtes et numéro de page ne s'étendent pas : les titres suivent la colonne, en-têtes et numéro restent sur toute la largeur. Les images sont dimensionnées sur la largeur d'une **colonne** (`largeurColonne`, `disponibleTypst()`). Vérifié sur de vrais PDF à 2 et 3 colonnes (notes de bas de page, saut de chapitre, marges miroir).
- Word : `column: { count, space, equalWidth }` sur chaque section ; vérifié sous LibreOffice (pas dans Word). Arrondi en twips (10 mm → 566).
- Limites : pas de titre pleine largeur au-dessus des colonnes ; pas d'équilibrage de la dernière page ; aperçu du spécimen indicatif.

## 13. Scaleway : trois modèles au choix du back-office (29/10/2026)

- Décision de Sylvain, après les études de confidentialité (`etude-confidentialite-ia.md`, `etude-scaleway-generative-apis.md`) : ajouter **gpt-oss-120b**, **qwen3.5-397b-a17b** et **qwen3-235b-a22b-instruct-2507** (Scaleway Generative APIs, Paris) au choix du modèle de Corrections IA et de Margo, **« les bancs ne valent pas des tests réels »**, avec des **tarifs en euros** (ni convertis, ni mêlés aux dollars). Les défauts restent Haiku 5.5 (Corrections IA) et Sonnet 5.5 (Margo).
- `server/fournisseurs.js` : troisième fournisseur `scaleway` (ids `gpt-oss*` et `qwen*`), clé `SCALEWAY_API_KEY`, adresse `https://api.scaleway.ai/v1/chat/completions` (`SCALEWAY_API_URL` pour les essais). Même traduction que Mistral (`traduireRequete(corps, service)`). Réflexion : `thinking: disabled` devient `reasoning_effort: low` pour gpt-oss (qui ne se coupe pas) et `none` pour Qwen ; le contenu de réflexion renvoyé n'est jamais lu, ses jetons sont facturés et comptés. Choix d'outil : `auto`, `none` et `required` transmis tels quels, fonction nommée en `{type:'function', function:{name}}` — Scaleway ne documente que `auto` et la fonction nommée ; **à vérifier à l'essai** (notamment Margo sans outil, qui envoie `none`).
- `server/usageIa.js` : `TARIFS_EUR` (gpt-oss-120b 0,15 / 0,60 € ; Qwen 3 235B 0,75 / 2,25 € ; **Qwen 3.5 397B 0,6 / 3,6 € provisoire**, prix non trouvé chez Scaleway, repris d'IONOS et OVHcloud — à corriger dans la console). Cache relu compté plein tarif (estimation haute). Les compteurs gardent `usd` et ajoutent `eur` ; le back-office affiche « x $ + y € » sans conversion.
- À savoir avant les essais : réglage valable pour toute l'instance (remettre Haiku / Sonnet après coup) ; n'essayer que sur ses propres textes tant que le DPA et les conditions générales de Scaleway ne sont pas lus ; Scaleway ne plafonne pas la dépense, seuls les quotas internes freinent ; sortie maximale des modèles inconnue (si Scaleway refuse `max_tokens`, baisser le garde-fou « sortieMaxJetons ») ; lire `events-ia.jsonl` et `events-dialogue.jsonl` (modèle, arrêt, jetons).
- Tests : `fournisseurs.test.js` (traduction, réflexion, outils, tarifs, comptes en euros), `ia-corrections.test.js` et `dialogue.test.js` (faux Scaleway), `adminIa.test.js` (affichage en euros). Jamais testé contre le vrai Scaleway.
- **Comprendre les refus (29/10/2026).** Les essais réels ont montré des lots de corrections refusés en entier sans qu'on sache pourquoi (gpt-oss : 6 refus ; Qwen 3.5 : 37). `events-dialogue.jsonl` porte désormais `motifsRefus` (`{ introuvable, ambigu, identique, en-attente, chevauche, structure, mal-forme, autre }`, nombre de refus par motif), jamais un mot du document ; l'événement `fin` envoyé au client porte `motifs`, et `events-agents.jsonl` (connecteur) porte `motifs` dans chaque ligne d'écriture. Classement : `motifDeRefus` (`server/agentTexte.js`). Attente sur un 429 : `delaiRelance` (`server/dialogue.js`), nombre de tentatives = garde-fou `margoRelances`.
