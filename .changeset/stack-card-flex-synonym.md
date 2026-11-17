---
'@astryxdesign/cli': patch
---

[fix] `astryx component Flex` names Stack first. Stack's search card now lists `Flex`, the name Chakra UI and Mantine use for the same row-or-column layout part, so the lookup that misses suggests Stack before Layout.

@josephfarina
