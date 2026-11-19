---
'@astryxdesign/cli': patch
---

[perf] `astryx doctor` keeps what its `core-props` check finds while every folder the check listed, every file it read, and the TypeScript, Core and project config it used are unchanged, and it loads the parts of the check only when they are needed. A warm `doctor` in a project that has not changed no longer parses its pages again or reads Core's types again, and a project without TypeScript no longer loads the component reader. Every answer is unchanged.

@josephfarina
