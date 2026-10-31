---
'@astryxdesign/core': patch
---

[feat] `useResizable`'s configuration-object form is deprecated in favor of `useResizable(handleRef, options)`, and with it the `resizable` props of `ResizeHandle` and `LayoutPanel` and the form's types (`ResizableRegionConfig`, `UseResizableSingleConfig`, `UseResizableMultiConfig`, `ResizableRegion`, `ResizableProps`). Old usage works unchanged until a minor removes it: TypeScript marks it deprecated, and nothing warns at runtime. To migrate:

1. Create a ref for each handle: `const handleRef = useRef(null)`.
2. Pass it first, with the same options: `useResizable(handleRef, options)`. A `regions` call becomes one call per region, with the shared `containerRef` and `direction`; an `autoSaveId` of `<autoSaveId>:<region key>` keeps each region's saved size.
3. Give the ref to the handle in place of its `resizable` prop: `<ResizeHandle ref={handleRef} />`. Its `isReversed` and `isDisabled` stay on the handle.
4. Give `LayoutPanel` the size in place of its `resizable` prop: `<LayoutPanel width={region.size}>`.

`SideNav`, the docs, the stories and the templates use the ref form.

@vjeux
