# amend.ink v2 : le connecteur Claude du back-office (12/11/2026)

Demande de Sylvain : « un connecteur en back office qui permet de connecter Claude à tous les documents de mon compte admin. Utilises les briques de la v1, avec ici un connecteur pour tous les docs. »

## Docs

Docs n'a pas de serveur MCP (un ticket ouvert chez eux, suivi à la veille). Écart assumé, comme pour Margo.

## Briques reprises

- **De la v1** (`server/mcp.js`, `server/connecteur.js`) : le protocole MCP réduit (un POST JSON-RPC par message, réponse JSON, pas de flux ; `initialize`, `ping`, `tools/list`, `tools/call`, notifications sans réponse), l'adresse secrète en guise d'autorisation (comme un lien de partage), un 404 net aux sondes OAuth (`/.well-known/oauth-…`), un 405 au GET.
- **De la v2** : les quatre outils de Margo (`lire`, `chercher`, `proposer`, `commenter`, `application/serveur/margo.js`), qui lisent y/hub et n'écrivent que des suggestions et des fils de commentaires.

## Ce qui change par rapport à la v1

- **Un connecteur pour tous les documents** du compte (et non un par document) : deux outils de plus, `documents` (la liste, avec le rôle) et `plan` ; chaque outil prend l'identifiant du document.
- **Les droits de la personne**, document par document : lire demande `lire`, proposer `suggerer`, commenter `commenter`. Un document qui n'est pas à elle est « introuvable ».
- **Un second agent, « claude »**, à côté de Margo : y/hub l'accepte comme agent (suggestions seulement), et ses suggestions et commentaires s'affichent « Claude (connecteur) ».
- **Réservé aux administrateurs** de l'instance, géré au back-office (rubrique « Connecteur Claude ») : créer l'adresse (montrée une seule fois), en créer une nouvelle (l'ancienne cesse de marcher), la révoquer. Seule l'empreinte (SHA-256) de l'adresse est gardée, dans les réglages de l'instance. À chaque appel, la personne doit être toujours administratrice.

## Routes

- `POST /api/mcp/<secret>` : les messages MCP.
- `GET | POST | DELETE /api/admin/connecteur` : état, création, révocation.

## Limites

- Pas d'ajout de paragraphes, de notes ni de suppression d'images (outils de la v1 non repris) : propositions de texte et commentaires seulement.
- Pas de limite de débit propre au connecteur (les écritures passent par les mêmes contrôles que Margo).
