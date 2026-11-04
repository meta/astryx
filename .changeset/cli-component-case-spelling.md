---
'@astryxdesign/cli': patch
---

[fix] `astryx component` takes a component's exact name in another case as that component's, never a module's that only shares the spelling. `tokenizer` opens Tokenizer's doc instead of CodeBlock's, which it reached through `CodeBlock/tokenizer.ts`. `--source` with `tokenizer`, `slider`, `switch` or `progressBar` no longer prints `CodeBlock/tokenizer.ts` or the motion tables in `motion/uikit/`, and answers `ERR_NO_SOURCE`, as `--source badge` does.

@vjeux
