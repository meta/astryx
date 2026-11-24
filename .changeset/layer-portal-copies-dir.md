---
'@astryxdesign/core': patch
---

[fix] Layer, DropdownMenu: a layer that leaves an unsafe ancestor (such as a paragraph) and copies that ancestor's text direction now also sets `dir`, so direction-aware styles inside it agree with its layout. A right-to-left DropdownMenu inside a left-to-right region now points its sub-menu chevron and its Back chevron toward where the sub-menu opens.

@cixzhang
