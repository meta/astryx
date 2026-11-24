---
'@astryxdesign/core': patch
---

[feat] Promote `ListInput` to Core, imported from `@astryxdesign/core/ListInput` or the package root, with its types `ListInputProps`, `ListInputChange`, `ListInputColumn`, `ListInputRenderContext`, and `ListInputValueContext`. ListInput edits a short, ordered collection of simple records: each record renders one Astryx input per column, Add appends a record from `createItem`, Remove deletes one, and `onChange` reports each change with an `add`, `update`, or `remove` descriptor. An add or a removal is announced, and moves focus, once the controlled value applies it. Pass `reorderable={createReorderable({onReorder})}` to give each record a reorder handle; a move goes to `onReorder`, never to `onChange`. As every component that composes Field does, it takes no root `xstyle`, `className`, or `style`: `containerXstyle`, `containerClassName`, and `containerStyle` style the Field box, and `controlXstyle`, `controlClassName`, and `controlStyle` style the `role="group"` element that holds the records.

@ernestt
