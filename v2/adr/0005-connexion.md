# ADR 0005 — Connexion par lien magique

- Statut : acceptée (Sylvain, 07/11/2026)

## Contexte

Docs impose OIDC. Nos utilisateurs sont des auteurs et éditeurs sans fournisseur d'identité ; la v1 utilise le lien magique par courriel.

## Décision

Notre serveur gère l'identité par lien magique, comme dans la v1. y/hub reçoit l'identité de notre serveur à chaque connexion (cookie de session vérifié par notre serveur). Pas d'OIDC.

## Options écartées

OIDC avec Keycloak ou un service hébergé : un service de plus, sans besoin exprimé.

## Conséquences

Le code de connexion reste à nous (couche application) ; il pourra être repris de la v1 après relecture.

## Ce qui ferait revenir dessus

Une demande d'organisations disposant déjà d'un fournisseur d'identité.
