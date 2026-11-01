---
'@astryxdesign/core': patch
---

[feat] A `SearchSource` can show results before its search settles. `search(query, context)` may call `context.update(items)` (new exported type `SearchContext`) to show matches it already has, such as people the page loaded earlier, and then return the server's answer. `BaseTypeahead`, `Typeahead` and `Tokenizer` show each list for the current query, change the list at most once per keystroke, and add later rows only after the ones already shown, so the highlighted row never moves; the field stays busy and the result count is announced once, when the search settles. A later list that moves or removes shown rows is shown as given with a development warning. Sources that never call `update` show one list per query as before, with two changes every field sees: option element ids now follow the item's `id` instead of its row index (tests that select options by an index-based id need updating), and a grouped `Tokenizer` with `hasCreate` shows its Create row after the groups instead of first. To show local matches at once, pass `debounceMs={0}` and delay the server request inside the source (`spec:AST-092`).

@cixzhang
