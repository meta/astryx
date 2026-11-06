---
'@astryxdesign/cli': patch
---

[feat] `astryx build --type` takes component, hook and template, and still accepts `doc` and `theme`, now deprecated (DEP-0018): a build kit has no doc or theme group, so they return an empty kit. Use `astryx search <query> --type doc` or `astryx search <query> --type theme` instead. In text mode build warns once on stderr; JSON output carries `meta.deprecations`; the kit itself is unchanged. The next minor release refuses `doc` and `theme`.

@josephfarina
