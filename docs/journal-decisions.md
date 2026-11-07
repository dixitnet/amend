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
- Déploiement toujours manuel / sur demande, par Sylvain via `deploy/deployer.sh` (depuis le 02/11/2026 ; avant : `deploy/livrer.sh`). Le développement se fait par Claude sur la branche `dev-claude` ; le Mac ne sert plus qu'à la préproduction ponctuelle (voir § 14).
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

## 14. Organisation « dev-claude » (02/11/2026)

- Décisions de Sylvain : **Claude développe sur une branche dédiée fixe, `dev-claude`**, commite et pousse lui-même, puis **fusionne dans `main` avec l'accord de Sylvain** (fusion directe, sans demande de fusion GitHub). Le Mac ne fait plus de développement : seulement des tests de préproduction ponctuels et le déploiement.
- `deploy/livrer.sh` est supprimé (contrôles, commit et poussée passent chez Claude). Remplacé par `deploy/deployer.sh` : récupère `origin/main`, affiche le commit, demande confirmation, lance `deploy/deploy.sh` sur le VPS en SSH (option `--restart`) et affiche la fin du journal. Il ne commite, ne fusionne et ne pousse rien.
- Contrôles : Claude lance `format:check`, `lint` et `npm test` avant chaque commit, dans son propre environnement, et signale ce qui n'a pas pu y tourner (ex. compilation Typst réelle).
- En fin de lot, Claude donne le bloc Mac de préproduction (checkout de `dev-claude`, installation, build, relance du LaunchAgent si le serveur a changé), demande l'accord de fusion, puis donne le bloc de déploiement.
- Inchangé : Claude n'agit jamais sur le VPS (pas de `ssh`), ne déploie pas, ne lit pas le `.env`. Pas de poussée forcée ni de réécriture de `main`.
- Sessions Claude Code dans le cloud : une branche `claude/…` peut être imposée par la session ; elle tient lieu de `dev-claude` pour cette session.
- `.claude/settings.json` : simplification proposée à Sylvain (Claude ne modifie pas ses propres permissions).

## 15. Premier chargement d'un document (02/11/2026)

