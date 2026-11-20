---
'@astryxdesign/core': patch
---

[component] Promote `Stat` from Lab to Core, imported from `@astryxdesign/core/Stat` or the package root: a KPI tile with a metric label, a large value, an optional up, down or flat change, a supporting line and a slot for a sparkline. Its looks are unchanged, and so are its props except one: `delta.sentiment` takes Core's tone words `success`, `error` and `neutral`, as Badge's `variant` does (Banner's `status` shares `success` and `error`), so Lab's `positive` and `negative` become `success` and `error`. A `media` of `false`, `true` or `''` no longer leaves an empty gap below the tile. The words a screen reader hears after the change ("trending up", "trending down", "flat") now come from the translation catalog. Import it from `@astryxdesign/core` and rename those two values; the canary-only `@astryxdesign/lab` `Stat` export now re-exports the Core component.

@josephfarina
