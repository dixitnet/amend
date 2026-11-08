# Scénarios de l'étape 4, « Éditeur » (2026-11-08)

- Auteur : Claude (Mistral suspendu depuis le 08/11/2026).
- Statut : proposés à l'ouverture ; à ajuster après l'arbitrage du plan (`docs/v2-etape-4-plan.md`).

Du plus simple au plus difficile, de la couche la plus basse à la plus haute.

| Couche | Scénario | Données |
|---|---|---|
| T1 | chacune des cinq règles, une à une | « l'été », `"mot"`, « Fin... », « Quoi ? », « Note : » |
| T1 | idempotence : typographier deux fois ne change rien | toutes les données ci-dessous |
| T1 | n'ajoute rien devant un signe tapé collé (« mot; » reste « mot; ») | |
| T1 | respecte l'existant correct (espace fine ou insécable déjà là, de l'une ou l'autre sorte) | |
| T1 | adresses et courriels intacts ; signes qui ne sont pas de la ponctuation (`!=`, `?param`, `12:30`, `:)`) intacts | piégées : URL avec `'`, `"`, `?`, `:` ; courriel ; heure ; émoticônes |
| T1 | guillemets : ouverture et fermeture selon le caractère précédent, y compris en début de texte, après une parenthèse, un tiret | |
| T1 | langue autre que le français : rien ne change | |
| T2 | BlockNote sans navigateur : un document avec notes s'écrit en Yjs et se relit à l'identique (texte et mise en forme de la note) | |
| T2 | le schéma refuse les blocs et styles retirés, y compris dans un HTML collé (vidéo, code, couleur) | HTML piégé |
| T2 | deux documents Yjs en mémoire : deux personnes modifient la même note ; convergence | |
| T5 | frappe française : chaque règle, à la frappe ; Retour arrière juste après rend ce qui a été tapé | |
| T5 | collage : texte brut et HTML typographiés ; adresse collée intacte ; accents décomposés collés rendus en NFC | |
| T5 | note : insertion, numérotation (insérer une note avant une autre renumérote), modification, suppression ; rechargement | |
| T5 | note : deux navigateurs modifient la même note ; copier-coller d'un passage avec note | |
| T5 | lecteur et correcteur : ni typographie ni note ne permettent d'écrire (lecture seule maintenue) | |
| recette (Sylvain) | vrai clavier français du Mac (touches mortes, guillemets, espace insécable tapée à la main) ; vrai iPad | |
