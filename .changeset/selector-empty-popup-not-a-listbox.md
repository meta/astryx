---
'@astryxdesign/core': patch
---

[fix] When a search matches nothing, or there are no options, `Selector` and `MultiSelector` no longer expose an empty listbox. The popup becomes a group named by the field's label and shows the "no results" or "no options" message as its content beside the search input, so screen readers meet a named group instead of an invalid empty listbox. The message is still announced, the search input still names the popup in `aria-controls`, and the listbox, or a MultiSelector's grid, returns as soon as options match.

@cixzhang
