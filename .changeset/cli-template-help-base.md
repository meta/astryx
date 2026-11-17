---
'@astryxdesign/cli': patch
---

[feat] A command doc's option can declare `pointers`: parts of its description that help leaves out when the run's base does not serve what they name. On a base other than Core, `astryx template --help` no longer names `--skeleton` in the `--list` text or suggests `--package @astryxdesign/core`, and `astryx mcp --help` no longer names `theme targets` in the `--docs-only` text.

@josephfarina
