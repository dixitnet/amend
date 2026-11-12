# amend.ink v2 : tickets à déposer en amont (préparés le 11/11/2026)

Demande de Sylvain (11/11/2026, point 14 du lot « stabiliser, fiabiliser ») : préparer les tickets des défauts des fondations listés dans `docs/v2-veille.md`, prêts à coller. **Sylvain les dépose lui-même** (prise de parole publique, règle 4.4 des règles de la v2) : Claude ne peut pas écrire hors du dépôt `dixitnet/amend`.

Chaque ticket est écrit en anglais, sur les versions installées le 11/11/2026, qui sont les dernières publiées : `@blocknote/core` 0.57.0, `@y/prosemirror` 2.0.0-15, `@y/y` 14.0.0-rc.29, `@y/hub` 0.10.1, `@handlewithcare/prosemirror-inputrules` 0.1.4, `prosemirror-view` 1.42.9, `prosemirror-state` 1.4.4. Les dépôts ont été parcourus pour éviter les doublons (recherche des tickets ouverts et fermés).

## Où en est chaque ticket

| N°  | Dépôt                                           | Sujet                                                                                                    | État     | Vérifié comment                                                                                                              |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | handlewithcarecollective/prosemirror-inputrules | `undoInputRule` réinsère le texte tapé                                                                   | **prêt** | cas minimal sans BlockNote ni Yjs, rejoué dans Chromium : « a » puis « -- » donne « a— », l'annulation donne « a--- »        |
| 2   | handlewithcarecollective/prosemirror-inputrules | « Applying a mismatched transaction » quand un greffon réagit dans sa vue (mode suggestion de BlockNote) | **prêt** | même cas minimal, avec un greffon qui marque le texte tapé depuis sa vue : l'erreur se produit, la règle n'est pas appliquée |
| 3   | TypeCellOS/BlockNote                            | `getSuggestionAtSelection` cherche des marques qui n'existent pas                                        | **prêt** | lecture du code livré (`@blocknote/core/dist/y.js`) : les autres fonctions de la même extension utilisent les bons noms      |
| 4   | TypeCellOS/BlockNote                            | un fil résolu lève une erreur tant que le nom de qui l'a résolu n'est pas chargé                         | **prêt** | lecture du code livré (`Comments.tsx`) : la ligne suivante prévoit déjà l'état « loading »                                   |
| 5   | yjs/y-prosemirror                               | une mise en forme suggérée (gras) n'est pas marquée comme suggestion                                     | **prêt** | reproduit sur la démo publique de y-prosemirror (sources identiques à 2.0.0-15) ; captures                                   |
| 6   | yjs/y-prosemirror                               | une touche morte sur une sélection, en mode suggestion, laisse le « ^ » dans le texte                    | **prêt** | reproduit sur la démo, par simulation de la composition (outils de Chromium), deux fois sur deux ; captures                  |
| 7   | yjs/y-prosemirror                               | les remplacements sont découpés au caractère (question, pas un défaut)                                   | **prêt** | reproduit sur la démo ; captures                                                                                             |
| 8   | yjs/y-prosemirror                               | commentaire sur #245 : avec les suggestions affichées, la frappe directe au contact d'une suggestion s'y mêle (attribution à la mauvaise personne, suggestion effacée par un remplacement) | **à vérifier sur la démo** | reproduit dans amend.ink (montage de l'exemple `12-multi-doc-versioning` de BlockNote, `viewSuggestions` et frappe permise), essai du 12/11/2026 ; pas encore rejoué sur la démo de y-prosemirror |

Non préparés, et pourquoi :

- **Suppression qui franchit la fin d'un paragraphe** et **paragraphe entier supprimé invisible après rechargement** : **ne se reproduisent pas sur la démo de y-prosemirror** (le texte supprimé y est bien noté, et la suppression réapparaît après rechargement, dans les trois façons de supprimer essayées). Ils viendraient de BlockNote ou de notre montage : à reproduire d'abord avec l'exemple de collaboration de BlockNote avant tout ticket. Nos contournements restent.
- **Ctrl+Z en mode suggestion** : la démo n'a pas d'annulation (pas de `yUndoPlugin`) : rien à reproduire là. **Frappe dans la suggestion d'une autre personne** : ne se reproduit pas sur la démo.

