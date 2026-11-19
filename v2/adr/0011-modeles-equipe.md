# ADR 0011 — Modèles de mise en page : ceux d'amend.ink dans le design, ceux des équipes en données bornées

- Statut : acceptée (10/11/2026, Sylvain : « 9 oui »), avec le plan `docs/v2-etape-7-modeles-plan.md` (réponses 1-1, 2-1, 3-1, 4-1, 5-1, 6 tout, 7-1, 8-2, 10-2).
- Complète l'ADR 0008 (design) et la règle 17 (aucune valeur de design hors des réglages décidés).

## Contexte

L'export PDF compose un livre avec un modèle de mise en page (étape 7, lot 1 : « TàT - Poche »). Une maison d'édition veut le sien, pour sa collection. L'ADR 0008 veut que toute valeur de design soit une décision de Sylvain, notée dans `design/reglages.js` ; un modèle d'équipe contient des valeurs choisies par une équipe.

Docs (La Suite numérique) avait des modèles avec des accès par personne et par équipe (`Template`, `TemplateAccess`, v3.0.0, PDF composé sur le serveur), puis les a retirés : son export actuel, dans le navigateur, ne propose que le format. **Écart avec Docs**, décidé par Sylvain (journal, § 40).

## Décision

1. **Deux sortes de modèles, une seule forme.**
   - Les **modèles d'amend.ink** restent des réglages de design (`livre.modeles`), décidés par Sylvain.
   - Les **modèles d'équipe** sont des **données** (table `amend.modeles`) : un modèle d'amend.ink (`base`) et des **écarts**, et rien d'autre. Le modèle complet est toujours calculé (`appliquerEcarts`, domaine) : une correction de la base atteint les modèles qui en dérivent, sauf sur les réglages qu'ils ont changés.
   - Pas de modèles personnels : un auteur seul crée une équipe d'une personne.
2. **Liste fermée et bornée.** Sylvain fixe dans le design les réglages ouverts aux équipes et leurs bornes (`livre.reglables`), le catalogue des polices (`livre.polices`) et la largeur utile minimale (`livre.largeurUtileMin`) ; l'équipe choisit dedans, comme elle choisit le texte de ses documents. Le domaine vérifie (réglage connu, type, bornes, grille qui tient dans la page) et rend des codes ; il ne décide d'aucune valeur.
3. **Droits.** Le gestionnaire de l'équipe crée, règle et supprime ses modèles et choisit son modèle par défaut ; qui écrit un document choisit le modèle enregistré avec lui ; quiconque exporte peut en prendre un autre pour un seul export. Révision du 12/11/2026 (Sylvain) : plus de case « Retenir ce modèle » ; pour qui écrit le document, le modèle d'un export PDF réussi devient celui du document (le dernier retenu) ; pour un lecteur, il ne vaut que pour cet export.
4. **Le modèle suit le document** : choisi pour lui, sinon le défaut de son équipe, sinon le premier d'amend.ink. Un correcteur extérieur obtient celui retenu, sans la liste de l'équipe. Un document qui sort de l'équipe perd un modèle d'équipe ; un modèle supprimé rend ses documents au défaut.
5. **Écartés** : le Typst libre dans un modèle d'équipe, le dépôt de polices par une équipe, la composition sur le serveur (la compilation reste dans le navigateur).

## Polices de l'instance : qui peut les télécharger (Sylvain, 19/11/2026)

Un fichier de police envoyé par un administrateur est servi à **toute personne connectée** à l'instance : le PDF se compose dans le navigateur, qui doit avoir les fichiers. Décision confirmée après l'audit du 16/11/2026 (constat « Serveur 1 ») : pas de restriction par document. L'administrateur qui envoie une police répond de sa licence pour cet usage (le renoncement n° 25 écarte toujours la livraison de Marianne dans le code).

## Ce qui ferait revenir dessus

Un maquettiste réel qui a besoin d'un réglage hors de la liste (on l'ajoute alors à la liste, ou Sylvain ajoute un modèle d'amend.ink) ; une police demandée par une maison (on l'ajoute au catalogue) ; Docs qui rétablirait un mécanisme de modèle générique (`docs/v2-veille.md`).

## Complément du 12/11/2026 : modèles de l'instance

