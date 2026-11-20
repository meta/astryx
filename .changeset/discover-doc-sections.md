---
'@astryxdesign/cli': patch
---

[feat] `astryx discover` names the sections an installed integration adds to a doc another package owns, so a reader can open its own section straight away: the list prints the read beside the doc, `docs: theme (read: astryx docs theme install-and-apply)`, the JSON entry gains `docSections` (each name's section keys, each opening with `astryx docs <name> <key>`), and the doc's item page gains `sections` and prints the same reads.

@josephfarina
