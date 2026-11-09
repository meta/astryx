---
'@astryxdesign/core': patch
---

[fix] A theme duration token written with `calc()` now times a press's release as the browser resolves it. Before, the release clock fell back to 175 ms while the fade played the token's value.

@vjeux
