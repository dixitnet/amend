# amend.ink v2 : plan de l'étape 4, « Éditeur »

Statut : **arbitré** par Sylvain le 08/11/2026 (« ok » sur les six questions ; voir « Arbitrage » en fin de plan) ; développement lancé. Mistral étant suspendu, la revue d'ouverture est faite par Claude (`docs/v2-revues/2026-11-08-etape-4-ouverture.md`), et les scénarios de test aussi (`docs/v2-tests/etape-4-scenarios.md`).

Références : `docs/v2-regles-developpement.md` (§ 3 « Avant de proposer », § 8), `docs/v2-procedure-tests.md`, `v2/adr/0003-blocknote.md`, `v2/adr/0008-design.md`.

## But

Un éditeur de livre : les blocs dont un livre a besoin et seulement eux, les notes de bas de page, la typographie française à la frappe et au collage. Par les points d'extension publics de BlockNote, sans le modifier.

## Ce qui est établi

- **Typographie française** : cinq règles, volontairement limitées (décision de la v1, 08/10/2026, documentée dans `shared/typographie.js`) :
  1. `'` devient `’` ;
  2. `"` devient `« … »`, avec espaces insécables à l'intérieur ;
  3. `...` devient `…` ;
  4. espace fine insécable avant `;`, `!` et `?` ;
  5. espace insécable avant `:`.

  Principes : idempotente ; ne fait que transformer (n'ajoute jamais d'espace devant un signe tapé collé) ; respecte l'existant correct ; ne touche ni aux adresses ni aux courriels ; un Retour arrière juste après rend ce qui a été tapé. Elle s'applique à la frappe et au collage, et plus tard aux textes de Margo (étape 8) : d'où une règle du domaine, pure et partagée. La v2 la **réécrit** d'après ces règles, avec ses tests : elle n'importe pas la v1.
- **Notes de bas de page** : besoin établi (v1, modèle de livre, études du 07/11/2026). BlockNote n'en a pas ; il permet un « contenu en ligne » personnalisé, à texte riche.
- **Langue** : la typographie suit la langue **du document**, pas celle de l'interface (règles, traductions).
- **Design** : Mantine et BlockNote tels quels (ADR 0008) ; poignées de bloc : question laissée ouverte par Sylvain.

## Ce qui n'est pas établi : questions pour Sylvain

### 1. Les blocs et les styles d'un livre

BlockNote 0.57 fournit 14 blocs et 7 styles. Proposition :

| Garder | Retirer |
|---|---|
| paragraphe, titre (niveaux 1 à 3), citation, liste à puces, liste numérotée, séparateur (pour le séparateur de scène), tableau, image | audio, vidéo, fichier, bloc de code, liste à cocher, liste repliable |
| gras, italique, souligné, barré, lien | code, couleur du texte, couleur de fond |

Raison : des exports propres et un livre, pas une page web ; ce qu'on retire n'a pas d'équivalent dans le modèle de livre (PDF, Word). L'**image** demande un stockage des fichiers (étape 6) : la garder dans le schéma dès maintenant, mais sans envoi de fichier avant l'étape 6 ?

### 2. Le modèle des notes de bas de page

| Modèle | Ce qu'il donne | Ce qu'il coûte |
|---|---|---|
| **a. contenu en ligne à texte riche** (la note vit à l'endroit de son appel, dans le paragraphe) | numérotation calculée, jamais stockée ; collaboration et suggestions caractère par caractère, comme le reste du texte ; copier, couper, déplacer emportent la note ; recommandé par l'étude du 07/11 | une note tient en un seul paragraphe (pas de note à plusieurs paragraphes) ; l'affichage (où se lit et s'édite le texte de la note) est à trouver |
| b. texte de la note en propriété, modifié dans une fenêtre | simple | pas de mise en forme ; modifications simultanées : la dernière gagne ; le mode suggestion ne suit pas une propriété |
| c. notes en blocs à part, en fin de document, reliées par identifiant (modèle de la v1) | plusieurs paragraphes possibles | liens à tenir nous-mêmes (copier-coller, suppression, annulation), code spécifique à notre charge |

