---
'@astryxdesign/core': patch
---

[fix] With a value, a `Typeahead`'s Tab stop is the value's token button (WCAG 2.2 SC 2.4.6 and 4.1.2). It was named by the value alone ("Apple"), so screen reader users could not tell which field it belonged to. It is now named by the field label and the value ("Fruit Apple"), and described by the field's description and status.

A clickable `Token` passed `aria-labelledby` and `aria-describedby` to its root, a generic element where they named nothing. It now passes them to its inner button, the element that owns its action. Every other structure keeps them on its root.

@cixzhang @duytbp
