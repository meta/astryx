---
'@astryxdesign/core': patch
---

[fix] A swizzled `Table` now honors `virtualization` from the package's `useTableRowsVirtualization`, and the package `Table` honors a capability from a swizzled copy. Before, each copy recognized only its own capability, so a swizzled Table rendered every row and its code failed to type-check. The capability is read through a registered, versioned key, and its type carries one required brand member that is never present at runtime, so only the hook makes a capability. A `virtualization` value the hook did not make now gets its own development warning. No API changes.

@cixzhang
