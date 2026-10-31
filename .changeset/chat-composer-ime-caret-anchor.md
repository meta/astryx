---
'@astryxdesign/core': patch
---

[fix] Anchor programmatic carets in ChatComposerInput inside trailing text nodes rather than element boundaries so CJK IME composition starts cleanly without committing raw preedit letters. (#6411)

@ManoharPaturi
