---
'@astryxdesign/core': patch
---

[fix] SideNav: during a collapse, the copy of the expanded rail and the real rail now paint above the page's other content until the motion ends. Before, a positioned sibling such as a sticky app header could cut across the leaving rail for the length of the collapse when SideNav was used without AppShell. The motion's timing and curve are unchanged, and Reduce Motion stays instant.

@cixzhang
