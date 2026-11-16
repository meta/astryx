---
'@astryxdesign/core': patch
---

[a11y] `Selector` and `MultiSelector` no longer expose an empty listbox. When a search matches nothing, or there are no options, the popup drops its listbox role and shows the "no results" or "no options" message as plain content beside the search input, so screen readers no longer meet an invalid empty listbox. The message is still announced, the search input still names the popup in `aria-controls`, and the listbox returns as soon as options match.

@cixzhang
