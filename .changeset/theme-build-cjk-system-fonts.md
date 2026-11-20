---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` counts the fonts macOS and Windows ship for Chinese, Japanese and Korean (such as PingFang SC, Hiragino Sans, Microsoft YaHei and 微软雅黑) as system fonts, so it no longer names them as fonts the theme does not load.

@josephfarina
