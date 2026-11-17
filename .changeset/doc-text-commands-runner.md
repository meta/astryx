---
'@astryxdesign/cli': patch
---

[fix] `component` and `template` now print the commands in a component's or template's own doc text with the name you run the CLI by, as `docs` already does. Before, a component doc's `astryx docs icons` printed bare. Through `npx`, `pnpm exec` or a tool that runs the CLI for you, that command might not run. A `{@command}` token in that text now prints as a command too. JSON output keeps the text as written.

@josephfarina
