---
'@astryxdesign/cli': patch
---

[perf] `astryx build`'s COMPONENTS line names the batch form: "Read the ones you need in one call: `astryx component <name> [name...]`". Before, it said "Read one", and agents read each component in its own call.

@josephfarina
