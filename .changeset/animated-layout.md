---
'@astryxdesign/core': patch
---

[chore] Internal: the one module for size-change glides (`spec:AST-105`, `architecture:react-component-runtime` INV12). After a reported size change, the content after it inside a container glides to its new place on one shared internal motion role, and the changed element enters or exits on the same motion. Not exported; no component uses it yet. The public `useAnimatedLayout` hook and Collapsible's and TreeList's `animatedLayout` prop arrive together in a later release.

@cixzhang
