---
'@astryxdesign/cli': patch
---

[fix] `theme build --check` no longer reads a theme family as out of date when only the command named in its built-by lines differs. A built family module names the command that built it once per member theme, and outputs an earlier release built with another command (`pnpm dlx … theme build`, for example) failed the check with otherwise identical content. The check already ignored that line in a single theme's module; it now ignores it on every member's line, and `integration verify` does the same. A second line for one theme, or any other change to the module, is still out of date.

@cixzhang