Proposition : **a**, après un essai qui montre deux ou trois affichages possibles en captures, pour que Sylvain choisisse (l'affichage est une décision de design). Si l'essai échoue, retour à cette question.

Règle à réexaminer à ce moment-là : afficher une note (appel en exposant, texte replié ou visible) demandera sans doute quelques règles CSS propres à cet élément, que Mantine ne fournit pas. La règle actuelle (aucune feuille de style maison, ADR 0008) l'interdit ; une fois l'affichage choisi par Sylvain, il faudra permettre une feuille de design limitée aux réglages décidés, vérifiée comme `reglages.js`.

### 3. Où brancher la typographie, et une règle à réexaminer

BlockNote fait lui-même ses remplacements à la frappe (`# ` qui devient un titre, par exemple) avec un module de ProseMirror, `@handlewithcare/prosemirror-inputrules`, qui sait défaire le dernier remplacement au Retour arrière : exactement le principe de nos cinq règles. Son point d'extension `prosemirrorPlugins` est public et documenté. Mais l'utiliser oblige à importer ce module et `prosemirror-state` dans `extensions/`, ce que la règle 1 interdit (« une fondation n'est importée que par son adaptateur »).

Respecter la lettre de la règle obligerait à recréer ce mécanisme avec des raccourcis clavier : plus de code, moins sûr (touches mortes, saisie composée, iPad), pour un résultat que BlockNote fournit. C'est le signe que la règle est mal posée pour ce cas.

**Proposition de révision de la règle 1** : une extension peut importer, en plus de l'API de BlockNote, les paquets que les points d'extension publics de BlockNote exigent (`prosemirror-state`, `prosemirror-model`, et `@handlewithcare/prosemirror-inputrules`), **dans les versions que BlockNote embarque**, déclarés en dépendances exactes, une seule copie vérifiée par un contrat statique (comme pour Yjs). Rien d'autre de ProseMirror, et toujours rien hors de `extensions/` et des adaptateurs.

### 4. La langue du document, d'ici l'étape 6

Où la langue d'un document est enregistrée relève de l'étape 6 (métadonnées). D'ici là : tout document est-il en français ? L'extension reçoit la langue en paramètre, elle ne la décide pas.

### 5. Les renoncements prévus au § 8 pour cette étape

1. **Table des matières dans le texte** : la produire à l'export (Typst) et dans le volet « Plan » (interface), pas comme un bloc du texte.
2. **Styles de paragraphe** personnalisés : non ; les blocs suffisent.
3. **Colonnes à l'écran** : non ; les colonnes restent un réglage d'export.

Proposition : renoncer aux trois et les inscrire au registre (`docs/v2-renoncements.md`).

## Contenu, en lots d'une couche (après arbitrage)

0. **Essais** dans le brouillon de Claude (hors du dépôt) : notes (modèle a, deux ou trois affichages, captures) ; typographie par le module de règles de saisie de BlockNote (frappe, touches mortes, Retour arrière, collage). Résultats et captures soumis à Sylvain.
1. **Domaine** : `domaine/typographie.js`, les cinq règles, pures ; T1 sur les données piégées (adresses, courriels, idempotence, existant correct, signes collés).
2. **Extensions** (`extensions/`) : la typographie (frappe et collage) et la note de bas de page (contenu en ligne, numérotation). Elles posent des éléments et des attributs sémantiques, sans apparence (règle 19, ADR 0008).
3. **Adaptateur BlockNote** : le schéma du livre (blocs et styles retenus, plus la note), et le branchement des extensions.
4. **Tests** (voir les scénarios) : T1, T2 (BlockNote sans navigateur : aller-retour Yjs d'un document avec notes ; contenu retiré refusé au collage), T5 (frappe, Retour arrière, collage, notes, deux navigateurs), et une courte recette sur un vrai clavier français et un vrai iPad.

## Critères de sortie

1. Taper et coller du français donne la typographie des cinq règles, et rien d'autre ; un Retour arrière rend ce qui a été tapé.
2. Une note s'insère, se numérote, se modifie à deux, survit au rechargement et à un copier-coller.
3. Le schéma ne contient que les blocs et styles retenus, y compris au collage d'un contenu qui en contient d'autres.
4. Aucune modification de BlockNote ; aucun élément de design hors de `v2/design/` ; tests T0 à T5 verts.

## Hors périmètre, noté pour plus tard

- Suggestions et commentaires (étape 5), y compris la typographie et les notes en mode suggestion.
- Envoi et stockage des images (étape 6).
- Notes dans les exports PDF et Word (étape 7) ; typographie des textes de Margo (étape 8).
- Apparence des notes au-delà des valeurs par défaut, poignées de bloc, barre fixe : travail sur l'interface (points ouverts de l'ADR 0008).
- Proposer en amont (BlockNote) les notes de bas de page et la typographie française, comme le recommandait l'étude du 07/11 : décision de Sylvain.

## Arbitrage de Sylvain (08/11/2026)

1. Blocs et styles : ceux proposés ; l'image reste au schéma, sans envoi de fichier avant l'étape 6 (renoncement n° 8 pour le reste).
2. Notes : modèle a, après essai et captures ; affichage choisi par Sylvain.
3. Règle 1 révisée : les extensions peuvent importer `prosemirror-state`, `prosemirror-model` et `@handlewithcare/prosemirror-inputrules`, dans les versions de BlockNote, une seule copie.
4. Tout document est en français d'ici l'étape 6 ; l'extension reçoit la langue en paramètre.
5. Renoncements n° 5, 6 et 7 inscrits au registre.
6. Proposer en amont (BlockNote) les notes et la typographie : oui, le moment venu, chaque envoi soumis à Sylvain avant.
