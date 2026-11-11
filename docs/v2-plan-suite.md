# amend.ink v2 : plan de la suite (10/11/2026)

Statut : **proposé**, à arbitrer par Sylvain (réponse par numéros). Rien n'est lancé.

Sources : audit complet du 10/11/2026 (`docs/v2-audits/2026-11-10-0657-audit-complet.md`), ordre de reconstruction (`docs/v2-regles-developpement.md`, § 8), plans des étapes 6 et 7, plan du back-office, journal des décisions.

## Où en est la v2

| Étape | État |
|---|---|
| 1. Squelette | close (07/11) |
| 2. Droits | close (08/11) |
| 4. Éditeur | close (08/11) |
| 5. Relecture | close (09/11) |
| 6. Application | **lots faits** (6a comptes et partage, 6b interface M et L, 6c dossiers, 6d équipes, format S), **pas de revue de clôture** ; restent le catalogue anglais préparé, la pseudo-langue vérifiée sur tous les parcours, et la langue du document (renvoyée à l'étape 6 par l'étape 4, jamais reprise) |
| 7. Exports | lot 1 fait (Markdown, PDF de livre « TàT - Poche ») ; suite à arbitrer |
| 8. IA | **close (11/11)** : Margo (onglet, « Corriger », serveur, adaptateur IA), modèle au back-office ; `docs/v2-etape-8-plan.md` |
| 9. Publication et back-office | back-office, lot 1 fait (rubrique Système) ; le reste à arbitrer |
| Bascule de la v1 | pas planifiée |

En ligne : v2.amend.ink, service fermé, ouvert à des invités réels depuis le 09/11.

## 0. Déploiement (décidé le 10/11/2026, « 2 puis 1 »)

- Fait : ne reconstruire que ce qui a changé ; le déploiement passe après les sites (`deploy/auto/`).
- Fait (« ok pour 0, 1 et 2 », 10/11/2026) : clients v1 et v2 construits dans GitHub Actions (flux `livraison`, branche `livraison`) ; le VPS en extrait les clients, n'installe que les dépendances du serveur quand elles changent, et bascule le client servi d'un seul geste (point 3 en partie).

## A. Avant tout invité réel (exploitation, à faire d'abord)

Ces trois lots sont petits, et ils comptent dès le premier texte réel déposé dans la v2.

