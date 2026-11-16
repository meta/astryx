---
'@astryxdesign/cli': patch
---

[fix] An import written as a template literal with nothing put in it (``import(`./icons.ts`)``) is read as the string it holds wherever the CLI reads a module's imports: `astryx theme build --watch` follows it, the built theme module carries it, `astryx doctor`'s shipped-import check judges it, and `astryx template` copies the file it names. Before, such an import was skipped.

@josephfarina
