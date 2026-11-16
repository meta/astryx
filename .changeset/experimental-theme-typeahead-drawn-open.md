---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the sheet and its pictures show a typeahead's list open. The render loads React DOM's client with a document in place before the page (a part that loads it with the page, such as a toast, loaded it with none, so typing never reached a field's change handler), types as a person types, and opens a typeahead's open look without waiting for its search delay.

@josephfarina
