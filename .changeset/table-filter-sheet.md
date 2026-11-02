---
'@astryxdesign/core': patch
---

[feat] `useTableFiltering` can present its filters in a bottom sheet. A header cell is the wrong home for a filter on a phone: the column is too narrow to hold a control, and a popover anchored to it covers the rows the filter is meant to narrow. The new `presentation` option takes `'header'` (the default, unchanged), `'bottom-sheet'`, or `'adaptive'`, which uses the sheet on a compact touch screen and the header everywhere else. In the sheet, every filter sits behind one Filter button above the table that carries the active-filter count; each change applies as it is made and the sheet has no scrim, so the rows behind stay visible and keep updating. Short enum filters render as a list of checkboxes or radios rather than a Selector, so nothing opens a second layer on top of the sheet. The new optional `onClearAll` adds a Reset action to the sheet that clears every filter in one call; pass `clearAll` from `useTableFilterState`. Nothing changes for a table that does not set `presentation`.

@imdreamrunner