1. **Fait le 10/11/2026.** **Sauvegarde de la base de la v2.** Un `pg_dump -Fc` nocturne déposé sous `/opt/amend/data/`, que le NAS emporte déjà chaque nuit avec la v1 ; un essai de restauration une fois, sur une base à part ; tout dans les scripts de `deploy/auto/` et `v2/exploitation/prod/`, rien à faire à la main. Valkey ne garde que quelques secondes de flux : rien à sauvegarder. Lève le report du 08/11.
2. **Fait le 10/11/2026, dans le serveur de la v2 plutôt que dans Caddy** (comme Docs les pose dans Django ; déployés seuls, testés en T4 et T6 ; `X-Frame-Options DENY`, `nosniff`, `Referrer-Policy: same-origin`, et `default-src 'none'` sur l'API, sans politique de contenu sur la page, comme Docs). Proposé à l'origine : **en-têtes de sécurité** dans `Caddyfile.v2` : `X-Content-Type-Options: nosniff`, `Content-Security-Policy: frame-ancestors 'none'`, `Referrer-Policy`. Une politique de contenu complète viendra après lecture de ce que fait Docs (son montage Nginx). Durée de HSTS : 7 jours aujourd'hui, comme la v1 « pour commencer » ; à allonger sur décision.
3. **Déploiement sans page vide** : fait pour le client (bascule d'un seul geste, 10/11/2026) ; restent dépendance du service à PostgreSQL ; installation qui échoue si un pare-feu ouvre 4300 ou 4400.

## B. Correctifs de l'audit (un lot technique)

4. Les mineurs justes de l'audit, chacun avec un test, comme après l'audit du 08/11 : liste dans la synthèse du rapport (domaine, serveur, adaptateurs, client, garde-fous, campagne, deux lignes des règles sur l'historique). Environ une demi-journée de travail de Claude.

## C. Lot de design, puis technique (décisions de design de Sylvain)

5. **Fenêtres de confirmation et notifications de Mantine** à la place des sept `confirm` et cinq `alert` du navigateur, comme Docs (`Modal`, `notifications`) ; « Lien copié » en notification.
6. **Noms accessibles par ligne** des boutons Accepter, Refuser, Retirer ; une seule table de pictos.
7. **Typographie du catalogue français** : espaces insécables avant « : » et dans les guillemets, fines avant ; ! ?, avec un test qui les exige.

## D. Clore l'étape 6 (fait le 10/11/2026 : `docs/v2-revues/2026-11-10-etape-6-cloture.md` ; langue du document : renoncement n° 14)

8. **Langue du document** : propriété enregistrée avec le document, choisie par ses éditeurs (règle 28), qui règle la typographie à la frappe, les exports et, plus tard, Margo. Par défaut le français. Proposé : un choix dans la fenêtre « Renommer » ou un menu du bandeau, à montrer d'abord ; regarder d'abord dans le code de Docs s'il enregistre une langue par document, et comment, avant de proposer l'interface.
9. **Catalogue anglais préparé et pseudo-langue** passés sur tous les parcours de la pile (critère de sortie de l'étape 6).
10. **Revue de clôture de l'étape 6** (IA de Scaleway), réponses dans `docs/v2-revues/`.

## E. Étape 7, suite (exports)

Ouverture par une revue, puis, selon l'arbitrage du lot 1 :

11. Fenêtre « Exporter » comme Docs (format, modèle).
12. Export Word (`xl-docx-exporter` de BlockNote, comme Docs).
13. Images dans l'export Markdown (archive `.zip`, comme Docs).
14. Entrée « Exporter » au téléphone (picto à choisir).
15. Petites capitales et exposant dans l'éditeur (styles du schéma, saisie des siècles). **À peser** : utile au livre, mais c'est du schéma à nous ; seulement si un texte réel le demande.
16. Clôture : export d'un livre de référence identique à l'attendu (critère du § 8).

## F. Étape 8, IA (Margo)

17. Ouverture : comment Docs branche l'IA (BlockNote AI) ; Margo comme auteur attribué des suggestions ; limites en signes ; MCP (le connecteur « Inviter Claude » de la v1). Plan d'étape à arbitrer avant tout lot. Les seuils se fixeront sur les journaux réels, pas sur des hypothèses. **Plan arbitré le 10/11/2026 : `docs/v2-etape-8-plan.md`** (onglet Margo allégé, bouton « Corriger », moteur sur le serveur, renoncement à `xl-ai`, Fable 5.2 parmi les modèles).

## G. Étape 9, publication et back-office

18. Page publiée.
19. Back-office : rubriques « Personnes » et « Journaux », puis la consommation de Margo en signes avec l'étape 8. Les gestes d'administration seulement sur un besoin constaté.

## H. Bascule

20. Conditions à fixer avec Sylvain : étapes 6 à 9 closes, sauvegarde éprouvée par une restauration, audit complet juste avant (règle du § 6), période d'essai réelle sur v2.amend.ink. Pas de migration des documents de la v1 (renoncement 1).

## Ordre proposé

A (1, 2, 3) maintenant, puis B (4), puis D (8 à 10) pour clore l'étape 6, puis E, F, G. C se glisse quand Sylvain a pris les décisions de design.

## Questions pour Sylvain (issues de l'audit)

- Q1. Un lecteur voit-il les commentaires ? **Non** (Sylvain, 10/11/2026) : on garde le modèle de Docs.
- Q2. Sur iPad avec un clavier, entrer en modification par la touche Entrée ? **Non** (Sylvain, 10/11/2026) : seulement d'un appui ; renoncement n° 13.
- Q3. Quand l'ancrage d'un commentaire échoue, afficher un message ? **Oui** (Sylvain, 10/11/2026) : à faire dans le lot 4.
- Q4. Un fil dont le premier commentaire est supprimé revient à l'auteur de la réponse suivante : **non** (Sylvain, 10/11/2026) ; propositions dans la réponse de Claude du même jour (le fil reste à qui l'a ouvert, comme Docs).
- Q5. Durée de HSTS : garder 7 jours, ou passer à un an une fois le site stable ?
