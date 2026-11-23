---
'@astryxdesign/core': patch
---

[component] Promote `DiffViewer` to Core, imported from `@astryxdesign/core/DiffViewer` or the package root together with `parseUnifiedDiff`, `createDiffFile`, and the diff model types. DiffViewer shows a read-only, syntax-highlighted diff of one file in unified or split view: a file header with the path, status, and line counts over the hunks, review annotation rows under any line, optional line-number buttons, and folds for a change too large to show line by line. Every changed line reads as added or removed without colour, also under forced colors. The file header is a disclosure that starts open; `collapsible` takes the same `CollapsibleConfig` as Banner and Collapsible (`{defaultIsOpen: false}` starts it collapsed, `{isOpen, onOpenChange}` controls it, and `false` turns it off).

@ernestt
