# Correctifs locaux de dépendances

Appliqués automatiquement après chaque `npm ci` / `npm install` dans `client/` (script `postinstall` : `patch-package`). Si la version de la dépendance change, `patch-package` échoue bruyamment : le correctif est alors à revoir, pas à ignorer.

## `y-prosemirror+1.3.7.patch` (02/11/2026)

**Pourquoi.** À chaque transaction, y-prosemirror 1.3.7 (`updateYText`) insérait le texte nouveau dans Yjs sans ses marques, puis réappliquait les marques de tout le paragraphe. Deux personnes qui tapaient en même temps dans le même paragraphe se gênaient : la passe de l'une encadrait de balises « sans marque » le texte que l'autre venait d'insérer. En suivi des modifications, des espaces tapées perdaient ainsi leur marque d'insertion et entraient dans le texte sans proposition, y compris pour un correcteur (campagne de tests, écart 5 ; `docs/diagnostic-editeur-2026-11-02.md`, D.5).

**Ce que fait le correctif.** Le texte nouveau est inséré avec ses marques, et seuls les caractères dont les marques diffèrent sont reformatés.

**Effet mesuré** (`tools/campagne/endurance.mjs`, Chromium, 10 tours) : à des endroits différents du même paragraphe, de 0 à 8 tours fautifs sur 10 selon le rôle, ramené à 0. Reste un cas rare : deux personnes qui commencent à taper exactement au même endroit au même instant (une espace peut encore perdre sa marque ; cause différente, l'ambiguïté du diff entre caractères identiques).

**Quand le retirer.** Au passage à `@y/prosemirror` 2 (écriture incrémentale vers Yjs), ou si y-prosemirror 1.x corrige `updateYText`.
