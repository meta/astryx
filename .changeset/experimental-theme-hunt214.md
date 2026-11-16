---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: fonts Apple ships on iPhone and iPad as well as the Mac (Apple Color Emoji, Helvetica Neue, PingFang, Hiragino Sans, Avenir Next, Futura and others), and `-apple-system`, are noted as shipping only on Apple platforms (macOS, iOS and iPadOS), not only on macOS. Mac-only fonts (Monaco, Lucida Grande, Geneva, `BlinkMacSystemFont` and others) are still noted as macOS only.

A comma before three digits on a millisecond time (`transition-duration '1,000ms'`) is a thousands mark, as on a pixel length, so the repair is `1000ms`, not `1.000ms`. On rem, em and seconds it stays a decimal point (`1,125rem` is `1.125rem`).

@josephfarina
