---
'@astryxdesign/core': patch
---

[fix] The development warning for passing both `button` and `renderTrigger` to `DropdownMenu` now names `renderTrigger`; it named a `trigger` prop that does not exist. The docs match the component too: `button` is mutually exclusive with `renderTrigger`, the private menu radius defaults to `--radius-container`, and a disabled `DropdownMenuCheckboxItem` or `DropdownMenuRadioItem` takes no focus — the arrow keys, typeahead, and the pointer highlight skip it — while it stays in the accessibility tree as disabled.

@cixzhang
