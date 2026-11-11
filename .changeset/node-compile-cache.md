---
'@astryxdesign/cli': patch
---

[perf] The CLI turns on Node's compile cache, so a run skips most of compiling the CLI's modules again. The cache sits in the user's own folder in the system temp folder (`node-compile-cache-<uid>`), used only once it exists (the first run on a machine just makes the folder, so a one-off run pays nothing for it) and only while it is a real folder the user owns and no one else can reach. Where the system has no user ids (Windows), that cannot be checked, so the cache stays off. `NODE_DISABLE_COMPILE_CACHE=1` turns it off. A cache that cannot be read or written is skipped without a word, and every command prints the same output.

@josephfarina
