---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` warns a `[light, dark]` pair of sizes (`['4px', '12px']`), which `light-dark()` does not take, and a pair half that reads a token nothing sets, as it warns the same CSS written as text. A var() name with a letter beyond ASCII (`var(--café)`) is read as CSS reads it: no false warning in the build, and no refusal in `astryx experimental theme`.

@josephfarina
