---
'@astryxdesign/cli': patch
---

[feat] Every `--json` result that lists or returns a template gives it `isReady`: false for a template whose doc sets `isReady: false`, else true. `discover`, which names a package's templates only by id, carries neither. That covers `search` results, `build`'s start, alternatives, pages and blocks, `template <id>` (shown, `--skeleton`, and copied), and `component <Name> --blocks`; `template --list` already had it. In text, those commands mark an unready template `(not ready)`, and `template --list` says `(not ready)` instead of `(WIP)`. Search still lists an unready template in the same place.

@josephfarina
