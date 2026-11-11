# ADR 0010 — Courrier

- Statut : acceptée (09/11/2026), reprise de la v1 (Mailgun, zone européenne, décision antérieure de Sylvain) ; notée à la demande de l'audit partiel du 09/11/2026.

## Contexte

L'étape 6a envoie des courriers : lien de connexion (ADR 0005), invitation, accès donné.

## Décision

1. **Mailgun**, par son API HTTP, zone européenne, comme la v1 : un appel HTTPS, sans bibliothèque (`adaptateurs/courrier/`).
2. Un courrier = une partie texte et une partie HTML, **un seul lien cliquable**, l'adresse recopiée en texte (idées de la v1 contre les filtres et les passerelles de sécurité).
3. **Sans mise en forme** : l'apparence d'un courrier relève du design (étape 6b, décision de Sylvain).
4. Sans clé (`V2_MAILGUN_CLE`, `V2_MAILGUN_DOMAINE`), les courriers sont écrits dans le journal et gardés en mémoire ; en développement seulement, une route les rend (essais, tests).
5. **Langue** : le français, comme les documents, jusqu'à ce que la langue de la personne soit enregistrée (étape 6b).
6. **Exception à la règle des traductions (règle 23)** pour les textes d'exploitation : les courriels d'alerte (`exploitation/prod/alerter.sh`, `veiller.sh`, `essayer.sh`) et les messages des scripts d'exploitation sont écrits en français, en dur. Ils ne s'adressent qu'aux administrateurs de l'instance, et des scripts bash ne liraient pas les catalogues sans un outillage disproportionné (Sylvain, 11/11/2026, audit partiel de 14 h 33, A3). Les courriers destinés aux personnes (connexion, invitation, accès) restent traduits par les catalogues.

## Ce qui ferait revenir dessus

Un coût ou une délivrabilité insuffisants mesurés sur les journaux réels.
