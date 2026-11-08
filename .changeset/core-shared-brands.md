---
'@astryxdesign/core': patch
---

[fix] A swizzled copy and the package now agree on the animated-layout handle, code-language values and snap paging. A handle from `useAnimatedLayout` passed to a swizzled `AppShell`, `List`, `Table`, `TreeList`, `Collapsible` or `SideNav` no longer throws when the layout changes, and those copies type-check: each brand is read through a registered, versioned key at runtime, and the types carry one optional brand member that is never present. No API changes.

@cixzhang
