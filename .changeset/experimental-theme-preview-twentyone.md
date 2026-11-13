---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview`: when both spellings of a folder are already there, the case-clash refusal suggests a new folder beside them, and names `preview remove` for a preview already inside. A `theme-preview.json` entry that leads outside the folder (`../`) is reported as damaged by `add` and `list`. `remove` drops such an entry and deletes nothing outside, and its messages show paths from the project.

@josephfarina
