---
'@astryxdesign/cli': patch
---

[fix] A command that reads a project module again after changing it, such as `astryx integration add` checking the manifest it just wrote, now reads the change for an ES module `.js` file in a package without a `"type"` field. It read the module as first loaded.

@vjeux