- Audit : `docs/audit-chargement-2026-11-02.md`, avec les outils `tools/banc-ouverture.mjs` et `tools/analyse-bundle.mjs`. Constat vérifié en production : ni compression ni cache, 790 ko retéléchargés à chaque ouverture.
- Décision de Sylvain : points 1 (cache des fichiers statiques), 2a (compression par Caddy, `encode zstd gzip`), 3 (état initial compressé sur la WebSocket, message `etat-z`, demandé par `?z=1`) et 4 (métadonnées demandées dès l'arrivée par `public/precharge.js`, un seul `/api/auth/me` par page). En réserve : chargement à la demande des modules hors éditeur, préchargement des polices, cache des ancres de commentaires.
- Résultat au banc (4G simulée) : livre 2,4 s → 1,2 s à la première visite, 0,48 s ensuite.

## 16. Tests de la production par Claude (02/11/2026)

- Décision de Sylvain : un moyen pérenne pour que Claude teste la production et **y intervienne pleinement sur des documents de test** (créer, écrire, tester des parcours), pas seulement lire. `www.amend.ink` est autorisé dans le réseau de l'environnement cloud.
- Choix (points 1, 3 et 4) : un **compte de test ordinaire** (pas administrateur), dont le cookie est dans le secret `AMEND_PROD_COOKIE` ; la frontière est le compte lui-même (le serveur ne lui ouvre que ses documents et ceux qu'on lui partage). Règles écrites dans `CLAUDE.md` (titres « TEST — », pas d'invitation réelle ni de publication, IA avec parcimonie, pas de suppression du compte). Outils : `tools/prod.mjs` (vérification du compte, refus d'un cookie administrateur, création « TEST — », contexte Chromium connecté, dépôt d'un état Yjs) et le banc d'ouverture en mode production (corpus créé une fois puis réutilisé).
- Écartés : une limitation par dossier (les dossiers ne sont qu'un rangement personnel, en faire une frontière d'accès demanderait un nouveau modèle de droits) ; un jeton de test de longue durée côté serveur ; pour l'instant, un garde-fou serveur `COMPTES_TEST` (pas de courrier, pas de publication, hors statistiques), à reconsidérer si les statistiques du back-office en souffrent.
- Vérifié en production le 02/11 : `index.html` en `no-cache` et 304 ; bundle en zstd (201 ko transférés pour 611 ko), `immutable` ; seconde visite : 1 ko transféré.

## 17. Éditeur : campagne de tests, écarts, y-prosemirror v2 (02/11/2026)

- Campagne de tests de l'interface d'édition (suivi à plusieurs, commentaires, « sélectionner puis taper ») dans Chromium, WebKit et sur le Mac : `docs/campagne-editeur-2026-11-02.md`, outils `tools/campagne/`. Seize écarts, leurs causes (`docs/diagnostic-editeur-2026-11-02.md`), les alternatives (`docs/alternatives-suivi-2026-11-02.md`).
- Décision de Sylvain : pas de correction avant diagnostic complet ; puis interventions légères (aa5ea9d) : en suivi, refus des gestes qui effaceraient du texte sans pouvoir être suivis (éditeur compris) ; correctif local de y-prosemirror 1.3.7 (`client/patches/`, appliqué par `patch-package` à chaque `npm ci` du client) contre les espaces qui sortaient du suivi. `CORRECTEUR_ETANCHE` reste en `observer` (absent en production) : le mode `refuser` fait perdre la frappe d'un correcteur sans empêcher la fuite.
- y-prosemirror v2 (`@y/prosemirror`, Yjs 14, mode suggestion natif) : bonne conception pour nos défauts de fond, pas prête (touches mortes, Ctrl+Z, suggestion d'autrui effaçable, affichage) — `docs/essai-y-prosemirror-v2-2026-11-02.md`. **On mise dessus pour plus tard** : pas de chantier maison lourd qu'elle rendrait inutile (jointure suivie, suivi de la mise en forme).
- Registre des écarts à corriger et procédure de veille mensuelle de la v2 (script `tools/essai-y-prosemirror-v2/veille.mjs`, critères de passage) : `docs/ecarts-editeur.md`.
- 03/11/2026 : écart 6 corrigé (touche morte contre le curseur d'une autre personne : curseurs distants masqués pendant une composition) ; veille de la v2 programmée le 1er de chaque mois à 10 h 37 (tâche planifiée qui revient dans la session Claude de la campagne).
- 03/11/2026 : écarts 2, 3, 7a, 8, 13, 15 corrigés dans la réécriture en suivi (`client/src/suivi/reecriture.js`, tests `client/test/ecartsSuivi.test.js`) ; deux tests anciens mis à jour (ordre « barré puis ajout » sur plusieurs paragraphes). Restent : 7b, 10, 11, 12 (attendre la v2), 9, 14, 16 (à décider).

## 18. Banc d'essai de Margo (03/11/2026)

- Page du back-office `#/admin/ia/banc` (lien en tête de la rubrique IA), réservée aux administrateurs : un texte collé (Markdown simple accepté, un bloc par ligne non vide), une consigne, et jusqu'à 3 colonnes — un modèle parmi ceux du back-office et, au besoin, une autre manière de répondre (préremplie avec celle de la production).
- Chaque colonne fait tourner la vraie boucle de Margo (`server/dialogue.js`, outils du connecteur, droits de correcteur, garde-fous en vigueur) sur **sa propre copie du texte, en mémoire** (`server/banc.js`) ; les colonnes tournent en même temps. Résultats côte à côte : réponse de Margo, étapes, modifications (barré / souligné), commentaires avec leur passage, durée, appels au modèle, signes lus.
- Décisions de Sylvain : Margo seule (pas Corrections IA) ; manière de répondre réglable par colonne ; **consommation non comptée** (ni quotas, ni consommation du back-office, ni journal `dialogue`) — le coût n'apparaît que sur la facture des fournisseurs, la page le dit ; **rien n'est enregistré** (ni texte ni résultats) ; une estimation en signes est affichée avant de lancer, sans seuil de blocage.
- La limite « signes par demande » de production ne bloque pas l'essai (la page signale quand la production refuserait la demande). Un seul essai à la fois sur l'instance (mémoire du VPS).

## 19. Mistral : réflexion de Large 4, Small 4, niveaux de réflexion au banc (03/11/2026)

- Panne : Margo (et Corrections IA) sur Mistral Large 4 échouaient — « reasoning_effort none is not supported for this model » (journal du VPS). Depuis la fin de l'aperçu, Large 4 n'accepte que `low`, `medium`, `high` ; Mistral dit d'utiliser `low` à la place de l'ancien `none`. Correctif : `low` pour Large 4 (décision de Sylvain, option 1).
- Table des niveaux de réflexion par modèle dans `server/fournisseurs.js` (`REFLEXION`) : la production envoie le moins coûteux (aucune pour Anthropic, Small 4 et les Qwen ; `low` pour Large 4 et gpt-oss-120b).
- Mistral Small 4 (`mistral-small-2603`, réflexion none / high, 0,15 / 0,60 $ + 10 % UE) ajouté au back-office. Mistral Medium 3.5, demandé aussi, n'a **pas** été ajouté : Mistral l'a déclaré obsolète le 31/10/2026 et renvoie vers Large 4.
- Banc d'essai : un choix de réflexion par colonne, limité aux niveaux que le modèle accepte (Anthropic : réflexion adaptative et niveau d'effort ; Mistral / Scaleway : `reasoning_effort`). Le niveau en production ne change pas : on mesure d'abord au banc.
- Reste à voir à l'essai : Mistral recommande de renvoyer sa réflexion dans l'historique des échanges ; nous la retirons. Tarif de Large 4 sur sa fiche : 0,70 / 2,10 $ (l'estimation du back-office est sur 0,68 / 2,09 $ + 10 %).

## 20. Outils de Margo et du connecteur : supprimer, retirer, modifications (03/11/2026)

- Revue des outils (Margo et « Inviter Claude » partagent `server/mcp.js`). Décision de Sylvain : points 1, 2, 3, 6, 9 puis 4 et 5. Écartés pour l'instant : mise en forme visible ou proposable (7, 8), retouche de ses commentaires (10, marginal), structure en suivi (11), Margo avec les droits d'un éditeur (12, déconseillé).
- `supprimer` : propose en suivi la suppression d'une note entière (`bloc` + `note`) ou d'une image (`image`) — même attribut `suivi: { type: 'deletion' }` qu'une suppression faite dans l'éditeur. Un passage de `proposer` qui recouvre un appel de note renvoie vers cet outil.
- Images : ce sont des blocs sans texte, que `lire` ne montrait pas. Elles s'affichent à leur place, entre les blocs, avec leur rang `⟦image n⟧` et leur texte alternatif ; elles ne prennent pas de numéro de bloc (celui de l'éditeur ne compte que paragraphes et titres). `plan` en donne le nombre.
- `chercher` : insensible aux apostrophes (’/') et aux espaces insécables, comme `proposer` ; donne le nombre total d'occurrences et d'endroits.
- `modifications` (lecture) : les modifications en attente, avec auteur, « remplace / insère / supprime », contexte, et un identifiant (`12-1`, `12-n2`, `12-n2-1`, `image-3`, `12-coupure`) valable pour l'état présent du document. Compte dans les signes lus de Margo.
- `retirer` : retire sans trace les propositions **de l'agent lui-même** (même nom d'auteur), désignées par ces identifiants. Limite connue : toutes les conversations Margo signent « Margo (IA) », donc Margo peut retirer une proposition de Margo faite à la demande d'une autre personne.
- Descriptions précisées : suppression d'un paragraphe entier par `proposer` (vérifiée : accepté, le bloc disparaît), structure (titre, liste, déplacement) à proposer en commentaire, déplacement d'une note = `supprimer` + `ajouter_note`.

## 21. Margo sur un livre entier : consignes, refus, recherches, cache Scaleway (03/11/2026)

- Constat (Qwen 3.8 27B, réflexion coupée, sur « Vie et mort de Zan » entier, `events-dialogue.jsonl`) : bon sur un chapitre (20 corrections en 2 appels) ; sur le livre, corrections une par une avec 27 refus sur 38 (introuvable 14, identique 9, structure 3), et deux demandes de cohérence arrêtées à 101 étapes après 150 à 160 recherches, sans rien poser. Bilans qui annoncent des corrections refusées ; incohérences « factuelles » inventées (nombre de régions, numéro du congrès des maires).
- Décision de Sylvain (points 1, 2, 3, 4, 6, 7, 8, 9, 10). Elle revient en partie sur celle du 14/10 (« rien sur la façon de lire ou de grouper ») :
  - consigne commune à Margo et au connecteur (`instructionsDocument`) : ne pas relire ni rechercher ce qui est lu ; ne présenter comme fait que ce que les outils ont confirmé ; ne pas signaler une erreur d'après sa seule connaissance du monde (contradictions internes au texte seulement, sinon une vérification à faire) ; description de `proposer` : une quinzaine de remplacements par appel ;
  - refus plus utiles : « rien ne change » dit que le texte est sans doute déjà conforme ; « introuvable à la ponctuation près » (nouveau motif `introuvable-ponctuation` au journal, sans texte) ; passage qui recouvre un appel de note : comment insérer juste avant ou après ;
  - tirets recopiés en trait d'union retrouvés comme les apostrophes ; la correction se calcule alors sur le texte du document (pas de fausse modification d'apostrophe ou de tiret) ; `shared/diff.js` : un tiret typographique rendu en trait d'union n'est plus une modification (comme l'espace insécable). Les guillemets ne sont pas tolérés (longueur différente, ouverture et fermeture mal devinées) ;
  - Margo : une recherche déjà faite dans la même demande n'est pas relancée (réponse « tu as déjà cherché ») ; le libellé « lit les blocs » donne les blocs réellement lus (fenêtre de Margo et banc) ;
  - back-office : l'entrée relue en cache de Qwen 3.8 27B comptée à 0,12 € (grille Scaleway) au lieu de 0,60 € ; les autres modèles Scaleway restent au plein tarif faute de prix connu.
- Abandonné : signal de vie dans le flux (l'« erreur réseau » venait de la mise en veille du Mac).

## 22. Margo : au fil de la lecture, recherches groupées, commentaires retirables (03/11/2026)

- Constat sur la demande de cohérence du livre entier : Qwen 3.8 27B lit tout puis lance une recherche par date (environ 84) et atteint la limite d'étapes sans rien poser — bilan désormais fidèle ; Sonnet 5.5 va au bout (4 corrections, 12 commentaires, vraies contradictions internes) mais double des fils existants et ne peut pas retirer ses commentaires. Conclusion d'usage : Margo reste sur Sonnet 5.5 ; Qwen 3.8 27B seulement pour une correction à l'échelle d'un chapitre.
- Décision de Sylvain (points 1 à 4) :
  - consigne commune : travailler au fil de la lecture (poser corrections et commentaires après chaque lecture) ; consulter `commentaires` avant de commenter (aussi dans la description de `commenter`) ;
  - `chercher` accepte `textes` (plusieurs textes en un appel, un résultat par texte) ; Margo ne relance que ceux qui n'ont pas encore été cherchés dans la demande ;
  - `retirer` s'étend aux commentaires de l'agent : un fil avec ses réponses (refusé s'il porte la réponse de quelqu'un d'autre), ou une réponse seule ; `commentaires` marque « (toi) » et donne l'identifiant de ses réponses. `retirer` est ouvert aux lecteurs (ils commentent ; ils n'ont jamais de modification à retirer).
- Essai après le lot (cohérence du livre entier, `events-dialogue.jsonl`) : Qwen 3.8 27B passe de 101 à 28 étapes (7 recherches groupées), environ 0,75 € au lieu de 2,50 €, 3 corrections et aucun commentaire ; Sonnet 5.5 : 20 étapes, environ 0,97 $, 4 corrections et 12 commentaires. Sur cette tâche, l'avantage de prix de Qwen disparaît. Margo reste sur Sonnet 5.5 ; essai suivant utile pour Qwen : Corrections IA face à Haiku 5.5.
- Limite constatée : toutes les conversations Margo signent « Margo (IA) ». Qwen a vu marqués « (toi) » les commentaires posés par la conversation Sonnet, en a présenté le contenu comme le sien et en a retiré 4. Décision de Sylvain : pas de développement (ni identité par conversation, ni limite à la demande en cours) ; contournement : un seul modèle à la fois sur un document d'essai, ou rejeter les commentaires de Margo entre deux essais. Sur un document partagé, deux personnes qui utilisent Margo partagent cette signature.

## 23. Margo : refus « identique » détaillés, coupe-circuit sur les refus en série (04/11/2026)

- Constat (« corrige tout uniquement sur la forme », document de 545 blocs) : Qwen 3.8 27B, 101 étapes, 21 corrections, 125 refus dont 116 « identique » (≈ 2,40 €) ; Sonnet 5.5, 26 étapes, 22 corrections et 2 commentaires, 11 refus dont 10 « identique » (≈ 0,79 $). Les deux modèles proposent des corrections que le texte porte déjà, ou que la typographie automatique ramène au texte ; Sonnet passe à la suite, Qwen insiste.
- Décision de Sylvain (points 1 et 2) :
  - le refus « identique » se décline au journal en `identique-strict` (recopié tel quel), `identique-espaces` (seules des espaces différaient) et `identique-typographie` (le reste, effacé par la typographie automatique), toujours sans texte ; chaque cas a son message au modèle (`raisonIdentique`, server/agentTexte.js) ;
  - coupe-circuit (garde-fou `margoRefusEnSerie`, 5 par défaut, réglable au back-office) : des appels d'écriture refusés en entier d'affilée ; au seuil, un message de service demande à Margo de cesser et de passer à la suite ; au double, la demande s'arrête sur un bilan sans outil (arrêt `refus` au journal, demande « incomplète »). Un appel accepté, même en partie, remet le compte à zéro.
- À suivre : si `identique-espaces` domine, prévenir dans `lire` que les espaces insécables sont invisibles mais présentes ; si `identique-typographie` domine, vérifier que la typographie automatique n'annule pas une correction voulue.

## 24. Vers une IA européenne : formulation d'accueil, GLM-5.3 et DeepSeek V4.1 Flash chez Scaleway (04/11/2026)

- Objectif à terme : une IA sous droit européen, avec des données confidentielles (non conservées, jamais utilisées pour l'entraînement). Formulation retenue par Sylvain pour la nouvelle page d'accueil, **à n'employer qu'une fois la bascule faite** (défauts européens et non-conservation obtenue par écrit du fournisseur) :
  > « L'IA d'amend.ink est européenne : vos textes restent sous droit européen, ne sont pas conservés et ne servent jamais à l'entraînement. »
- Conditions avant de l'afficher : modèles par défaut européens (aujourd'hui Haiku 5.5 et Sonnet 5.5, Anthropic) ; DPA de Scaleway lu ; non-conservation confirmée par écrit (chez Mistral, elle est sur demande et acceptation, 30 jours de conservation sinon). Claude hébergé en Europe (Bedrock, Vertex) ne suffit pas : prestataire américain, donc pas le droit européen.
- Veille du 04/11/2026 : Scaleway propose GLM-5.3 et DeepSeek V4.1 Flash (octobre 2026), en tête des modèles ouverts ; Mistral Large 4 (poids publiés le 29/10, licence qui exige un contrat pour le proposer en service) n'y est pas ; Mistral Medium 3.5 y figure encore, mais obsolète chez Mistral. OVHcloud AI Endpoints annonce la non-conservation par défaut (catalogue plus court).
- Décision de Sylvain (point 1) : `glm-5.3` et `deepseek-v4.1-flash-1017` ajoutés au choix du back-office (Corrections IA et Margo), fournisseur Scaleway. Identifiants et caractéristiques d'après la page « Supported models » de Scaleway : contexte 256 K, appel d'outils, réflexion none / low / high / max (la production envoie `none`), sortie au plus 16 K (GLM-5.3) et 131 K (DeepSeek). Libellé « maximale » pour le niveau `max` au banc.
- Tarifs : GLM-5.3 **provisoire** 1,80 / 5,50 €, cache non publié (plein tarif), d'après la page « Generative APIs » de Scaleway (date incertaine) ; DeepSeek V4.1 Flash **confirmé dans la console** : 0,40 / 0,80 €, cache relu 0,08 €. La FAQ de Scaleway donne 0,60 / 3,60 € pour Qwen 3.5 397B, ce qui recoupe la valeur provisoire déjà en place.
- Essai à faire : la demande de cohérence du livre entier (§ 22), Sonnet 5.5 en référence ; un seul modèle à la fois sur le document d'essai (signature commune « Margo (IA) »). Essai indépendant toujours prévu : Corrections IA, Qwen 3.8 27B face à Haiku 5.5.
- Essais réels (demande de cohérence du livre entier, `events-dialogue.jsonl`) :
  - GLM-5.3 : 35 étapes, 6 modifications et 13 commentaires, 11 refus, coupé par une perte de réseau en 4G (arrêt `annule`, aucune erreur côté serveur) ; 3,51 M jetons d'entrée **sans aucun cache** (≈ 6,34 € au tarif provisoire). Hors de prix pour Margo sur un livre tant que le cache ne sert pas.
  - DeepSeek V4.1 Flash : 21 étapes, 160 s, terminé ; 9 modifications, 9 commentaires, 5 refus ; 0,86 M jetons d'entrée hors cache et 0,70 M relus en cache (45 %) : **≈ 0,40 €** au tarif confirmé (Sonnet 5.5 : ≈ 0,97 $ sur la même tâche, § 22). Réserves : un fait du monde corrigé d'office ([376]), deux choix d'auteur passés en correction, un bilan qui annonce plus de commentaires que posés. Margo reste sur Sonnet 5.5 ; à départager au banc (`docs/banc-margo-montfaucon.md`).

## 25. Refonder le cœur sur Yjs 14 et `@y/prosemirror` 2 : étude et prototype (07/11/2026)

- Veille de la v2 du 07/11 : aucune nouvelle version depuis l'essai du 02/11 (`docs/ecarts-editeur.md`).
- Étude `docs/etude-refondation-coeur-2026-11-07.md`, à la demande de Sylvain (reconstruire plutôt que mettre à jour, compromis fonctionnels admis) : circuit d'une frappe en suivi, points faibles de la vue ProseMirror, sort de chaque fichier du cœur, alternatives à ProseMirror (aucune ne règle nos défauts), perspectives amont, architecture cible (deux documents Yjs, base et suggestions ; rôles = droits par document ; attribution par le serveur ; l'IA écrit un delta comme un auteur), compromis, plan de prototype en sept jalons.
- Constats : Yjs 14 (`@y/y` 14.0.0-rc.29) sans version stable ni date, tickets de fond ouverts ; y/hub, le serveur de référence, est AGPL ou commercial et demande Redis, PostgreSQL, S3 : on garderait notre serveur. Nos trois échecs (touche morte, Ctrl+Z, suggestion d'autrui) ne sont signalés dans aucun ticket amont.
- En attente de Sylvain : direction, compromis, lancement du prototype, signalement en amont, passage de `prosemirror-view` en 1.42.9.
- Complément du même jour, `docs/etude-blocknote-tiptap-yhub-2026-11-07.md` : BlockNote (0.57, déjà sur `@y/prosemirror` 2 avec suggestions, versions et client y/hub) écarté comme fondation (modèle par blocs, React, exports et IA en GPL ou commerciale), gardé comme référence et banc d'essai ; Tiptap facultatif (suivi payant, collaboration sur Yjs 13) ; y/hub écarté en production (AGPL ou commerciale, Redis et PostgreSQL, bêta, droits par document qui n'expriment pas « lecteur qui commente »), utilisé comme serveur de référence dans le prototype. Cible inchangée : ProseMirror nu, `@y/prosemirror` 2, notre serveur.
- Prémisses revues par Sylvain (peu d'utilisateurs, règles modifiables, pas de perspective commerciale arrêtée, préférence pour un noyau bâti par d'autres) : `docs/etude-docs-blocknote-yhub-2026-11-07.md`. Docs (DINUM), BlockNote et y/hub forment une seule chaîne (Docs sur y/hub depuis sa v6.0.0, épopée « Suggestion mode » #2491 sur Yjs 14). Fork de Docs déconseillé (rythme de l'amont, exploitation lourde, OIDC) ; recommandation : « Docs allégé » (BlockNote + y/hub, notre serveur Node pour comptes, droits, IA, exports, publication) et propositions en amont (rôle de suggestion, défauts de saisie, notes de bas de page, typographie française, modèle PDF, compteur en signes). Décisions en attente de Sylvain.
