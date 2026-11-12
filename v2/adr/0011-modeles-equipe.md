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
3. **Droits.** Le gestionnaire de l'équipe crée, règle et supprime ses modèles et choisit son modèle par défaut ; qui écrit un document choisit le modèle enregistré avec lui ; quiconque exporte peut en prendre un autre pour un seul export.
4. **Le modèle suit le document** : choisi pour lui, sinon le défaut de son équipe, sinon le premier d'amend.ink. Un correcteur extérieur obtient celui retenu, sans la liste de l'équipe. Un document qui sort de l'équipe perd un modèle d'équipe ; un modèle supprimé rend ses documents au défaut.
5. **Écartés** : le Typst libre dans un modèle d'équipe, le dépôt de polices par une équipe, la composition sur le serveur (la compilation reste dans le navigateur).

## Ce qui ferait revenir dessus

Un maquettiste réel qui a besoin d'un réglage hors de la liste (on l'ajoute alors à la liste, ou Sylvain ajoute un modèle d'amend.ink) ; une police demandée par une maison (on l'ajoute au catalogue) ; Docs qui rétablirait un mécanisme de modèle générique (`docs/v2-veille.md`).

## Complément du 12/11/2026 : modèles de l'instance

Décision de Sylvain (`docs/v2-modeles-pdf-plan.md`) : un seul modèle dans le code, « A4 simple », par défaut et base de tous les autres ; des **modèles de l'instance**, en données (`amend.modeles` sans équipe), que les administrateurs créent et règlent au back-office sur **tous** les réglages du modèle (`livre.reglablesInstance`), et dont ils choisissent le défaut ; « TàT - Poche » quitte le code et devient le premier d'entre eux (reprise au démarrage du serveur, une fois). Un modèle d'équipe s'appuie sur l'A4 ou sur un modèle de l'instance (deux étages, `resoudreModele`), et garde la liste fermée des équipes. Le modèle d'un document : son choix, sinon le défaut de son équipe, sinon celui de l'instance, sinon l'A4. Des écarts propres à un document viendront plus tard.
