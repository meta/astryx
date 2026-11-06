---
'@astryxdesign/core': patch
---

[fix] SideNav: during a collapse, the copy of the expanded rail now paints at the rail's own level, just below the rail, instead of at `z-index: 1` with the rail raised to `2`. Page content stacks against the leaving rail as it does against the nav: a positioned sibling with no `z-index` no longer sits under the copy, and content positioned above the nav also covers the copy. The motion's timing and curve are unchanged, and Reduce Motion stays instant.

@cixzhang
