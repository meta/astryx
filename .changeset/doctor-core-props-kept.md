---
'@astryxdesign/cli': patch
---

[perf] Once the per-user catalogs folder exists, `astryx doctor` keeps what its `core-props` check finds while every folder the check listed, every file it read, and the TypeScript, Core and project config it used are unchanged. A warm `doctor` in a project that has not changed then skips that check's scan: the check no longer parses the project's pages or reads Core's types again. The check also loads its parts only when they are needed, so a project without TypeScript no longer loads the component reader. Every answer is unchanged.

@josephfarina
