---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: number tokens read as CSS reads them.

- Only the tokens Core's stylesheet multiplies by a size inside calc() (the line heights) refuse a unit; weight tokens take the font-weight keywords again (`bold`, `normal`), so a theme saved with one stays editable.
- Numbers are read as the browser reads them: `1.5e0`, `+1.5`, `15E-1` and `1.5EM` are numbers, and a `color-mix()` share like `50.%` is refused.
- A CSS font value on a part with a size and line height (`1rem/1.5`) or a size written as math (`calc(1rem + 2px)`) is split into its longhands; a part named twice (`bold bold`) is refused, never written as a family.

@josephfarina
