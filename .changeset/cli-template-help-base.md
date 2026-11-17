---
'@astryxdesign/cli': patch
---

[fix] On a base other than Core, `astryx template --help` no longer names `--skeleton` in the `--list` text or suggests `--package @astryxdesign/core`. A command doc's option can now declare `pointers`, parts of its description that help leaves out when the base does not serve what they name.

@josephfarina
