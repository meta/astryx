---
'@astryxdesign/core': patch
---

[fix] `useTableRowExpansion`: expanding or collapsing a row no longer re-renders the other rows; only the toggled row's chevron and panel update. This holds while `getRowKey`, `getRowLabel`, `getIsItemExpandable` and `renderExpanded` keep their identity (defined outside the component or memoized); `onToggle` can be written inline. On a long table the toggle used to rebuild every row, which held the page for seconds.

@cixzhang
