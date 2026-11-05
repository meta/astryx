---
'@astryxdesign/core': patch
---

[feat] Table tree plugin (`useTableTreeData`) takes the WAI-ARIA treegrid role and a row-focus keyboard model.

When any row is expandable, the table carries `role="treegrid"`. Every body row carries `aria-level` and `aria-expanded` (parents only), plus `aria-posinset` and `aria-setsize` when the row meta supplies them. The row ARIA that axe flagged as invalid on a native table (`aria-conditional-attr`) is now valid in context. Flat data is untouched: no role, no row ARIA, no tab stop.

The keyboard model is a row-focus subset of the APG treegrid pattern, plus Enter/Space to toggle a focused row. Only rows take focus, and no key enters a cell. The visible rows share one roving tab stop, which follows focus onto a row (arrow keys, a click, programmatic focus). On a focused row, ArrowDown/ArrowUp move to the next/previous visible row and stay put on the last/first. Home/End jump to the ends. ArrowRight expands a collapsed row. ArrowLeft collapses an expanded row and does nothing on a collapsed row or a leaf. Enter/Space toggle an expandable row. Left/Right never move to a child or parent row, and they swap under RTL.

Keys pressed with Alt or Meta pass through to the browser and other handlers. Ctrl+Home/Ctrl+End still jump to the first/last row. There is no type-ahead. PageUp/PageDown are not handled.

Because no cell takes focus, the model differs from the pattern in two ways. ArrowRight on an expanded row or a leaf does nothing, where the pattern moves focus into the row's first cell. The controls inside cells (the chevron, a selection checkbox) stay in the ordinary page Tab order. The pattern's Tab visits only the focused row's controls and then leaves the treegrid. Focusing a control inside a cell leaves the row stop where it is, and the controls keep their own keys. This version has no cell-by-cell navigation; a composition that needs it is outside the supported contract.

When a collapse or a data change removes the row that holds focus or the row stop, each moves to that row's nearest remaining ancestor. For a collapse, that is the row that collapsed. Focus moves only if it was lost. The chevrons and the header expand-all toggle now draw the shared focus ring.

Two consequences are worth knowing. A tree table now takes one Tab stop for its rows, at the active row's place in DOM order. Tab order: the scroll region while the table overflows horizontally, the header controls, then the in-cell controls and the active row in DOM order. A test that queried `getByRole('table')` on a tree table queries `treegrid` now.

Also new: `TableRenderProps.ref` lets a plugin reach the `<table>` node (merged with the consumer's `ref`), and `TableTreeRowMeta` gains optional `posInSet`/`setSize`. `useTreeFocus` resolves the focused item through `itemSelector`, so a host whose items are not `role="treeitem"` can pass its own `itemSelector` to reuse the keyboard model.

@AKnassa
