---
'@astryxdesign/cli': patch
---

[docs] The Astryx skill the CLI writes for agents on the computer, and the Claude Code and Codex plugin skill made from it, now say to pin `@astryxdesign/cli` exactly when the project pins `@astryxdesign/core` exactly. Before, agents added the CLI at Core's version with a `^` range beside an exactly pinned Core.

@josephfarina
