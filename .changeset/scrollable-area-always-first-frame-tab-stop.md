---
'@astryxdesign/core': patch
'@astryxdesign/lab': patch
---

[fix] A scroll area that keeps its sticky containment, such as CodeBlock, a BottomSheet body, Lab Schedule's week and day time grid, or a `ScrollableArea` with `stickyContainment="always"`, is a keyboard tab stop from the first frame its content overflows, including when Schedule's loaded events replace its loading view. Before, it could scroll for a moment after it appeared before the keyboard could reach it. Other scroll areas still read no layout as they mount.

@cixzhang
