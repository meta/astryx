---
'@astryxdesign/cli': patch
---

[feat] `astryx docs <topic>` prints the topic whole, as `--json` already did, so a guide's first read carries its rules and examples. A topic whose own text is over 16 KB still lists its sections, and a whole read ends with the commands that open one section or the section list. `--index` lists the sections of any topic, and `--full` prints any topic whole.

@josephfarina
