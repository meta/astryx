---
'@astryxdesign/cli': patch
---

[feat] `astryx discover` names the sections an installed integration adds to a doc another package owns, so a reader can open its own section straight away: the list shows `docs: theme (sections: install-and-apply)`, the JSON entry gains `docSections` (each name's section keys), and the doc's item page gains `sections`. Each key opens with `astryx docs <name> <key>`.

@josephfarina
