---
'@astryxdesign/cli': patch
---

[fix] An import written as a template literal with nothing put in it (``import(`./icons.ts`)``) is read as the string it holds by these commands: `astryx theme build --watch` follows it, the built theme module carries it, `astryx doctor`'s shipped-import check judges it, and `astryx template` lists a package imported that way in its install line when the project lacks it. Before, such an import was skipped.

@josephfarina
