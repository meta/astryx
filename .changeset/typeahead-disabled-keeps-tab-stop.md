---
'@astryxdesign/core': patch
---

[fix] Typeahead, Tokenizer, PowerSearch: a disabled field keeps its tab stop. Before, a field disabled without a `disabledMessage` rendered a natively disabled input, so Tab skipped it and screen-reader users moving by focus never reached it. Now the input is announced as disabled (`aria-disabled`), stays read-only, opens and picks nothing, and shows a focus ring under keyboard focus. A search still in flight when the field becomes disabled is dropped: it opens, announces, and spins nothing. A Tokenizer or PowerSearch with `tokenOverflowBehavior="unfocusedLayer"` and no `disabledMessage` keeps its natively disabled input for now.

@cixzhang
