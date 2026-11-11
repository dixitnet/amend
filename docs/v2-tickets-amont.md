# amend.ink v2 : tickets à déposer en amont (préparés le 11/11/2026)

Demande de Sylvain (11/11/2026, point 14 du lot « stabiliser, fiabiliser ») : préparer les tickets des défauts des fondations listés dans `docs/v2-veille.md`, prêts à coller. **Sylvain les dépose lui-même** (prise de parole publique, règle 4.4 des règles de la v2) : Claude ne peut pas écrire hors du dépôt `dixitnet/amend`.

Chaque ticket est écrit en anglais, sur les versions installées le 11/11/2026, qui sont les dernières publiées : `@blocknote/core` 0.57.0, `@y/prosemirror` 2.0.0-15, `@y/y` 14.0.0-rc.29, `@y/hub` 0.10.1, `@handlewithcare/prosemirror-inputrules` 0.1.4, `prosemirror-view` 1.42.9, `prosemirror-state` 1.4.4. Les dépôts ont été parcourus pour éviter les doublons (recherche des tickets ouverts et fermés).

## Où en est chaque ticket

| N°    | Dépôt                                           | Sujet                                                                                                                                                                         | État         | Vérifié comment                                                                                                              |
| ----- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 1     | handlewithcarecollective/prosemirror-inputrules | `undoInputRule` réinsère le texte tapé                                                                                                                                        | **prêt**     | cas minimal sans BlockNote ni Yjs, rejoué dans Chromium : « a » puis « -- » donne « a— », l'annulation donne « a--- »        |
| 2     | handlewithcarecollective/prosemirror-inputrules | « Applying a mismatched transaction » quand un greffon réagit dans sa vue (mode suggestion de BlockNote)                                                                      | **prêt**     | même cas minimal, avec un greffon qui marque le texte tapé depuis sa vue : l'erreur se produit, la règle n'est pas appliquée |
| 3     | TypeCellOS/BlockNote                            | `getSuggestionAtSelection` cherche des marques qui n'existent pas                                                                                                             | **prêt**     | lecture du code livré (`@blocknote/core/dist/y.js`) : les autres fonctions de la même extension utilisent les bons noms      |
| 4     | TypeCellOS/BlockNote                            | un fil résolu lève une erreur tant que le nom de qui l'a résolu n'est pas chargé                                                                                              | **prêt**     | lecture du code livré (`Comments.tsx`) : la ligne suivante prévoit déjà l'état « loading »                                   |
| 5 à 8 | yjs/y-prosemirror                               | défauts du mode suggestion (suppression à cheval sur deux paragraphes, paragraphe supprimé invisible après rechargement, découpage des remplacements, mise en forme suggérée) | **en cours** | reproduction sur la démo publique de y-prosemirror, pour que les tickets ne dépendent ni de BlockNote ni de notre code       |

Non préparés, et pourquoi :

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

## 5 à 8. y-prosemirror : défauts du mode suggestion

En cours de reproduction sur la démo publique (https://y-prosemirror-demo.netlify.app/), au format des tickets existants du dépôt (« Go to the demo, type …, set suggestions to "Edit" … »). Complété dès que la reproduction est faite ; un défaut qui ne se reproduit pas sur la démo viendrait de BlockNote ou de notre montage, et ne doit pas être signalé à y-prosemirror.
