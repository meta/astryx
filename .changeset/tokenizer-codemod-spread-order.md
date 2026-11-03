---
'@astryxdesign/cli': patch
---

[fix] The `promote-tokenizer-presentation` codemod writes the stable `presentation` attribute before the first spread of props. A `presentation` that the spread carries then still wins, as it wins over `experimental.presentation`. Before, the codemod put the moved value after such a spread, so the value that lost started to win.

@imdreamrunner