- **Commentaire sur y-prosemirror#288** (« diffing deletes unsupported ») : notre déclencheur (la recréation de l'éditeur) a disparu avec le montage de l'exemple de BlockNote ; sans cas reproductible, un commentaire n'apporterait rien au mainteneur.
- **Page blanche `reading 'copy'` (Yjs 14, rendu des contenus attribués)** : pas de cas minimal ; seul un document témoin le montre. À reprendre si le défaut revient.
- **Connexions en lecture seule de y/hub 0.10.1** : la veille attend la version suivante, qui refait cette synchronisation.
- **`fontFamily` du thème de BlockNote** : sans objet depuis le 08/11 (la v2 n'impose plus de police).

---

## 1. prosemirror-inputrules : `undoInputRule` réinsère le texte tapé

Déposer sur : https://github.com/handlewithcarecollective/prosemirror-inputrules/issues/new

**Titre** : `undoInputRule` inserts the typed text a second time

**Corps** :

````markdown
### Summary

Since this fork inserts the typed text in its own transaction before applying the rule (so that history can track it), the text is already in the document when the rule is undone. `undoInputRule` still re-inserts `undoable.text`, as upstream `prosemirror-inputrules` does (where the typed text was never inserted), so the typed text ends up doubled.

### Versions

- `@handlewithcare/prosemirror-inputrules` 0.1.4
- `prosemirror-state` 1.4.4, `prosemirror-view` 1.42.9, `prosemirror-model` 1.25.12
- Chromium (Playwright 1.63)

### Steps to reproduce

```js
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Schema } from 'prosemirror-model'
import { history } from 'prosemirror-history'
import { InputRule, inputRules, undoInputRule } from '@handlewithcare/prosemirror-inputrules'

const schema = new Schema({
  nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'text*', toDOM: () => ['p', 0] }, text: {} },
})
const view = new EditorView(document.body, {
  state: EditorState.create({ schema, plugins: [history(), inputRules({ rules: [new InputRule(/--$/, '—')] })] }),
})
// In the browser, type: a - -   → the paragraph reads "a—"
undoInputRule(view.state, view.dispatch)
console.log(view.state.doc.textContent)
```

**Expected**: `a--` (the rule is undone, the typed text stays).
**Actual**: `a---` (the second `-` is inserted again).

### Cause

In `run()`, the typed text is dispatched first (`view.dispatch(insertTr)`), then the rule's transaction. `undoInputRule` inverts the rule's steps, which brings the typed text back, and then also does `tr.replaceWith(undoable.from, undoable.to, schema.text(undoable.text, marks))` — a second copy, since `from`/`to` are the positions mapped through `insertTr`.

### Suggested fix

Since the typed text is already part of the document before the rule runs, `undoInputRule` only needs to invert the rule's steps; the `if (undoable.text) … else tr.delete(…)` branch can go (or be kept only for rules that ran without a prior `insertTr`, e.g. the `compositionend` path, which passes an empty text).
````

---

## 2. prosemirror-inputrules : « Applying a mismatched transaction »

Déposer sur : https://github.com/handlewithcarecollective/prosemirror-inputrules/issues/new (le ticket fermé #2, « Unexpected extra transactions », est voisin : c'est la même transaction d'insertion préalable, mais un autre effet).

**Titre** : Input rule throws "Applying a mismatched transaction" when another plugin dispatches from its view on the inserted text

**Corps** :

````markdown
### Summary

`run()` builds the rule's transaction on a state computed _before_ the typed text is dispatched (`state = view.state.apply(insertTr)`), then dispatches `insertTr`, then the rule's transaction. If dispatching `insertTr` makes another plugin dispatch a transaction from its view (`PluginView.update`), the document is no longer the one the rule's transaction was built on, and ProseMirror throws `RangeError: Applying a mismatched transaction`. The rule is not applied.

This is what happens with collaborative bindings that react to local changes from their view: in BlockNote 0.57 (which uses this package), with the suggestion mode of `@y/prosemirror` 2.0.0-15 enabled, every input rule (`# ` → heading, `- ` → list, smart quotes…) fails with this error.

### Versions

- `@handlewithcare/prosemirror-inputrules` 0.1.4
- `prosemirror-state` 1.4.4, `prosemirror-view` 1.42.9
- Chromium (Playwright 1.63)

### Steps to reproduce

```js
import { EditorState, Plugin } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Schema } from 'prosemirror-model'
import { history } from 'prosemirror-history'
import { InputRule, inputRules } from '@handlewithcare/prosemirror-inputrules'

const schema = new Schema({
  nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'text*', toDOM: () => ['p', 0] }, text: {} },
  // Like a suggestion mark: not inclusive, so new text is not marked by itself.
  marks: { highlight: { inclusive: false, toDOM: () => ['mark', 0] } },
})
let busy = false
// Stands for a collaborative binding: reacts to a change from its view and dispatches.
const markTyped = new Plugin({
  view: () => ({
    update(view, prev) {
      if (busy || view.state.doc.eq(prev.doc)) return
      const { from } = view.state.selection
      if (from < 2) return
      busy = true
      try {
        view.dispatch(view.state.tr.addMark(from - 1, from, schema.marks.highlight.create()))
      } finally {
        busy = false
      }
    },
  }),
})
new EditorView(document.body, {
  state: EditorState.create({
    schema,
    plugins: [history(), inputRules({ rules: [new InputRule(/--$/, '—')] }), markTyped],
  }),
})
// In the browser, type: a - -
```

**Expected**: the paragraph reads `a—`.
**Actual**: `RangeError: Applying a mismatched transaction` (uncaught, from the second `-`); the paragraph reads `a--`.

### Suggested fix

Build the rule's transaction on the editor's actual state once `insertTr` (and `closeHistory`) have been dispatched — e.g. dispatch `insertTr` first, then re-read `view.state`, re-check the match and call `rule.handler(view.state, …)` with positions mapped through whatever happened in between — or skip the rule if `view.state.doc` is no longer `state.doc`.
````

---

## 3. BlockNote : `getSuggestionAtSelection` cherche des marques qui n'existent pas

Déposer sur : https://github.com/TypeCellOS/BlockNote/issues/new

**Titre** : `SuggestionsExtension.getSuggestionAtSelection` looks for non-existent mark names and always returns undefined

**Corps** :

````markdown
### Summary

In `@blocknote/core/y` 0.57.0, `getSuggestionAtSelection()` looks for marks named `insertion`, `deletion` and `modification`. The suggestion marks are `y-attributed-insert`, `y-attributed-delete` and `y-attributed-format` (the names the same extension uses in `getSuggestionAtCoords` and when checking for suggestions in the document). So it never finds anything.

From the published bundle (`@blocknote/core/dist/y.js`):

```js
function getSuggestionAtSelection() {
  return editor.transact((tr) => {
    const selection = tr.selection
    if (selection.empty)
      return (
        getMarkAtPos(selection.anchor, 'insertion') ||
        getMarkAtPos(selection.anchor, 'deletion') ||
        getMarkAtPos(selection.anchor, 'modification')
      )
  })
}
```

while `getSuggestionAtCoords` uses `"y-attributed-insert"`, `"y-attributed-delete"` and `"y-attributed-format"`.

### Versions

`@blocknote/core` 0.57.0, `@y/prosemirror` 2.0.0-15, `@y/y` 14.0.0-rc.29.

### Steps to reproduce

1. Set up an editor with collaboration and a suggestion document (`withCollaboration({ collaboration: { …, suggestionDoc, renderer } })`), then `editor.getExtension('suggestions').enableSuggestions()`.
2. Type a word: it becomes a suggested insertion (rendered with the `y-attributed-insert` mark).
3. Put the cursor inside that word and call `editor.getExtension('suggestions').getSuggestionAtSelection()`.

**Expected**: the suggestion under the cursor (same shape as `getSuggestionAtCoords` returns).
**Actual**: `undefined`.

### Suggested fix

Use the same names as `getSuggestionAtCoords`: `y-attributed-insert`, `y-attributed-delete`, `y-attributed-format`.
````

---

## 4. BlockNote : un fil résolu lève une erreur tant que le nom de qui l'a résolu n'est pas chargé

Déposer sur : https://github.com/TypeCellOS/BlockNote/issues/new

**Titre** : Resolved thread throws "…resolved thread …, but their data could not be found" while the resolver's user data is loading

**Corps** :

````markdown
### Summary

`Comments` (`@blocknote/react`, `components/Comments/Comments.tsx`) loads the user who resolved a thread with `useCommentUsers([thread.resolvedBy])`, which resolves asynchronously through `resolveUsers`. On the first render the user is not there yet, and the component throws:

```ts
if (thread.resolved && thread.resolvedUpdatedAt && thread.resolvedBy) {
  const resolvedByUser = users.get(thread.resolvedBy);
  if (!resolvedByUser) {
    throw new Error(
      `User ${thread.resolvedBy} resolved thread ${thread.id}, but their data could not be found.`,
    );
  }
  …
  authorInfo={(thread.resolvedBy && users.get(thread.resolvedBy)) || "loading"}
```

The code a few lines below already handles the loading case (`|| "loading"`), but the `throw` above it is reached first. With a thread sidebar (`ThreadsSidebar`, filter "resolved" or "all") the whole sidebar errors out as soon as a resolved thread is shown, unless the resolver happens to be cached already.

### Versions

`@blocknote/react` 0.57.0, `@blocknote/core` 0.57.0.

### Steps to reproduce

1. Use `CommentsExtension` with a thread store whose threads come from a server, and a `resolveUsers` that fetches users (asynchronously).
2. Resolve a thread as user A.
3. Reload the page as user B (user A not yet in the users cache) and show the threads sidebar with resolved threads.

**Expected**: the thread renders; the "resolved by" line shows a loading state, then A's name.
**Actual**: `Error: User A resolved thread …, but their data could not be found.`

### Suggested fix

Remove the `throw`: the `authorInfo` fallback to `"loading"` below already covers this case.
````

---

Les tickets 5 à 7 se reproduisent sur la démo publique de y-prosemirror, https://y-prosemirror-demo.netlify.app/ ; ses sources, lues dans la carte de son fichier construit, sont identiques octet pour octet à `@y/prosemirror` 2.0.0-15. Deux précautions, notées dans les tickets : attendre 3 à 6 s après une modification en mode Edit avant de lire l'état (sinon la suggestion n'est pas encore partie), et laisser environ 0,5 s entre une sélection au clavier et l'action suivante. Les captures sont dans `docs/v2-tickets-amont/`, à joindre aux tickets.

## 5. y-prosemirror : une mise en forme suggérée n'est pas marquée comme suggestion

Déposer sur : https://github.com/yjs/y-prosemirror/issues/new (voisins fermés : #249, changement de type de bloc ; #241, ouvert, sur `updateYText` hors mode suggestion)

**Titre** : V2 suggestions: a suggested formatting change (bold) is not shown as a suggestion

Pièces jointes : `04-bold-unselected-edit.png`, `04-bold-view.png`

**Corps** :

```markdown
**Describe the bug**
In suggestion mode, making a word bold applies the bold in the suggestion layer, but nothing marks it as a suggestion: no attribution, no visual difference from bold text that is already accepted. Accept All does apply it, and Reject All removes it, so the change is recorded — it is just invisible as a suggestion, so a reviewer cannot see it, nor accept or reject it on its own.

**To Reproduce**
Steps to reproduce the behavior:

1. Go to https://y-prosemirror-demo.netlify.app/
2. Type "Le temps est beau"
3. Set suggestions to "Edit"
4. Select "est" (wait half a second after selecting), press Ctrl+B (or the B button)
5. Click elsewhere to deselect; switch to "View"

"est" is bold, with no insertion/deletion/format attribution (no attribution markup in the DOM). Set suggestions to "Off": "est" is not bold in the original document. "Accept All" makes it bold; "Reject All" removes the bold.

**Expected behavior**
The formatting change is shown as a suggestion (like `y-attributed-format` attributions), so it can be seen, accepted or rejected like an insertion or a deletion.

**Environment**
Public demo on 2026-11-11; its sources (from `dist/demo.js.map`) are identical to `@y/prosemirror` 2.0.0-15, with `@y/y` 14.0.0-rc.29. Chromium. Also observed through BlockNote 0.57.0.
```

---

## 6. y-prosemirror : une touche morte sur une sélection laisse le « ^ »

Déposer sur : https://github.com/yjs/y-prosemirror/issues/new (voisin fermé : #81, composition des langues asiatiques synchronisée avant `compositionend`)

**Titre** : V2 suggestions: composing over a selection (dead key) leaves the dead-key character in the text

Pièces jointes : `05a-edit-after.png`, `05a-off-after.png`

**Corps** :

```markdown
**Describe the bug**
In suggestion mode, typing an accented character with a dead key (e.g. `^` then `e` → `ê`, as on French keyboards) over a selected word leaves the dead-key character in the text: the suggestion reads `^ê` instead of `ê`. The event log shows a second `compositionstart` right after the first composition update, i.e. the DOM is replaced while the composition is in progress.

**To Reproduce**
Steps to reproduce the behavior:

1. Go to https://y-prosemirror-demo.netlify.app/
2. Type "Le the est beau"
3. Set suggestions to "Edit"
4. Select "the", wait half a second
5. Type `ê` with a dead key: `^` then `e`

Result: `Le ~~the~~ ^ê est beau` (the insertion is `^ê`). With suggestions "Off", the same steps give `Le ê est beau`. With suggestions "Edit" and no selection (collapsed cursor), the result is correct (`ê` inserted), although the second `compositionstart` still shows up.

**Expected behavior**
The insertion is `ê`, as without suggestions.

**Environment**
Public demo on 2026-11-11 (sources identical to `@y/prosemirror` 2.0.0-15, `@y/y` 14.0.0-rc.29). Chromium; the composition was driven through the Chrome DevTools Protocol (`Input.imeSetComposition` with `^`, then with `ê`, then `Input.insertText`), reproduced twice out of two. First noticed with a real French keyboard in BlockNote 0.57.0.
```

---

## 7. y-prosemirror : les remplacements sont découpés au caractère (question)

Déposer sur : https://github.com/yjs/y-prosemirror/issues/new — **à poser comme une question**, pas comme un défaut : le texte accepté est juste, c'est la présentation qui gêne la relecture d'un texte.

**Titre** : V2 suggestions: replacing a word keeps the letters it shares with the new word out of the suggestion — intended?

Pièces jointes : `03-type-after.png`, `03-paste-after.png`

**Corps** :

```markdown
**Question**
When a word is replaced in suggestion mode, the letters the old and new words have in common stay outside of the suggestion (character-level diff). Accept All and Reject All give the right text, but for proofreading (an editor reviewing a copy-editor's changes) the suggestion reads oddly, and accepting or rejecting part of it is not possible as a word-level replacement.

**To Reproduce**

1. Go to https://y-prosemirror-demo.netlify.app/
2. Type "Le temps est beau"
3. Set suggestions to "Edit"
4. Select "beau", type "blanc"

Result: `Le temps est b` + inserted `lanc` + deleted `eau` — the shared `b` stays unattributed, and the insertion comes before the deletion.

Same with a paste: type "chat noir dort" and, on another line, "vert"; in "Edit", copy "vert", select "noir dort" and paste: the result is deleted `noir do` + inserted `ve` + unchanged `rt`.

**Question**
Is the character-level granularity intended for suggestions? Would a word-level (or "whole selection replaced") option be possible, so that replacing a selection is shown as one deletion followed by one insertion?

**Environment**
Public demo on 2026-11-11 (sources identical to `@y/prosemirror` 2.0.0-15, `@y/y` 14.0.0-rc.29). Chromium. Also seen through BlockNote 0.57.0.
```

---

## 8. y-prosemirror : commentaire sur #245 (frappe directe au contact d'une suggestion affichée)

Ajouter à https://github.com/yjs/y-prosemirror/issues/245 (décision de Sylvain, 12/11/2026). **À rejouer d'abord sur la démo** (mode qui affiche les suggestions tout en écrivant dans le texte) : le cas vient d'amend.ink, sur le montage de l'exemple `07-collaboration/12-multi-doc-versioning` de BlockNote. Détail : `docs/v2-tests/essai-editer-2026-11-12.md`.

**Corps** :

```markdown
Adding cases to this issue, seen with suggestions **shown** (BlockNote `viewSuggestions()`, i.e. a `DiffRenderer` with `suggestionMode = false`) while the user **edits the base document directly** — the setup of BlockNote's `12-multi-doc-versioning` example, with editing allowed in the "view suggestions" state. This is the mode Google Docs calls "Editing" with suggestions visible, and what Docs (La Suite numérique) plans in suitenumerique/docs#2491.

User A suggests " donc" in "Il faisait| nuit". User B, an editor, types directly:

1. right after the suggestion (and one character beyond, in the next word): B's text is absorbed into A's suggestion, **attributed to A**; rejecting the suggestion **deletes B's text**;
2. right before the suggestion at the end of a paragraph: B's text is absorbed and **the whole suggestion is now attributed to B**;
3. B selects a range overlapping the suggestion and types a replacement: **A's suggestion disappears**, with no trace in the attributions;
4. inside a suggested deletion: B's text goes to the base document and splits the deletion in two suggestions (acceptable, but surprising).

Typing one word away from the suggestion is fine.

Versions: `@y/prosemirror` 2.0.0-15, `@y/y` 14.0.0-rc.29, `@blocknote/core` 0.57.0, Chromium.

We now block direct edits within the suggestion and the words touching it in that mode, as a workaround. A fix in the binding (direct edits never attributed, and never extending a suggestion) would let us remove it.
```