Décision de Sylvain (`docs/v2-modeles-pdf-plan.md`) : un seul modèle dans le code, « A4 simple », par défaut et base de tous les autres ; des **modèles de l'instance**, en données (`amend.modeles` sans équipe), que les administrateurs créent et règlent au back-office sur **tous** les réglages du modèle (`livre.reglablesInstance`), et dont ils choisissent le défaut ; « TàT - Poche » quitte le code et devient le premier d'entre eux (reprise au démarrage du serveur, une fois). Un modèle d'équipe s'appuie sur l'A4 ou sur un modèle de l'instance (deux étages, `resoudreModele`), et garde la liste fermée des équipes. Le modèle d'un document : son choix, sinon le défaut de son équipe, sinon celui de l'instance, sinon l'A4. Des écarts propres à un document viendront plus tard.

## Complément du 13/11/2026 : modèles complets, réglés style par style

- **Un modèle est une copie complète** (`amend.modeles.valeurs`, jsonb) : page, marges, grille, folio, titres courants, séparateur, césure, début de chapitre et `styles` (texte, citation, titres 1 à 5, titre, sous-titre, légende). On le crée en copiant un modèle existant (`POST …/modeles { nom, depart }`) ; ensuite rien ne le relie à son modèle de départ, une correction de celui-ci ne l'atteint pas.
- **Un seul jeu de réglages ouverts** (`REGLES_MODELES`) : gestionnaires d'équipe et administrateurs règlent tout (`PUT …/modeles/:id { nom?, reglages }`). Le domaine (`appliquerReglages`) contrôle les bornes, le type, le catalogue des polices et la grille ; il rend des codes (`reglages-invalides`, `reglage-inconnu`, `reglage-hors-bornes`, `modele-impossible`).
- Le gabarit Typst compose chaque style séparément (`set text`, `set par`, règles `show` des citations, titres, titre, sous-titre, légende), et replaçait le texte sur la grille après chaque bloc (`blancSurGrille`) jusqu'au 15/11/2026 : depuis, l'espace avant et après un style est un nombre de points réglé dans le modèle (Sylvain, « espacement en pt »), et un espacement quelconque peut donc écarter le texte de la grille ; `blancSurGrille` ne sert plus qu'à convertir les modèles enregistrés avec des lignes blanches.
- Les familles de polices d'un modèle sont celles de ses styles (`famillesDuModele`) ; une famille envoyée par l'instance ne peut être supprimée tant qu'un modèle, d'instance ou d'équipe, en garde une copie.
- Conversion : les lignes `base` + `ecarts` d'avant le 13/11/2026 deviennent des modèles complets au démarrage ; `base` et `ecarts` restent en base, sans usage, jusqu'au retrait de ce code transitoire.

## Complément du 19/11/2026 : parties, en-têtes, bibliographie

Décisions de Sylvain (`docs/v2-modeles-140x220-plan.md`), à partir d'un livre de 140 × 220 mm :

- **Les parties sont des titres 1, les chapitres des titres 2.** Le titre 2 peut ouvrir une page comme le titre 1 (`ouverture2` : début, ligne du titre, ligne où le texte reprend, interligne) ; par défaut il reste dans le texte, avec les espaces de son style. Une page ouverte par un titre 1 ou 2 n'a pas d'en-tête ; le numéro de page s'y règle par niveau (`folio.ouverture`, `folio.ouverture2`). L'en-tête « chapitre en cours » est le dernier titre d'un niveau qui ouvre une page.
- **Le style des en-têtes est réglable** (`enTete.police`, `corps`, `italique`, `petitesCapitales`, `alignement`).
- **Petites capitales et retrait suspendu** entrent dans les styles ; les petites capitales sont celles de la police (Typst ne les imite pas : sans effet avec une police qui n'en a pas, ce que le formulaire dit). Pas de petites capitales dans le texte.
- **Un style de paragraphe « Bibliographie »** (bloc de l'éditeur, comme « Légende »), en retrait suspendu.
- **Reprise** : un modèle enregistré avant ce jour garde son rendu. Ce qui lui manque se déduit de lui (`completerModele`) : titre 2 dans le texte, en-têtes en italique au corps du texte, bibliographie au corps du texte.
- Modèle de l'instance « TàT 140 × 220 », créé une fois au démarrage (`livre.reprise`).
- Écartés : en-tête « auteur », ornement sous le titre, numérotation automatique des chapitres, grand chiffre de partie, demi-gras, pages liminaires composées.
