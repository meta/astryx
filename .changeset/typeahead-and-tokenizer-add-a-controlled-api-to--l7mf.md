---
'@astryxdesign/core': patch
---

[feat] Typeahead and Tokenizer take `query` and `defaultQuery` so an app can set or clear the typed text. Pass `query` with `onChangeQuery` to restore a search, clear it from another control, or keep the text after a pick. `onChangeQuery` keeps reporting every change, its own included, so a controlled field stays in sync. A change from outside does not move focus, and it does not open the listbox or announce a result count unless the field has focus. Omit `query` and the field still owns its text; `defaultQuery` sets the starting value.
@mvanhorn
